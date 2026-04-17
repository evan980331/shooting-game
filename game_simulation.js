import { InventorySystem } from './inventory.js?v=6.9';
import { ItemDatabase } from './db.js?v=7.0';

export class MathUtils {
    static seed = 1234567;
    static seededRandom() {
        this.seed = (this.seed * 9301 + 49297) % 233280;
        return this.seed / 233280;
    }
}

export class GameSimulation {
    constructor() {
        this.nextBulletId = 1;
        this.state = {
            players: {},
            bullets: [],
            bots: [],
            effects: [],
            time: 0
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
            { x: 2300, y: 1800, w: 200, h: 200, color: [0, 1, 0, 0.3] }
        ];

        this.isInMenu = false;
        this.currentMap = 1;
        this.gameTimer = 900;
        
        // Single player / local client flags
        this.events = {
            inventoryDirty: false,
            playerDied: false,
            playerWon: false,
            sessionReset: false,
            messages: []
        };
    }

    pushMessage(msg) {
        this.events.messages.push(msg);
    }

    addPlayer(id) {
        this.state.players[id] = {
            id: id,
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
            visualJitter: 0,
            recoilOffset: { x: 0, y: 0 },
            cameraZoom: 1.5,
            
            // Internal state
            consecutiveShots: 0,
            lastShotTime: 0,
            shootTimer: 0,
            input: { moveX: 0, moveY: 0, isShooting: false },
            inventory: null
        };
        const p = this.state.players[id];
        p.inventory = new InventorySystem(p);
        return p;
    }

    removePlayer(id) {
        delete this.state.players[id];
    }

    applyInput(id, input) {
        const p = this.state.players[id];
        if (!p) return;
        if (input.move) {
            p.input.moveX = input.move.x;
            p.input.moveY = input.move.y;
        }
        if (input.angle !== undefined) {
            p.rotation = input.angle;
        }
        if (input.shoot !== undefined) {
            p.input.isShooting = input.shoot;
        }
        if (input.throw) {
            this.spawnEffect(id, input.throw);
        }
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
            
            // Merge raw data
            Object.assign(p, sp); 
            
            // Protect Inventory reference
            if(sp.inventory && p.inventory) {
                p.inventory.items = sp.inventory.items;
                p.inventory.backpack = sp.inventory.backpack;
            }
        }
    }

    getSpeedMultiplier(p) {
        let weightPenalty = p.weight * 0.01;
        if (p.weightlessTimer > 0) weightPenalty = 0;

        let mult = 1.0 - weightPenalty;
        if (mult > 1.05) mult = 1.05;

        if (p.hasTorsoInjury) mult -= 0.15;
        if (p.isHealing) mult *= 0.50;
        if (p.isRepairing) mult *= 0.50;
        if (p.isGassed) mult *= 0.95;
        if (p.adrenalineTimer > 0) mult *= 1.10;

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

        return !(r2L > r1R || r2R < r1L || r2T > r1B || r2B < r1T);
    }

    checkWallCollision(nx, ny, overrideW = null, overrideH = null) {
        const checkW = overrideW !== null ? overrideW : 30;
        const checkH = overrideH !== null ? overrideH : 30;
        const targetRect = { x: nx, y: ny, w: checkW, h: checkH };
        for (let w of this.walls) {
            if (this.AABBIntersect(targetRect, w)) return true;
        }
        return false;
    }

    update(dt) {
        if (this.isInMenu) return;
        this.state.time += dt;

        for (let id in this.state.players) {
            this.updatePlayer(this.state.players[id], dt);
        }

        this.updateBullets(dt);
        this.updateBots(dt);

        if (this.gameTimer > 0) {
            this.gameTimer -= dt;
            if (this.gameTimer <= 0) {
                this.gameTimer = 0;
                for(let id in this.state.players) {
                    this.die(this.state.players[id]);
                }
            }
        }
    }

    updatePlayer(p, dt) {
        if (p.isDead || p.won) return;

        p.shootTimer -= dt;
        if (p.input.isShooting && p.shootTimer <= 0) {
            if (p.isRepairing) {
                p.isRepairing = false;
                this.events.inventoryDirty = true;
            }
            this.shoot(p);
        }

        const mult = this.getSpeedMultiplier(p);
        const speed = p.baseSpeed * mult * dt;

        let moveX = p.input.moveX;
        let moveY = p.input.moveY;

        if (moveX !== 0 || moveY !== 0) {
            const len = Math.sqrt(moveX * moveX + moveY * moveY);
            moveX = (moveX / len) * speed;
            moveY = (moveY / len) * speed;

            if (!this.checkWallCollision(p.x + moveX, p.y)) {
                p.x += moveX;
            }
            if (!this.checkWallCollision(p.x, p.y + moveY)) {
                p.y += moveY;
            }
        }

        this.updatePlayerState(p, dt);
        this.updateEffects(p, dt);
        this.updateRecoil(p, dt);
        this.updateTimersAndZones(p, dt);
    }

    updateBots(dt) {
        if (!this.state.bots) return;
        for (let b of this.state.bots) {
            if (b.health <= 0) continue;
            b.shootTimer -= dt;
            if (b.shootTimer <= 0 && b.weapon) {
                let s = b.weapon.stats;
                b.shootTimer = 10.0 / Math.max(1, s.fireRate);
                let bulletSpeed = Math.max(10, s.velocity) * 20;
                let effectiveRange = Math.max(10, s.range) * 20;
                
                let baseSpread = 0.43 * (1 - (s.accuracy / 100));
                let angleOffset = (MathUtils.seededRandom() * 2 - 1) * baseSpread;
                let finalRot = b.rotation + angleOffset;
                
                this.state.bullets.push({
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

    updatePlayerState(p, dt) {
        if (p.pkActiveTime > 0) p.pkActiveTime -= dt;
        if (p.adrenalineTimer > 0) {
            p.adrenalineTimer -= dt;
            p.bleedCount = 0;
            p.isBleeding = false;
            p.isHeavyBleeding = false;
        }
        if (p.strengthTimer > 0) p.strengthTimer -= dt;
        if (p.weightlessTimer > 0) p.weightlessTimer -= dt;

        let shouldTakeTickDmg = p.pkActiveTime <= 0;

        if (!p.bleedCount) p.bleedCount = 0;
        const bleedCount = p.bleedCount;

        if (bleedCount > 0 && !p.isHeavyBleeding && shouldTakeTickDmg) {
            const bleedInterval = 2.0; 
            p.bleedTimer = (p.bleedTimer || 0) + dt;
            if (p.bleedTimer >= bleedInterval) {
                p.bleedTimer -= bleedInterval;
                let damage = bleedCount === 2 ? 2 : 1; 
                if (p.health > 1) {
                    p.health = Math.max(1, p.health - damage);
                }
            }
        } else if (bleedCount === 0 && !p.isHeavyBleeding) {
            p.bleedTimer = 0;
        }

        p.isBleeding = bleedCount > 0;

        if (p.isHeavyBleeding && shouldTakeTickDmg) {
            p.heavyBleedTimer = (p.heavyBleedTimer || 0) + dt;
            if (p.heavyBleedTimer >= 1.0) {
                p.heavyBleedTimer -= 1.0;
                p.health -= 1;
            }
        } else if (!p.isHeavyBleeding) {
            p.heavyBleedTimer = 0;
        }

        if (p.hasHeadInjury && shouldTakeTickDmg) p.health -= 0.5 * dt;
        if (p.hasTorsoInjury && shouldTakeTickDmg) p.health -= 1.0 * dt;

        if (p.healOverRate > 0) {
            p.health += p.healOverRate * dt;
            if (p.health > 100) p.health = 100;
            if (p.healOverTimer !== undefined && p.healOverTimer > 0) {
                p.healOverTimer -= dt;
                if (p.healOverTimer <= 0 || p.health >= 100) {
                    p.healOverRate = 0;
                    p.healOverTimer = 0;
                    p.healOverName = '';
                }
            }
        }

        if (p.health <= 0) {
            p.health = 0;
            if (!p.isDead) this.die(p);
        }

        if (p.isReloading) {
            p.reloadTimer -= dt;
            if (p.reloadTimer <= 0) {
                p.isReloading = false;
                if (p.reloadTargetWeapon) {
                    p.reloadTargetWeapon.currentMag += p.reloadAmount;
                }
                this.events.inventoryDirty = true;
            }
        }

        if (p.isRepairing) {
            if (p.repairPrepTimer > 0) {
                p.repairPrepTimer -= dt;
            } else {
                const dbKit = ItemDatabase[p.repairKit.typeId];
                const dbArmor = ItemDatabase[p.repairTarget.typeId];
                
                if (dbKit && dbArmor) {
                    let consumeAmt = p.repairUseRate * dt;
                    consumeAmt = Math.min(consumeAmt, p.repairKit.capacity);
                    
                    let missingDur = p.repairTarget.maxDurability - p.repairTarget.durability;
                    let requiredConsume = missingDur / p.repairEfficiency;
                    consumeAmt = Math.min(consumeAmt, requiredConsume);
                    
                    if (consumeAmt > 0) {
                        p.repairKit.capacity -= consumeAmt;
                        p.repairTarget.durability += consumeAmt * p.repairEfficiency;
                        this.events.inventoryDirty = true;
                    }
                    
                    if (p.repairKit.capacity <= 0 || p.repairTarget.durability >= p.repairTarget.maxDurability) {
                        p.isRepairing = false;
                        if (p.repairKit.capacity <= 0) {
                            let idx = p.inventory.items.findIndex(i => i.id === p.repairKit.id);
                            if (idx !== -1) {
                                p.inventory.freeGrid(p.repairKit, p.inventory[p.repairKit.container]);
                                p.inventory.items.splice(idx, 1);
                            }
                        }
                        this.events.inventoryDirty = true;
                    }
                } else {
                    p.isRepairing = false;
                }
            }
        }

        if (p.isHealing) {
            p.healTimer -= dt;
            if (p.healTimer <= 0) {
                p.isHealing = false;
                const targetItem = p.healTargetItem;
                const dbItem = p.healDbItem;
                if (!targetItem || !dbItem) return;
                
                const idx = p.inventory.items.findIndex(i => i.id === targetItem.id);
                if (idx !== -1) {
                    if (dbItem.type === 'medical-buff') {
                        if (dbItem.effectType === 'adrenaline') p.adrenalineTimer = (dbItem.effectDuration / 1000) || 60;
                        if (dbItem.effectType === 'strength') p.strengthTimer = (dbItem.effectDuration / 1000) || 60;
                        if (dbItem.effectType === 'weightless') p.weightlessTimer = (dbItem.effectDuration / 1000) || 60;
                        targetItem.capacity -= 1;
                    } else if (dbItem.type === 'medical') {
                        if (dbItem.healAmount) p.health = Math.min(100, p.health + dbItem.healAmount);
                        if (dbItem.healOverTime) { p.healOverRate = dbItem.healOverTime.rate; p.healOverTimer = dbItem.healOverTime.duration; p.healOverName = dbItem.name; }
                        if (dbItem.cureBleed) { p.isBleeding = false; p.bleedCount = 0; }
                        if (dbItem.cureHeavyBleed) p.isHeavyBleeding = false;
                        if (dbItem.painkiller) p.pkActiveTime += dbItem.painkiller;
                        targetItem.capacity -= 1;
                    } else {
                        targetItem.capacity = 0; // Default consume
                    }

                    if (targetItem.capacity <= 0 || targetItem.capacity === undefined) {
                        p.inventory.items.splice(idx, 1);
                        p.inventory.freeGrid(targetItem, p.inventory[targetItem.container]);
                    }
                    this.events.inventoryDirty = true;
                }
            }
        }
    }

    spawnEffect(playerId, throwData) {
        const p = this.state.players[playerId];
        if (!p || p.isDead || p.won) return;
        
        let r = 150;
        if (throwData.effectType === 'smoke') r = 200;
        else if (throwData.effectType === 'gas') r = 180;

        let fx = {
            x: throwData.x,
            y: throwData.y,
            type: throwData.effectType,
            fuse: throwData.fuseTime ? (throwData.fuseTime / 1000) : 0,
            timer: throwData.duration ? (throwData.duration / 1000) : 5, 
            radius: r,
            active: false,
            damage: throwData.damage || 0
        };
        this.state.effects.push(fx);
    }

    updateEffects(p, dt) {
        p.isGassed = false;
        for (let i = this.state.effects.length - 1; i >= 0; i--) {
            let fx = this.state.effects[i];
            if (!fx.active) {
                fx.fuse -= dt;
                if (fx.fuse <= 0) {
                    fx.active = true;
                    if (fx.type === 'frag') {
                        for(let id in this.state.players) {
                            let ep = this.state.players[id];
                            let dist = Math.hypot(ep.x - fx.x, ep.y - fx.y);
                            if (dist < fx.radius) {
                                this.damagePlayer(ep, fx.damage * 0.7, 'torso');
                            }
                        }
                        this.state.effects.splice(i, 1);
                    }
                }
            } else {
                fx.timer -= dt;
                if (fx.type === 'gas') {
                    let dist = Math.hypot(p.x - fx.x, p.y - fx.y);
                    if (dist < fx.radius) {
                        p.isGassed = true;
                        p.health -= 2 * dt;
                    }
                }
                if (fx.timer <= 0) {
                    this.state.effects.splice(i, 1);
                }
            }
        }
    }

    updateRecoil(p, dt) {
        if (Math.abs(p.visualJitter) > 0.001) {
            p.visualJitter *= Math.pow(0.0001, dt);
        } else {
            p.visualJitter = 0;
        }

        const recoveryFactor = Math.pow(0.000001, dt);
        p.recoilOffset.x *= recoveryFactor;
        p.recoilOffset.y *= recoveryFactor;
        if (Math.abs(p.recoilOffset.x) < 0.1) p.recoilOffset.x = 0;
        if (Math.abs(p.recoilOffset.y) < 0.1) p.recoilOffset.y = 0;
    }

    updateTimersAndZones(p, dt) {
        const playerRect = { x: p.x, y: p.y, w: p.size, h: p.size };
        let inZone = false;
        for (let z of this.extractionZones) {
            if (this.AABBIntersect(playerRect, z)) {
                inZone = true;
                break;
            }
        }

        if (inZone) {
            p.isExtracting = true;
            p.extractionTimer -= dt;
            if (p.extractionTimer <= 0) {
                this.win(p);
            }
        } else {
            p.isExtracting = false;
            p.extractionTimer = 10.0;
        }
    }

    shoot(p) {
        let activeItem = p.inventory.items.find(i => i.container === p.activeWeaponSlot);
        if (!activeItem) return;
        if (p.isReloading) return;

        const weaponDef = ItemDatabase[activeItem.typeId];
        if (!weaponDef) return;

        if (weaponDef.type === 'melee') {
            p.shootTimer = 10.0 / Math.max(1, weaponDef.stats.fireRate);
            return;
        }

        if (weaponDef.type !== 'weapon' || !weaponDef.stats) return;

        if (activeItem.currentMag !== undefined) {
            if (activeItem.currentMag <= 0) return;
            activeItem.currentMag--;
        }

        const s = weaponDef.stats;
        let fr = Math.max(1, s.fireRate);
        p.shootTimer = 10.0 / fr; 

        let dmgAmount = 10;
        let pelletCount = 1;
        if (typeof s.damage === 'string' && s.damage.includes('x')) {
            const parts = s.damage.split('x');
            dmgAmount = parseFloat(parts[0]) || 0;
            pelletCount = parseInt(parts[1]) || 1;
        } else {
            dmgAmount = parseFloat(s.damage) || 0;
        }

        if (!p.consecutiveShots) p.consecutiveShots = 0;
        if (!p.lastShotTime) p.lastShotTime = 0;
        
        let nowMs = this.state.time * 1000;
        let frInterval = 10000 / fr; 
        
        if (nowMs - p.lastShotTime > frInterval + 100) {
            p.consecutiveShots = 0;
        }
        p.consecutiveShots++;
        p.lastShotTime = nowMs;

        for (let pl = 0; pl < pelletCount; pl++) {
            let maxSpreadRad = 0.33;
            if (pelletCount > 1) maxSpreadRad = 0.5;

            let baseSpread = maxSpreadRad * (1 - (s.accuracy / 100));
            let currentSpread = 0;
            if (pelletCount > 1) {
                currentSpread = baseSpread;
            } else if (p.consecutiveShots > 3) {
                let extra = p.consecutiveShots - 3;
                let spreadMult = Math.min(1.0, extra / 7.0);
                currentSpread = baseSpread * spreadMult;
            }

            let jitterMagnitude = (1 - (s.recoil / 100)) * 0.10;
            if (p.strengthTimer > 0) jitterMagnitude *= 0.5;
            
            let horizontalJitter = (MathUtils.seededRandom() * 2 - 1) * jitterMagnitude;
            let bulletJitter = (p.consecutiveShots > 3) ? horizontalJitter : 0;

            let spreadRand = (MathUtils.seededRandom() * 2 - 1);
            if (pelletCount > 1) {
                spreadRand = (MathUtils.seededRandom() + MathUtils.seededRandom() - 1);
            }
            let angleOffset = spreadRand * currentSpread + bulletJitter;
            let finalRot = p.rotation + angleOffset;

            let bulletSpeed = Math.max(10, s.velocity) * 20;
            let effectiveRange = Math.max(10, s.range) * 20;

            this.state.bullets.push({
                x: (p.x + p.recoilOffset.x) + Math.cos(p.rotation) * 25,
                y: (p.y + p.recoilOffset.y) + Math.sin(p.rotation) * 25,
                rot: finalRot,
                speed: bulletSpeed,
                damage: dmgAmount,
                maxRange: effectiveRange,
                distTravelled: 0,
                decayed: false,
                armorPen: s.armorPen || 1.0,
                ammoId: activeItem.loadedAmmoId || null,
                owner: p.id
            });
            
            if (pl === pelletCount - 1) {
                p.visualJitter = horizontalJitter * 0.8;
            }
        }

        let recoilBonus = (p.strengthTimer > 0) ? 10 : 0;
        let finalRecoil = Math.max(0, s.recoil - recoilBonus);
        let kickbackForce = (1 - (finalRecoil / 100)) * 450;
        let kickX = -Math.cos(p.rotation) * kickbackForce * 0.016;
        let kickY = -Math.sin(p.rotation) * kickbackForce * 0.016;

        if (!this.checkWallCollision(p.x + p.recoilOffset.x + kickX, p.y + p.recoilOffset.y)) {
            p.recoilOffset.x += kickX;
        }
        if (!this.checkWallCollision(p.x + p.recoilOffset.x, p.y + p.recoilOffset.y + kickY)) {
            p.recoilOffset.y += kickY;
        }
    }

    updateBullets(dt) {
        for (let i = this.state.bullets.length - 1; i >= 0; i--) {
            let b = this.state.bullets[i];

            let moveX = Math.cos(b.rot) * b.speed * dt;
            let moveY = Math.sin(b.rot) * b.speed * dt;

            b.x += moveX;
            b.y += moveY;
            b.distTravelled += Math.sqrt(moveX * moveX + moveY * moveY);

            if (!b.decayed && b.distTravelled > b.maxRange) {
                b.damage *= 0.5;
                b.decayed = true;
            }

            // Check collision with ALL players
            let hitPlayer = false;
            for (let pid in this.state.players) {
                if (b.owner === pid) continue; // Don't hurt yourself
                let cp = this.state.players[pid];
                if (cp.isDead) continue;
                
                let dist = Math.hypot(cp.x - b.x, cp.y - b.y);
                if (dist < (cp.size / 2) + 5) {
                    let isHead = dist < (cp.size / 4);
                    this.damagePlayer(cp, b.damage, isHead ? 'head' : 'torso', b.ammoId || null, b.armorPen || 1.0);
                    hitPlayer = true;
                    break;
                }
            }

            if (hitPlayer) {
                this.state.bullets.splice(i, 1);
                continue;
            }

            // Check bots
            if (this.state.bots) {
                let hitBot = false;
                for (let bot of this.state.bots) {
                    if (bot.health <= 0) continue;
                    let dist = Math.hypot(bot.x - b.x, bot.y - b.y);
                    if (dist < (bot.size / 2) + 5) {
                        let isHead = dist < (bot.size / 4);
                        
                        let damage = b.damage;
                        let targetArmorLevel = isHead ? (bot.helmetLevel || 0) : (bot.armorLevel || 0);
                        let ammoDb = b.ammoId ? ItemDatabase[b.ammoId] : null;

                        if (ammoDb && targetArmorLevel > 0 && bot.armorDurability > 0) {
                            let pen = ammoDb.penLevel || 0;
                            const apMult = b.armorPen || 1.0;

                            let armorMod = ammoDb.armorDamageMods ? (ammoDb.armorDamageMods[targetArmorLevel] || 1.0) : 1.0;
                            let durDmg = damage * armorMod * apMult;
                            bot.armorDurability -= durDmg;
                            if (bot.armorDurability < 0) bot.armorDurability = 0;

                            if (pen < targetArmorLevel) {
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
                        }

                        bot.health -= damage;
                        hitBot = true;
                        break;
                    }
                }
                if (hitBot) {
                    this.state.bullets.splice(i, 1);
                    continue;
                }
            }

            if (this.checkWallCollision(b.x, b.y, 10, 4)) {
                this.state.bullets.splice(i, 1);
                continue;
            }

            if (b.distTravelled > b.maxRange * 1.2) {
                this.state.bullets.splice(i, 1);
                continue;
            }
        }
    }

    damagePlayer(p, amount, hitZone = 'torso', ammoId = null, armorPen = 1.0) {
        if (p.isDead) return;

        const dbAmmo = ammoId ? ItemDatabase[ammoId] : null;

        if (hitZone === 'torso') {
            let armorItem = p.inventory.items.find(i => i.container === 'armorSlot');
            if (armorItem && armorItem.durability > 0) {
                let dbArmor = ItemDatabase[armorItem.typeId];
                let armorLevel = dbArmor.level || 1;
                let penLevel = dbAmmo ? (dbAmmo.penLevel || 0) : 0;

                if (penLevel >= armorLevel) {
                    let mod = dbAmmo.armorDamageMods ? (dbAmmo.armorDamageMods[armorLevel] || 0) : 0;
                    armorItem.durability -= amount * mod * armorPen;
                    armorItem.durability = Math.max(0, armorItem.durability);
                } else {
                    let mod = dbAmmo ? (dbAmmo.armorDamageMods ? (dbAmmo.armorDamageMods[armorLevel] || 1.0) : 1.0) : 1.0;
                    let blockAmount = amount * (dbArmor.damageReduction || 0);
                    let armorDmg = blockAmount * mod * armorPen;
                    if (armorDmg > armorItem.durability) armorDmg = armorItem.durability;
                    armorItem.durability -= armorDmg;
                    amount -= armorDmg; 
                    armorItem.durability = Math.max(0, armorItem.durability);
                }
                this.events.inventoryDirty = true;
            } else if (!p.hasTorsoInjury && amount > 15) {
                p.hasTorsoInjury = true;
            }
        } else if (hitZone === 'head') {
            let helmetItem = p.inventory.items.find(i => i.container === 'helmetSlot');
            if (helmetItem && helmetItem.durability > 0) {
                let dbHelmet = ItemDatabase[helmetItem.typeId];
                let armorLevel = dbHelmet.level || 1;
                let penLevel = dbAmmo ? (dbAmmo.penLevel || 0) : 0;

                if (penLevel >= armorLevel) {
                    let mod = dbAmmo.armorDamageMods ? (dbAmmo.armorDamageMods[armorLevel] || 0) : 0;
                    helmetItem.durability -= amount * mod * armorPen;
                    helmetItem.durability = Math.max(0, helmetItem.durability);
                } else {
                    let mod = dbAmmo ? (dbAmmo.armorDamageMods ? (dbAmmo.armorDamageMods[armorLevel] || 1.0) : 1.0) : 1.0;
                    let blockAmount = amount * (dbHelmet.damageReduction || 0);
                    let armorDmg = blockAmount * mod * armorPen;
                    if (armorDmg > helmetItem.durability) armorDmg = helmetItem.durability;
                    helmetItem.durability -= armorDmg;
                    amount -= armorDmg;
                    helmetItem.durability = Math.max(0, helmetItem.durability);
                }
                this.events.inventoryDirty = true;
            } else if (!p.hasHeadInjury && amount > 5) {
                p.hasHeadInjury = true;
            }
        }

        if (dbAmmo && dbAmmo.hpDamageMod !== undefined) {
            amount *= dbAmmo.hpDamageMod;
        }

        if (dbAmmo && dbAmmo.forceTorsoInjury && !p.hasTorsoInjury) {
            p.hasTorsoInjury = true;
        }

        p.health -= amount;

        if (amount > 40 && !p.isHeavyBleeding) {
            p.isHeavyBleeding = true;
            p.bleedCount = 0; 
        } else if (amount > 15) {
            if (!p.isHeavyBleeding) {
                p.bleedCount = Math.min(2, (p.bleedCount || 0) + 1);
            }
        }

        if (p.health <= 0) {
            p.health = 0;
            this.die(p);
        }
    }

    die(p) {
        p.isDead = true;
        p.health = 0;
        p.inventory.clearOnDeath();
        this.events.inventoryDirty = true;
        this.events.playerDied = true;
    }

    win(p) {
        p.won = true;
        this.events.playerWon = true;
    }

    resetSession() {
        for (let pid in this.state.players) {
            let p = this.state.players[pid];
            p.x = 2000; p.y = 2000;
            p.health = 100; p.weight = 0;
            p.isDead = false; p.won = false;
            p.isBleeding = false; p.isHeavyBleeding = false;
            p.hasHeadInjury = false; p.hasTorsoInjury = false;
            p.pkActiveTime = 0; p.isHealing = false; p.isReloading = false;
            p.reloadTimer = 0; p.adrenalineTimer = 0; p.strengthTimer = 0;
            p.weightlessTimer = 0; p.isGassed = false; p.healOverRate = 0;
            p.isExtracting = false; p.extractionTimer = 10.0;
        }
        this.state.effects = [];
        this.state.bullets = [];
        this.state.bots = [];
        this.gameTimer = 900;
        
        this.isInMenu = true;
        this.events.inventoryDirty = true;
        this.events.sessionReset = true;
    }

    spawnTestBot() {
        this.state.bots = [{
            x: 1800, y: 2000,
            size: 30, rotation: Math.PI,
            health: 100, maxHealth: 100,
            armorLevel: 4, helmetLevel: 4,
            armorType: "金甲", armorDurability: 50, armorMaxDurability: 50,
            weapon: ItemDatabase["M7"],
            shootTimer: 0, color: [1, 0.2, 0.2, 1]
        }];
        console.log('[Test Bot] Spawned');
    }
}
