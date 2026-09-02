/**
 * Weapon — Encapsulates weapon-specific data and pure weapon methods.
 *
 * P0-3: Extract Weapon from GameSimulation.
 *
 * Weapon wraps:
 *   - Database definition (static stats from ItemDatabase)
 *   - Inventory item (runtime state: currentMag, loadedAmmoId, durability)
 *
 * Weapon provides:
 *   - Computed mag size (base + upgraded)
 *   - Can-fire checks
 *   - Fire rate / cooldown
 *   - Damage calculation (pellet count for shotguns)
 *   - Spread calculation (base + consecutive shot bonus)
 *   - Recoil kickback
 *   - Bullet creation data
 *   - Reload completion (apply rounds to magazine)
 *
 * Weapon does NOT:
 *   - Create bullets (GameSimulation does that)
 *   - Manage player state (shootTimer, recoilOffset, etc.)
 *   - Handle wall collision
 *   - Manage inventory (adding/removing ammo)
 *
 * This is a read-only wrapper — it does not duplicate inventory item state.
 * All mutable state (currentMag, durability) delegates to the inventory item.
 */
export class Weapon {
    /**
     * @param {object} dbDef - ItemDatabase entry for this weapon
     * @param {object} item  - Inventory item instance (runtime state)
     */
    constructor(dbDef, item) {
        this.db = dbDef;
        this.item = item;
    }

    // ── Type Checks ──────────────────────────────────────────

    get isWeapon() { return this.db && this.db.type === 'weapon'; }
    get isMelee()  { return this.db && this.db.type === 'melee'; }
    get isValid()  { return !!this.db && !!this.db.stats; }

    // ── Static Stats (from database) ─────────────────────────

    get damage()      { return this.db.stats.damage; }
    get fireRate()    { return Math.max(1, this.db.stats.fireRate); }
    get recoil()      { return this.db.stats.recoil; }
    get accuracy()    { return this.db.stats.accuracy; }
    get range()       { return this.db.stats.range; }
    get velocity()    { return this.db.stats.velocity; }
    get reloadMult()  { return this.db.stats.reloadMult || 1.0; }
    get armorPen()    { return this.db.stats.armorPen || 1.0; }
    get ammoType()    { return this.db.ammoType; }

    // ── Magazine (computed from db + inventory item) ──────────

    get baseMagSize() {
        return this.db.stats.magSize || 0;
    }

    get maxMagSize() {
        if (this.item.hasUpgradedMag && this.db.stats.upMagSize) {
            return this.db.stats.upMagSize;
        }
        return this.baseMagSize;
    }

    get currentMag() {
        return this.item.currentMag || 0;
    }

    get isMagFull() {
        return this.currentMag >= this.maxMagSize;
    }

    get isMagEmpty() {
        return this.currentMag <= 0;
    }

    // ── Ammo ─────────────────────────────────────────────────

    get loadedAmmoId() {
        return this.item.loadedAmmoId || null;
    }

    // ── Durability ───────────────────────────────────────────

    get durability()      { return this.item.durability; }
    get maxDurability()   { return this.item.maxDurability; }

    // ── Fire Rate ────────────────────────────────────────────

    /**
     * Cooldown in seconds between shots.
     * Original: p.shootTimer = 10.0 / fr
     */
    get cooldown() {
        return 10.0 / this.fireRate;
    }

    // ── Can Fire ─────────────────────────────────────────────

    canFire() {
        if (!this.isWeapon || !this.isValid) return false;
        if (this.isMagEmpty) return false;
        return true;
    }

    /**
     * Consume one round from the magazine.
     * Returns true if a round was consumed.
     */
    consumeRound() {
        if (!this.canFire()) return false;
        this.item.currentMag--;
        return true;
    }

    // ── Damage ───────────────────────────────────────────────

    /**
     * Parse damage value and return { damage, pelletCount }.
     * Shotgun format: "10x8" → { damage: 10, pelletCount: 8 }
     * Normal format:  25    → { damage: 25, pelletCount: 1 }
     */
    parseDamage() {
        const raw = this.damage;
        if (typeof raw === 'string' && raw.includes('x')) {
            const parts = raw.split('x');
            return {
                damage: parseFloat(parts[0]) || 0,
                pelletCount: parseInt(parts[1]) || 1
            };
        }
        return {
            damage: parseFloat(raw) || 0,
            pelletCount: 1
        };
    }

    // ── Spread ───────────────────────────────────────────────

    /**
     * Calculate spread for a given shot.
     * @param {number} consecutiveShots - Player's consecutive shot count
     * @param {number} pelletCount       - Number of pellets (shotgun)
     * @returns {{ currentSpread: number, maxSpreadRad: number }}
     */
    getSpread(consecutiveShots, pelletCount) {
        let maxSpreadRad = 0.33;
        if (pelletCount > 1) maxSpreadRad = 0.5;

        const baseSpread = maxSpreadRad * (1 - (this.accuracy / 100));

        let currentSpread = 0;
        if (pelletCount > 1) {
            currentSpread = baseSpread;
        } else if (consecutiveShots > 3) {
            const extra = consecutiveShots - 3;
            const spreadMult = Math.min(1.0, extra / 7.0);
            currentSpread = baseSpread * spreadMult;
        }

        return { currentSpread, maxSpreadRad };
    }

    // ── Jitter ───────────────────────────────────────────────

    /**
     * Calculate visual jitter magnitude.
     * @param {number} strengthTimer - Player's strength buff timer (>0 = active)
     * @returns {number} jitter magnitude
     */
    getJitterMagnitude(strengthTimer) {
        let jitter = (1 - (this.recoil / 100)) * 0.10;
        if (strengthTimer > 0) jitter *= 0.5;
        return jitter;
    }

    // ── Kickback ─────────────────────────────────────────────

    /**
     * Calculate recoil kickback offset.
     * @param {number} strengthTimer - Player's strength buff timer
     * @param {number} playerRotation - Player's aim direction in radians
     * @returns {{ kickX: number, kickY: number }}
     */
    getKickback(strengthTimer, playerRotation) {
        const recoilBonus = (strengthTimer > 0) ? 10 : 0;
        const finalRecoil = Math.max(0, this.recoil - recoilBonus);
        const kickbackForce = (1 - (finalRecoil / 100)) * 450;

        return {
            kickX: -Math.cos(playerRotation) * kickbackForce * 0.016,
            kickY: -Math.sin(playerRotation) * kickbackForce * 0.016
        };
    }

    // ── Bullet Creation Data ─────────────────────────────────

    /**
     * Calculate bullet speed and effective range.
     * @returns {{ bulletSpeed: number, effectiveRange: number }}
     */
    getProjectileData() {
        return {
            bulletSpeed: Math.max(10, this.velocity) * 20,
            effectiveRange: Math.max(10, this.range) * 20
        };
    }

    // ── Reload ───────────────────────────────────────────────

    /**
     * Calculate reload time for a given amount of rounds.
     * @param {number} reloadAmount - Number of rounds to load
     * @returns {number} Reload time in seconds
     */
    getReloadTime(reloadAmount) {
        const missingRatio = reloadAmount / this.maxMagSize;
        let time = (this.maxMagSize / 20.0) * missingRatio * this.reloadMult;
        return Math.max(0.8, time); // Minimum 0.8s
    }

    /**
     * Apply reload completion to the inventory item.
     * @param {number} amount - Number of rounds to add
     */
    applyReload(amount) {
        this.item.currentMag = (this.item.currentMag || 0) + amount;
    }
}
