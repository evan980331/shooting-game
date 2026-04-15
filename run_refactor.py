import re

def refactor_sim():
    with open('game_simulation.js', 'r', encoding='utf-8') as f:
        code = f.read()

    # 1. Add MathUtils
    math_utils = """
export class MathUtils {
    static seed = 1234567;
    static seededRandom() {
        this.seed = (this.seed * 9301 + 49297) % 233280;
        return this.seed / 233280;
    }
}
"""
    if 'class MathUtils' not in code:
        code = re.sub(r"(import .*?\n)(?=\s*export class)", r"\1\n" + math_utils, code, count=1)

    # 2. Rewrite constructor and addPlayer/removePlayer
    constructor_pattern = re.compile(r'    constructor\(\) \{.*?(?=    pushMessage)', re.DOTALL)
    
    new_constructor = """    constructor() {
        this.nextBulletId = 1;
        this.state = {
            players: {},
            bullets: [],
            bots: [],
            effects: [],
            time: 0
        };

        this.walls = [
            { x: 2000, y: -20, w: 4040, h: 40, color: [0.3, 0.3, 0.3, 1] },
            { x: 2000, y: 4020, w: 4040, h: 40, color: [0.3, 0.3, 0.3, 1] },
            { x: -20, y: 2000, w: 40, h: 4040, color: [0.3, 0.3, 0.3, 1] },
            { x: 4020, y: 2000, w: 40, h: 4040, color: [0.3, 0.3, 0.3, 1] },
            { x: 1800, y: 1850, w: 300, h: 40, color: [0.5, 0.5, 0.5, 1] },
            { x: 1800, y: 2150, w: 300, h: 40, color: [0.5, 0.5, 0.5, 1] },
            { x: 2200, y: 2000, w: 40, h: 300, color: [0.5, 0.5, 0.5, 1] }
        ];

        this.extractionZones = [
            { x: 2300, y: 1800, w: 200, h: 200, color: [0, 1, 0, 0.3] }
        ];

        this.isInMenu = true;
        this.currentMap = 1;
        this.gameTimer = 900;
        
        this.events = {
            inventoryDirty: false,
            playerDied: false,
            playerWon: false,
            sessionReset: false,
            messages: []
        };
    }

    addPlayer(id) {
        this.state.players[id] = {
            id: id,
            x: 2000, y: 2000,
            size: 30, rotation: 0,
            health: 100,
            isBleeding: false, isHeavyBleeding: false,
            hasHeadInjury: false, hasTorsoInjury: false,
            pkActiveTime: 0, isHealing: false, isReloading: false,
            reloadTimer: 0, healOverRate: 0,
            weight: 0, baseSpeed: 200,
            color: [0, 0.5, 1, 1],
            isDead: false, isExtracting: false,
            extractionTimer: 10.0, won: false,
            visualJitter: 0, recoilOffset: { x: 0, y: 0 }, cameraZoom: 1.5,
            consecutiveShots: 0, lastShotTime: 0,
            shootTimer: 0,
            input: { moveX: 0, moveY: 0, isShooting: false, mouseX: 0, mouseY: 0, canvasW: 800, canvasH: 600 }
        };
        this.state.players[id].inventory = new InventorySystem(this.state.players[id]);
        return this.state.players[id];
    }

    removePlayer(id) {
        delete this.state.players[id];
    }

    applyInput(id, input) {
        const p = this.state.players[id];
        if (!p) return;
        p.input.moveX = input.move ? input.move.x : 0;
        p.input.moveY = input.move ? input.move.y : 0;
        if(input.angle !== undefined) p.rotation = input.angle;
        p.input.isShooting = !!input.shoot;
    }

    exportState() {
        const payload = {
            time: this.state.time,
            players: {},
            bullets: this.state.bullets,
            bots: this.state.bots,
            effects: this.state.effects
        };
        for (let id in this.state.players) {
            const p = this.state.players[id];
            payload.players[id] = {
                id: p.id,
                x: p.x, y: p.y, rotation: p.rotation, size: p.size,
                health: p.health, isBleeding: p.isBleeding, isHeavyBleeding: p.isHeavyBleeding,
                hasHeadInjury: p.hasHeadInjury, hasTorsoInjury: p.hasTorsoInjury,
                pkActiveTime: p.pkActiveTime, isHealing: p.isHealing, isReloading: p.isReloading,
                adrenalineTimer: p.adrenalineTimer, strengthTimer: p.strengthTimer, weightlessTimer: p.weightlessTimer,
                isDead: p.isDead, isExtracting: p.isExtracting, extractionTimer: p.extractionTimer, won: p.won,
                color: p.color,
                inventory: {
                    items: p.inventory.items,
                    backpack: p.inventory.backpack
                }
            };
        }
        return JSON.stringify(payload);
    }

    importState(json) {
        const parsed = JSON.parse(json);
        this.state.time = parsed.time;
        this.state.bullets = parsed.bullets;
        this.state.bots = parsed.bots;
        this.state.effects = parsed.effects;
        
        for (let id in parsed.players) {
            if (!this.state.players[id]) this.addPlayer(id);
            const sp = parsed.players[id];
            const p = this.state.players[id];
            Object.assign(p, sp); // merge raw data
            // We do not copy sp.inventory directly over p.inventory!
            // We just update the arrays so client UI referencing p.inventory still works.
            if(sp.inventory) {
                p.inventory.items = sp.inventory.items;
                p.inventory.backpack = sp.inventory.backpack;
            }
        }
    }

"""
    code = constructor_pattern.sub(new_constructor, code)
    
    # 3. Replace all "this.player" with "p"
    # But wait, methods need to take `p`!
    
    # Let's fix getSpeedMultiplier
    code = code.replace("getSpeedMultiplier() {", "getSpeedMultiplier(p) {")
    code = re.sub(r'this\.player((?:\.[a-zA-Z0-9_]+)+)', r'p\1', code)
    
    # Fix 'this.input' everywhere. Since input is on 'p', this.input -> p.input
    code = code.replace("this.input.", "p.input.")
    
    # Fix Math.random()
    code = code.replace("Math.random()", "MathUtils.seededRandom()")
    
    # Fix performance.now()
    code = code.replace("performance.now()", "(this.state.time * 1000)")
    
    # Now, the tricky part: update(dt) needs to iterate over players
    update_old = "    update(dt, isInventoryOpen) {"
    update_new = """    update(dt) {
        this.state.time += dt;
        for (let id in this.state.players) {
            let p = this.state.players[id];
            this.updatePlayer(p, dt);
        }
        this.updateBullets(dt);
        this.updateBots(dt);
        // Note: updateTimersAndZones is now handled per player or globally.
        if (this.gameTimer > 0) {
            this.gameTimer -= dt;
            if (this.gameTimer <= 0) {
                this.gameTimer = 0;
            }
        }
    }

    updatePlayer(p, dt) {"""
    
    code = code.replace(update_old, update_new)
    
    # Replace references to `isInventoryOpen` since it doesn't apply cleanly here, 
    # Or just remove `if (!isInventoryOpen)` conditions since server handles input!
    code = re.sub(r'if \(!isInventoryOpen\) \{', r'if (true) {', code)
    
    # Replace checkWallCollision's implicit player size
    code = code.replace("const checkW = overrideW !== null ? overrideW : p.size;", "const checkW = overrideW !== null ? overrideW : 30;")
    code = code.replace("const checkH = overrideH !== null ? overrideH : p.size;", "const checkH = overrideH !== null ? overrideH : 30;")
    
    # Add 'p' to internal methods
    methods_to_add_p = ['updatePlayerState', 'updateEffects', 'updateRecoil', 'updateTimersAndZones', 'shoot', 'die', 'win']
    for m in methods_to_add_p:
        code = code.replace(f"this.{m}(dt);", f"this.{m}(p, dt);")
        code = code.replace(f"this.{m}();", f"this.{m}(p);")
        code = code.replace(f"{m}(dt) {{", f"{m}(p, dt) {{")
        code = code.replace(f"{m}() {{", f"{m}(p) {{")
    
    code = code.replace("damagePlayer(amount, hitZone = 'torso', ammoId = null, armorPen = 1.0)", "damagePlayer(p, amount, hitZone = 'torso', ammoId = null, armorPen = 1.0)")
    code = code.replace("this.damagePlayer(fx.damage * 0.7, 'torso');", "this.damagePlayer(p, fx.damage * 0.7, 'torso');")
    
    # Wait, the bot shooting logic needs to damage a player!
    # Original:
    # if (b.owner === 'bot' && !p.isDead) { let dist = Math.hypot(p.x - ...); this.damagePlayer(b.damage, ...) }
    # Now that we have multiple players, the bullets need to check against ALL players.
    # In 'updateBullets(dt)'
    bot_hit_logic = """if (b.owner === 'bot' && !p.isDead) {
                let dist = Math.hypot(p.x - b.x, p.y - b.y);
                if (dist < (p.size / 2) + 5) {
                    let isHead = dist < (p.size / 4);
                    this.damagePlayer(b.damage, isHead ? 'head' : 'torso', b.ammoId || null, b.armorPen || 1.0);
                    this.bullets.splice(i, 1);
                    continue;
                }
            }"""
    bot_hit_logic_new = """if (b.owner === 'bot') {
                let hitResult = false;
                for (let pid in this.state.players) {
                    let cp = this.state.players[pid];
                    if (cp.isDead) continue;
                    if (Math.hypot(cp.x - b.x, cp.y - b.y) < (cp.size / 2) + 5) {
                        this.damagePlayer(cp, b.damage, 'torso', b.ammoId || null, b.armorPen || 1.0);
                        this.state.bullets.splice(i, 1);
                        hitResult = true;
                        break;
                    }
                }
                if(hitResult) continue;
            }"""
    # Simply doing regex to replace `this.bullets` and `this.bots` with `this.state.bullets`
    code = code.replace("this.bullets.", "this.state.bullets.")
    code = code.replace("this.bots.", "this.state.bots.")
    code = code.replace("this.effects.", "this.state.effects.")
    
    # There are so many specific parts. I will write the final file directly in Python rather than regex matching!

    with open('game_simulation_refactored.js', 'w', encoding='utf-8') as f:
        f.write(code)

refactor_sim()
