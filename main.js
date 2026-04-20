import { InventorySystem } from './inventory.js?v=9.0';
import { UIManager } from './ui.js?v=9.0';
import { ItemDatabase, EconomyRules } from './db.js?v=9.0';
import { GameSimulation } from './game_simulation.js?v=9.0';

const WGSL_SHADER = `
struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) color: vec4f,
    @location(1) uv: vec2f,
    @location(2) shapeType: f32,
};

struct Uniforms {
    data: vec4f, // xy = resolution, zw = cameraOffset
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

@vertex
fn vs_main(
    @location(0) pos: vec2f,
    @location(1) instancePos: vec2f,
    @location(2) instanceSize: vec2f,
    @location(3) instanceColor: vec4f,
    @location(4) rotation: f32,
    @location(5) shapeType: f32,
    @location(6) originOffset: vec2f
) -> VertexOutput {
    var out: VertexOutput;
    
    // Scale local position
    let scaledPos = pos * instanceSize;
    // Apply local origin offset
    let localPos = scaledPos + originOffset;
    
    // Rotate (around origin since pos is -0.5 to 0.5)
    let c = cos(rotation);
    let s = sin(rotation);
    let rotMatrix = mat2x2f(c, s, -s, c);
    let rotatedPos = rotMatrix * localPos;
    
    // Scale and translate
    let worldPos = rotatedPos + instancePos;
    
    // Convert to clip space [-1, 1] relative to camera offset
    let screenPos = worldPos - uniforms.data.zw;
    let clipPos = (screenPos / uniforms.data.xy) * 2.0 - vec2f(1.0, 1.0);
    // WebGPU y-axis is up in clip space, but down in canvas space. So flip Y.
    out.position = vec4f(clipPos.x, -clipPos.y, 0.0, 1.0);
    out.color = instanceColor;
    out.uv = pos;
    out.shapeType = shapeType;
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
    if (in.shapeType == 1.0) {
        let dist = length(in.uv);
        if (dist > 0.5) {
            discard;
        }
    }
    return in.color;
}
`;

class Game {
    constructor() {
        console.log("%c [GAME] Version 9.0 Initializing... ", "background: #000; color: #00ffaa; font-weight: bold;");
        this.canvas = document.getElementById('game-canvas');
        this.ctx = null;
        this.device = null;

        this.sim = new GameSimulation();
        this.localPlayerId = 'singleplayer'; // Fallback / Local mode
        this.sim.addPlayer(this.localPlayerId);
        
        this.player = this.sim.state.players[this.localPlayerId];
        this.input = this.player.input;
        this.walls = this.sim.walls;
        this.extractionZones = this.sim.extractionZones;
        
        Object.defineProperty(this, 'bullets', { get: () => this.sim.state.bullets });
        Object.defineProperty(this, 'effects', { get: () => this.sim.state.effects });
        Object.defineProperty(this, 'bots', { get: () => this.sim.state.bots });

        this.lastTime = performance.now();
        this.renderInstances = [];
        this.cameraX = 0;
        this.cameraY = 0;

        Object.defineProperty(this, 'isInMenu', { get: () => this.sim.isInMenu, set: (v) => this.sim.isInMenu = v });
        Object.defineProperty(this, 'shootTimer', { get: () => this.player.shootTimer, set: (v) => this.player.shootTimer = v });
        Object.defineProperty(this, 'gameTimer', { get: () => this.sim.gameTimer, set: (v) => this.sim.gameTimer = v });

        this.inventory = this.player.inventory;

        this.isMultiplayer = false;
        this.ws = null;

        this.bindEvents();
        this.connectServer();

        // Ensure camera starts correctly focused even before first update
        this.cameraX = this.player.x - this.canvas.width / 2;
        this.cameraY = this.player.y - this.canvas.height / 2;
    }

    connectServer() {
        this.ws = new WebSocket('ws://localhost:8081');
        this.ws.onopen = () => {
            console.log('[Client] Connected to WebSocket Server');
        };
        this.ws.onmessage = (e) => {
            const msg = JSON.parse(e.data);
            if (msg.type === 'init') {
                this.isMultiplayer = true;
                this.sim.removePlayer(this.localPlayerId); // Remove singleplayer dummy
                this.localPlayerId = msg.playerId;
                this.sim.addPlayer(this.localPlayerId);
                this.player = this.sim.state.players[this.localPlayerId];
                this.inventory = this.player.inventory; // Re-bind
                this.input = this.player.input;
                if(this.ui) this.ui.player = this.player;
                if(this.ui) this.ui.inventory = this.inventory;
            } else if (msg.type === 'state') {
                let wasDead = this.player ? this.player.isDead : false;
                let wasWon = this.player ? this.player.won : false;
                
                this.sim.importState(msg.data);
                
                this.player = this.sim.state.players[this.localPlayerId];
                if (!wasDead && this.player && this.player.isDead) this.sim.events.playerDied = true;
                if (!wasWon && this.player && this.player.won) this.sim.events.playerWon = true;

                // Ensure inventory UI checks re-bind if raw data wiped instance
                if (this.sim.events.inventoryDirty && this.ui) {
                    this.ui.refreshInventory();
                    this.sim.events.inventoryDirty = false;
                }
            }
        };
        this.ws.onerror = (e) => {
            console.warn('[Client] Server connection failed, falling back to local simulation.');
        };
        this.ws.onclose = () => {
            console.log('[Client] Disconnected from server.');
            this.isMultiplayer = false;
        };
    }

    sendInput() {
        if (!this.isMultiplayer || !this.ws || this.ws.readyState !== 1) return;
        this.ws.send(JSON.stringify({
            type: 'input',
            playerId: this.localPlayerId,
            move: { x: this.input.moveX, y: this.input.moveY },
            shoot: this.input.isShooting,
            angle: this.player.rotation
        }));
    }


    async init() {
        if (!navigator.gpu) {
            this.showError("WebGPU not supported on this browser.");
            return false;
        }

        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
            this.showError("No appropriate GPU adapter found.");
            return false;
        }

        this.device = await adapter.requestDevice();
        this.ctx = this.canvas.getContext('webgpu');

        const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
        this.ctx.configure({
            device: this.device,
            format: presentationFormat,
            alphaMode: 'premultiplied'
        });

        // Setup Shaders and Pipeline
        const shaderModule = this.device.createShaderModule({
            label: 'Game shaders',
            code: WGSL_SHADER
        });

        // Quad geometry - centered square
        const vertexData = new Float32Array([
            -0.5, -0.5,
            0.5, -0.5,
            -0.5, 0.5,
            -0.5, 0.5,
            0.5, -0.5,
            0.5, 0.5
        ]);

        this.vertexBuffer = this.device.createBuffer({
            label: 'Vertex Buffer',
            size: vertexData.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(this.vertexBuffer, 0, vertexData);

        // Max 1000 instances
        this.maxInstances = 1000;
        this.instanceDataSize = (2 + 2 + 4 + 1 + 1 + 2 + 0) * 4; // pos(2)+size(2)+col(4)+rot(1)+shapeType(1)+originOffset(2) = 12 floats = 48 bytes

        this.instanceBuffer = this.device.createBuffer({
            label: 'Instance Buffer',
            size: this.maxInstances * this.instanceDataSize,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });

        this.uniformBuffer = this.device.createBuffer({
            label: 'Uniform Buffer',
            size: 16, // vec4f (16 bytes)
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this.device.queue.writeBuffer(this.uniformBuffer, 0, new Float32Array([this.canvas.width, this.canvas.height, 0, 0]));

        // Setup pipeline
        this.pipeline = this.device.createRenderPipeline({
            label: 'Render Pipeline',
            layout: 'auto',
            vertex: {
                module: shaderModule,
                entryPoint: 'vs_main',
                buffers: [
                    // Base Geometry buffer (stepped per vertex)
                    {
                        arrayStride: 8, // vec2f (8 bytes)
                        stepMode: 'vertex',
                        attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }]
                    },
                    // Instance data buffer (stepped per instance)
                    {
                        arrayStride: 48, // 12 * 4 bytes
                        stepMode: 'instance',
                        attributes: [
                            { shaderLocation: 1, offset: 0, format: 'float32x2' }, // pos
                            { shaderLocation: 2, offset: 8, format: 'float32x2' }, // size
                            { shaderLocation: 3, offset: 16, format: 'float32x4' }, // color
                            { shaderLocation: 4, offset: 32, format: 'float32' },   // rotation
                            { shaderLocation: 5, offset: 36, format: 'float32' },   // shapeType
                            { shaderLocation: 6, offset: 40, format: 'float32x2' }  // originOffset
                        ]
                    }
                ]
            },
            fragment: {
                module: shaderModule,
                entryPoint: 'fs_main',
                targets: [{
                    format: presentationFormat,
                    blend: {
                        color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
                    }
                }]
            },
            primitive: {
                topology: 'triangle-list'
            }
        });

        this.bindGroup = this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [{
                binding: 0,
                resource: { buffer: this.uniformBuffer }
            }]
        });

        // Setup inventory UI properly
        this.ui = new UIManager(this);
        this.ui.initUI();

        // Expose to window for external modification
        window.setWeight = (weight) => {
            this.player.weight = weight;
        };
        window.setBleeding = (state) => {
            this.player.isBleeding = state;
        };
        window.setHealth = (val) => {
            if (!this.player.isDead && !this.player.won) {
                this.player.health = Math.min(100, Math.max(0, val));
            }
        };

        this.updateHUD(); // Initial HUD

        // Write initial camera state
        this.writeCameraUniforms();

        // Start loop
        requestAnimationFrame((t) => this.loop(t));
        return true;
    }

    writeCameraUniforms() {
        if (!this.device || !this.uniformBuffer) return;
        const zoom = (this.player && this.player.cameraZoom && !isNaN(this.player.cameraZoom)) ? this.player.cameraZoom : 1.5;
        const virtualWidth = this.canvas.width * zoom;
        const virtualHeight = this.canvas.height * zoom;
        
        const cx = isNaN(this.cameraX) ? 0 : this.cameraX;
        const cy = isNaN(this.cameraY) ? 0 : this.cameraY;

        this.device.queue.writeBuffer(
            this.uniformBuffer, 0,
            new Float32Array([virtualWidth, virtualHeight, cx, cy])
        );
    }

    showError(msg) {
        document.getElementById('error-msg').innerText = msg;
        document.getElementById('error-msg').style.display = 'block';
    }

    bindEvents() {
        window.addEventListener('keydown', (e) => this.handleKey(e.key.toLowerCase(), true));
        window.addEventListener('keyup', (e) => this.handleKey(e.key.toLowerCase(), false));

        window.addEventListener('mousemove', (e) => {
            if (this.isInMenu || this.player.isDead || this.player.won) return;
            const rect = this.canvas.getBoundingClientRect();
            // Allow tracking mouse even if it is outside the canvas bounds
            this.input.mouseX = e.clientX - rect.left;
            this.input.mouseY = e.clientY - rect.top;
        });

        window.addEventListener('mousedown', (e) => {
            if (this.isInMenu || this.player.isDead || this.player.won) return;
            if (e.button === 0) this.input.isShooting = true;
        });

        window.addEventListener('mouseup', (e) => {
            if (e.button === 0) this.input.isShooting = false;
        });

        // Minimap Context
        const minimapCanvas = document.getElementById('minimap-canvas');
        if (minimapCanvas) {
            this.minimapCtx = minimapCanvas.getContext('2d');
        }

        // Add some click interactions to test health/bleeding for debugging easily
        // window.addEventListener('mousedown', (e) => {
        //     if(e.button === 2) this.player.isBleeding = !this.player.isBleeding;
        //     else if(e.button === 0) this.player.weight += 10;
        //     // Loop weight around
        //     if(this.player.weight > 70) this.player.weight = 0;
        // });
        // this.canvas.oncontextmenu = () => false;
    }

    handleKey(key, state) {
        if (['w', 'a', 's', 'd'].includes(key)) {
            this.input[key] = state;
        }
        if (key === 'r' && state === true) {
            this.reload();
        }

        // Hotbar map: 5,6,7,8,9 -> index 0,1,2,3,4
        if (['5', '6', '7', '8', '9'].includes(key) && state === true) {
            this.useHotbarItem(parseInt(key) - 5);
        }

        // Weapon switching map: 1, 2, 3, 4
        if (['1', '2', '3', '4'].includes(key) && state === true) {
            this.switchWeapon(parseInt(key));
        }

        // TEST BLEEDING keybind 'p'
        if (key === 'p' && state === true) {
            this.player.bleedCount = (this.player.bleedCount || 0) + 1;
            console.log("BleedCount set to:", this.player.bleedCount);
        }

        // SPAWN BOT keybind 'b'
        if (key === 'b' && state === true) {
            this.spawnTestBot();
        }
    }


    switchWeapon(slotNumber) {
        if (this.player.isDead || this.player.won || this.isInMenu || this.player.isReloading || this.player.isHealing) return;

        const slotMap = {
            1: 'primaryWep',
            2: 'primaryWep2',
            3: 'secondaryWep',
            4: 'meleeSlot'
        };

        const targetSlot = slotMap[slotNumber];

        // Auto-skip logic: check if slot is empty, if so move to next
        let checkOrder = [1, 2, 3, 4];
        let startIndex = checkOrder.indexOf(slotNumber);

        for (let i = 0; i < 4; i++) {
            let checkIdx = (startIndex + i) % 4;
            let querySlot = slotMap[checkOrder[checkIdx]];
            let item = this.inventory.items.find(invItem => invItem.container === querySlot);

            if (item) {
                // Found a valid weapon
                this.player.activeWeaponSlot = querySlot;
                this.updateHUD(); // Refresh HUD immediately
                return;
            }
        }

        // If all 4 are empty, it defaults to the requested one (fails gracefully in shoot anyway)
        this.player.activeWeaponSlot = targetSlot;
        this.updateHUD();
    }

    getSpeedMultiplier() {
        return this.sim.getSpeedMultiplier();
    }

    update(dt) {
        this.sim.input.canvasW = this.canvas.width * this.player.cameraZoom;
        this.sim.input.canvasH = this.canvas.height * this.player.cameraZoom;
        this.sim.update(dt, this.isInventoryOpen);
        
        // Process Simulation Events generated by GameSimulation
        if (this.sim.events.playerDied) {
            document.getElementById('game-over').classList.remove('hidden');
            setTimeout(() => this.resetSession(), 3000);
            this.sim.events.playerDied = false;
        }
        if (this.sim.events.playerWon) {
            document.getElementById('game-win').classList.remove('hidden');
            document.getElementById('extraction-timer').classList.add('hidden');
            setTimeout(() => this.resetSession(), 5000);
            this.sim.events.playerWon = false;
        }
        if (this.sim.events.sessionReset) {
            document.getElementById('game-over').classList.add('hidden');
            document.getElementById('game-win').classList.add('hidden');
            document.getElementById('extraction-timer').classList.add('hidden');
            const mainMenu = document.getElementById('main-menu');
            const gameContainer = document.getElementById('game-container');
            if (mainMenu) mainMenu.style.display = '';
            if (gameContainer) gameContainer.style.display = 'none';
            if (this.ui) this.ui.refreshInventory();
            
            // Reset camera
            this.cameraX = this.player.x - this.canvas.width / 2;
            this.cameraY = this.player.y - this.canvas.height / 2;
            
            this.sim.events.sessionReset = false;
        }
        if (this.sim.events.inventoryDirty) {
            if (this.ui) this.ui.refreshInventory();
            this.updateHUD();
            this.sim.events.inventoryDirty = false;
        }

        if (this.player.isDead || this.player.won || this.isInMenu) return;

        // Visual Jitter/Recoil handling (syncing local state from sim state)
        const zoom = (this.player.cameraZoom && !isNaN(this.player.cameraZoom)) ? this.player.cameraZoom : 1.5;
        const virtualWidth = this.canvas.width * zoom;
        const virtualHeight = this.canvas.height * zoom;

        const rx = (this.player.recoilOffset && !isNaN(this.player.recoilOffset.x)) ? this.player.recoilOffset.x : 0;
        const ry = (this.player.recoilOffset && !isNaN(this.player.recoilOffset.y)) ? this.player.recoilOffset.y : 0;

        this.cameraX = (this.player.x + rx) - virtualWidth / 2;
        this.cameraY = (this.player.y + ry) - virtualHeight / 2;

        this.writeCameraUniforms();

        this.updateHUD();
    }

    resetSession() {
        this.sim.resetSession(); 
        if(this.isMultiplayer) {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({
                    type: 'resetPlayer',
                    playerId: this.localPlayerId
                }));
            }
        }
    }

    spawnTestBot() {
        this.sim.spawnTestBot(); // Bot spawn command
    }

    updateHUD() {
        const setHtmlObj = (id, text) => {
            const el = document.getElementById(id);
            if (el) el.innerText = text;
        };

        setHtmlObj('health-text', Math.ceil(this.player.health));
        setHtmlObj('weight-text', this.player.weight);
        setHtmlObj('speed-multiplier-text', this.getSpeedMultiplier().toFixed(2));

        // Update Ammo HUD and Weapon Image
        let activeItem = this.inventory.items.find(i => i.container === this.player.activeWeaponSlot);
        const wepImg = document.getElementById('current-weapon-img');

        if (activeItem && ItemDatabase[activeItem.typeId]) {
            const dbItem = ItemDatabase[activeItem.typeId];
            if (dbItem.type === 'weapon' && dbItem.stats && dbItem.stats.magSize) {
                let maxMag = dbItem.stats.magSize;
                if (activeItem.hasUpgradedMag && dbItem.stats.upMagSize) maxMag = dbItem.stats.upMagSize;
                let cur = activeItem.currentMag !== undefined ? activeItem.currentMag : maxMag;
                
                let requiredClass = dbItem.ammoType; // e.g. "中口徑", "小口徑" ...
                let maxTier = dbItem.maxAmmoTier || 99;
                let hotbarAmmoCount = 0;
                if (requiredClass) {
                    let availableAmmoStacks = this.inventory.items.filter(inv => {
                        if (inv.container !== 'hotbarSlot') return false;
                        const dbAmmo = ItemDatabase[inv.typeId];
                        if (!dbAmmo) return false;
                        if (dbAmmo.ammoClass !== requiredClass) return false;
                        if ((dbAmmo.tier || 1) > maxTier) return false;
                        return true;
                    });
                    hotbarAmmoCount = availableAmmoStacks.reduce((sum, it) => sum + (it.amount || 0), 0);
                }
                
                setHtmlObj('ammo-text', cur + " / " + hotbarAmmoCount);
            } else {
                setHtmlObj('ammo-text', "- / -");
            }
            if (wepImg && dbItem.name) {
                wepImg.src = "槍械圖片/" + encodeURIComponent(dbItem.name) + ".png";
                wepImg.style.display = 'block';
            } else if (wepImg) {
                wepImg.style.display = 'none';
            }
        } else {
            setHtmlObj('ammo-text', "- / -");
            if (wepImg) wepImg.style.display = 'none';
        }

        const getEl = id => document.getElementById(id);
        const setVis = (id, condition) => {
            const el = getEl(id);
            if (el) {
                if (condition) el.classList.remove('hidden');
                else el.classList.add('hidden');
            }
        };

        // Bleeding indicator: show stack count and type
        const bleedCount = this.player.bleedCount || 0;
        const bleedEl = document.getElementById('bleeding-indicator');
        if (bleedEl) {
            if (bleedCount > 0 && !this.player.isHeavyBleeding) {
                bleedEl.innerText = bleedCount === 2 ? '(出血 x2)' : '(出血)';
                bleedEl.classList.remove('hidden');
            } else {
                bleedEl.classList.add('hidden');
            }
        }
        setVis('heavy-bleeding-indicator', this.player.isHeavyBleeding);
        setVis('head-injury-indicator', this.player.hasHeadInjury);
        setVis('torso-injury-indicator', this.player.hasTorsoInjury);
        setVis('painkiller-indicator', this.player.pkActiveTime > 0);
        setVis('healing-indicator', this.player.isHealing);
        setVis('reloading-indicator', this.player.isReloading);
        setVis('adrenaline-indicator', this.player.adrenalineTimer > 0);
        setVis('strength-indicator', this.player.strengthTimer > 0);
        setVis('weightless-indicator', this.player.weightlessTimer > 0);
        
        const isHealingOverTime = this.player.healOverRate > 0 && this.player.healOverTimer > 0;
        setVis('action-progress', this.player.isRepairing || this.player.isHealing || isHealingOverTime);
        const actEl = getEl('action-text');
        const actFill = getEl('action-bar-fill');
        
        if (this.player.isRepairing) {
            if (this.player.repairPrepTimer > 0) {
                if (actEl) actEl.innerText = `準備修復... ${Math.max(0, this.player.repairPrepTimer).toFixed(1)}s`;
                if (actFill) actFill.style.width = ((3.0 - Math.max(0, this.player.repairPrepTimer)) / 3.0 * 100) + '%';
            } else {
                if (this.player.repairTarget) {
                    const currentMax = this.player.repairTarget.maxDurability || 1;
                    let pct = Math.floor(this.player.repairTarget.durability / currentMax * 100);
                    if (actEl) actEl.innerText = `護甲修復中... ${pct}%`;
                    if (actFill) actFill.style.width = pct + '%';
                }
            }
        } else if (this.player.isHealing) {
            if (actEl) actEl.innerText = `使用 ${this.player.healName}... ${Math.max(0, this.player.healTimer).toFixed(1)}s`;
            let pct = Math.min(100, Math.max(0, ((this.player.healDuration - this.player.healTimer) / this.player.healDuration) * 100));
            if (actFill) actFill.style.width = pct + '%';
        } else if (isHealingOverTime) {
            const totalDur = (100 - (this.player.health - this.player.healOverRate * this.player.healOverTimer)) / (this.player.healOverRate || 1);
            const elapsed = totalDur - this.player.healOverTimer;
            const pct = Math.min(100, Math.max(0, (elapsed / totalDur) * 100)) || (this.player.health);
            if (actEl) actEl.innerText = `${this.player.healOverName || '回血中'}... ${Math.max(0, this.player.healOverTimer).toFixed(1)}s (${Math.ceil(this.player.health)}/100)`;
            if (actFill) actFill.style.width = Math.ceil(this.player.health) + '%';
        }

        if (this.player.isExtracting && !this.player.won && !this.player.isDead) {
            setVis('extraction-timer', true);
            setHtmlObj('timer-text', Math.max(0, this.player.extractionTimer).toFixed(1));
        } else if (!this.player.won) {
            setVis('extraction-timer', false);
        }

        // Format and update game timer
        let minutes = Math.floor(this.gameTimer / 60);
        let seconds = Math.floor(this.gameTimer % 60);
        setHtmlObj('game-timer', `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);

        // Update Hotbar visuals
        for (let i = 0; i < 5; i++) {
            let hbSlot = document.getElementById(`hotbar-${i + 5}`);
            if (hbSlot) {
                let item = this.inventory.items.find(inv => inv.container === 'hotbarSlot' && inv.x === i);
                if (item) {
                    let itemName = item.typeId;
                    hbSlot.innerHTML = `<span style="font-size:10px;">${itemName}</span>`;
                } else {
                    hbSlot.innerHTML = '';
                }
            }
        }

        // update Current Weapon Name -> handled slightly differently or kept here
        let wNameEl = document.getElementById('current-weapon-name');
        if (wNameEl) {
            if (activeItem && ItemDatabase[activeItem.typeId]) {
                wNameEl.innerText = ItemDatabase[activeItem.typeId].name;
            } else {
                wNameEl.innerText = "-";
            }
        }

        // Update Health Bar and Armor Icons
        let hpBar = document.getElementById('health-bar-fill');
        if (hpBar) {
            hpBar.style.width = Math.max(0, Math.min(100, this.player.health)) + "%";
            if (this.player.health < 30) hpBar.style.background = "#cc2222";
            else if (this.player.health < 70) hpBar.style.background = "#cccc22";
            else hpBar.style.background = "#22cc22";
        }

        // Helmet and Armor visual (durability-aware)
        let helmetFill = document.getElementById('helmet-fill');
        let armorFill = document.getElementById('armor-fill');
        let helmetDurText = document.getElementById('helmet-dur-text');
        let armorDurText = document.getElementById('armor-dur-text');

        let hasHelmet = this.inventory.items.find(i => i.container === 'helmetSlot');
        let hasArmor = this.inventory.items.find(i => i.container === 'armorSlot');

        if (helmetFill) {
            if (hasHelmet) {
                const dbH = ItemDatabase[hasHelmet.typeId];
                const maxDur = hasHelmet.maxDurability !== undefined ? hasHelmet.maxDurability : (dbH && dbH.maxDurability ? dbH.maxDurability : 1);
                const curDur = hasHelmet.durability !== undefined ? hasHelmet.durability : maxDur;
                const pct = Math.max(0, Math.min(100, (curDur / maxDur) * 100));
                helmetFill.style.height = pct + '%';
                if (helmetFill.style.background !== '#00ccff') helmetFill.style.background = pct < 25 ? '#ff4444' : '#00ccff';
                if (helmetDurText) helmetDurText.innerText = curDur.toFixed(1);
            } else {
                helmetFill.style.height = '0%';
                if (helmetDurText) helmetDurText.innerText = '-';
            }
        }

        let helmetCross = document.getElementById('helmet-cross');
        if (helmetCross) {
            helmetCross.style.display = (hasHelmet && this.player.hasHeadInjury) ? 'block' : 'none';
        }

        if (armorFill) {
            if (hasArmor) {
                const dbA = ItemDatabase[hasArmor.typeId];
                const maxDur = hasArmor.maxDurability !== undefined ? hasArmor.maxDurability : (dbA && dbA.maxDurability ? dbA.maxDurability : 1);
                const curDur = hasArmor.durability !== undefined ? hasArmor.durability : maxDur;
                const pct = Math.max(0, Math.min(100, (curDur / maxDur) * 100));
                armorFill.style.height = pct + '%';
                armorFill.style.background = pct < 25 ? '#ff4444' : '#00ffaa';
                if (armorDurText) armorDurText.innerText = curDur.toFixed(1);
            } else {
                armorFill.style.height = '0%';
                if (armorDurText) armorDurText.innerText = '-';
            }
        }

        let armorCross = document.getElementById('armor-cross');
        if (armorCross) {
            armorCross.style.display = (hasArmor && this.player.hasTorsoInjury) ? 'block' : 'none';
        }
    }

    renderMinimap() {
        if (!this.minimapCtx) return;

        const ctx = this.minimapCtx;
        const width = ctx.canvas.width;
        const height = ctx.canvas.height;

        ctx.clearRect(0, 0, width, height);

        // Minimap scale (4x zoom in -> so 1.5 / 4.0) -> Map world to canvas
        const mapScale = 0.05; // Base scale fitting screen
        const fovZoom = 0.375; // Used to be 1.5
        const finalScale = mapScale / fovZoom;

        ctx.save();
        ctx.translate(width / 2, height / 2);

        // Draw Walls
        ctx.fillStyle = "rgba(100, 100, 100, 0.8)";
        for (let w of this.walls) {
            let dx = w.x - (this.player.x + this.player.recoilOffset.x);
            let dy = w.y - (this.player.y + this.player.recoilOffset.y);
            ctx.fillRect(
                dx * finalScale - (w.w * finalScale) / 2,
                dy * finalScale - (w.h * finalScale) / 2,
                w.w * finalScale,
                w.h * finalScale
            );
        }

        // Draw Extraction Zones (green)
        ctx.fillStyle = "rgba(0, 255, 80, 0.5)";
        ctx.strokeStyle = "rgba(0, 255, 80, 1)";
        ctx.lineWidth = 1;
        for (let z of this.extractionZones) {
            let dx = z.x - (this.player.x + this.player.recoilOffset.x);
            let dy = z.y - (this.player.y + this.player.recoilOffset.y);
            let zx = dx * finalScale - (z.w * finalScale) / 2;
            let zy = dy * finalScale - (z.h * finalScale) / 2;
            let zw = z.w * finalScale;
            let zh = z.h * finalScale;
            ctx.fillRect(zx, zy, zw, zh);
            ctx.strokeRect(zx, zy, zw, zh);
        }

        // Draw Player
        ctx.fillStyle = "rgba(0, 150, 255, 1)";
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(2, this.player.size * finalScale * 0.4), 0, Math.PI * 2);
        ctx.fill();

        // Draw Player Direction Line (short)
        ctx.strokeStyle = "rgba(255, 255, 0, 1)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(this.player.rotation) * 6, Math.sin(this.player.rotation) * 6);
        ctx.stroke();

        ctx.restore();
    }

    render() {
        // Collect instances to draw
        this.renderInstances = [];

        // Bullets
        for (let b of this.bullets) {
            this.renderInstances.push({
                x: b.x, y: b.y, w: 10, h: 4, rot: b.rot, color: [1, 1, 0, 1], shapeType: 0.0, originX: 0, originY: 0
            });
        }

        // Grass/Bushes (New)
        if (this.sim.state.grass) {
            for (let g of this.sim.state.grass) {
                this.renderInstances.push({
                    x: g.x, y: g.y, w: g.w, h: g.h,
                    rot: 0, color: [0.1, 0.45, 0.1, 0.7], shapeType: 1.0, originX: 0, originY: 0
                });
            }
        }

        // Zones
        for (let z of this.extractionZones) {
            this.renderInstances.push({
                x: z.x, y: z.y, w: z.w, h: z.h, rot: 0, color: z.color, shapeType: 0.0, originX: 0, originY: 0
            });
        }

        // Walls
        for (let w of this.walls) {
            this.renderInstances.push({
                x: w.x, y: w.y, w: w.w, h: w.h, rot: 0, color: w.color, shapeType: 0.0, originX: 0, originY: 0
            });
        }

        // Player
        if (!this.player.isDead) {
            this.renderInstances.push({
                x: this.player.x + this.player.recoilOffset.x, 
                y: this.player.y + this.player.recoilOffset.y, 
                w: this.player.size, h: this.player.size,
                rot: this.player.rotation, color: this.player.color, shapeType: 1.0, originX: 0, originY: 0
            });

            // Helmet (smaller concentric circle)
            this.renderInstances.push({
                x: this.player.x + this.player.recoilOffset.x, 
                y: this.player.y + this.player.recoilOffset.y, 
                w: this.player.size * 0.55, h: this.player.size * 0.55,
                rot: this.player.rotation, color: [0.2, 0.2, 0.2, 1.0], shapeType: 1.0, originX: 0, originY: 0
            });

            // Weapon (yellow line/rect extending from edge of the player circle)
            const weaponW = 20;
            const weaponH = 6;
            const weaponOriginOffX = this.player.size / 2 + weaponW / 2 - 2;

            this.renderInstances.push({
                // Pos mapped exactly to player center
                x: this.player.x + this.player.recoilOffset.x, 
                y: this.player.y + this.player.recoilOffset.y, 
                w: weaponW, h: weaponH,
                rot: this.player.rotation + this.player.visualJitter, color: [1, 1, 0, 1], shapeType: 0.0,
                originX: weaponOriginOffX, originY: 0
            });
        }
        
        // Bots
        if (this.bots) {
            for (let b of this.bots) {
                if (b.health > 0) {
                    this.renderInstances.push({
                        x: b.x, y: b.y, w: b.size, h: b.size,
                        rot: b.rotation, color: b.color, shapeType: 1.0, originX: 0, originY: 0
                    });

                    this.renderInstances.push({
                        x: b.x, y: b.y, w: b.size * 0.55, h: b.size * 0.55,
                        rot: b.rotation, color: [0.8, 0.2, 0.2, 1.0], shapeType: 1.0, originX: 0, originY: 0
                    });

                    const weaponW = 20;
                    const weaponOriginOffX = b.size / 2 + weaponW / 2 - 2;
                    this.renderInstances.push({
                        x: b.x, y: b.y, w: 20, h: 6,
                        rot: b.rotation, color: [0.5, 0.5, 0.5, 1], shapeType: 0.0,
                        originX: weaponOriginOffX, originY: 0
                    });

                    // Simple Visual Health Bar above bot
                    const botHpPct = b.health / 100;
                    this.renderInstances.push({
                        x: b.x, y: b.y - b.size - 5, w: b.size * 1.2 * botHpPct, h: 4,
                        rot: 0, color: [0, 1, 0, 0.8], shapeType: 0.0, originX: 0, originY: 0
                    });

                    // Armor Durability Bar (if any)
                    if (b.armorLevel > 0 && b.armorDurability !== undefined) {
                        const armorMax = b.armorMaxDurability || 40;
                        const botArmorPct = b.armorDurability / armorMax;
                        this.renderInstances.push({
                            x: b.x, y: b.y - b.size - 10, w: b.size * 1.2 * botArmorPct, h: 3,
                            rot: 0, color: [0, 0.6, 1, 0.8], shapeType: 0.0, originX: 0, originY: 0
                        });
                    }
                }
            }
        }

        // Prepare instance buffer
        const instanceData = new Float32Array(this.renderInstances.length * 12);
        for (let i = 0; i < this.renderInstances.length; i++) {
            const inst = this.renderInstances[i];
            const offset = i * 12;
            instanceData[offset] = inst.x;
            instanceData[offset + 1] = inst.y;
            instanceData[offset + 2] = inst.w;
            instanceData[offset + 3] = inst.h;
            instanceData[offset + 4] = inst.color[0];
            instanceData[offset + 5] = inst.color[1];
            instanceData[offset + 6] = inst.color[2];
            instanceData[offset + 7] = inst.color[3];
            instanceData[offset + 8] = inst.rot;
            instanceData[offset + 9] = inst.shapeType || 0.0;
            instanceData[offset + 10] = inst.originX || 0.0;
            instanceData[offset + 11] = inst.originY || 0.0;
        }

        if (this.renderInstances.length > 0) {
            this.device.queue.writeBuffer(
                this.instanceBuffer, 0,
                instanceData, 0
            );
        }

        // Encode and submit commands
        const commandEncoder = this.device.createCommandEncoder();
        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: this.ctx.getCurrentTexture().createView(),
                clearValue: { r: 0.1, g: 0.1, b: 0.1, a: 1.0 },
                loadOp: 'clear',
                storeOp: 'store'
            }]
        });

        if (this.renderInstances.length > 0) {
            renderPass.setPipeline(this.pipeline);
            renderPass.setBindGroup(0, this.bindGroup);
            renderPass.setVertexBuffer(0, this.vertexBuffer);
            renderPass.setVertexBuffer(1, this.instanceBuffer);
            renderPass.draw(6, this.renderInstances.length, 0, 0);
        }

        renderPass.end();
        this.device.queue.submit([commandEncoder.finish()]);

        // Render Minimap
        this.renderMinimap();
    }

    spawnThrowable(dbItem) {
        if (!this.effects) this.effects = [];
        let r = 150; // default radius
        if (dbItem.effectType === 'smoke') r = 200;
        else if (dbItem.effectType === 'gas') r = 180;

        let dx = this.input.mouseX - (this.canvas.width / 2);
        let dy = this.input.mouseY - (this.canvas.height / 2);

        // Apply throw range limit
        let dist = Math.hypot(dx, dy);
        let maxRange = 600;
        if (dist > maxRange) {
            dx = (dx / dist) * maxRange;
            dy = (dy / dist) * maxRange;
        }

        let finalX = this.player.x + dx;
        let finalY = this.player.y + dy;

        let throwData = {
            effectType: dbItem.effectType,
            x: finalX,
            y: finalY,
            duration: dbItem.duration || 0,
            fuseTime: dbItem.fuseTime || 0,
            damage: dbItem.damage || 0,
            radius: r
        };

        if (this.isMultiplayer && this.ws && this.ws.readyState === 1) {
            this.ws.send(JSON.stringify({ type: 'input', playerId: this.localPlayerId, throw: throwData }));
        } else {
            this.sim.applyInput(this.localPlayerId, { throw: throwData });
        }

        const msg = document.createElement('div');
        msg.innerText = "投擲了 " + dbItem.name;
        msg.style.position = 'absolute';
        msg.style.top = '50%';
        msg.style.left = '50%';
        msg.style.transform = 'translate(-50%, -50%)';
        msg.style.color = 'yellow';
        msg.style.fontSize = '24px';
        msg.style.zIndex = '9999';
        msg.style.pointerEvents = 'none';
        document.body.appendChild(msg);
        setTimeout(() => msg.remove(), 2000);
    }

    // New Armor Wear & Tear Logic
    calculateRepair(kit, armor) {
        const dbKit = ItemDatabase[kit.typeId];
        const dbArmor = ItemDatabase[armor.typeId];
        if (!dbKit || !dbArmor) return null;

        const armorLevel = dbArmor.level || 1;
        const kitLevel = dbKit.level || 1;
        const levelDiff = armorLevel - kitLevel;

        let decayRate = 0.08; // Same level
        if (levelDiff === 1) decayRate = 0.15;
        else if (levelDiff >= 2) decayRate = 0.30;

        const currentMax = armor.maxDurability || dbArmor.maxDurability;
        const originalMax = armor.originalMaxDurability || dbArmor.maxDurability;
        const decayAmount = currentMax * decayRate;
        const predictedMax = Math.max(0, currentMax - decayAmount);
        
        // Scrapping Threshold: 20% of original
        const isBroken = predictedMax < (originalMax * 0.20);

        return {
            decayAmount,
            predictedMax,
            originalMax,
            currentMax,
            isBroken,
            decayRate
        };
    }

    executeRepair(kit, armor) {
        const result = this.calculateRepair(kit, armor);
        if (!result) return false;

        const dbKit = ItemDatabase[kit.typeId];
        const dbArmor = ItemDatabase[armor.typeId];

        if (result.isBroken) {
            armor.isBroken = true;
            armor.maxDurability = result.predictedMax;
            armor.durability = 0; // Completely broken
            this.ui.refreshInventory();
            this.updateHUD();
            return true;
        }

        // Apply decay to max durability first
        armor.maxDurability = result.predictedMax;

        // Calculate efficiency
        let efficiency = 2; // Default for same
        let levelDiff = dbKit.level - dbArmor.level;
        if (levelDiff === 1) efficiency = 3;
        else if (levelDiff >= 2) efficiency = 4;

        this.player.isRepairing = true;
        this.player.repairKit = kit;
        this.player.repairTarget = armor;
        this.player.repairEfficiency = efficiency;
        this.player.repairPrepTimer = (dbKit.prepTime / 1000) || 1.0;
        this.player.repairUseRate = dbKit.useRate || 10;

        this.ui.refreshInventory();
        this.updateHUD();
        return true;
    }

    // Keep startRepair for backward compatibility if needed, but point it to the UI trigger if possible
    // Or just let UIManager handle it as it does now.
    startRepair(repairKit, targetArmor) {
        // This was the old in-raid repair. 
        // We will now trigger the UI modal instead if we are in menu/tab.
        if (this.ui) {
            this.ui.openRepairModal(repairKit, targetArmor);
        }
    }

    reload() {
        if (this.player.isDead || this.player.won || this.isInMenu || this.player.isReloading) return;

        let activeItem = this.inventory.items.find(i => i.container === this.player.activeWeaponSlot);
        if (!activeItem) return;

        const weaponDef = ItemDatabase[activeItem.typeId];
        if (!weaponDef || weaponDef.type !== 'weapon' || !weaponDef.stats || !weaponDef.stats.magSize) return;

        let maxMag = weaponDef.stats.magSize;
        if (activeItem.hasUpgradedMag && weaponDef.stats.upMagSize) {
            maxMag = weaponDef.stats.upMagSize;
        }

        if (activeItem.currentMag === maxMag) return; // Already full
        
        let requiredClass = weaponDef.ammoType; // e.g. "中口徑", "小口徑", "散彈", "鈍傷彈" ...
        if (!requiredClass) return;

        let maxTier = weaponDef.maxAmmoTier || 99; // Pistols have maxAmmoTier: 3

        // Find compatible ammo stacks in hotbar: ammoClass must match and tier must be within limit
        let availableAmmoStacks = this.inventory.items.filter(i => {
            if (i.container !== 'hotbarSlot') return false;
            const dbAmmo = ItemDatabase[i.typeId];
            if (!dbAmmo) return false;
            if (dbAmmo.ammoClass !== requiredClass) return false;
            if ((dbAmmo.tier || 1) > maxTier) return false;
            return true;
        });

        // Sort by highest tier first (use best ammo available)
        availableAmmoStacks.sort((a, b) => {
            let ta = (ItemDatabase[a.typeId] || {}).tier || 0;
            let tb = (ItemDatabase[b.typeId] || {}).tier || 0;
            return tb - ta;
        });

        let totalAvailable = availableAmmoStacks.reduce((sum, item) => sum + (item.amount || 0), 0);
        if (totalAvailable <= 0) return; // out of ammo

        // Remember what ammo is being loaded (for penetration calc on bullets)
        let loadedAmmoTypeId = availableAmmoStacks[0].typeId;
        activeItem.loadedAmmoId = loadedAmmoTypeId;

        let need = maxMag - activeItem.currentMag;
        let actualReloadAmount = Math.min(need, totalAvailable);

        // Deduct from stacks (immediately to prevent dropping issues)
        let toDeduct = actualReloadAmount;
        for (let stack of availableAmmoStacks) {
            if (toDeduct <= 0) break;
            if (stack.amount >= toDeduct) {
                stack.amount -= toDeduct;
                toDeduct = 0;
            } else {
                toDeduct -= stack.amount;
                stack.amount = 0;
            }
        }
        
        // Remove empty stacks from Hotbar
        for (let i = this.inventory.items.length - 1; i >= 0; i--) {
            let it = this.inventory.items[i];
            const dbIt = ItemDatabase[it.typeId];
            if (it.container === 'hotbarSlot' && dbIt && dbIt.ammoClass === requiredClass && it.amount <= 0) {
                this.inventory.freeGrid(it, this.inventory.hotbarSlot);
                this.inventory.items.splice(i, 1);
            }
        }

        let reloadMult = weaponDef.stats.reloadMult || 1.0;
        let missingRatio = actualReloadAmount / maxMag;
        let reloadTimeSec = (maxMag / 20.0) * missingRatio * reloadMult;
        reloadTimeSec = Math.max(0.8, reloadTimeSec); // Absolute minimum 0.8s for immersion

        this.player.isReloading = true;
        this.player.reloadTimer = reloadTimeSec;
        this.player.reloadTargetWeapon = activeItem;
        this.player.reloadAmount = actualReloadAmount;
        this.updateHUD();
        if (this.ui) this.ui.refreshInventory();
    }

    useHotbarItem(index) {
        if (this.player.isDead || this.player.won || this.isInMenu || this.player.isHealing) return;

        // Find items in hotbar
        const hotbarItems = this.inventory.items.filter(i => i.container === 'hotbarSlot');
        hotbarItems.sort((a, b) => a.x - b.x); // Sort by grid X position (0 to 4)

        const targetItem = hotbarItems.find(i => i.x === index);
        if (!targetItem) return;

        const dbItem = ItemDatabase[targetItem.typeId];
        if (!dbItem) return;

        if (dbItem.type === 'throwable') {
            this.spawnThrowable(dbItem);
            this.inventory.items = this.inventory.items.filter(i => i.id !== targetItem.id);
            this.inventory.freeGrid(targetItem, this.inventory.hotbarSlot);
            this.ui.refreshInventory();
            return;
        }

        this.useItemDirectly(targetItem);
    }

    useItemDirectly(itemObj) {
        if (this.player.isDead || this.player.won || this.player.isHealing) return;
        const dbItem = ItemDatabase[itemObj.typeId];
        if (!dbItem || (dbItem.type !== 'medical' && dbItem.type !== 'medical-buff')) return;

        if (itemObj.capacity === undefined) {
            itemObj.capacity = dbItem.maxCapacity || 1;
        }
        if (itemObj.capacity <= 0) return;

        // Prevent using bleed removers if not bleeding
        if (dbItem.healType === 'remove_bleed' && this.player.bleedCount <= 0 && !this.player.isHeavyBleeding) {
            return;
        }

        // Start Healing process
        this.player.isHealing = true;
        this.player.healDuration = (dbItem.useTime || 1000) / 1000.0;
        this.player.healTimer = this.player.healDuration;
        this.player.healTargetItem = itemObj;
        this.player.healDbItem = dbItem;
        this.player.healName = dbItem.name || itemObj.typeId;
        this.updateHUD();
    }

    completeHealing() {
        this.player.isHealing = false;
        if (this.player.isDead) return;

        const dbItem = this.player.healDbItem;
        const targetItem = this.player.healTargetItem;

        if (!dbItem || !targetItem) return;

        // Make sure the item is still in inventory
        const idx = this.inventory.items.findIndex(i => i.id === targetItem.id);
        if (idx === -1) return;

        if (dbItem.type === 'medical-buff') {
            if (dbItem.effectType === 'adrenaline') this.player.adrenalineTimer = (dbItem.effectDuration / 1000) || 60;
            if (dbItem.effectType === 'strength') this.player.strengthTimer = (dbItem.effectDuration / 1000) || 60;
            if (dbItem.effectType === 'weightless') this.player.weightlessTimer = (dbItem.effectDuration / 1000) || 60;

            targetItem.capacity -= 1;
            if (targetItem.capacity <= 0) {
                this.inventory.items.splice(idx, 1);
                this.inventory.freeGrid(targetItem, this.inventory[targetItem.container]);
            }
            this.updateHUD();
            if (this.ui) this.ui.refreshInventory();
            return;
        }

        // Apply effect based on healType
        let usedCap = false;

        if (dbItem.healType === 'instant') {
            this.player.health = Math.min(100, this.player.health + (dbItem.healAmount || 0));
            usedCap = true;
        } else if (dbItem.healType === 'over_time') {
            this.player.healOverRate = dbItem.healRate;
            // Calculate how long healing will last: (100 - currentHp) / healRate seconds
            const hpNeeded = Math.max(1, 100 - this.player.health);
            this.player.healOverTimer = hpNeeded / (dbItem.healRate || 1);
            this.player.healOverName = dbItem.name || '血包';
            usedCap = true;
        } else if (dbItem.healType === 'remove_bleed') {
            if (this.player.isBleeding || this.player.isHeavyBleeding) {
                this.player.isHeavyBleeding = false;
                this.player.isBleeding = false;
                this.player.bleedCount = 0;
                usedCap = true;
            }
        } else if (dbItem.healType === 'remove_injury') {
            if (this.player.hasHeadInjury || this.player.hasTorsoInjury || this.player.isBleeding || this.player.isHeavyBleeding) {
                this.player.hasHeadInjury = false;
                this.player.hasTorsoInjury = false;
                this.player.isBleeding = false;
                this.player.isHeavyBleeding = false;
                this.player.bleedCount = 0;
                usedCap = true;
            }
        } else if (dbItem.healType === 'remove_any') {
            if (this.player.hasHeadInjury || this.player.hasTorsoInjury || this.player.isBleeding || this.player.isHeavyBleeding) {
                this.player.hasHeadInjury = false;
                this.player.hasTorsoInjury = false;
                this.player.isBleeding = false;
                this.player.isHeavyBleeding = false;
                this.player.bleedCount = 0;
                usedCap = true;
            }
        } else if (dbItem.healType === 'full_heal') {
            this.player.hasHeadInjury = false;
            this.player.hasTorsoInjury = false;
            this.player.isBleeding = false;
            this.player.isHeavyBleeding = false;
            this.player.bleedCount = 0;
            this.player.health = 100;
            usedCap = true;
        } else if (dbItem.healType === 'painkiller') {
            this.player.pkActiveTime += (dbItem.pkDuration || 3000) / 1000; // in seconds
            usedCap = true;
        }

        if (usedCap) {
            targetItem.capacity -= (dbItem.costPerUse || 1);
            if (targetItem.capacity <= 0) {
                this.inventory.items.splice(idx, 1);
                this.inventory.freeGrid(targetItem, this.inventory[targetItem.container]);
            }
        }

        if (this.ui) this.ui.refreshInventory();
        this.updateHUD();
    }

    loop(time) {
        const dt = (time - this.lastTime) / 1000.0;
        this.lastTime = time;

        this.update(dt);
        this.render();

        requestAnimationFrame((t) => this.loop(t));
    }
}

window.onload = () => {
    const game = new Game();
    window.game = game;
    window.gameInstance = game;
    game.init();

    // Developer helper info in console
    console.log("Game Loaded. Global helpers injected: window.setWeight(kg), window.setBleeding(bool), window.setHealth(0-100)");
};
