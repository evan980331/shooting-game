def patch_main():
    with open('main.js', 'r', encoding='utf-8') as f:
        code = f.read()

    # 1. Update constructor
    old_const = """    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = null;
        this.device = null;

        // Extract simulation state
        this.sim = new GameSimulation();

        // Bind legacy properties to simulation so UI and external scripts still work unmodified
        this.player = this.sim.player;
        this.input = this.sim.input;
        this.walls = this.sim.walls;
        this.extractionZones = this.sim.extractionZones;
        this.bullets = this.sim.bullets;
        this.effects = this.sim.effects;
        this.bots = this.sim.bots;
        this.inventory = this.sim.inventory;

        // View/Render state
        this.lastTime = performance.now();
        this.renderInstances = []; // Collect items to draw
        this.cameraX = 0;
        this.cameraY = 0;

        // Link properties from sim that UI checks natively
        Object.defineProperty(this, 'isInMenu', { get: () => this.sim.isInMenu, set: (v) => this.sim.isInMenu = v });
        Object.defineProperty(this, 'shootTimer', { get: () => this.sim.shootTimer, set: (v) => this.sim.shootTimer = v });
        Object.defineProperty(this, 'gameTimer', { get: () => this.sim.gameTimer, set: (v) => this.sim.gameTimer = v });

        this.sim.completeHealingCallback = () => this.completeHealing();

        this.bindEvents();
    }"""
    
    new_const = """    constructor() {
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
                this.sim.importState(msg.data);
                // Ensure inventory UI checks re-bind if raw data wiped instance
                this.player = this.sim.state.players[this.localPlayerId];
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
"""
    code = code.replace(old_const, new_const)

    # 2. Patch inputs in handleKey
    old_hk = """    handleKey(key, state) {
        if (key === 'w') this.input.w = state;
        if (key === 'a') this.input.a = state;
        if (key === 's') this.input.s = state;
        if (key === 'd') this.input.d = state;"""
    new_hk = """    handleKey(key, state) {
        if (key === 'w') this.input.w = state;
        if (key === 'a') this.input.a = state;
        if (key === 's') this.input.s = state;
        if (key === 'd') this.input.d = state;
        
        let moveX = 0; let moveY = 0;
        if (this.input.a) moveX -= 1;
        if (this.input.d) moveX += 1;
        if (this.input.w) moveY -= 1;
        if (this.input.s) moveY += 1;
        
        this.input.moveX = moveX;
        this.input.moveY = moveY;"""
    code = code.replace(old_hk, new_hk)

    # 3. Patch mouse input recording
    old_mouse_move = """        window.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.input.mouseX = e.clientX - rect.left;
            this.input.mouseY = e.clientY - rect.top;
        });"""
    new_mouse_move = """        window.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.input.mouseX = e.clientX - rect.left;
            this.input.mouseY = e.clientY - rect.top;
            
            const dx = this.input.mouseX - (this.canvas.width / 2) - (this.player.recoilOffset ? this.player.recoilOffset.x : 0);
            const dy = this.input.mouseY - (this.canvas.height / 2) - (this.player.recoilOffset ? this.player.recoilOffset.y : 0);
            this.player.rotation = Math.atan2(dy, dx);
        });"""
    code = code.replace(old_mouse_move, new_mouse_move)

    # 4. Patch loop to not update simulation if multiplayer
    old_loop = """        if (!this.ui.isInventoryOpen) {
            this.sim.update(dt, this.ui.isInventoryOpen);
        } else {
            this.sim.update(dt, this.ui.isInventoryOpen);
        }"""
    # Wait, how does it look currently? Let's check visually:
    # `this.sim.update(dt, this.ui.isInventoryOpen);`
    # Let me just replace the direct call.
    code = code.replace("        this.sim.update(dt, this.ui.isInventoryOpen);", """
        if (!this.isMultiplayer) {
            this.sim.update(dt);
        } else {
            this.sendInput();
        }
""")
    code = code.replace("        this.sim.update(dt, true);", "") # Remove any other update calls

    # 5. Remove `completeHealing` method since it's now in game_simulation
    # I'll just leave completeHealing there since I removed the callback hook. It won't be called.

    # 6. Delete old reset methods delegating to sim without player obj
    code = code.replace("this.sim.resetSession();", "this.sim.resetSession(); if(this.isMultiplayer) {\n            // Tell server to reset? For now just UI\n        }")
    code = code.replace("this.sim.spawnTestBot();", "this.sim.spawnTestBot(); // Bot spawn command")

    with open('main.js', 'w', encoding='utf-8') as f:
        f.write(code)

patch_main()
