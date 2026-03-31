import { InventorySystem } from './inventory.js?v=6.9';
import { UIManager } from './ui.js?v=7.5';
import { ItemDatabase } from './db.js?v=7.0';

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
        this.canvas = document.getElementById('game-canvas');
        this.ctx = null;
        this.device = null;

        // Game State
        this.player = {
            x: 2000,
            y: 2000,
            size: 30, // radius/size
            rotation: 0,
            health: 100,
            isBleeding: false,
            isHeavyBleeding: false,
            hasHeadInjury: false,
            hasTorsoInjury: false,
            pkActiveTime: 0,
            isHealing: false,
            isReloading: false,
            reloadTimer: 0,
            healOverRate: 0,
            weight: 0,
            baseSpeed: 200, // units per second
            color: [0, 0.5, 1, 1], // Blue
            isDead: false,
            isExtracting: false,
            extractionTimer: 10.0, // seconds
            won: false,
            visualJitter: 0, // Horizontal recoil jitter
            recoilOffset: { x: 0, y: 0 }, // Spring-back recoil offset
            cameraZoom: 1.5 // Added FOV multiplier (1.5x larger field of view)
        };

        this.input = {
            w: false, a: false, s: false, d: false,
            mouseX: 400, mouseY: 300, isShooting: false
        };

        this.walls = [
            // Outer limits (4000x4000)
            { x: 2000, y: -20, w: 4040, h: 40, color: [0.3, 0.3, 0.3, 1] },
            { x: 2000, y: 4020, w: 4040, h: 40, color: [0.3, 0.3, 0.3, 1] },
            { x: -20, y: 2000, w: 40, h: 4040, color: [0.3, 0.3, 0.3, 1] },
            { x: 4020, y: 2000, w: 40, h: 4040, color: [0.3, 0.3, 0.3, 1] },
            // Inner obstacles
            { x: 1800, y: 1850, w: 300, h: 40, color: [0.5, 0.5, 0.5, 1] },
            { x: 1800, y: 2150, w: 300, h: 40, color: [0.5, 0.5, 0.5, 1] },
            { x: 2200, y: 2000, w: 40, h: 300, color: [0.5, 0.5, 0.5, 1] }
        ];

        this.extractionZones = [
            { x: 2300, y: 1800, w: 200, h: 200, color: [0, 1, 0, 0.3] } // Green translucent
        ];

        this.lastTime = performance.now();
        this.renderInstances = []; // Collect items to draw

        this.isInMenu = true;
        this.currentMap = 1; // Default map is 1
        this.cameraX = 0;
        this.cameraY = 0;
        this.bullets = [];
        this.effects = [];
        this.shootTimer = 0;

        // Setup inventory logic early so HUD can bind
        this.inventory = new InventorySystem(this.player);

        // Match user requirement: 15 minutes timer -> 900 seconds
        this.gameTimer = 900;

        this.bindEvents();
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

        // Start loop
        requestAnimationFrame((t) => this.loop(t));
        return true;
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
        let weightPenalty = this.player.weight * 0.01;
        if (this.player.weightlessTimer > 0) weightPenalty = 0;

        let mult = 1.0 - weightPenalty;
        if (mult > 1.05) mult = 1.05; // clamp max naturally

        if (this.player.hasTorsoInjury) mult -= 0.15; // 15% penalty
        if (this.player.isHealing) mult *= 0.50; // 50% slow when healing
        if (this.player.isRepairing) mult *= 0.50; // 50% slow when repairing
        if (this.player.isGassed) mult *= 0.95; // 5% slow from gas

        if (this.player.adrenalineTimer > 0) mult *= 1.10; // +10% speed

        return Math.max(0.1, mult);
    }

    AABBIntersect(rect1, rect2) {
        const r1L = rect1.x - rect1.w / 2;
        const r1R = rect1.x + rect1.w / 2;
        const r1T = rect1.y - rect1.h / 2;
        const r1B = rect1.y + rect1.h / 2;

        const r2L = rect2.x - rect2.w / 2;
        const r2R = rect2.x + rect2.w / 2;
        const r2T = rect2.y - rect2.h / 2;
        const r2B = rect2.y + rect2.h / 2;

        return !(r2L > r1R ||
            r2R < r1L ||
            r2T > r1B ||
            r2B < r1T);
    }

    checkWallCollision(nx, ny, overrideW = null, overrideH = null) {
        // Simple AABB collision with walls
        const checkW = overrideW !== null ? overrideW : this.player.size;
        const checkH = overrideH !== null ? overrideH : this.player.size;
        const targetRect = { x: nx, y: ny, w: checkW, h: checkH };
        for (let w of this.walls) {
            if (this.AABBIntersect(targetRect, w)) return true;
        }
        return false;
    }

    update(dt) {
        if (this.player.isDead || this.player.won || this.isInMenu) return;

        if (!this.isInventoryOpen) {
            this.shootTimer -= dt;
            if (this.input.isShooting && this.shootTimer <= 0) {
                if (this.player.isRepairing) {
                    this.player.isRepairing = false;
                    this.updateHUD();
                }
                this.shoot();
            }
        }
        this.updateBullets(dt);
        
        // Update Bots
        if (this.bots) {
            for (let b of this.bots) {
                if (b.health <= 0) continue;
                b.shootTimer -= dt;
                if (b.shootTimer <= 0 && b.weapon) {
                    let s = b.weapon.stats;
                    b.shootTimer = 10.0 / Math.max(1, s.fireRate);
                    let bulletSpeed = Math.max(10, s.velocity) * 20;
                    let effectiveRange = Math.max(10, s.range) * 20;
                    
                    let baseSpread = 0.43 * (1 - (s.accuracy / 100));
                    let angleOffset = (Math.random() * 2 - 1) * baseSpread;
                    let finalRot = b.rotation + angleOffset;
                    
                    this.bullets.push({
                        x: b.x + Math.cos(b.rotation) * 25,
                        y: b.y + Math.sin(b.rotation) * 25,
                        rot: finalRot,
                        speed: bulletSpeed,
                        damage: s.damage || 0,
                        maxRange: effectiveRange,
                        distTravelled: 0,
                        decayed: false,
                        owner: 'bot'
                    });
                }
            }
        }

        if (!this.isInventoryOpen) {
            // Player rotation based on screen center (camera focuses on player)
            // Use logical position + recoil offset for aim calculation
            const dx = this.input.mouseX - (this.canvas.width / 2) - this.player.recoilOffset.x;
            const dy = this.input.mouseY - (this.canvas.height / 2) - this.player.recoilOffset.y;
            this.player.rotation = Math.atan2(dy, dx);

            // Movement
            const mult = this.getSpeedMultiplier();
            const speed = this.player.baseSpeed * mult * dt;

            let moveX = 0;
            let moveY = 0;

            if (this.input.w) moveY -= 1;
            if (this.input.s) moveY += 1;
            if (this.input.a) moveX -= 1;
            if (this.input.d) moveX += 1;

            if (moveX !== 0 || moveY !== 0) {
                // Normalize for diagonal movement
                const len = Math.sqrt(moveX * moveX + moveY * moveY);
                moveX = (moveX / len) * speed;
                moveY = (moveY / len) * speed;

                // X-axis check
                if (!this.checkWallCollision(this.player.x + moveX, this.player.y)) {
                    this.player.x += moveX;
                }
                // Y-axis check
                if (!this.checkWallCollision(this.player.x, this.player.y + moveY)) {
                    this.player.y += moveY;
                }
            }
        }

        // Injury and Healing (Tick effects over time)
        if (this.player.pkActiveTime > 0) this.player.pkActiveTime -= dt;
        if (this.player.adrenalineTimer > 0) {
            this.player.adrenalineTimer -= dt;
            this.player.bleedCount = 0;
            this.player.isBleeding = false;
            this.player.isHeavyBleeding = false;
        }
        if (this.player.strengthTimer > 0) this.player.strengthTimer -= dt;
        if (this.player.weightlessTimer > 0) this.player.weightlessTimer -= dt;

        let shouldTakeTickDmg = this.player.pkActiveTime <= 0;

        // Bleeding ticks (tick-based, not per-frame)
        // bleedCount = 0 (none), 1 (one stack, tick every 2s), 2 (two stacks, tick every 1s)
        // Normal bleed never kills (locks at 1 HP)
        if (!this.player.bleedCount) this.player.bleedCount = 0;
        const bleedCount = this.player.bleedCount;

        if (bleedCount > 0 && !this.player.isHeavyBleeding && shouldTakeTickDmg) {
            const bleedInterval = 2.0; // 永遠每 2 秒扣血
            this.player.bleedTimer = (this.player.bleedTimer || 0) + dt;
            if (this.player.bleedTimer >= bleedInterval) {
                this.player.bleedTimer -= bleedInterval;
                // 依據堆疊層數決定扣血量 (1層=1HP, 2層=2HP) 或者固定只扣1HP。這裡固定每2秒扣1HP來符合修復要求
                let damage = bleedCount === 2 ? 2 : 1; 
                if (this.player.health > 1) {
                    this.player.health = Math.max(1, this.player.health - damage);
                }
            }
        } else if (bleedCount === 0 && !this.player.isHeavyBleeding) {
            this.player.bleedTimer = 0;
        }

        // Sync legacy isBleeding flag from bleedCount
        this.player.isBleeding = bleedCount > 0;

        // Heavy bleed ticks (can kill)
        if (this.player.isHeavyBleeding && shouldTakeTickDmg) {
            this.player.heavyBleedTimer = (this.player.heavyBleedTimer || 0) + dt;
            if (this.player.heavyBleedTimer >= 1.0) {
                this.player.heavyBleedTimer -= 1.0;
                this.player.health -= 1;
            }
        } else if (!this.player.isHeavyBleeding) {
            this.player.heavyBleedTimer = 0;
        }

        if (this.player.hasHeadInjury && shouldTakeTickDmg) this.player.health -= 0.5 * dt;   // ~1HP/2sec
        if (this.player.hasTorsoInjury && shouldTakeTickDmg) this.player.health -= 1.0 * dt;   // ~1HP/sec

        if (this.player.healOverRate > 0) {
            this.player.health += this.player.healOverRate * dt;
            if (this.player.health > 100) this.player.health = 100;
            if (this.player.healOverTimer !== undefined && this.player.healOverTimer > 0) {
                this.player.healOverTimer -= dt;
                if (this.player.healOverTimer <= 0 || this.player.health >= 100) {
                    this.player.healOverRate = 0;
                    this.player.healOverTimer = 0;
                    this.player.healOverName = '';
                }
            }
        }

        if (this.player.health <= 0) {
            this.player.health = 0;
            if (!this.player.isDead) this.die();
        }

        // Handle Active Throwables / Effects
        this.player.isGassed = false;
        for (let i = this.effects.length - 1; i >= 0; i--) {
            let fx = this.effects[i];
            if (!fx.active) {
                fx.fuse -= dt;
                if (fx.fuse <= 0) {
                    fx.active = true;
                    if (fx.type === 'frag') {
                        let dist = Math.hypot(this.player.x - fx.x, this.player.y - fx.y);
                        if (dist < fx.radius) {
                            this.damagePlayer(fx.damage * 0.7, 'torso');
                        }
                        this.effects.splice(i, 1);
                    }
                }
            } else {
                fx.timer -= dt;
                if (fx.type === 'gas') {
                    let dist = Math.hypot(this.player.x - fx.x, this.player.y - fx.y);
                    if (dist < fx.radius) {
                        this.player.isGassed = true;
                        this.player.health -= 2 * dt;
                    }
                }
                if (fx.timer <= 0) {
                    this.effects.splice(i, 1);
                }
            }
        }

        // Recoil & Jitter Decay (Recovery)
        if (Math.abs(this.player.visualJitter) > 0.001) {
            this.player.visualJitter *= Math.pow(0.0001, dt); // Very fast decay
        } else {
            this.player.visualJitter = 0;
        }

        // Recovery for position recoil (Spring back)
        const recoveryFactor = Math.pow(0.000001, dt); // Extremely fast spring-back
        this.player.recoilOffset.x *= recoveryFactor;
        this.player.recoilOffset.y *= recoveryFactor;
        if (Math.abs(this.player.recoilOffset.x) < 0.1) this.player.recoilOffset.x = 0;
        if (Math.abs(this.player.recoilOffset.y) < 0.1) this.player.recoilOffset.y = 0;

        // Global Game Timer (15 mins)
        if (this.gameTimer > 0) {
            this.gameTimer -= dt;
            if (this.gameTimer <= 0) {
                this.gameTimer = 0;
                this.die(); // Die when time runs out
            }
        }

        // Reload Logic processing
        if (this.player.isReloading) {
            this.player.reloadTimer -= dt;
            let ri = document.getElementById('reloading-indicator');
            if (ri) ri.innerText = "(換彈中... " + Math.max(0, this.player.reloadTimer).toFixed(1) + "s)";

            if (this.player.reloadTimer <= 0) {
                this.player.isReloading = false;
                if (this.player.reloadTargetWeapon) {
                    this.player.reloadTargetWeapon.currentMag += this.player.reloadAmount;
                }
                if (ri) ri.innerText = '(換彈中...)';
                this.updateHUD();
            }
        }

        // Repair Logic Processing
        if (this.player.isRepairing) {
            if (this.player.repairPrepTimer > 0) {
                this.player.repairPrepTimer -= dt;
            } else {
                const dbKit = ItemDatabase[this.player.repairKit.typeId];
                const dbArmor = ItemDatabase[this.player.repairTarget.typeId];
                
                if (dbKit && dbArmor) {
                    let consumeAmt = this.player.repairUseRate * dt;
                    consumeAmt = Math.min(consumeAmt, this.player.repairKit.capacity);
                    
                    let missingDur = this.player.repairTarget.maxDurability - this.player.repairTarget.durability;
                    let requiredConsume = missingDur / this.player.repairEfficiency;
                    consumeAmt = Math.min(consumeAmt, requiredConsume);
                    
                    if (consumeAmt > 0) {
                        this.player.repairKit.capacity -= consumeAmt;
                        this.player.repairTarget.durability += consumeAmt * this.player.repairEfficiency;
                        if (this.ui) this.ui.refreshInventory();
                    }
                    
                    if (this.player.repairKit.capacity <= 0 || this.player.repairTarget.durability >= this.player.repairTarget.maxDurability) {
                        this.player.isRepairing = false;
                        if (this.player.repairKit.capacity <= 0) {
                            let idx = this.inventory.items.findIndex(i => i.id === this.player.repairKit.id);
                            if (idx !== -1) {
                                this.inventory.freeGrid(this.player.repairKit, this.inventory[this.player.repairKit.container]);
                                this.inventory.items.splice(idx, 1);
                            }
                        }
                        if (this.ui) this.ui.refreshInventory();
                    }
                } else {
                    this.player.isRepairing = false;
                }
            }
        }

        // Healing Logic Processing
        if (this.player.isHealing) {
            this.player.healTimer -= dt;
            if (this.player.healTimer <= 0) {
                this.completeHealing();
            }
        }

        // Extraction Zone Check
        const playerRect = { x: this.player.x, y: this.player.y, w: this.player.size, h: this.player.size };
        let inZone = false;
        for (let z of this.extractionZones) {
            if (this.AABBIntersect(playerRect, z)) {
                inZone = true;
                break;
            }
        }

        if (inZone) {
            this.player.isExtracting = true;
            this.player.extractionTimer -= dt;
            if (this.player.extractionTimer <= 0) {
                this.win();
            }
        } else {
            this.player.isExtracting = false;
            this.player.extractionTimer = 10.0;
        }

        // Update Camera to follow player (center screen, including recoil bounce)
        // Zoom-aware camera centering
        const virtualWidth = this.canvas.width * this.player.cameraZoom;
        const virtualHeight = this.canvas.height * this.player.cameraZoom;
        this.cameraX = (this.player.x + this.player.recoilOffset.x) - virtualWidth / 2;
        this.cameraY = (this.player.y + this.player.recoilOffset.y) - virtualHeight / 2;

        // Update Uniforms
        this.device.queue.writeBuffer(
            this.uniformBuffer, 0,
            new Float32Array([this.canvas.width * this.player.cameraZoom, this.canvas.height * this.player.cameraZoom, this.cameraX, this.cameraY])
        );

        this.updateHUD();
    }

    damagePlayer(amount, hitZone = 'torso', ammoId = null, armorPen = 1.0) {
        if (this.player.isDead) return;

        const dbAmmo = ammoId ? ItemDatabase[ammoId] : null;

        // Apply conditions based on rules
        if (hitZone === 'torso') {
            let armorItem = this.inventory.items.find(i => i.container === 'armorSlot');
            if (armorItem && armorItem.durability > 0) {
                let dbArmor = ItemDatabase[armorItem.typeId];
                let armorLevel = dbArmor.level || 1;
                let penLevel = dbAmmo ? (dbAmmo.penLevel || 0) : 0;

                if (penLevel >= armorLevel) {
                    // Full penetration: armor barely takes damage, full HP damage passes through
                    let mod = dbAmmo.armorDamageMods ? (dbAmmo.armorDamageMods[armorLevel] || 0) : 0;
                    armorItem.durability -= amount * mod * armorPen;
                    armorItem.durability = Math.max(0, armorItem.durability);
                } else {
                    // Normal block logic scaled by armor damage mod
                    let mod = dbAmmo ? (dbAmmo.armorDamageMods ? (dbAmmo.armorDamageMods[armorLevel] || 1.0) : 1.0) : 1.0;
                    let blockAmount = amount * (dbArmor.damageReduction || 0);
                    let armorDmg = blockAmount * mod * armorPen;
                    if (armorDmg > armorItem.durability) armorDmg = armorItem.durability;
                    armorItem.durability -= armorDmg;
                    amount -= armorDmg; // HP damage reduced by armor block
                    armorItem.durability = Math.max(0, armorItem.durability);
                }
                if (this.ui) this.ui.refreshInventory();
            } else if (!this.player.hasTorsoInjury && amount > 15) {
                this.player.hasTorsoInjury = true;
            }
        } else if (hitZone === 'head') {
            let helmetItem = this.inventory.items.find(i => i.container === 'helmetSlot');
            if (helmetItem && helmetItem.durability > 0) {
                let dbHelmet = ItemDatabase[helmetItem.typeId];
                let armorLevel = dbHelmet.level || 1;
                let penLevel = dbAmmo ? (dbAmmo.penLevel || 0) : 0;

                const weaponAP = dbItem.stats.armorPen || 1.0;
                if (penLevel >= armorLevel) {
                    let mod = dbAmmo.armorDamageMods ? (dbAmmo.armorDamageMods[armorLevel] || 0) : 0;
                    helmetItem.durability -= amount * mod * weaponAP;
                    helmetItem.durability = Math.max(0, helmetItem.durability);
                } else {
                    let mod = dbAmmo ? (dbAmmo.armorDamageMods ? (dbAmmo.armorDamageMods[armorLevel] || 1.0) : 1.0) : 1.0;
                    let blockAmount = amount * (dbHelmet.damageReduction || 0);
                    let armorDmg = blockAmount * mod * weaponAP;
                    if (armorDmg > helmetItem.durability) armorDmg = helmetItem.durability;
                    helmetItem.durability -= armorDmg;
                    amount -= armorDmg;
                    helmetItem.durability = Math.max(0, helmetItem.durability);
                }
                if (this.ui) this.ui.refreshInventory();
            } else if (!this.player.hasHeadInjury && amount > 5) {
                this.player.hasHeadInjury = true;
            }
        }

        // Apply hp damage multiplier from ammo (e.g. 鈍傷彈 = 0.6x HP damage)
        if (dbAmmo && dbAmmo.hpDamageMod !== undefined) {
            amount *= dbAmmo.hpDamageMod;
        }

        // Special ammo effects
        if (dbAmmo && dbAmmo.forceTorsoInjury && !this.player.hasTorsoInjury) {
            this.player.hasTorsoInjury = true;
        }

        this.player.health -= amount;

        if (amount > 40 && !this.player.isHeavyBleeding) {
            this.player.isHeavyBleeding = true;
            this.player.bleedCount = 0; // heavy bleed overrides normal
        } else if (amount > 15) {
            // Stack normal bleeding up to 2 layers
            if (!this.player.isHeavyBleeding) {
                this.player.bleedCount = Math.min(2, (this.player.bleedCount || 0) + 1);
            }
        }

        if (this.player.health <= 0) {
            this.player.health = 0;
            this.die();
        }
    }

    die() {
        this.player.isDead = true;
        this.player.health = 0;
        document.getElementById('game-over').classList.remove('hidden');

        // Clear inventory except stash and secure container
        this.inventory.clearOnDeath();
        this.ui.refreshInventory();
        this.updateHUD(); // Weight will be updated

        // Reset session logic after 3 seconds
        setTimeout(() => {
            this.resetSession();
        }, 3000);
    }

    win() {
        this.player.won = true;
        document.getElementById('game-win').classList.remove('hidden');
        document.getElementById('extraction-timer').classList.add('hidden');

        // Return to start after 5 seconds
        setTimeout(() => {
            this.resetSession();
        }, 5000);
    }

    resetSession() {
        this.player.x = 2000;
        this.player.y = 2000;
        this.player.health = 100;
        this.player.weight = 0;
        this.player.isDead = false;
        this.player.won = false;

        this.player.isBleeding = false;
        this.player.isHeavyBleeding = false;
        this.player.hasHeadInjury = false;
        this.player.hasTorsoInjury = false;
        this.player.pkActiveTime = 0;
        this.player.isHealing = false;
        this.player.isReloading = false;
        this.player.reloadTimer = 0;
        this.player.adrenalineTimer = 0;
        this.player.strengthTimer = 0;
        this.player.weightlessTimer = 0;
        this.player.isGassed = false;
        this.player.healOverRate = 0;
        this.effects = [];

        this.gameTimer = 900; // Reset to 15 mins
        this.player.isExtracting = false;
        this.player.extractionTimer = 10.0;
        
        // Reset camera instantly so next uniform buffer write is correct if needed
        this.cameraX = this.player.x - this.canvas.width / 2;
        this.cameraY = this.player.y - this.canvas.height / 2;

        document.getElementById('game-over').classList.add('hidden');
        document.getElementById('game-win').classList.add('hidden');
        document.getElementById('extraction-timer').classList.add('hidden');

        // Return to lobby: show main-menu, hide game canvas
        const mainMenu = document.getElementById('main-menu');
        const gameContainer = document.getElementById('game-container');
        if (mainMenu) mainMenu.style.display = '';
        if (gameContainer) gameContainer.style.display = 'none';
        this.isInMenu = true;

        // Also refresh UI to sync stash state
        if (this.ui) {
            this.ui.refreshInventory();
        }
    }

    spawnTestBot() {
        this.bots = [{
            x: this.player.x - 200,
            y: this.player.y,
            size: this.player.size,
            rotation: Math.PI,
            health: 100, // Realistic human HP
            maxHealth: 100,
            armorLevel: 4, // Upgraded to Gold Armor for testing
            helmetLevel: 4, // Upgraded to Gold Helmet
            armorType: "金甲",
            armorDurability: 50,
            armorMaxDurability: 50,
            weapon: ItemDatabase["M7"],
            shootTimer: 0,
            color: [1, 0.2, 0.2, 1]
        }];
        console.log('[Test Bot] Spawned with '+this.bots[0].health+' HP, Lv4 Gold Armor/Helmet (AP testing enabled)');
    }

    shoot() {
        let activeItem = this.inventory.items.find(i => i.container === this.player.activeWeaponSlot);
        if (!activeItem) return;
        if (this.player.isReloading) return;

        const weaponDef = ItemDatabase[activeItem.typeId];
        if (!weaponDef) return;

        if (weaponDef.type === 'melee') {
            // Melee Attack Logic
            this.shootTimer = 10.0 / Math.max(1, weaponDef.stats.fireRate);
            // Range check
            let rangeSq = Math.pow(Math.max(2, weaponDef.stats.range) * 20, 2);
            for (let i = this.effects.length - 1; i >= 0; i--) {
                // Optional: implement breaking boxes/effects with melee. 
            }
            // For now, melee doesn't do much in PvE without enemies yet, but let's log it
            console.log("Swung Melee!", weaponDef.name, "Damage:", weaponDef.stats.damage);
            return;
        }

        if (weaponDef.type !== 'weapon' || !weaponDef.stats) return;

        // Check Ammo
        if (activeItem.currentMag !== undefined) {
            if (activeItem.currentMag <= 0) return; // Out of ammo, need reload
            activeItem.currentMag--; // Consume 1 ammo per trigger pull
        }

        const s = weaponDef.stats;

        // Fire Rate: interval = (10000 / fireRate) / 1000 seconds
        let fr = Math.max(1, s.fireRate);
        this.shootTimer = 10.0 / fr; // 10000/fr ms -> 10.0/fr sec

        // Parse damage for shotguns (e.g. "10x8")
        let dmgAmount = 10;
        let pelletCount = 1;
        if (typeof s.damage === 'string' && s.damage.includes('x')) {
            const parts = s.damage.split('x');
            dmgAmount = parseFloat(parts[0]) || 0;
            pelletCount = parseInt(parts[1]) || 1;
        } else {
            dmgAmount = parseFloat(s.damage) || 0;
        }

        // Calculate consecutive shots for spread logic
        if (!this.player.consecutiveShots) this.player.consecutiveShots = 0;
        if (!this.player.lastShotTime) this.player.lastShotTime = 0;
        
        let now = performance.now();
        let frInterval = 10000 / fr; // max time between shots to be considered "continuous"
        
        // If time since last shot exceeds the fire rate interval + 100ms tolerance, reset streak
        if (now - this.player.lastShotTime > frInterval + 100) {
            this.player.consecutiveShots = 0;
        }
        this.player.consecutiveShots++;
        this.player.lastShotTime = now;

        // Spawn Bullets
        for (let p = 0; p < pelletCount; p++) {
            let maxSpreadRad = 0.33; // ~19 deg deviation max
            if (pelletCount > 1) maxSpreadRad = 0.5; // Shotguns

            let baseSpread = maxSpreadRad * (1 - (s.accuracy / 100));

            // First 3 shots no spread, ramps up after
            let currentSpread = 0;
            if (pelletCount > 1) {
                currentSpread = baseSpread; // shotguns always full spread
            } else if (this.player.consecutiveShots > 3) {
                let extra = this.player.consecutiveShots - 3;
                let spreadMult = Math.min(1.0, extra / 7.0);
                currentSpread = baseSpread * spreadMult;
            }

            let jitterMagnitude = (1 - (s.recoil / 100)) * 0.10; // Reduced from 0.15 to 0.10 for 1.5x FOV
            if (this.player.strengthTimer > 0) jitterMagnitude *= 0.5; // Strength reduces jitter
            
            let horizontalJitter = (Math.random() * 2 - 1) * jitterMagnitude;
            
            // Trajectory Logic: First 3 shots perfectly accurate (no jitter on bullet)
            let bulletJitter = (this.player.consecutiveShots > 3) ? horizontalJitter : 0;

            let spreadRand = (Math.random() * 2 - 1);
            if (pelletCount > 1) {
                // Triangular distribution for shotguns: middle is most dense
                spreadRand = (Math.random() + Math.random() - 1);
            }
            let angleOffset = spreadRand * currentSpread + bulletJitter;
            let finalRot = this.player.rotation + angleOffset;

            let bulletSpeed = Math.max(10, s.velocity) * 20;
            let effectiveRange = Math.max(10, s.range) * 20;

            this.bullets.push({
                x: (this.player.x + this.player.recoilOffset.x) + Math.cos(this.player.rotation) * 25,
                y: (this.player.y + this.player.recoilOffset.y) + Math.sin(this.player.rotation) * 25,
                rot: finalRot,
                speed: bulletSpeed,
                damage: dmgAmount,
                maxRange: effectiveRange,
                distTravelled: 0,
                decayed: false,
                armorPen: s.armorPen || 1.0,
                ammoId: activeItem.loadedAmmoId || null
            });
            
            // Store horizontal jitter for visual feedback (use latest pellet's jitter)
            if (p === pelletCount - 1) {
                this.player.visualJitter = horizontalJitter * 0.8;
            }
        }

        // Apply recoil push AFTER bullets are spawned
        // Use recoilOffset for temporary "bounce" that springs back
        let recoilBonus = (this.player.strengthTimer > 0) ? 10 : 0;
        let finalRecoil = Math.max(0, s.recoil - recoilBonus);
        let kickbackForce = (1 - (finalRecoil / 100)) * 450;
        let kickX = -Math.cos(this.player.rotation) * kickbackForce * 0.016;
        let kickY = -Math.sin(this.player.rotation) * kickbackForce * 0.016;

        if (!this.checkWallCollision(this.player.x + this.player.recoilOffset.x + kickX, this.player.y + this.player.recoilOffset.y)) {
            this.player.recoilOffset.x += kickX;
        }
        if (!this.checkWallCollision(this.player.x + this.player.recoilOffset.x, this.player.y + this.player.recoilOffset.y + kickY)) {
            this.player.recoilOffset.y += kickY;
        }
    }

    updateBullets(dt) {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            let b = this.bullets[i];

            let moveX = Math.cos(b.rot) * b.speed * dt;
            let moveY = Math.sin(b.rot) * b.speed * dt;

            b.x += moveX;
            b.y += moveY;
            b.distTravelled += Math.sqrt(moveX * moveX + moveY * moveY);

            if (!b.decayed && b.distTravelled > b.maxRange) {
                b.damage *= 0.5;
                b.decayed = true;
            }

            if (b.owner === 'bot' && !this.player.isDead) {
                let dist = Math.hypot(this.player.x - b.x, this.player.y - b.y);
                if (dist < (this.player.size / 2) + 5) {
                    let isHead = dist < (this.player.size / 4);
                    this.damagePlayer(b.damage, isHead ? 'head' : 'torso', b.ammoId || null, b.armorPen || 1.0);
                    this.bullets.splice(i, 1);
                    continue;
                }
            } else if (b.owner !== 'bot' && this.bots) {
                let hitBot = false;
                for (let bot of this.bots) {
                    if (bot.health <= 0) continue;
                    let dist = Math.hypot(bot.x - b.x, bot.y - b.y);
                    if (dist < (bot.size / 2) + 5) {
                        let isHead = dist < (bot.size / 4);
                        
                        // Ammo Logic against Bot Armor
                        let damage = b.damage;
                        let targetArmorLevel = isHead ? (bot.helmetLevel || 0) : (bot.armorLevel || 0);
                        let ammoDb = b.ammoId ? ItemDatabase[b.ammoId] : null;

                        if (ammoDb && targetArmorLevel > 0 && bot.armorDurability > 0) {
                            let pen = ammoDb.penLevel || 0;
                            const apMult = b.armorPen || 1.0;

                            // Calculate durability damage to bot armor
                            let armorMod = ammoDb.armorDamageMods ? (ammoDb.armorDamageMods[targetArmorLevel] || 1.0) : 1.0;
                            let durDmg = damage * armorMod * apMult;
                            bot.armorDurability -= durDmg;
                            if (bot.armorDurability < 0) bot.armorDurability = 0;

                            if (pen < targetArmorLevel) {
                                // Mitigated
                                let reduction = 0;
                                if (targetArmorLevel === 1) reduction = 0.1;
                                else if (targetArmorLevel === 2) reduction = 0.2;
                                else if (targetArmorLevel === 3) reduction = 0.35;
                                else if (targetArmorLevel === 4) reduction = 0.5;
                                damage *= (1 - reduction);
                            }
                            if (ammoDb.hpDamageMod !== undefined) {
                                damage *= ammoDb.hpDamageMod;
                            }
                        } else if (targetArmorLevel > 0 && bot.armorDurability <= 0) {
                            console.log(`[Combat Log] ! Bot Armor BROKEN ! Full damage dealt.`);
                        }

                        bot.health -= damage;
                        console.log(`[Combat Log] - Hit ${isHead ? 'Head' : 'Torso'}! BaseDmg: ${b.damage.toFixed(1)}, FinalDmg: ${damage.toFixed(1)} vs Lv${targetArmorLevel} Armor. Bot HP: ${Math.max(0, bot.health).toFixed(1)}/100`);

                        if (bot.health <= 0) {
                            console.log(`[Combat Log] !!! BOT KILLED !!!`);
                        }

                        hitBot = true;
                        break;
                    }
                }
                if (hitBot) {
                    this.bullets.splice(i, 1);
                    continue;
                }
            }

            if (this.checkWallCollision(b.x, b.y, 10, 4)) {
                this.bullets.splice(i, 1);
                continue;
            }

            if (b.distTravelled > b.maxRange * 1.2) {
                this.bullets.splice(i, 1);
                continue;
            }
        }
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

        let worldTargetX = this.cameraX + this.input.mouseX; // Simple mapping, assume camera isn't complex
        let worldTargetY = this.cameraY + this.input.mouseY;

        // As standard 2D topdown centering: target = playerPos + (mouseX - screenW/2)
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

        this.effects.push({
            type: dbItem.effectType,
            x: finalX,
            y: finalY,
            timer: (dbItem.duration / 1000) || 0,
            fuse: (dbItem.fuseTime / 1000) || 0,
            damage: dbItem.damage || 0,
            radius: r,
            active: false
        });

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
