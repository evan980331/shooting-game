const fs = require('fs');

// Fix db.js
let db = fs.readFileSync('db.js', 'utf8');
const newRules = `export const EconomyRules = {
    buyRate: 1.0,
    sellRate: 0.3,
    repairCostGoldArmor: 4000,
    shopCategories: {
        '槍械': (item) => item.type === 'weapon',
        '近戰': (item) => item.type === 'melee',
        '護甲': (item) => item.type === 'armor' || item.type === 'helmet',
        '背包': (item) => item.type === 'backpack',
        '醫療': (item) => item.type === 'medical' || item.type === 'medical-buff',
        '投擲物': (item) => item.type === 'throwable',
        '維修配件': (item) => item.type === 'repair',
        '子彈': (item) => item.type === 'ammo',
        '保險箱': (item) => item.type === 'secure',
    }
};`;
db = db.replace(/export const EconomyRules = \{[\s\S]*?\};/, newRules);
fs.writeFileSync('db.js', db, 'utf8');

// Fix ui.js
let ui = fs.readFileSync('ui.js', 'utf8');
ui = ui.replace(/this\.currentShopCategory === '.*?'\s*&&\s*curItemsContainer/g, "this.currentShopCategory === '子彈' && curItemsContainer");
// Instead of a global replace, I'll be more precise:
ui = ui.replace(/this\.currentShopCategory === '武器'/g, "this.currentShopCategory === '槍械'");
// Catch corrupted '武器' -> 'Z' or similar. 
ui = ui.replace(/const isWeaponTab = this\.currentShopCategory === '.*?'/, "const isWeaponTab = this.currentShopCategory === '槍械'");

// Also handle the default string for ammoClassSubCat "?部" -> "全部", "??" -> "未知"
ui = ui.replace(/const ammoClasses = \['\?部', \.\.\.new Set\(activeCategoryItems\.map\(\(\{ item \}\) => item\.ammoClass \|\| '\?\?'\)\)\];/g, 
  "const ammoClasses = ['全部', ...new Set(activeCategoryItems.map(({ item }) => item.ammoClass || '未知'))];");
ui = ui.replace(/this\.ammoClassSubCat = '\?部'/g, "this.ammoClassSubCat = '全部'");
ui = ui.replace(/this\.currentWeaponSubCat = '\?部'/g, "this.currentWeaponSubCat = '全部'");
ui = ui.replace(/!== '\?部'/g, "!== '全部'");
ui = ui.replace(/\|\| '\?\?'/g, "|| '未知'");

fs.writeFileSync('ui.js', ui, 'utf8');
console.log('Fixed db.js and ui.js');
