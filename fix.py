import re

# Fix main.js
with open('main.js', 'rb') as f:
    main_content = f.read()
main_content = main_content.replace(b'this.maxInstances = 1000;', b'this.maxInstances = 100000;')
with open('main.js', 'wb') as f:
    f.write(main_content)

# Fix db.js
with open('db.js', 'rb') as f:
    content = f.read()

pattern = b'export const EconomyRules = \\{[\\s\\S]*?\\};'

new_rules = '''export const EconomyRules = {
    buyRate: 1.0,  // 100%
    sellRate: 0.3, // 30% (70% Tax)
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
};'''.encode('utf-8')

content = re.sub(pattern, new_rules, content)
with open('db.js', 'wb') as f:
    f.write(content)

# Fix ui.js
with open('ui.js', 'rb') as f:
    ui_content = f.read()

ui_text = ui_content.decode('utf-8', errors='ignore')

ui_text = re.sub(r"this\.currentShopCategory === '[^']+'\s*&&\s*curItemsContainer", "this.currentShopCategory === '子彈' && curItemsContainer", ui_text)

ui_text = re.sub(r"const ammoClasses = \['[^']+', \.\.\.new Set\(activeCategoryItems\.map\(\(\{ item \}\) => item\.ammoClass \|\| '[^']+'\)\)\];", "const ammoClasses = ['全部', ...new Set(activeCategoryItems.map(({ item }) => item.ammoClass || '未知'))];", ui_text)

ui_text = re.sub(r"this\.ammoClassSubCat !== '[^']+'", "this.ammoClassSubCat !== '全部'", ui_text)
ui_text = re.sub(r"\(item\.ammoClass \|\| '[^']+'\) === this\.ammoClassSubCat", "(item.ammoClass || '未知') === this.ammoClassSubCat", ui_text)

ui_text = re.sub(r"this\.currentWeaponSubCat = '[^']+';", "this.currentWeaponSubCat = '全部';", ui_text)
ui_text = re.sub(r"this\.ammoClassSubCat = '[^']+';", "this.ammoClassSubCat = '全部';", ui_text)

ui_text = re.sub(r"const isWeaponTab = this\.currentShopCategory === '[^']+';", "const isWeaponTab = this.currentShopCategory === '槍械';", ui_text)

sort_logic = '''
        activeCategoryItems.sort((a, b) => {
            if (this.currentShopCategory === '子彈') {
                const tierA = a.item.tier || 0;
                const tierB = b.item.tier || 0;
                if (tierA !== tierB) return tierA - tierB;
            }
            return (a.item.price || 0) - (b.item.price || 0);
        });
        
        activeCategoryItems.forEach(({ key, item }) => {'''

ui_text = ui_text.replace('activeCategoryItems.forEach(({ key, item }) => {', sort_logic)

with open('ui.js', 'wb') as f:
    f.write(ui_text.encode('utf-8'))
