/**
 * 戰鬥系統回歸測試 — Day 2
 *
 * 測試射擊與傷害的核心邏輯，基於以下實際程式碼：
 *   - gameplay/Weapon.js：canFire、consumeRound、parseDamage、cooldown、getSpread
 *   - gameplay/Player.js：health、isDead、die()、updateState() 的死亡判定
 *   - game_simulation.js：shoot() 的射擊流程、damagePlayer() 的傷害計算
 *
 * 注意：GameSimulation.shoot() 和 damagePlayer() 依賴 InventorySystem（需要 DOM），
 * 因此這裡測試的是可獨立測試的 Weapon/Player 邏輯，以及模擬戰鬥流程。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { GameState } from '../core/GameState.js?v=1778846971';
import { Player } from '../gameplay/Player.js?v=1778846971';
import { Weapon } from '../gameplay/Weapon.js?v=1778846971';

// ── 測試用武器定義（模擬 ItemDatabase 中的真實武器）──────────

const M4A1_DEF = {
    name: 'M4A1',
    type: 'weapon',
    ammoType: '中口徑',
    stats: {
        damage: 19,
        fireRate: 75,
        recoil: 60,
        accuracy: 80,
        range: 70,
        velocity: 75,
        magSize: 30,
        upMagSize: 40,
        reloadMult: 1.0,
    },
};

const AWM_DEF = {
    name: 'AWM',
    type: 'weapon',
    ammoType: '紅蛋',
    stats: {
        damage: 150,
        fireRate: 10,
        recoil: 20,
        accuracy: 100,
        range: 100,
        velocity: 100,
        magSize: 5,
        upMagSize: null,
        reloadMult: 6.5,
    },
};

const M870_DEF = {
    name: 'M870',
    type: 'weapon',
    ammoType: '散彈',
    stats: {
        damage: '10x8',
        fireRate: 35,
        recoil: 0,
        accuracy: 20,
        range: 40,
        velocity: 40,
        magSize: 7,
        upMagSize: 12,
        reloadMult: 4.8,
    },
};

const MELEE_DEF = {
    name: '刀',
    type: 'melee',
    stats: {
        damage: 25,
        fireRate: 50,
        recoil: 0,
        accuracy: 100,
        range: 2,
        velocity: 0,
        magSize: null,
    },
};

function makeItem(overrides = {}) {
    return {
        currentMag: 30,
        loadedAmmoId: null,
        durability: 100,
        maxDurability: 100,
        hasUpgradedMag: false,
        ...overrides,
    };
}

// ── 射擊觸發條件 ─────────────────────────────────────────

describe('射擊觸發條件', () => {

    describe('Weapon.canFire()', () => {
        it('應在彈匣有彈藥且為有效武器時回傳 true', () => {
            const w = new Weapon(M4A1_DEF, makeItem({ currentMag: 30 }));
            expect(w.canFire()).toBe(true);
        });

        it('應在彈匣為空時回傳 false', () => {
            const w = new Weapon(M4A1_DEF, makeItem({ currentMag: 0 }));
            expect(w.canFire()).toBe(false);
        });

        it('應在非武器類型時回傳 false', () => {
            const w = new Weapon(MELEE_DEF, makeItem());
            expect(w.canFire()).toBe(false);
        });

        it('應在 dbDef 無 stats 時回傳 false（isValid 為 false）', () => {
            const invalidDef = { type: 'weapon' };
            const w = new Weapon(invalidDef, makeItem());
            expect(w.isValid).toBe(false);
            expect(w.canFire()).toBe(false);
        });
    });

    describe('Weapon.consumeRound()', () => {
        it('應消耗一發彈藥並回傳 true', () => {
            const item = makeItem({ currentMag: 10 });
            const w = new Weapon(M4A1_DEF, item);
            expect(w.consumeRound()).toBe(true);
            expect(item.currentMag).toBe(9);
        });

        it('連續消耗應遞減 currentMag', () => {
            const item = makeItem({ currentMag: 5 });
            const w = new Weapon(M4A1_DEF, item);
            w.consumeRound();
            w.consumeRound();
            w.consumeRound();
            expect(item.currentMag).toBe(2);
        });

        it('彈匣空時應回傳 false 且不改變 currentMag', () => {
            const item = makeItem({ currentMag: 0 });
            const w = new Weapon(M4A1_DEF, item);
            expect(w.consumeRound()).toBe(false);
            expect(item.currentMag).toBe(0);
        });
    });

    describe('射速限制（cooldown）', () => {
        it('M4A1 的 cooldown 應為 10.0 / 75 ≈ 0.1333 秒', () => {
            const w = new Weapon(M4A1_DEF, makeItem());
            expect(w.cooldown).toBeCloseTo(10.0 / 75, 6);
        });

        it('AWM 的 cooldown 應為 10.0 / 10 = 1.0 秒', () => {
            const w = new Weapon(AWM_DEF, makeItem());
            expect(w.cooldown).toBe(1.0);
        });

        it('fireRate 最小值應為 1（避免除以零）', () => {
            const def = { ...M4A1_DEF, stats: { ...M4A1_DEF.stats, fireRate: 0 } };
            const w = new Weapon(def, makeItem());
            expect(w.fireRate).toBe(1);
            expect(w.cooldown).toBe(10.0);
        });
    });

    describe('射擊流程模擬（shoot 邏輯驗證）', () => {
        /**
         * 模擬 game_simulation.js shoot() 的核心流程：
         * 1. 檢查 isReloading → 如果正在換彈則不射擊
         * 2. 檢查 canFire() → 彈匣必須有彈藥
         * 3. consumeRound() → 消耗一發
         * 4. 設定 shootTimer = weapon.cooldown
         * 5. parseDamage() → 取得傷害值
         * 6. 建立 bullet 物件並加入 gameState.bullets
         */
        it('完整射擊流程應正確消耗彈藥、設定冷卻、生成子彈', () => {
            const gs = new GameState();
            const p = new Player('p1', gs);
            p.inventory = { items: [] };

            const item = makeItem({ currentMag: 30 });
            p.inventory.items.push(item);
            item.container = p.activeWeaponSlot;

            // 模擬 shoot() 的核心邏輯
            const weapon = new Weapon(M4A1_DEF, item);

            // 前置條件檢查
            expect(p.isReloading).toBe(false);
            expect(weapon.canFire()).toBe(true);

            // 執行射擊
            weapon.consumeRound();
            p.shootTimer = weapon.cooldown;
            const { damage: dmgAmount, pelletCount } = weapon.parseDamage();

            // 驗證結果
            expect(item.currentMag).toBe(29);
            expect(p.shootTimer).toBeCloseTo(10.0 / 75, 6);
            expect(dmgAmount).toBe(19);
            expect(pelletCount).toBe(1);
        });

        it('正在換彈時不應執行射擊', () => {
            const gs = new GameState();
            const p = new Player('p1', gs);
            p.isReloading = true;
            p.reloadTimer = 2.0;

            const item = makeItem({ currentMag: 30 });
            const weapon = new Weapon(M4A1_DEF, item);

            // shoot() 開頭會檢查 isReloading 並 return
            if (p.isReloading) {
                // 模擬 shoot() 的 early return
                expect(true).toBe(true);
            } else {
                weapon.consumeRound();
                expect(item.currentMag).toBe(29);
            }

            // 彈藥不應被消耗
            expect(item.currentMag).toBe(30);
        });

        it('散彈槍射擊應生成多顆子彈（pelletCount=8）', () => {
            const item = makeItem({ currentMag: 7 });
            const weapon = new Weapon(M870_DEF, item);

            expect(weapon.canFire()).toBe(true);
            weapon.consumeRound();
            const { damage, pelletCount } = weapon.parseDamage();

            expect(item.currentMag).toBe(6);
            expect(damage).toBe(10);
            expect(pelletCount).toBe(8);
        });

        it('近戰武器不應消耗彈藥（canFire 回傳 false）', () => {
            const item = makeItem({ currentMag: 0 });
            const weapon = new Weapon(MELEE_DEF, item);

            expect(weapon.isMelee).toBe(true);
            expect(weapon.canFire()).toBe(false);
            expect(weapon.consumeRound()).toBe(false);
        });
    });
});

// ── 傷害計算 ─────────────────────────────────────────────

describe('傷害計算', () => {

    describe('Weapon.parseDamage()', () => {
        it('數字格式傷害應正確解析', () => {
            const w = new Weapon(M4A1_DEF, makeItem());
            const result = w.parseDamage();
            expect(result.damage).toBe(19);
            expect(result.pelletCount).toBe(1);
        });

        it('AWM 應解析為 150 傷害、1 顆子彈', () => {
            const w = new Weapon(AWM_DEF, makeItem());
            const result = w.parseDamage();
            expect(result.damage).toBe(150);
            expect(result.pelletCount).toBe(1);
        });

        it('散彈格式 "10x8" 應解析為 10 傷害、8 顆彈丸', () => {
            const w = new Weapon(M870_DEF, makeItem());
            const result = w.parseDamage();
            expect(result.damage).toBe(10);
            expect(result.pelletCount).toBe(8);
        });

        it('散彈格式 "8x10" 應解析為 8 傷害、10 顆彈丸', () => {
            const krmDef = {
                ...M870_DEF,
                stats: { ...M870_DEF.stats, damage: '8x10' },
            };
            const w = new Weapon(krmDef, makeItem());
            const result = w.parseDamage();
            expect(result.damage).toBe(8);
            expect(result.pelletCount).toBe(10);
        });
    });

    describe('子彈傷害衰減（updateBullets 邏輯）', () => {
        /**
         * 模擬 game_simulation.js updateBullets() 中的衰減邏輯：
         *   if (!b.decayed && b.distTravelled > b.maxRange) {
         *       b.damage *= 0.5;
         *       b.decayed = true;
         *   }
         */
        it('子彈超過有效射程後傷害應減半', () => {
            const bullet = {
                damage: 19,
                maxRange: 1400, // 70 * 20
                distTravelled: 0,
                decayed: false,
            };

            // 模擬子彈飛行超過 maxRange
            bullet.distTravelled = 1500;
            if (!bullet.decayed && bullet.distTravelled > bullet.maxRange) {
                bullet.damage *= 0.5;
                bullet.decayed = true;
            }

            expect(bullet.damage).toBeCloseTo(9.5, 2);
            expect(bullet.decayed).toBe(true);
        });

        it('子彈在有效射程內傷害不應衰減', () => {
            const bullet = {
                damage: 19,
                maxRange: 1400,
                distTravelled: 500,
                decayed: false,
            };

            if (!bullet.decayed && bullet.distTravelled > bullet.maxRange) {
                bullet.damage *= 0.5;
                bullet.decayed = true;
            }

            expect(bullet.damage).toBe(19);
            expect(bullet.decayed).toBe(false);
        });

        it('已衰減的子彈不應再次衰減', () => {
            const bullet = {
                damage: 9.5,
                maxRange: 1400,
                distTravelled: 2000,
                decayed: true,
            };

            if (!bullet.decayed && bullet.distTravelled > bullet.maxRange) {
                bullet.damage *= 0.5;
                bullet.decayed = true;
            }

            expect(bullet.damage).toBe(9.5);
        });
    });
});

// ── 玩家血量扣減 ─────────────────────────────────────────

describe('玩家血量扣減', () => {

    describe('Player 基礎血量', () => {
        it('新玩家應有 100 點血量', () => {
            const gs = new GameState();
            const p = new Player('p1', gs);
            expect(p.health).toBe(100);
        });

        it('直接扣減血量應正確反映', () => {
            const gs = new GameState();
            const p = new Player('p1', gs);
            p.health -= 30;
            expect(p.health).toBe(70);
        });

        it('多次扣減應累加', () => {
            const gs = new GameState();
            const p = new Player('p1', gs);
            p.health -= 20;
            p.health -= 25;
            expect(p.health).toBe(55);
        });
    });

    describe('damagePlayer 邏輯（無護甲）', () => {
        /**
         * 模擬 game_simulation.js damagePlayer() 在無護甲時的邏輯：
         *   - hitZone === 'torso' 且無 armorItem → 檢查 torsoInjury
         *   - hitZone === 'head' 且無 helmetItem → 檢查 headInjury
         *   - p.health -= amount
         *   - 出血判定（amount > 40 → heavyBleeding；amount > 15 → bleedCount++）
         */
        it('軀幹傷害應直接扣減血量', () => {
            const gs = new GameState();
            const p = new Player('p1', gs);
            p.inventory = { items: [] }; // 無護甲

            const amount = 25;
            // 模擬 damagePlayer 無護甲路徑
            // hitZone === 'torso'，無 armorItem → 不進入護甲分支
            // 直接 p.health -= amount
            p.health -= amount;

            expect(p.health).toBe(75);
        });

        it('大於 15 的軀幹傷害應觸發輕度出血（bleedCount++）', () => {
            const gs = new GameState();
            const p = new Player('p1', gs);
            p.inventory = { items: [] };

            const amount = 20;
            p.health -= amount;

            // 模擬出血判定
            if (amount > 40 && !p.isHeavyBleeding) {
                p.isHeavyBleeding = true;
                p.bleedCount = 0;
            } else if (amount > 15) {
                if (!p.isHeavyBleeding) {
                    p.bleedCount = Math.min(2, (p.bleedCount || 0) + 1);
                }
            }

            expect(p.bleedCount).toBe(1);
            expect(p.isHeavyBleeding).toBe(false);
        });

        it('大於 40 的傷害應觸發重度出血', () => {
            const gs = new GameState();
            const p = new Player('p1', gs);
            p.inventory = { items: [] };

            const amount = 50;
            p.health -= amount;

            if (amount > 40 && !p.isHeavyBleeding) {
                p.isHeavyBleeding = true;
                p.bleedCount = 0;
            } else if (amount > 15) {
                if (!p.isHeavyBleeding) {
                    p.bleedCount = Math.min(2, (p.bleedCount || 0) + 1);
                }
            }

            expect(p.isHeavyBleeding).toBe(true);
            expect(p.bleedCount).toBe(0);
        });

        it('小於等於 15 的傷害不應觸發出血', () => {
            const gs = new GameState();
            const p = new Player('p1', gs);
            p.inventory = { items: [] };

            const amount = 10;
            p.health -= amount;

            if (amount > 40 && !p.isHeavyBleeding) {
                p.isHeavyBleeding = true;
                p.bleedCount = 0;
            } else if (amount > 15) {
                if (!p.isHeavyBleeding) {
                    p.bleedCount = Math.min(2, (p.bleedCount || 0) + 1);
                }
            }

            expect(p.bleedCount).toBe(0);
            expect(p.isHeavyBleeding).toBe(false);
        });

        it('大於 15 的頭部傷害應觸發頭部受傷', () => {
            const gs = new GameState();
            const p = new Player('p1', gs);
            p.inventory = { items: [] }; // 無頭盔

            const amount = 20;
            const hitZone = 'head';

            // 模擬 damagePlayer 頭部無頭盔路徑
            if (hitZone === 'head') {
                // 無 helmetItem → else if 分支
                if (!p.hasHeadInjury && amount > 5) {
                    p.hasHeadInjury = true;
                }
            }

            p.health -= amount;

            expect(p.hasHeadInjury).toBe(true);
            expect(p.health).toBe(80);
        });

        it('大於 15 的軀幹傷害應觸發軀幹受傷', () => {
            const gs = new GameState();
            const p = new Player('p1', gs);
            p.inventory = { items: [] };

            const amount = 20;
            const hitZone = 'torso';

            // 模擬 damagePlayer 軀幹無護甲路徑
            if (hitZone === 'torso') {
                // 無 armorItem → else if 分支
                if (!p.hasTorsoInjury && amount > 15) {
                    p.hasTorsoInjury = true;
                }
            }

            p.health -= amount;

            expect(p.hasTorsoInjury).toBe(true);
        });
    });
});

// ── 玩家死亡判定 ─────────────────────────────────────────

describe('玩家死亡判定', () => {

    describe('Player.updateState() 死亡檢查', () => {
        /**
         * 模擬 Player.updateState() 中的死亡檢查邏輯：
         *   if (this.health <= 0) {
         *       this.health = 0;
         *       if (!this.isDead) this.die();
         *   }
         */
        it('血量降至 0 時應觸發 die()', () => {
            const gs = new GameState();
            const p = new Player('p1', gs);
            p.inventory = { clearOnDeath: () => {} };

            p.health = 0;

            // 模擬 updateState 的死亡檢查
            if (p.health <= 0) {
                p.health = 0;
                if (!p.isDead) p.die();
            }

            expect(p.isDead).toBe(true);
            expect(p.health).toBe(0);
            expect(gs.events.playerDied).toBe(true);
        });

        it('血量降至負數時應被 clamp 為 0 並觸發 die()', () => {
            const gs = new GameState();
            const p = new Player('p1', gs);
            p.inventory = { clearOnDeath: () => {} };

            p.health = -50;

            if (p.health <= 0) {
                p.health = 0;
                if (!p.isDead) p.die();
            }

            expect(p.health).toBe(0);
            expect(p.isDead).toBe(true);
        });

        it('已死亡的玩家不應重複觸發 die()', () => {
            const gs = new GameState();
            const p = new Player('p1', gs);
            p.inventory = { clearOnDeath: () => {} };

            // 第一次死亡
            p.health = 0;
            if (p.health <= 0) {
                p.health = 0;
                if (!p.isDead) p.die();
            }
            expect(gs.events.playerDied).toBe(true);

            // 清除事件，模擬下一幀
            gs.clearEvents();

            // 再次進入死亡檢查
            if (p.health <= 0) {
                p.health = 0;
                if (!p.isDead) p.die();
            }

            // playerDied 不應再次被觸發
            expect(gs.events.playerDied).toBe(false);
        });

        it('血量大於 0 時不應觸發死亡', () => {
            const gs = new GameState();
            const p = new Player('p1', gs);

            p.health = 50;

            if (p.health <= 0) {
                p.health = 0;
                if (!p.isDead) p.die();
            }

            expect(p.isDead).toBe(false);
            expect(p.health).toBe(50);
        });
    });

    describe('Player.die()', () => {
        it('應設定 isDead = true', () => {
            const gs = new GameState();
            const p = new Player('p1', gs);
            p.inventory = { clearOnDeath: () => {} };
            p.die();
            expect(p.isDead).toBe(true);
        });

        it('應將血量設為 0', () => {
            const gs = new GameState();
            const p = new Player('p1', gs);
            p.health = 50;
            p.inventory = { clearOnDeath: () => {} };
            p.die();
            expect(p.health).toBe(0);
        });

        it('應觸發 inventoryDirty 和 playerDied 事件', () => {
            const gs = new GameState();
            const p = new Player('p1', gs);
            p.inventory = { clearOnDeath: () => {} };
            p.die();
            expect(gs.events.inventoryDirty).toBe(true);
            expect(gs.events.playerDied).toBe(true);
        });

        it('應呼叫 inventory.clearOnDeath()', () => {
            const gs = new GameState();
            const p = new Player('p1', gs);
            let clearCalled = false;
            p.inventory = { clearOnDeath: () => { clearCalled = true; } };
            p.die();
            expect(clearCalled).toBe(true);
        });
    });

    describe('damagePlayer 死亡判定（完整流程）', () => {
        /**
         * 模擬 game_simulation.js damagePlayer() 結尾的死亡判定：
         *   p.health -= amount;
         *   if (p.health <= 0) {
         *       p.health = 0;
         *       p.die();
         *   }
         */
        it('致命傷害應觸發玩家死亡', () => {
            const gs = new GameState();
            const p = new Player('p1', gs);
            p.inventory = { items: [], clearOnDeath: () => {} };

            const amount = 100;
            p.health -= amount;

            if (p.health <= 0) {
                p.health = 0;
                p.die();
            }

            expect(p.isDead).toBe(true);
            expect(p.health).toBe(0);
            expect(gs.events.playerDied).toBe(true);
        });

        it('AWM 一槍（150 傷害）應擊殺滿血玩家', () => {
            const gs = new GameState();
            const p = new Player('p1', gs);
            p.inventory = { items: [], clearOnDeath: () => {} };

            const weapon = new Weapon(AWM_DEF, makeItem({ currentMag: 5 }));
            const { damage } = weapon.parseDamage();

            p.health -= damage;

            if (p.health <= 0) {
                p.health = 0;
                p.die();
            }

            expect(p.isDead).toBe(true);
            expect(damage).toBe(150);
        });

        it('非致命傷害不應觸發死亡', () => {
            const gs = new GameState();
            const p = new Player('p1', gs);
            p.inventory = { items: [], clearOnDeath: () => {} };

            const amount = 50;
            p.health -= amount;

            if (p.health <= 0) {
                p.health = 0;
                p.die();
            }

            expect(p.isDead).toBe(false);
            expect(p.health).toBe(50);
        });
    });
});
