export const ItemDatabase = {
    // === Assault Rifles (中口徑: all tiers 1-4) ===
    "M4A1": { name: "M4A1", weaponClass: "突擊步槍", type: "weapon", ammoType: "中口徑", price: 3000, weight: 3.5, stats: { damage: 19, fireRate: 75, recoil: 60, accuracy: 80, range: 70, velocity: 75, magSize: 30, upMagSize: 40, upMagPrice: 4500, reloadMult: 1.0 }, gridW: 2, gridH: 4 },
    "K416": { name: "K416", weaponClass: "突擊步槍", type: "weapon", ammoType: "中口徑", price: 3600, weight: 3.5, stats: { damage: 17, fireRate: 82, recoil: 70, accuracy: 80, range: 75, velocity: 75, magSize: 40, upMagSize: 50, upMagPrice: 5100, reloadMult: 1.0 }, gridW: 2, gridH: 4 },
    "SCAR-H": { name: "SCAR-H", weaponClass: "突擊步槍", type: "weapon", ammoType: "全威彈", price: 3500, weight: 4, stats: { damage: 25, fireRate: 55, recoil: 55, accuracy: 75, range: 80, velocity: 80, magSize: 30, upMagSize: 45, upMagPrice: 5000, reloadMult: 1.1 }, gridW: 2, gridH: 4 },
    "ASH-12": { name: "ASH-12", weaponClass: "突擊步槍", type: "weapon", ammoType: "鈍傷彈", price: 4200, weight: 6, stats: { damage: 32, fireRate: 50, recoil: 40, accuracy: 65, range: 70, velocity: 65, magSize: 30, upMagSize: 40, upMagPrice: 5700, reloadMult: 1.1 }, gridW: 2, gridH: 4 },
    "M7": { name: "M7", weaponClass: "突擊步槍", type: "weapon", ammoType: "全威彈", price: 4000, weight: 5, stats: { damage: 20, fireRate: 70, recoil: 60, accuracy: 75, range: 80, velocity: 70, magSize: 30, upMagSize: 45, upMagPrice: 6000, reloadMult: 1.0 }, gridW: 2, gridH: 4 },

    // === SMGs (小口徑: all tiers 1-4) ===
    "VMP": { name: "VMP", weaponClass: "衝鋒槍", type: "weapon", ammoType: "小口徑", price: 1000, weight: 2, stats: { damage: 12, fireRate: 95, recoil: 55, accuracy: 70, range: 50, velocity: 50, magSize: 50, upMagSize: 70, upMagPrice: 1600, reloadMult: 0.9 }, gridW: 2, gridH: 3 },
    "SMG-45": { name: "SMG-45", weaponClass: "衝鋒槍", type: "weapon", ammoType: "小口徑", price: 1000, weight: 2, stats: { damage: 18, fireRate: 65, recoil: 70, accuracy: 75, range: 60, velocity: 55, magSize: 30, upMagSize: 45, upMagPrice: 1600, reloadMult: 1.0 }, gridW: 2, gridH: 3 },
    "USS9": { name: "USS9", weaponClass: "衝鋒槍", type: "weapon", ammoType: "小口徑", price: 1000, weight: 2, stats: { damage: 16, fireRate: 85, recoil: 60, accuracy: 70, range: 55, velocity: 50, magSize: 40, upMagSize: 50, upMagPrice: 1600, reloadMult: 1.0 }, gridW: 2, gridH: 3 },

    // === Snipers ===
    "AWM": { name: "AWM", weaponClass: "狙擊槍", type: "weapon", ammoType: "紅蛋", price: 20000, weight: 10, stats: { damage: 150, fireRate: 10, recoil: 20, accuracy: 100, range: 100, velocity: 100, magSize: 5, upMagSize: null, upMagPrice: null, reloadMult: 6.5 }, gridW: 5, gridH: 1 },
    "LW3 Tundra": { name: "LW3 Tundra", weaponClass: "狙擊槍", type: "weapon", ammoType: "狙擊彈", price: 4500, weight: 8, stats: { damage: 90, fireRate: 15, recoil: 30, accuracy: 100, range: 100, velocity: 100, magSize: 5, upMagSize: 10, upMagPrice: 7300, reloadMult: 6.0 }, gridW: 5, gridH: 1 },
    "SV-98": { name: "SV-98", weaponClass: "狙擊槍", type: "weapon", ammoType: "狙擊彈", price: 4000, weight: 8, stats: { damage: 80, fireRate: 12, recoil: 30, accuracy: 95, range: 100, velocity: 100, magSize: 7, upMagSize: 10, upMagPrice: 6800, reloadMult: 6.0 }, gridW: 5, gridH: 1 },

    // === DMRs / LMGs ===
    "SKS": { name: "SKS", weaponClass: "精確射手/輕機槍", type: "weapon", ammoType: "全威彈", price: 3800, weight: 6.5, stats: { damage: 35, fireRate: 45, recoil: 80, accuracy: 95, range: 80, velocity: 90, magSize: 20, upMagSize: 30, upMagPrice: 6300, reloadMult: 2.0 }, gridW: 5, gridH: 1 },
    "M14單點": { name: "M14單點", weaponClass: "精確射手/輕機槍", type: "weapon", ammoType: "全威彈", price: 3800, weight: 7, stats: { damage: 30, fireRate: 40, recoil: 70, accuracy: 80, range: 85, velocity: 90, magSize: 20, upMagSize: 30, upMagPrice: 6300, reloadMult: 2.0 }, gridW: 5, gridH: 1 },
    "M14自動": { name: "M14自動", weaponClass: "精確射手/輕機槍", type: "weapon", ammoType: "全威彈", price: 5000, weight: 7, stats: { damage: 20, fireRate: 85, recoil: 40, accuracy: 65, range: 65, velocity: 75, magSize: 30, upMagSize: 50, upMagPrice: 7800, reloadMult: 1.8 }, gridW: 5, gridH: 2 },
    "Kilo Bolt": { name: "Kilo Bolt", weaponClass: "狙擊槍", type: "weapon", ammoType: "狙擊彈", price: 4000, weight: 8, stats: { damage: 65, fireRate: 20, recoil: 20, accuracy: 100, range: 95, velocity: 90, magSize: 10, upMagSize: 15, upMagPrice: 6500, reloadMult: 5.0 }, gridW: 5, gridH: 1 },
    "PKM": { name: "PKM", weaponClass: "精確射手/輕機槍", type: "weapon", ammoType: "全威彈", price: 4000, weight: 10, stats: { armorPen: 1.1, damage: 24, fireRate: 65, recoil: 60, accuracy: 60, range: 70, velocity: 80, magSize: 75, upMagSize: 100, upMagPrice: 7000, reloadMult: 1.8 }, gridW: 5, gridH: 2 },
    "M250": { name: "M250", weaponClass: "精確射手/輕機槍", type: "weapon", ammoType: "大口徑", price: 4200, weight: 10, stats: { armorPen: 1.1, damage: 22, fireRate: 75, recoil: 55, accuracy: 55, range: 75, velocity: 80, magSize: 75, upMagSize: 100, upMagPrice: 7200, reloadMult: 1.8 }, gridW: 5, gridH: 2 },
    "M249": { name: "M249", weaponClass: "精確射手/輕機槍", type: "weapon", ammoType: "中口徑", price: 3600, weight: 10, stats: { armorPen: 1.1, damage: 18, fireRate: 90, recoil: 60, accuracy: 60, range: 70, velocity: 80, magSize: 75, upMagSize: 100, upMagPrice: 6600, reloadMult: 1.8 }, gridW: 5, gridH: 2 },

    // === Shotguns (散彈: tiers 1-3 only, plus special Flechette) ===
    "M870": { name: "M870", weaponClass: "散彈槍", type: "weapon", ammoType: "散彈", price: 1000, weight: 2.5, stats: { damage: "10x8", fireRate: 35, recoil: 0, accuracy: 20, range: 40, velocity: 40, magSize: 7, upMagSize: 12, upMagPrice: 1500, reloadMult: 4.8 }, gridW: 1, gridH: 4 },
    "KRM-262": { name: "KRM-262", weaponClass: "散彈槍", type: "weapon", ammoType: "散彈", price: 1000, weight: 2.5, stats: { damage: "8x10", fireRate: 30, recoil: 0, accuracy: 20, range: 50, velocity: 40, magSize: 7, upMagSize: 12, upMagPrice: 1500, reloadMult: 4.8 }, gridW: 1, gridH: 4 },
    "S12K": { name: "S12K", weaponClass: "散彈槍", type: "weapon", ammoType: "散彈", price: 1000, weight: 2.5, stats: { damage: "10x6", fireRate: 40, recoil: 0, accuracy: 20, range: 40, velocity: 40, magSize: 15, upMagSize: 20, upMagPrice: 1500, reloadMult: 3.8 }, gridW: 1, gridH: 4 },

    // === Pistols (小口徑: max tier 3 紫彈 for pistols, all for SMGs) ===
    "MW11": { name: "MW11", weaponClass: "手槍", type: "weapon", ammoType: "小口徑", maxAmmoTier: 3, price: 500, weight: 1, stats: { damage: 20, fireRate: 50, recoil: 70, accuracy: 80, range: 50, velocity: 60, magSize: 20, upMagSize: 25, upMagPrice: 1000, reloadMult: 1.2 }, gridW: 1, gridH: 2 },
    ".50GS": { name: ".50GS", weaponClass: "手槍", type: "weapon", ammoType: "小口徑", maxAmmoTier: 3, price: 700, weight: 1, stats: { damage: 40, fireRate: 25, recoil: 20, accuracy: 80, range: 50, velocity: 70, magSize: 10, upMagSize: 15, upMagPrice: 1200, reloadMult: 1.5 }, gridW: 1, gridH: 2 },
    "G18": { name: "G18", weaponClass: "手槍", type: "weapon", ammoType: "小口徑", maxAmmoTier: 3, price: 500, weight: 1, stats: { damage: 11, fireRate: 100, recoil: 50, accuracy: 50, range: 30, velocity: 45, magSize: 20, upMagSize: 30, upMagPrice: 1000, reloadMult: 1.1 }, gridW: 1, gridH: 2 },

    // === Melee ===
    "刀": { name: "刀", weaponClass: "近戰", type: "melee", price: 1000, weight: 0.5, stats: { damage: 25, fireRate: 50, recoil: 0, accuracy: 100, range: 2, velocity: 0, magSize: null }, gridW: 1, gridH: 2 },

    // === Armor (Body) ===
    "金甲": { name: "金甲", type: "armor", level: 4, price: 5000, weight: 12, gridW: 3, gridH: 3, maxDurability: 70, damageReduction: 0.50 },
    "紫甲": { name: "紫甲", type: "armor", level: 3, price: 3000, weight: 8, gridW: 3, gridH: 3, maxDurability: 60, damageReduction: 0.35 },
    "藍甲": { name: "藍甲", type: "armor", level: 2, price: 2000, weight: 5, gridW: 2, gridH: 2, maxDurability: 50, damageReduction: 0.20 },
    "綠甲": { name: "綠甲", type: "armor", level: 1, price: 1000, weight: 3, gridW: 2, gridH: 2, maxDurability: 40, damageReduction: 0.10 },

    // === Armor (Head) ===
    "金頭": { name: "金頭", type: "helmet", level: 4, price: 3000, weight: 3, gridW: 2, gridH: 2, maxDurability: 50, damageReduction: 0.30 },
    "紫頭": { name: "紫頭", type: "helmet", level: 3, price: 2000, weight: 2, gridW: 2, gridH: 2, maxDurability: 40, damageReduction: 0.25 },
    "藍頭": { name: "藍頭", type: "helmet", level: 2, price: 1000, weight: 1, gridW: 2, gridH: 2, maxDurability: 35, damageReduction: 0.15 },
    "綠頭": { name: "綠頭", type: "helmet", level: 1, price: 500, weight: 0.5, gridW: 2, gridH: 2, maxDurability: 30, damageReduction: 0.10 },

    // === Backpacks ===
    "小背包": { name: "小背包", type: "backpack", price: 1500, weight: 1, gridW: 2, gridH: 2, capW: 3, capH: 4 },
    "中背包": { name: "中背包", type: "backpack", price: 4500, weight: 2, gridW: 2, gridH: 2, capW: 4, capH: 5 },
    "大背包": { name: "大背包", type: "backpack", price: 9000, weight: 3.5, gridW: 3, gridH: 3, capW: 5, capH: 6 },
    "特大背包": { name: "特大背包", type: "backpack", price: 12000, weight: 5, gridW: 3, gridH: 3, capW: 5, capH: 8 },

    // === Repair Kits ===
    "金甲修": { name: "金甲修", type: "repair", price: 4000, weight: 2.5, gridW: 2, gridH: 2, maxCapacity: 100, level: 4, useRate: 10, prepTime: 3000 },
    "紫甲修": { name: "紫甲修", type: "repair", price: 3000, weight: 2, gridW: 2, gridH: 2, maxCapacity: 75, level: 3, useRate: 10, prepTime: 2000 },
    "藍甲修": { name: "藍甲修", type: "repair", price: 1200, weight: 1.0, gridW: 1, gridH: 3, maxCapacity: 50, level: 2, useRate: 10, prepTime: 1500 },

    // === Medical ===
    "快速回血針": { name: "快速回血針", type: "medical", price: 500, weight: 0.1, gridW: 1, gridH: 1, maxCapacity: 8, healAmount: 15, useTime: 750, healType: 'instant', costPerUse: 1 },
    "基礎血包": { name: "基礎血包", type: "medical", price: 1500, weight: 0.5, gridW: 1, gridH: 2, maxCapacity: 300, useTime: 1500, healRate: 15, costPerHp: 1.0, healType: 'over_time' },
    "高級血包": { name: "高級血包", type: "medical", price: 3000, weight: 0.8, gridW: 1, gridH: 2, maxCapacity: 500, useTime: 1000, healRate: 20, costPerHp: 1.2, healType: 'over_time' },
    "止血帶": { name: "止血帶", type: "medical", price: 800, weight: 0.2, gridW: 1, gridH: 1, maxCapacity: 4, useTime: 2000, healType: 'remove_bleed', costPerUse: 1 },
    "繃帶": { name: "繃帶", type: "medical", price: 600, weight: 0.2, gridW: 1, gridH: 1, maxCapacity: 4, useTime: 2000, healType: 'remove_injury', costPerUse: 1 },
    "手術包": { name: "手術包", type: "medical", price: 4000, weight: 1.0, gridW: 1, gridH: 2, maxCapacity: 7, useTime: 3000, healType: 'remove_any', costPerUse: 1 },
    "痊癒治療包": { name: "痊癒治療包", type: "medical", price: 10000, weight: 1.5, gridW: 2, gridH: 2, maxCapacity: 1, useTime: 7000, healType: 'full_heal', costPerUse: 1 },
    "止痛藥": { name: "止痛藥", type: "medical", price: 1200, weight: 0.1, gridW: 1, gridH: 1, maxCapacity: 5, useTime: 1500, healType: 'painkiller', pkDuration: 3000, costPerUse: 1 },

    // === Injectors (Buffs) ===
    "腎上腺素針": { name: "腎上腺素針", type: "medical-buff", price: 400, weight: 0.5, gridW: 1, gridH: 1, maxCapacity: 2, useTime: 1000, effectDuration: 45000, effectType: 'adrenaline' },
    "力量針": { name: "力量針", type: "medical-buff", price: 400, weight: 0.5, gridW: 1, gridH: 1, maxCapacity: 2, useTime: 1000, effectDuration: 60000, effectType: 'strength' },
    "負重針": { name: "負重針", type: "medical-buff", price: 500, weight: 0.5, gridW: 1, gridH: 1, maxCapacity: 2, useTime: 1000, effectDuration: 60000, effectType: 'weightless' },

    // === Throwables ===
    "煙霧彈": { name: "煙霧彈", type: "throwable", price: 200, weight: 0.6, gridW: 1, gridH: 1, fuseTime: 0, duration: 20000, effectType: 'smoke' },
    "手榴彈": { name: "手榴彈", type: "throwable", price: 200, weight: 0.5, gridW: 1, gridH: 1, fuseTime: 3000, damage: 75, effectType: 'frag' },
    "毒氣彈": { name: "毒氣彈", type: "throwable", price: 200, weight: 0.5, gridW: 1, gridH: 1, fuseTime: 0, duration: 20000, effectType: 'gas' },

    // === Secure Containers ===
    "初始保險": { name: "初始保險", type: "secure", price: 0, weight: 0, gridW: 2, gridH: 2, capW: 2, capH: 2, unlocked: true },
    "中級保險": { name: "中級保險", type: "secure", price: 10000, weight: 0, gridW: 2, gridH: 3, capW: 2, capH: 3, unlocked: false },
    "高級保險": { name: "高級保險", type: "secure", price: 0, weight: 0, gridW: 3, gridH: 3, capW: 3, capH: 3, unlocked: false, requireTask: true },

    // ====================================================
    // === AMMO SYSTEM ===
    // ====================================================
    // All ammo objects have:
    //   ammoClass: which weapon class accepts it (e.g. "小口徑", "中口徑", "全威彈", "大口徑", "狙擊彈", "散彈")
    //   tier: numeric tier 1-4 (standard ammo)
    //   penLevel: which armor level it fully penetrates (breaks through without damage reduction). 0=none
    //   armorDamageMods: { 1, 2, 3, 4 } - multiplier applied to armor durability on each armor level
    //   hpDamageMod: multiplier on HP damage (default 1.0 - ammo doesn't change raw hp damage)
    //   special effects stored separately

    // --- 小口徑 Standard Ammo (SMG + Pistol[max tier 3]) ---
    "小口徑-1級綠彈": { name: "小口徑-1級綠彈", type: "ammo", ammoClass: "小口徑", tier: 1,
        penLevel: 0, armorDamageMods: { 1: 1.0, 2: 0.8, 3: 0.6, 4: 0.6 }, hpDamageMod: 1.0,
        price: 180, weight: 0.5, gridW: 1, gridH: 1, maxCapacity: 60 },
    "小口徑-2級藍彈": { name: "小口徑-2級藍彈", type: "ammo", ammoClass: "小口徑", tier: 2,
        penLevel: 0, armorDamageMods: { 1: 1.2, 2: 1.0, 3: 0.8, 4: 0.8 }, hpDamageMod: 1.0,
        price: 280, weight: 0.5, gridW: 1, gridH: 1, maxCapacity: 60 },
    "小口徑-3級紫彈": { name: "小口徑-3級紫彈", type: "ammo", ammoClass: "小口徑", tier: 3,
        penLevel: 1, armorDamageMods: { 1: 1.0, 2: 1.2, 3: 1.0, 4: 0.8 }, hpDamageMod: 1.0,
        price: 450, weight: 0.5, gridW: 1, gridH: 1, maxCapacity: 60 },
    "小口徑-4級金蛋": { name: "小口徑-4級金蛋", type: "ammo", ammoClass: "小口徑", tier: 4,
        penLevel: 2, armorDamageMods: { 1: 1.0, 2: 1.2, 3: 1.0, 4: 1.0 }, hpDamageMod: 1.0,
        price: 700, weight: 0.5, gridW: 1, gridH: 1, maxCapacity: 60 },

    // --- 中口徑 Standard Ammo (AR: M4A1, K416, M249 - all tiers) ---
    "中口徑-1級綠彈": { name: "中口徑-1級綠彈", type: "ammo", ammoClass: "中口徑", tier: 1,
        penLevel: 0, armorDamageMods: { 1: 1.0, 2: 0.8, 3: 0.6, 4: 0.6 }, hpDamageMod: 1.0,
        price: 200, weight: 0.5, gridW: 1, gridH: 1, maxCapacity: 60 },
    "中口徑-2級藍彈": { name: "中口徑-2級藍彈", type: "ammo", ammoClass: "中口徑", tier: 2,
        penLevel: 0, armorDamageMods: { 1: 1.2, 2: 1.0, 3: 0.8, 4: 0.8 }, hpDamageMod: 1.0,
        price: 320, weight: 0.5, gridW: 1, gridH: 1, maxCapacity: 60 },
    "中口徑-3級紫彈": { name: "中口徑-3級紫彈", type: "ammo", ammoClass: "中口徑", tier: 3,
        penLevel: 1, armorDamageMods: { 1: 1.0, 2: 1.2, 3: 1.0, 4: 0.8 }, hpDamageMod: 1.0,
        price: 500, weight: 0.5, gridW: 1, gridH: 1, maxCapacity: 60 },
    "中口徑-4級金蛋": { name: "中口徑-4級金蛋", type: "ammo", ammoClass: "中口徑", tier: 4,
        penLevel: 2, armorDamageMods: { 1: 1.0, 2: 1.2, 3: 1.0, 4: 1.0 }, hpDamageMod: 1.0,
        price: 800, weight: 0.5, gridW: 1, gridH: 1, maxCapacity: 60 },

    // --- 全威彈 (SCAR-H, PKM, SKS, M14, M7 - tier 2 minimum) ---
    "全威彈-2級藍彈": { name: "全威彈-2級藍彈", type: "ammo", ammoClass: "全威彈", tier: 2,
        penLevel: 1, armorDamageMods: { 1: 1.2, 2: 1.0, 3: 0.8, 4: 0.8 }, hpDamageMod: 1.0,
        price: 380, weight: 0.5, gridW: 1, gridH: 1, maxCapacity: 60 },
    "全威彈-3級紫彈": { name: "全威彈-3級紫彈", type: "ammo", ammoClass: "全威彈", tier: 3,
        penLevel: 2, armorDamageMods: { 1: 1.0, 2: 1.2, 3: 1.0, 4: 0.8 }, hpDamageMod: 1.0,
        price: 600, weight: 0.5, gridW: 1, gridH: 1, maxCapacity: 60 },
    "全威彈-4級金蛋": { name: "全威彈-4級金蛋", type: "ammo", ammoClass: "全威彈", tier: 4,
        penLevel: 3, armorDamageMods: { 1: 1.0, 2: 1.2, 3: 1.0, 4: 1.0 }, hpDamageMod: 1.0,
        price: 950, weight: 0.5, gridW: 1, gridH: 1, maxCapacity: 60 },

    // --- 大口徑 (M250 - tier 2 minimum; ASH-12 uses 鈍傷彈 special) ---
    "大口徑-2級藍彈": { name: "大口徑-2級藍彈", type: "ammo", ammoClass: "大口徑", tier: 2,
        penLevel: 1, armorDamageMods: { 1: 1.2, 2: 1.0, 3: 0.8, 4: 0.8 }, hpDamageMod: 1.0,
        price: 450, weight: 1.0, gridW: 1, gridH: 1, maxCapacity: 60 },
    "大口徑-3級紫彈": { name: "大口徑-3級紫彈", type: "ammo", ammoClass: "大口徑", tier: 3,
        penLevel: 2, armorDamageMods: { 1: 1.0, 2: 1.2, 3: 1.0, 4: 0.8 }, hpDamageMod: 1.0,
        price: 700, weight: 1.0, gridW: 1, gridH: 1, maxCapacity: 60 },
    "大口徑-4級金蛋": { name: "大口徑-4級金蛋", type: "ammo", ammoClass: "大口徑", tier: 4,
        penLevel: 3, armorDamageMods: { 1: 1.0, 2: 1.2, 3: 1.0, 4: 1.0 }, hpDamageMod: 1.0,
        price: 1100, weight: 1.0, gridW: 1, gridH: 1, maxCapacity: 60 },

    // --- 狙擊彈 (LW3, SV-98, Kilo Bolt - tier 3 minimum) ---
    "狙擊彈-3級紫彈": { name: "狙擊彈-3級紫彈", type: "ammo", ammoClass: "狙擊彈", tier: 3,
        penLevel: 2, armorDamageMods: { 1: 1.0, 2: 1.2, 3: 1.0, 4: 0.8 }, hpDamageMod: 1.0,
        price: 800, weight: 2.0, gridW: 1, gridH: 1, maxCapacity: 30 },
    "狙擊彈-4級金蛋": { name: "狙擊彈-4級金蛋", type: "ammo", ammoClass: "狙擊彈", tier: 4,
        penLevel: 3, armorDamageMods: { 1: 1.0, 2: 1.2, 3: 1.0, 4: 1.0 }, hpDamageMod: 1.0,
        price: 1200, weight: 2.0, gridW: 1, gridH: 1, maxCapacity: 30 },

    // --- 散彈 (Shotguns - tier 1-3 standard, plus special Flechette) ---
    "散彈-1級綠彈": { name: "散彈-1級綠彈", type: "ammo", ammoClass: "散彈", tier: 1,
        penLevel: 0, armorDamageMods: { 1: 1.0, 2: 0.8, 3: 0.6, 4: 0.6 }, hpDamageMod: 1.0,
        price: 160, weight: 0.5, gridW: 1, gridH: 1, maxCapacity: 20 },
    "散彈-2級藍彈": { name: "散彈-2級藍彈", type: "ammo", ammoClass: "散彈", tier: 2,
        penLevel: 0, armorDamageMods: { 1: 1.2, 2: 1.0, 3: 0.8, 4: 0.8 }, hpDamageMod: 1.0,
        price: 260, weight: 0.5, gridW: 1, gridH: 1, maxCapacity: 20 },
    "散彈-3級紫彈": { name: "散彈-3級紫彈", type: "ammo", ammoClass: "散彈", tier: 3,
        penLevel: 1, armorDamageMods: { 1: 1.0, 2: 1.2, 3: 1.0, 4: 0.8 }, hpDamageMod: 1.0,
        price: 400, weight: 0.5, gridW: 1, gridH: 1, maxCapacity: 20 },
    // Special: Flechette (for shotguns only) - 綠甲直接破, 藍甲x1.2, 紫甲x1.1, 金甲x0.9 HP mod
    "箭型彈": { name: "箭型彈（散彈特殊）", type: "ammo", ammoClass: "散彈", tier: 2, isSpecial: true,
        penLevel: 1, armorDamageMods: { 1: 0, 2: 1.2, 3: 1.1, 4: 0.9 }, hpDamageMod: 1.0,
        price: 300, weight: 0.5, gridW: 1, gridH: 1, maxCapacity: 20,
        specialDesc: "綠甲直接破，藍甲x1.2，紫甲x1.1，金甲x0.9" },

    // Special: 鈍傷彈 (ASH-12 only) - penetrates all armor, deals 0.6x HP damage, always causes Torso injury
    "鈍傷彈": { name: "鈍傷彈（ASH-12專用）", type: "ammo", ammoClass: "鈍傷彈", tier: 4, isSpecial: true,
        penLevel: 4, armorDamageMods: { 1: 0.6, 2: 0.6, 3: 0.6, 4: 0.6 }, hpDamageMod: 0.6,
        forceTorsoInjury: true,
        price: 1200, weight: 1.0, gridW: 1, gridH: 1, maxCapacity: 30,
        specialDesc: "穿透任何護甲，強制軀幹受傷，HP傷害x0.6" },

    // Special: AWM 紅蛋 - destroys armor lv1-3, gold armor x1.1
    "紅蛋": { name: "紅蛋（AWM專用）", type: "ammo", ammoClass: "紅蛋", tier: 4, isSpecial: true,
        penLevel: 3, armorDamageMods: { 1: 0, 2: 0, 3: 0, 4: 1.1 }, hpDamageMod: 1.0,
        price: 2500, weight: 2.0, gridW: 1, gridH: 1, maxCapacity: 10,
        specialDesc: "紫甲以下全破，金甲x1.1" },
};

export const EconomyRules = {
    buyRate: 1.0,  // 100%
    sellRate: 0.3, // 30% (70% Tax)
    repairCostGoldArmor: 4000,

    shopCategories: {
        "武器": (item) => item.type === 'weapon',
        "護甲": (item) => item.type === 'armor' || item.type === 'helmet',
        "背包": (item) => item.type === 'backpack',
        "醫療": (item) => item.type === 'medical' || item.type === 'medical-buff',
        "投擲物": (item) => item.type === 'throwable',
        "修理套件": (item) => item.type === 'repair',
        "子彈": (item) => item.type === 'ammo',
        "其他": (item) => item.type === 'secure',
    }
};
