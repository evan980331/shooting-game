import sys

with open('_clean_ui.js', 'r', encoding='utf-8') as f:
    clean = f.read()

print(f'Clean ui.js loaded: {len(clean)} chars')

# Find dblclick location
idx = clean.find("div.addEventListener('dblclick'")
print(f'dblclick found at char: {idx}')
if idx < 0:
    print('ERROR: dblclick not found!')
    sys.exit(1)

# Show surrounding context
print('Context (200 chars around dblclick):')
print(repr(clean[idx:idx+200]))

# Find the closing of the dblclick listener
# It ends with });  after the closing brace of the callback
# We need to find the matching });
depth = 0
end_idx = idx
i = idx
while i < len(clean):
    c = clean[i]
    if c == '{':
        depth += 1
    elif c == '}':
        depth -= 1
        if depth == 0:
            end_idx = i + 3  # include });
            break
    i += 1

print(f'\ndblclick block ends at char: {end_idx}')
OLD_BLOCK = clean[idx:end_idx]
print(f'Old block length: {len(OLD_BLOCK)} chars')
print('Old block last 50 chars:', repr(OLD_BLOCK[-50:]))

# New dblclick block with Raid-safe logic
NEW_BLOCK = """div.addEventListener('dblclick', (e) => {
                if (item.typeId === '\u5200') return;
                // Cancel any pending hold-drag
                this._cancelHold();
                if (this.attachedItemId !== null) return;

                const dbItem = ItemDatabase[item.typeId];
                const isInRaid = !this.game.isInMenu;

                // === \u6230\u5c40\u4e2d\uff1a\u7981\u6b62\u96d9\u64ca\u5378\u88dd\uff0c\u50c5\u5141\u8a31\u88dd\u5099\u81f3\u6b04\u4f4d\u6216\u80cc\u5305 ===
                if (isInRaid) {
                    const EQUIP_SLOTS = ['primaryWep', 'primaryWep2', 'secondaryWep', 'meleeSlot', 'armorSlot', 'helmetSlot', 'backpackSlot', 'hotbarSlot'];
                    // \u5982\u679c\u7269\u54c1\u5df2\u5728\u88dd\u5099\u6b04\u4e2d\uff0c\u6230\u5c40\u5167\u4e0d\u5141\u8a31\u96d9\u64ca\u5378\u88dd
                    if (EQUIP_SLOTS.includes(item.container)) {
                        this._showQuickEquipError('\u6230\u5c40\u4e2d\u4e0d\u53ef\u96d9\u64ca\u5378\u88dd\uff0c\u8acb\u62d6\u66f3\u81f3\u80cc\u5305');
                        return;
                    }
                    // \u7269\u54c1\u4e0d\u5728\u88dd\u5099\u6b04\uff1a\u5617\u8a66\u88dd\u5099
                    if (dbItem && dbItem.type === 'weapon' && dbItem.gridW * dbItem.gridH > 2) {
                        let placed = false;
                        for (const cName of ['primaryWep', 'primaryWep2']) {
                            if (item.container === cName) continue;
                            const slot = this.inv.findFreeSlot(dbItem.gridW, dbItem.gridH, this.inv[cName]);
                            if (slot) {
                                const res = this.inv.moveItem(item.id, cName, slot.x, slot.y, slot.rotated);
                                if (res && res.success) { placed = true; break; }
                            }
                        }
                        if (!placed) {
                            const bpSlot = this.inv.findFreeSlot(dbItem.gridW, dbItem.gridH, this.inv.backpack);
                            if (bpSlot) {
                                const res = this.inv.moveItem(item.id, 'backpack', bpSlot.x, bpSlot.y, bpSlot.rotated);
                                if (res && res.success) placed = true;
                            }
                        }
                        if (!placed) {
                            this._showQuickEquipError('\u4e3b\u6b66\u5668\u6b04\u4f4d\u8207\u80cc\u5305\u5747\u5df2\u6efd\uff0c\u7121\u6cd5\u5feb\u901f\u653e\u5165');
                            return;
                        }
                        this.refreshInventory();
                        this.game.updateHUD();
                        return;
                    }
                    // \u4f7f\u7528 autoEquip\uff0c\u4f46\u82e5\u6700\u7d42\u53ea\u5269\u300c\u5378\u56de stash\u300d\u7684\u8def\u5f91\u5247\u963b\u64cb
                    if (this.inv.autoEquipRaidSafe(item.id)) {
                        this.refreshInventory();
                        this.game.updateHUD();
                    } else {
                        this._showQuickEquipError('\u7a7a\u9593\u4e0d\u8db3\u6216\u7121\u5c0d\u61c9\u6b04\u4f4d\uff0c\u7121\u6cd5\u5feb\u901f\u79fb\u52d5');
                    }
                    return;
                }

                // === \u4e3b\u9078\u55ae\uff1a\u539f\u6709\u5b8c\u6574\u908f\u8f2f\uff08\u5141\u8a31\u5378\u88dd\uff09 ===
                // For weapons: try primaryWep \u2192 primaryWep2 \u2192 backpack \u2192 error
                if (dbItem && dbItem.type === 'weapon' && dbItem.gridW * dbItem.gridH > 2) {
                    // Large weapon: primaryWep1 \u2192 primaryWep2 \u2192 backpack
                    let placed = false;
                    for (const cName of ['primaryWep', 'primaryWep2']) {
                        if (item.container === cName) continue;
                        const slot = this.inv.findFreeSlot(dbItem.gridW, dbItem.gridH, this.inv[cName]);
                        if (slot) {
                            const res = this.inv.moveItem(item.id, cName, slot.x, slot.y, slot.rotated);
                            if (res && res.success) { placed = true; break; }
                        }
                    }
                    if (!placed) {
                        // Try backpack
                        const bpSlot = this.inv.findFreeSlot(dbItem.gridW, dbItem.gridH, this.inv.backpack);
                        if (bpSlot) {
                            const res = this.inv.moveItem(item.id, 'backpack', bpSlot.x, bpSlot.y, bpSlot.rotated);
                            if (res && res.success) placed = true;
                        }
                    }
                    if (!placed) {
                        this._showQuickEquipError('\u4e3b\u6b66\u5668\u6b04\u4f4d\u8207\u80cc\u5305\u5747\u5df2\u6efd\uff0c\u7121\u6cd5\u5feb\u901f\u653e\u5165');
                        return;
                    }
                    this.refreshInventory();
                    this.game.updateHUD();
                    return;
                }

                // Default: use standard autoEquip
                if (this.inv.autoEquip(item.id)) {
                    this.refreshInventory();
                    this.game.updateHUD();
                } else {
                    this._showQuickEquipError('\u7a7a\u9593\u4e0d\u8db3\u6216\u7121\u5c0d\u61c9\u6b04\u4f4d\uff0c\u7121\u6cd5\u5feb\u901f\u79fb\u52d5');
                }
            });"""

# Apply replacement
new_content = clean[:idx] + NEW_BLOCK + clean[end_idx:]

# Update cache bust version
new_content = new_content.replace('v=1778075789', 'v=1778874108')

with open('ui.js', 'w', encoding='utf-8', newline='') as f:
    f.write(new_content)

print(f'\nui.js rebuilt: {len(new_content)} chars')
try:
    new_content.encode('utf-8')
    print('Valid UTF-8: YES')
except Exception as e:
    print(f'Valid UTF-8: NO - {e}')
