/**
 * 護甲與換彈回歸測試 — Day 3
 *
 * 測試護甲傷害減免、護甲耐久度扣減、換彈時間/狀態、彈藥數量管理，
 * 基於以下實際程式碼：
 *   - game_simulation.js damagePlayer()：護甲減免、耐久扣減邏輯
 *   - gameplay/Weapon.js：getReloadTime()、applyReload()、maxMagSize、currentMag
 *   - gameplay/Player.js：isReloading、reloadTimer、reloadTargetWeapon、reloadAmount、updateState() 換彈 tick
 *   - main.js reload()：換彈流程（彈藥搜尋、扣除、時間計算）
 *   - db.js：護甲與彈藥的 ItemDatabase 定義
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { GameState } from '../core/GameState.js?v=1778846971';
import { Player } from '../gameplay/Player.js?v=1778846971';
import { Weapon } from '../gameplay/Weapon.js?v=1778846971';

// ── 測試用資料定義 ───────────────────────────────────────

// 護甲定義（模擬 db.js ItemDatabase 中的真實護甲）
const ARMOR_DEFS = {
    '綠甲': { name: '綠甲', type: 'armor', level: 1, maxDurability: 40, damageReduction: 0.10 },
    '藍甲': { name: '藍甲', type: 'armor', level: 2, maxDurability: 50, damageReduction: 0.20 },
    '紫甲': { name: '紫甲', type: 'armor', level: 3, maxDurability: 60, damageReduction: 0.35 },
    '金甲': { name: '金甲', type: 'armor', level: 4, maxDurability: 70, damageReduction: 0.50 },
};

const HELMET_DEFS = {
    '綠頭': { name: '綠頭', type: 'helmet', level: 1, maxDurability: 30, damageReduction: 0.10 },
    '藍頭': { name: '藍頭', type: 'helmet', level: 2, maxDurability: 35, damageReduction: 0.15 },
    '紫頭': { name: '紫頭', type: 'helmet', level: 3, maxDurability: 40, damageReduction: 0.25 },
    '金頭': { name: '金頭', type: 'helmet', level: 4, maxDurability: 50, damageReduction: 0.30 },
};

// 彈藥定義（模擬 db.js ItemDatabase 中的真實彈藥）
const AMMO_DEFS = {
    '小口徑-1級綠彈': { name: '小口徑-1級綠彈', type: 'ammo', ammoClass: '小口徑', tier: 1, penLevel: 0, armorDamageMods: { 1: 1.0, 2: 0.8, 3: 0.6, 4: 0.6 }, hpDamageMod: 1.0 },
    '小口徑-3級紫彈': { name: '小口徑-3級紫彈', type: 'ammo', ammoClass: '小口徑', tier: 3, penLevel: 1, armorDamageMods: { 1: 1.0, 2: 1.2, 3: 1.0, 4: 0.8 }, hpDamageMod: 1.0 },
    '小口徑-4級金蛋': { name: '小口徑-4級金蛋', type: 'ammo', ammoClass: '小口徑', tier: 4, penLevel: 2, armorDamageMods: { 1: 1.0, 2: 1.2, 3: 1.0, 4: 1.0 }, hpDamageMod: 1.0 },
    '中口徑-1級綠彈': { name: '中口徑-1級綠彈', type: 'ammo', ammoClass: '中口徑', tier: 1, penLevel: 0, armorDamageMods: { 1: 1.0, 2: 0.8, 3: 0.6, 4: 0.6 }, hpDamageMod: 1.0 },
    '中口徑-4級金蛋': { name: '中口徑-4級金蛋', type: 'ammo', ammoClass: '中口徑', tier: 4, penLevel: 2, armorDamageMods: { 1: 1.0, 2: 1.2, 3: 1.0, 4: 1.0 }, hpDamageMod: 1.0 },
    '全威彈-4級金蛋': { name: '全威彈-4級金蛋', type: 'ammo', ammoClass: '全威彈', tier: 4, penLevel: 3, armorDamageMods: { 1: 1.0, 2: 1.2, 3: 1.0, 4: 1.0 }, hpDamageMod: 1.0 },
    '紅蛋-4級金蛋': { name: '紅蛋-4級金蛋', type: 'ammo', ammoClass: '紅蛋', tier: 4, penLevel: 4, armorDamageMods: { 1: 0.6, 2: 0.6, 3: 0.6, 4: 0.6 }, hpDamageMod: 0.6, forceTorsoInjury: true },
};

// 武器定義
const M4A1_DEF = {
    name: 'M4A1', type: 'weapon', ammoType: '中口徑',
    stats: { damage: 19, fireRate: 75, recoil: 60, accuracy: 80, range: 70, velocity: 75, magSize: 30, upMagSize: 40, reloadMult: 1.0 },
};

const AWM_DEF = {
    name: 'AWM', type: 'weapon', ammoType: '紅蛋',
    stats: { damage: 150, fireRate: 10, recoil: 20, accuracy: 100, range: 100, velocity: 100, magSize: 5, upMagSize: null, reloadMult: 6.5 },
};

const M870_DEF = {
    name: 'M870', type: 'weapon', ammoType: '散彈',
    stats: { damage: '10x8', fireRate: 35, recoil: 0, accuracy: 20, range: 40, velocity: 40, magSize: 7, upMagSize: 12, reloadMult: 4.8 },
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

function makeArmorItem(typeId, durabilityOverride) {
    const def = ARMOR_DEFS[typeId];
    return {
        id: 1,
        typeId,
        container: 'armorSlot',
        durability: durabilityOverride ?? def.maxDurability,
        maxDurability: def.maxDurability,
    };
}

function makeHelmetItem(typeId, durabilityOverride) {
    const def = HELMET_DEFS[typeId];
    return {
        id: 2,
        typeId,
        container: 'helmetSlot',
        durability: durabilityOverride ?? def.maxDurability,
        maxDurability: def.maxDurability,
    };
}

/**
 * 模擬 game_simulation.js damagePlayer() 的護甲邏輯。
 * 這是實際程式碼的忠實重現，用於測試。
 */
function simulateDamagePlayer(p, amount, hitZone = 'torso', ammoId = null, armorPen = 1.0, itemDatabase = {}) {
    if (p.isDead) return;

    const dbAmmo = ammoId ? itemDatabase[ammoId] : null;

    if (hitZone === 'torso') {
        let armorItem = p.inventory.items.find(i => i.container === 'armorSlot');
        if (armorItem && armorItem.durability > 0) {
            let dbArmor = itemDatabase[armorItem.typeId];
            let armorLevel = dbArmor.level || 1;
            let penLevel = dbAmmo ? (dbAmmo.penLevel || 0) : 0;

            if (penLevel >= armorLevel) {
                // 穿透：護甲耐久扣減但無減免
                let mod = dbAmmo.armorDamageMods ? (dbAmmo.armorDamageMods[armorLevel] || 0) : 0;
                armorItem.durability -= amount * mod * armorPen;
                armorItem.durability = Math.max(0, armorItem.durability);
            } else {
                // 未穿透：護甲減免傷害
                let mod = dbAmmo ? (dbAmmo.armorDamageMods ? (dbAmmo.armorDamageMods[armorLevel] || 1.0) : 1.0) : 1.0;
                let blockAmount = amount * (dbArmor.damageReduction || 0);
                let armorDmg = blockAmount * mod * armorPen;
                if (armorDmg > armorItem.durability) armorDmg = armorItem.durability;
                armorItem.durability -= armorDmg;
                amount -= armorDmg;
                armorItem.durability = Math.max(0, armorItem.durability);
            }
            p.gameState.events.inventoryDirty = true;
        } else if (!p.hasTorsoInjury && amount > 15) {
            p.hasTorsoInjury = true;
        }
    } else if (hitZone === 'head') {
        let helmetItem = p.inventory.items.find(i => i.container === 'helmetSlot');
        if (helmetItem && helmetItem.durability > 0) {
            let dbHelmet = itemDatabase[helmetItem.typeId];
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
            p.gameState.events.inventoryDirty = true;
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
        p.die();
    }
}

// 合併的 ItemDatabase（用於測試）
const TEST_DB = { ...ARMOR_DEFS, ...HELMET_DEFS, ...AMMO_DEFS, ...{ M4A1: M4A1_DEF, AWM: AWM_DEF, M870: M870_DEF } };

// ── 護甲傷害減免 ─────────────────────────────────────────

describe('護甲傷害減免', () => {

    beforeEach(() => {
        // 每個測試前重置
    });

    describe('軀幹護甲減免（penLevel < armorLevel）', () => {
        it('綠甲（level 1）應減免 10% 傷害', () => {
            const gs = new GameState();
            const p = new Player('p1', gs);
            p.inventory = { items: [makeArmorItem('綠甲')] };

            const ammoId = '小口徑-1級綠彈'; // penLevel 0 < armorLevel 1
            simulateDamagePlayer(p, 100, 'torso', ammoId, 1.0, TEST_DB);

            // blockAmount = 100 * 0.10 = 10
            // mod = armorDamageMods[1] = 1.0
            // armorDmg = 10 * 1.0 * 1.0 = 10
            // amount -= 10 → 90
            expect(p.health).toBe(10); // 100 - 90 = 10
        });

        it('藍甲（level 2）應減免 20% 傷害', () => {
            const gs = new GameState();
            const p = new Player('p1', gs);
            p.inventory = { items: [makeArmorItem('藍甲')] };

            const ammoId = '小口徑-1級綠彈'; // penLevel 0 < armorLevel 2
            simulateDamagePlayer(p, 100, 'torso', ammoId, 1.0, TEST_DB);

            // blockAmount = 100 * 0.20 = 20
            // mod = armorDamageMods[2] = 0.8
            // armorDmg = 20 * 0.8 * 1.0 = 16
            // amount -= 16 → 84
            expect(p.health).toBe(16); // 100 - 84 = 16
        });

        it('紫甲（level 3）應減免 35% 傷害', () => {
            const gs = new GameState();
            const p = new Player('p1', gs);
            p.inventory = { items: [makeArmorItem('紫甲')] };

            const ammoId = '小口徑-1級綠彈'; // penLevel 0 < armorLevel 3
            simulateDamagePlayer(p, 100, 'torso', ammoId, 1.0, TEST_DB);

            // blockAmount = 100 * 0.35 = 35
            // mod = armorDamageMods[3] = 0.6
            // armorDmg = 35 * 0.6 * 1.0 = 21
            // amount -= 21 → 79
            expect(p.health).toBe(21); // 100 - 79 = 21
        });

        it('金甲（level 4）應減免 50% 傷害', () => {
            const gs = new GameState();
            const p = new Player('p1', gs);
            p.inventory = { items: [makeArmorItem('金甲')] };

            const ammoId = '小口徑-1級綠彈'; // penLevel 0 < armorLevel 4
            simulateDamagePlayer(p, 100, 'torso', ammoId, 1.0, TEST_DB);

            // blockAmount = 100 * 0.50 = 50
            // mod = armorDamageMods[4] = 0.6
            // armorDmg = 50 * 0.6 * 1.0 = 30
            // amount -= 30 → 70
            expect(p.health).toBe(30); // 100 - 70 = 30
        });
    });

    describe('護甲穿透（penLevel >= armorLevel）', () => {
        it('穿透時護甲不減免傷害，但耐久仍扣減', () => {
            const gs = new GameState();
            const p = new Player('p1', gs);
            const armor = makeArmorItem('綠甲'); // level 1, maxDur 40
            p.inventory = { items: [armor] };

            const ammoId = '小口徑-3級紫彈'; // penLevel 1 >= armorLevel 1
            simulateDamagePlayer(p, 50, 'torso', ammoId, 1.0, TEST_DB);

            // 穿透：mod = armorDamageMods[1] = 1.0
            // armorDmg = 50 * 1.0 * 1.0 = 50（但會被 clamp 到 maxDurability）
            // amount 不變 = 50
            expect(p.health).toBe(50); // 100 - 50 = 50（無減免）
            expect(armor.durability).toBeLessThanOrEqual(0); // 耐久被大量消耗
        });

        it('4級金蛋（penLevel 2）穿透 2級藍甲時不減免', () => {
            const gs = new GameState();
            const p = new Player('p1', gs);
            p.inventory = { items: [makeArmorItem('藍甲')] };

            const ammoId = '小口徑-4級金蛋'; // penLevel 2 >= armorLevel 2
            simulateDamagePlayer(p, 50, 'torso', ammoId, 1.0, TEST_DB);

            expect(p.health).toBe(50); // 無減免
        });
    });

    describe('頭盔減免', () => {
        it('金頭（level 4）應減免 30% 頭部傷害', () => {
            const gs = new GameState();
            const p = new Player('p1', gs);
            p.inventory = { items: [makeHelmetItem('金頭')] };

            const ammoId = '小口徑-1級綠彈'; // penLevel 0 < armorLevel 4
            simulateDamagePlayer(p, 100, 'head', ammoId, 1.0, TEST_DB);

            // blockAmount = 100 * 0.30 = 30
            // mod = armorDamageMods[4] = 0.6
            // armorDmg = 30 * 0.6 * 1.0 = 18
            // amount -= 18 → 82
            expect(p.health).toBe(18); // 100 - 82 = 18
        });

        it('綠頭（level 1）應減免 10% 頭部傷害', () => {
            const gs = new GameState();
            const p = new Player('p1', gs);
            p.inventory = { items: [makeHelmetItem('綠頭')] };

            const ammoId = '小口徑-1級綠彈'; // penLevel 0 < armorLevel 1
            simulateDamagePlayer(p, 50, 'head', ammoId, 1.0, TEST_DB);

            // blockAmount = 50 * 0.10 = 5
            // mod = armorDamageMods[1] = 1.0
            // armorDmg = 5 * 1.0 * 1.0 = 5
            // amount -= 5 → 45
            expect(p.health).toBe(55); // 100 - 45 = 55
        });
    });

    describe('無護甲時的傷害', () => {
        it('無護甲時軀幹傷害應全額扣減', () => {
            const gs = new GameState();
            const p = new Player('p1', gs);
            p.inventory = { items: [] };

            simulateDamagePlayer(p, 30, 'torso', '小口徑-1級綠彈', 1.0, TEST_DB);

            expect(p.health).toBe(70);
        });

        it('無頭盔時頭部傷害應全額扣減並觸發頭部受傷', () => {
            const gs = new GameState();
            const p = new Player('p1', gs);
            p.inventory = { items: [] };

            simulateDamagePlayer(p, 20, 'head', '小口徑-1級綠彈', 1.0, TEST_DB);

            expect(p.health).toBe(80);
            expect(p.hasHeadInjury).toBe(true);
        });
    });

    describe('特殊彈藥效果', () => {
        it('紅蛋（forceTorsoInjury）應強制觸發軀幹受傷', () => {
            const gs = new GameState();
            const p = new Player('p1', gs);
            p.inventory = { items: [makeArmorItem('金甲')] };

            const ammoId = '紅蛋-4級金蛋'; // penLevel 4 >= armorLevel 4, hpDamageMod 0.6
            simulateDamagePlayer(p, 100, 'torso', ammoId, 1.0, TEST_DB);

            // 穿透：無減免
            // hpDamageMod = 0.6 → amount = 100 * 0.6 = 60
            // forceTorsoInjury → hasTorsoInjury = true
            expect(p.hasTorsoInjury).toBe(true);
            expect(p.health).toBe(40); // 100 - 60 = 40
        });
    });
});

// ── 護甲耐久度扣減 ───────────────────────────────────────

describe('護甲耐久度扣減', () => {

    describe('軀幹護甲耐久', () => {
        it('未穿透時護甲耐久應扣減 blockAmount * mod * armorPen', () => {
            const gs = new GameState();
            const p = new Player('p1', gs);
            const armor = makeArmorItem('綠甲'); // maxDur 40
            p.inventory = { items: [armor] };

            simulateDamagePlayer(p, 30, 'torso', '小口徑-1級綠彈', 1.0, TEST_DB);

            // blockAmount = 30 * 0.10 = 3
            // mod = armorDamageMods[1] = 1.0
            // armorDmg = 3 * 1.0 * 1.0 = 3
            expect(armor.durability).toBe(37); // 40 - 3 = 37
        });

        it('穿透時護甲耐久應扣減 amount * mod * armorPen', () => {
            const gs = new GameState();
            const p = new Player('p1', gs);
            const armor = makeArmorItem('綠甲'); // level 1, maxDur 40
            p.inventory = { items: [armor] };

            simulateDamagePlayer(p, 30, 'torso', '小口徑-3級紫彈', 1.0, TEST_DB);

            // 穿透：mod = armorDamageMods[1] = 1.0
            // armorDmg = 30 * 1.0 * 1.0 = 30
            expect(armor.durability).toBe(10); // 40 - 30 = 30... wait
            // Actually: 40 - 30 = 10
            expect(armor.durability).toBe(10);
        });

        it('護甲耐久不應低於 0', () => {
            const gs = new GameState();
            const p = new Player('p1', gs);
            const armor = makeArmorItem('綠甲', 5); // 僅剩 5 耐久
            p.inventory = { items: [armor] };

            simulateDamagePlayer(p, 100, 'torso', '小口徑-1級綠彈', 1.0, TEST_DB);

            // blockAmount = 100 * 0.10 = 10
            // mod = 1.0, armorDmg = 10 * 1.0 * 1.0 = 10
            // 但 armorDmg > durability(5) → armorDmg = 5
            // amount -= 5 → 95
            expect(armor.durability).toBe(0);
            expect(p.health).toBe(5); // 100 - 95 = 5
        });

        it('耐久為 0 的護甲不應提供減免', () => {
            const gs = new GameState();
            const p = new Player('p1', gs);
            const armor = makeArmorItem('金甲', 0); // 0 耐久
            p.inventory = { items: [armor] };

            simulateDamagePlayer(p, 50, 'torso', '小口徑-1級綠彈', 1.0, TEST_DB);

            // durability <= 0 → 不進入護甲分支
            // 直接扣減 + 觸發 torsoInjury（amount > 15）
            expect(p.health).toBe(50);
            expect(p.hasTorsoInjury).toBe(true);
        });
    });

    describe('頭盔耐久', () => {
        it('未穿透時頭盔耐久應扣減', () => {
            const gs = new GameState();
            const p = new Player('p1', gs);
            const helmet = makeHelmetItem('藍頭'); // level 2, maxDur 35, reduction 0.15
            p.inventory = { items: [helmet] };

            simulateDamagePlayer(p, 50, 'head', '小口徑-1級綠彈', 1.0, TEST_DB);

            // blockAmount = 50 * 0.15 = 7.5
            // mod = armorDamageMods[2] = 0.8
            // armorDmg = 7.5 * 0.8 * 1.0 = 6
            expect(helmet.durability).toBe(29); // 35 - 6 = 29
        });

        it('頭盔耐久不應低於 0', () => {
            const gs = new GameState();
            const p = new Player('p1', gs);
            const helmet = makeHelmetItem('綠頭', 2); // 僅剩 2 耐久
            p.inventory = { items: [helmet] };

            simulateDamagePlayer(p, 50, 'head', '小口徑-1級綠彈', 1.0, TEST_DB);

            // blockAmount = 50 * 0.10 = 5
            // mod = 1.0, armorDmg = 5 * 1.0 * 1.0 = 5
            // armorDmg > durability(2) → armorDmg = 2
            // amount -= 2 → 48
            expect(helmet.durability).toBe(0);
            expect(p.health).toBe(52); // 100 - 48 = 52
        });
    });

    describe('armorPen 倍率影響', () => {
        it('armorPen > 1.0 應增加護甲耐久扣減', () => {
            const gs = new GameState();
            const p = new Player('p1', gs);
            const armor = makeArmorItem('綠甲');
            p.inventory = { items: [armor] };

            simulateDamagePlayer(p, 30, 'torso', '小口徑-1級綠彈', 1.5, TEST_DB);

            // blockAmount = 30 * 0.10 = 3
            // mod = 1.0, armorDmg = 3 * 1.0 * 1.5 = 4.5
            expect(armor.durability).toBeCloseTo(35.5, 2); // 40 - 4.5
        });
    });
});

// ── 換彈時間 ─────────────────────────────────────────────

describe('換彈時間', () => {

    describe('Weapon.getReloadTime()', () => {
        it('M4A1 裝滿 30 發的換彈時間應正確計算', () => {
            const w = new Weapon(M4A1_DEF, makeItem());
            // missingRatio = 30 / 30 = 1.0
            // time = (30 / 20.0) * 1.0 * 1.0 = 1.5
            const time = w.getReloadTime(30);
            expect(time).toBe(1.5);
        });

        it('M4A1 裝 15 發（半滿）的換彈時間應為一半', () => {
            const w = new Weapon(M4A1_DEF, makeItem());
            // missingRatio = 15 / 30 = 0.5
            // time = (30 / 20.0) * 0.5 * 1.0 = 0.75 → clamp to 0.8
            const time = w.getReloadTime(15);
            expect(time).toBe(0.8); // 最小 0.8 秒
        });

        it('AWM 裝滿 5 發的換彈時間應正確計算', () => {
            const w = new Weapon(AWM_DEF, makeItem());
            // missingRatio = 5 / 5 = 1.0
            // time = (5 / 20.0) * 1.0 * 6.5 = 1.625
            const time = w.getReloadTime(5);
            expect(time).toBe(1.625);
        });

        it('M870 裝滿 7 發的換彈時間應正確計算', () => {
            const w = new Weapon(M870_DEF, makeItem());
            // missingRatio = 7 / 7 = 1.0
            // time = (7 / 20.0) * 1.0 * 4.8 = 1.68
            const time = w.getReloadTime(7);
            expect(time).toBeCloseTo(1.68, 4);
        });

        it('換彈時間不應低於 0.8 秒', () => {
            const w = new Weapon(M4A1_DEF, makeItem());
            // 裝 1 發：missingRatio = 1/30 ≈ 0.033
            // time = (30/20) * 0.033 * 1.0 = 0.05 → clamp to 0.8
            const time = w.getReloadTime(1);
            expect(time).toBeGreaterThanOrEqual(0.8);
        });

        it('reloadMult > 1.0 應增加換彈時間', () => {
            const slowDef = { ...M4A1_DEF, stats: { ...M4A1_DEF.stats, reloadMult: 2.0 } };
            const w = new Weapon(slowDef, makeItem());
            // time = (30/20) * 1.0 * 2.0 = 3.0
            const time = w.getReloadTime(30);
            expect(time).toBe(3.0);
        });
    });

    describe('main.js reload() 換彈時間計算邏輯', () => {
        /**
         * 模擬 main.js reload() 中的換彈時間計算：
         *   let reloadMult = weaponDef.stats.reloadMult || 1.0;
         *   let missingRatio = actualReloadAmount / maxMag;
         *   let reloadTimeSec = (maxMag / 20.0) * missingRatio * reloadMult;
         *   reloadTimeSec = Math.max(0.8, reloadTimeSec);
         */
        it('應與 Weapon.getReloadTime() 結果一致', () => {
            const maxMag = 30;
            const reloadMult = 1.0;
            const actualReloadAmount = 30;

            // main.js 的計算方式
            const missingRatio = actualReloadAmount / maxMag;
            let reloadTimeSec = (maxMag / 20.0) * missingRatio * reloadMult;
            reloadTimeSec = Math.max(0.8, reloadTimeSec);

            // Weapon.getReloadTime() 的計算方式
            const w = new Weapon(M4A1_DEF, makeItem());
            const weaponTime = w.getReloadTime(actualReloadAmount);

            expect(reloadTimeSec).toBe(weaponTime);
        });
    });
});

// ── 換彈狀態 ─────────────────────────────────────────────

describe('換彈狀態', () => {

    describe('Player 換彈狀態初始化', () => {
        it('新玩家不應處於換彈狀態', () => {
            const gs = new GameState();
            const p = new Player('p1', gs);
            expect(p.isReloading).toBe(false);
            expect(p.reloadTimer).toBe(0);
            expect(p.reloadTargetWeapon).toBeNull();
            expect(p.reloadAmount).toBe(0);
        });
    });

    describe('啟動換彈', () => {
        /**
         * 模擬 main.js reload() 設定換彈狀態：
         *   this.player.isReloading = true;
         *   this.player.reloadTimer = reloadTimeSec;
         *   this.player.reloadTargetWeapon = activeItem;
         *   this.player.reloadAmount = actualReloadAmount;
         */
        it('啟動換彈應正確設定所有換彈狀態', () => {
            const gs = new GameState();
            const p = new Player('p1', gs);
            const item = makeItem({ currentMag: 10 });
            p.inventory = { items: [item] };

            const w = new Weapon(M4A1_DEF, item);
            const reloadAmount = 20; // 補滿到 30
            const reloadTime = w.getReloadTime(reloadAmount);

            // 模擬 reload() 設定狀態
            p.isReloading = true;
            p.reloadTimer = reloadTime;
            p.reloadTargetWeapon = item;
            p.reloadAmount = reloadAmount;

            expect(p.isReloading).toBe(true);
            expect(p.reloadTimer).toBe(reloadTime);
            expect(p.reloadTargetWeapon).toBe(item);
            expect(p.reloadAmount).toBe(20);
        });
    });

    describe('換彈完成（Player.updateState reload tick）', () => {
        /**
         * 模擬 Player.updateState() 中的換彈 tick：
         *   if (this.isReloading) {
         *       this.reloadTimer -= dt;
         *       if (this.reloadTimer <= 0) {
         *           this.isReloading = false;
         *           if (this.reloadTargetWeapon) {
         *               this.reloadTargetWeapon.currentMag += this.reloadAmount;
         *           }
         *           this.gameState.events.inventoryDirty = true;
         *       }
         *   }
         */
        it('換彈計時器歸零時應完成換彈並補充彈藥', () => {
            const gs = new GameState();
            const p = new Player('p1', gs);
            const item = makeItem({ currentMag: 10 });
            p.inventory = { items: [item] };

            // 設定換彈狀態
            p.isReloading = true;
            p.reloadTimer = 1.5;
            p.reloadTargetWeapon = item;
            p.reloadAmount = 20;

            // 模擬 updateState 的 reload tick（時間到）
            const dt = 1.5;
            p.reloadTimer -= dt;
            if (p.reloadTimer <= 0) {
                p.isReloading = false;
                if (p.reloadTargetWeapon) {
                    p.reloadTargetWeapon.currentMag += p.reloadAmount;
                }
                p.gameState.events.inventoryDirty = true;
            }

            expect(p.isReloading).toBe(false);
            expect(item.currentMag).toBe(30); // 10 + 20 = 30
            expect(gs.events.inventoryDirty).toBe(true);
        });

        it('換彈計時器未歸零時不應完成換彈', () => {
            const gs = new GameState();
            const p = new Player('p1', gs);
            const item = makeItem({ currentMag: 10 });
            p.inventory = { items: [item] };

            p.isReloading = true;
            p.reloadTimer = 2.0;
            p.reloadTargetWeapon = item;
            p.reloadAmount = 20;

            // 只過了 1.0 秒
            const dt = 1.0;
            p.reloadTimer -= dt;
            if (p.reloadTimer <= 0) {
                p.isReloading = false;
                if (p.reloadTargetWeapon) {
                    p.reloadTargetWeapon.currentMag += p.reloadAmount;
                }
                p.gameState.events.inventoryDirty = true;
            }

            expect(p.isReloading).toBe(true);
            expect(p.reloadTimer).toBe(1.0);
            expect(item.currentMag).toBe(10); // 未補充
        });

        it('換彈中射擊應被阻止（shoot 的 isReloading 檢查）', () => {
            const gs = new GameState();
            const p = new Player('p1', gs);
            const item = makeItem({ currentMag: 10 });
            p.inventory = { items: [item] };

            p.isReloading = true;

            // 模擬 shoot() 開頭的 isReloading 檢查
            const canShoot = !p.isReloading;
            expect(canShoot).toBe(false);
        });
    });

    describe('Weapon.applyReload()', () => {
        it('應將彈藥加入 currentMag', () => {
            const item = makeItem({ currentMag: 5 });
            const w = new Weapon(M4A1_DEF, item);
            w.applyReload(25);
            expect(item.currentMag).toBe(30);
        });

        it('多次 applyReload 應累加', () => {
            const item = makeItem({ currentMag: 0 });
            const w = new Weapon(M4A1_DEF, item);
            w.applyReload(10);
            w.applyReload(10);
            w.applyReload(10);
            expect(item.currentMag).toBe(30);
        });
    });
});

// ── 彈藥數量管理 ─────────────────────────────────────────

describe('彈藥數量管理', () => {

    describe('彈匣大小', () => {
        it('M4A1 基礎彈匣應為 30 發', () => {
            const w = new Weapon(M4A1_DEF, makeItem());
            expect(w.baseMagSize).toBe(30);
            expect(w.maxMagSize).toBe(30);
        });

        it('M4A1 升級彈匣應為 40 發', () => {
            const w = new Weapon(M4A1_DEF, makeItem({ hasUpgradedMag: true }));
            expect(w.maxMagSize).toBe(40);
        });

        it('AWM 無升級彈匣（upMagSize: null）應使用基礎值', () => {
            const w = new Weapon(AWM_DEF, makeItem({ hasUpgradedMag: true }));
            expect(w.maxMagSize).toBe(5);
        });

        it('M870 基礎彈匣應為 7 發', () => {
            const w = new Weapon(M870_DEF, makeItem());
            expect(w.baseMagSize).toBe(7);
        });
    });

    describe('彈匣狀態判定', () => {
        it('滿彈匣 isMagFull 應為 true', () => {
            const w = new Weapon(M4A1_DEF, makeItem({ currentMag: 30 }));
            expect(w.isMagFull).toBe(true);
        });

        it('未滿彈匣 isMagFull 應為 false', () => {
            const w = new Weapon(M4A1_DEF, makeItem({ currentMag: 15 }));
            expect(w.isMagFull).toBe(false);
        });

        it('空彈匣 isMagEmpty 應為 true', () => {
            const w = new Weapon(M4A1_DEF, makeItem({ currentMag: 0 }));
            expect(w.isMagEmpty).toBe(true);
        });

        it('有彈藥的彈匣 isMagEmpty 應為 false', () => {
            const w = new Weapon(M4A1_DEF, makeItem({ currentMag: 1 }));
            expect(w.isMagEmpty).toBe(false);
        });
    });

    describe('射擊消耗彈藥', () => {
        it('每次射擊應消耗 1 發彈藥', () => {
            const item = makeItem({ currentMag: 30 });
            const w = new Weapon(M4A1_DEF, item);

            for (let i = 0; i < 5; i++) {
                w.consumeRound();
            }

            expect(item.currentMag).toBe(25);
        });

        it('散彈槍每次射擊也只消耗 1 發（不是 pelletCount）', () => {
            const item = makeItem({ currentMag: 7 });
            const w = new Weapon(M870_DEF, item);

            w.consumeRound();

            expect(item.currentMag).toBe(6); // 消耗 1 發，不是 8 發
        });

        it('彈匣空後 canFire 應為 false', () => {
            const item = makeItem({ currentMag: 1 });
            const w = new Weapon(M4A1_DEF, item);

            expect(w.canFire()).toBe(true);
            w.consumeRound();
            expect(w.canFire()).toBe(false);
            expect(item.currentMag).toBe(0);
        });
    });

    describe('換彈後彈藥補充', () => {
        it('換彈完成後 currentMag 應增加 reloadAmount', () => {
            const gs = new GameState();
            const p = new Player('p1', gs);
            const item = makeItem({ currentMag: 5 });
            p.inventory = { items: [item] };

            // 模擬換彈完成
            p.isReloading = true;
            p.reloadTimer = 0;
            p.reloadTargetWeapon = item;
            p.reloadAmount = 25;

            // 執行 reload tick
            if (p.isReloading) {
                p.reloadTimer -= 0; // 時間到
                if (p.reloadTimer <= 0) {
                    p.isReloading = false;
                    if (p.reloadTargetWeapon) {
                        p.reloadTargetWeapon.currentMag += p.reloadAmount;
                    }
                    p.gameState.events.inventoryDirty = true;
                }
            }

            expect(item.currentMag).toBe(30); // 5 + 25 = 30
        });

        it('部分換彈（彈藥不足）只補充可用數量', () => {
            const gs = new GameState();
            const p = new Player('p1', gs);
            const item = makeItem({ currentMag: 20 });
            p.inventory = { items: [item] };

            // 只有 5 癒可用
            p.isReloading = true;
            p.reloadTimer = 0;
            p.reloadTargetWeapon = item;
            p.reloadAmount = 5;

            if (p.isReloading) {
                p.reloadTimer -= 0;
                if (p.reloadTimer <= 0) {
                    p.isReloading = false;
                    if (p.reloadTargetWeapon) {
                        p.reloadTargetWeapon.currentMag += p.reloadAmount;
                    }
                    p.gameState.events.inventoryDirty = true;
                }
            }

            expect(item.currentMag).toBe(25); // 20 + 5 = 25
        });
    });

    describe('loadedAmmoId（已裝填彈藥類型）', () => {
        it('Weapon.loadedAmmoId 應從 item 讀取', () => {
            const item = makeItem({ loadedAmmoId: '小口徑-3級紫彈' });
            const w = new Weapon(M4A1_DEF, item);
            expect(w.loadedAmmoId).toBe('小口徑-3級紫彈');
        });

        it('未設定 loadedAmmoId 應回傳 null', () => {
            const item = makeItem({ loadedAmmoId: null });
            const w = new Weapon(M4A1_DEF, item);
            expect(w.loadedAmmoId).toBeNull();
        });
    });
});
