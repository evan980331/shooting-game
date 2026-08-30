import { ItemDatabase } from '../db.js?v=1778846971';

/**
 * Player — Encapsulates player state and player-specific behavior.
 *
 * P0-2: Extract Player from GameSimulation.
 * Player owns: position, health, status effects, speed, death/win logic.
 * Player does NOT own: inventory, weapon shooting, bullet creation, rendering.
 *
 * gameState reference is needed for firing events (inventoryDirty, playerDied, etc.)
 */
export class Player {
    constructor(id, gameState) {
        this.id = id;
        this.gameState = gameState;

        // ── Position & Physics ─────────────────────────────────
        this.x = 2000;
        this.y = 2000;
        this.size = 30;
        this.rotation = 0;
        this.baseSpeed = 200;
        this.weight = 0;
        this.color = [0.1, 0.6, 1, 1];

        // ── Health & Status ────────────────────────────────────
        this.health = 100;
        this.isDead = false;
        this.won = false;

        // Bleeding
        this.isBleeding = false;
        this.isHeavyBleeding = false;
        this.bleedCount = 0;
        this.bleedTimer = 0;
        this.heavyBleedTimer = 0;

        // Injuries
        this.hasHeadInjury = false;
        this.hasTorsoInjury = false;

        // Status effect timers
        this.pkActiveTime = 0;
        this.adrenalineTimer = 0;
        this.strengthTimer = 0;
        this.weightlessTimer = 0;
        this.isGassed = false;

        // Healing
        this.isHealing = false;
        this.healTimer = 0;
        this.healDuration = 0;
        this.healTargetItem = null;
        this.healDbItem = null;
        this.healName = '';
        this.healOverRate = 0;
        this.healOverTimer = 0;
        this.healOverName = '';

        // Reloading
        this.isReloading = false;
        this.reloadTimer = 0;
        this.reloadTargetWeapon = null;
        this.reloadAmount = 0;

        // Repairing
        this.isRepairing = false;
        this.repairKit = null;
        this.repairTarget = null;
        this.repairPrepTimer = 0;
        this.repairUseRate = 0;
        this.repairEfficiency = 0;

        // ── Combat State ───────────────────────────────────────
        this.consecutiveShots = 0;
        this.lastShotTime = 0;
        this.shootTimer = 0;
        this.visualJitter = 0;
        this.recoilOffset = { x: 0, y: 0 };

        // ── Camera ─────────────────────────────────────────────
        this.cameraZoom = 1.5;

        // ── Inventory Reference ────────────────────────────────
        // Set externally by GameSimulation.addPlayer() after InventorySystem creation
        this.inventory = null;

        // ── Input ──────────────────────────────────────────────
        this.input = { moveX: 0, moveY: 0, isShooting: false };

        // ── Weapon ─────────────────────────────────────────────
        this.activeWeaponSlot = 'primaryWep';

        // ── Extraction ─────────────────────────────────────────
        this.isExtracting = false;
        this.extractionTimer = 10.0;
        this.targetExitName = '';

        // ── Economy ────────────────────────────────────────────
        this.money = 100000;
    }

    // ── Speed Calculation ──────────────────────────────────────

    getSpeedMultiplier() {
        let weightPenalty = this.weight * 0.01;
        if (this.weightlessTimer > 0) weightPenalty = 0;

        let mult = 1.0 - weightPenalty;
        if (mult > 1.05) mult = 1.05;

        if (this.hasTorsoInjury) mult -= 0.15;
        if (this.isHealing) mult *= 0.50;
        if (this.isRepairing) mult *= 0.50;
        if (this.isGassed) mult *= 0.95;
        if (this.adrenalineTimer > 0) mult *= 1.10;

        return Math.max(0.1, mult);
    }

    // ── Status Effect Ticks ────────────────────────────────────

    updateState(dt) {
        if (this.pkActiveTime > 0) this.pkActiveTime -= dt;
        if (this.adrenalineTimer > 0) {
            this.adrenalineTimer -= dt;
            this.bleedCount = 0;
            this.isBleeding = false;
            this.isHeavyBleeding = false;
        }
        if (this.strengthTimer > 0) this.strengthTimer -= dt;
        if (this.weightlessTimer > 0) this.weightlessTimer -= dt;

        let shouldTakeTickDmg = this.pkActiveTime <= 0;

        // ── Bleeding Tick ──────────────────────────────────────
        if (this.bleedCount > 0 && !this.isHeavyBleeding && shouldTakeTickDmg) {
            const bleedInterval = 2.0;
            this.bleedTimer = (this.bleedTimer || 0) + dt;
            if (this.bleedTimer >= bleedInterval) {
                this.bleedTimer -= bleedInterval;
                let damage = this.bleedCount === 2 ? 2 : 1;
                if (this.health > 1) {
                    this.health = Math.max(1, this.health - damage);
                }
            }
        } else if (this.bleedCount === 0 && !this.isHeavyBleeding) {
            this.bleedTimer = 0;
        }

        this.isBleeding = this.bleedCount > 0;

        if (this.isHeavyBleeding && shouldTakeTickDmg) {
            this.heavyBleedTimer = (this.heavyBleedTimer || 0) + dt;
            if (this.heavyBleedTimer >= 1.0) {
                this.heavyBleedTimer -= 1.0;
                this.health -= 1;
            }
        } else if (!this.isHeavyBleeding) {
            this.heavyBleedTimer = 0;
        }

        // ── Injury Tick ────────────────────────────────────────
        if (this.hasHeadInjury && shouldTakeTickDmg) this.health -= 0.5 * dt;
        if (this.hasTorsoInjury && shouldTakeTickDmg) this.health -= 1.0 * dt;

        // ── Heal Over Time ─────────────────────────────────────
        if (this.healOverRate > 0) {
            this.health += this.healOverRate * dt;
            if (this.health > 100) this.health = 100;
            if (this.healOverTimer !== undefined && this.healOverTimer > 0) {
                this.healOverTimer -= dt;
                if (this.healOverTimer <= 0 || this.health >= 100) {
                    this.healOverRate = 0;
                    this.healOverTimer = 0;
                    this.healOverName = '';
                }
            }
        }

        // ── Death Check ────────────────────────────────────────
        if (this.health <= 0) {
            this.health = 0;
            if (!this.isDead) this.die();
        }

        // ── Reload Tick ────────────────────────────────────────
        if (this.isReloading) {
            this.reloadTimer -= dt;
            if (this.reloadTimer <= 0) {
                this.isReloading = false;
                if (this.reloadTargetWeapon) {
                    this.reloadTargetWeapon.currentMag += this.reloadAmount;
                }
                this.gameState.events.inventoryDirty = true;
            }
        }

        // ── Repair Tick ────────────────────────────────────────
        if (this.isRepairing) {
            if (this.repairPrepTimer > 0) {
                this.repairPrepTimer -= dt;
            } else {
                const dbKit = ItemDatabase[this.repairKit.typeId];
                const dbArmor = ItemDatabase[this.repairTarget.typeId];

                if (dbKit && dbArmor) {
                    let consumeAmt = this.repairUseRate * dt;
                    consumeAmt = Math.min(consumeAmt, this.repairKit.capacity);

                    let missingDur = this.repairTarget.maxDurability - this.repairTarget.durability;
                    let requiredConsume = missingDur / this.repairEfficiency;
                    consumeAmt = Math.min(consumeAmt, requiredConsume);

                    if (consumeAmt > 0) {
                        this.repairKit.capacity -= consumeAmt;
                        this.repairTarget.durability += consumeAmt * this.repairEfficiency;
                        this.gameState.events.inventoryDirty = true;
                    }

                    if (this.repairKit.capacity <= 0 || this.repairTarget.durability >= this.repairTarget.maxDurability) {
                        this.isRepairing = false;
                        if (this.repairKit.capacity <= 0) {
                            let idx = this.inventory.items.findIndex(i => i.id === this.repairKit.id);
                            if (idx !== -1) {
                                this.inventory.freeGrid(this.repairKit, this.inventory[this.repairKit.container]);
                                this.inventory.items.splice(idx, 1);
                            }
                        }
                        this.gameState.events.inventoryDirty = true;
                    }
                } else {
                    this.isRepairing = false;
                }
            }
        }

        // ── Healing Tick ───────────────────────────────────────
        if (this.isHealing) {
            this.healTimer -= dt;
            if (this.healTimer <= 0) {
                this.isHealing = false;
                const targetItem = this.healTargetItem;
                const dbItem = this.healDbItem;
                if (!targetItem || !dbItem) return;

                const idx = this.inventory.items.findIndex(i => i.id === targetItem.id);
                if (idx !== -1) {
                    if (dbItem.type === 'medical-buff') {
                        if (dbItem.effectType === 'adrenaline') this.adrenalineTimer = (dbItem.effectDuration / 1000) || 60;
                        if (dbItem.effectType === 'strength') this.strengthTimer = (dbItem.effectDuration / 1000) || 60;
                        if (dbItem.effectType === 'weightless') this.weightlessTimer = (dbItem.effectDuration / 1000) || 60;
                        targetItem.capacity -= 1;
                    } else if (dbItem.type === 'medical') {
                        if (dbItem.healAmount) this.health = Math.min(100, this.health + dbItem.healAmount);
                        if (dbItem.healOverTime) { this.healOverRate = dbItem.healOverTime.rate; this.healOverTimer = dbItem.healOverTime.duration; this.healOverName = dbItem.name; }
                        if (dbItem.cureBleed) { this.isBleeding = false; this.bleedCount = 0; }
                        if (dbItem.cureHeavyBleed) this.isHeavyBleeding = false;
                        if (dbItem.painkiller) this.pkActiveTime += dbItem.painkiller;
                        targetItem.capacity -= 1;
                    } else {
                        targetItem.capacity = 0; // Default consume
                    }

                    if (targetItem.capacity <= 0 || targetItem.capacity === undefined) {
                        this.inventory.items.splice(idx, 1);
                        this.inventory.freeGrid(targetItem, this.inventory[targetItem.container]);
                    }
                    this.gameState.events.inventoryDirty = true;
                }
            }
        }
    }

    // ── Death & Win ────────────────────────────────────────────

    die() {
        this.isDead = true;
        this.health = 0;
        this.inventory.clearOnDeath();
        this.gameState.events.inventoryDirty = true;
        this.gameState.events.playerDied = true;
    }

    win() {
        this.won = true;
        this.gameState.events.playerWon = true;
    }
}
