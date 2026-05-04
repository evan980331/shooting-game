with open('ui.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
i = 0
while i < len(lines):
    if "if (qItem && qItem.container !== 'stash') {" in lines[i]:
        new_lines.append('                if (qItem) {\n')
        new_lines.append('                    const inMenu = this.game.isInMenu;\n')
        new_lines.append("                    if (inMenu && qItem.container !== 'stash') {\n")
        new_lines.append('                        const dbItem = ItemDatabase[qItem.typeId];\n')
        new_lines.append('                        const slot = this.inv.findFreeSlot(dbItem.gridW, dbItem.gridH, this.inv.stash);\n')
        new_lines.append('                        if (slot) {\n')
        new_lines.append("                            const res = this.inv.moveItem(qItem.id, 'stash', slot.x, slot.y, slot.rotated);\n")
        new_lines.append('                            if (res && res.success) {\n')
        new_lines.append('                                this.refreshInventory();\n')
        new_lines.append('                                this.game.updateHUD();\n')
        new_lines.append('                            }\n')
        new_lines.append('                        } else {\n')
        new_lines.append('                            this._showQuickEquipError("倉庫空間不足，無法自動移入");\n')
        new_lines.append('                        }\n')
        new_lines.append("                    } else if (!inMenu && qItem.container !== 'backpack' && qItem.container !== 'secureContainer' && qItem.container !== 'hotbarSlot') {\n")
        new_lines.append('                        const dbItem = ItemDatabase[qItem.typeId];\n')
        new_lines.append("                        const hasBackpack = this.inv.items.find(i => i.container === 'backpackSlot');\n")
        new_lines.append('                        if (!hasBackpack) {\n')
        new_lines.append('                            this._showQuickEquipError("沒有裝備背包，無法快速卸裝");\n')
        new_lines.append('                            return;\n')
        new_lines.append('                        }\n')
        new_lines.append('                        const slot = this.inv.findFreeSlot(dbItem.gridW, dbItem.gridH, this.inv.backpack);\n')
        new_lines.append('                        if (slot) {\n')
        new_lines.append("                            const res = this.inv.moveItem(qItem.id, 'backpack', slot.x, slot.y, slot.rotated);\n")
        new_lines.append('                            if (res && res.success) {\n')
        new_lines.append('                                this.refreshInventory();\n')
        new_lines.append('                                this.game.updateHUD();\n')
        new_lines.append('                            }\n')
        new_lines.append('                        } else {\n')
        new_lines.append('                            this._showQuickEquipError("背包空間不足");\n')
        new_lines.append('                        }\n')
        new_lines.append('                    }\n')
        new_lines.append('                    return;\n')
        new_lines.append('                }\n')
        i += 15 # Skip the 15 lines of the old if block
    else:
        new_lines.append(lines[i])
        i += 1

with open('ui.js', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)
