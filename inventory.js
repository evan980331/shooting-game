import { ItemDatabase, EconomyRules } from './db.js?v=6.7';

export class InventorySystem {
    constructor(playerRef) {
        this.player = playerRef;

        // Let's say Stash is 10x10 and Backpack is 6x4 (simplified)
        this.stash = this.createGrid(10, 10);
        this.backpack = this.createGrid(6, 4); // 6 cols, 4 rows

        // Equipment loadout grids
        this.primaryWep = this.createGrid(5, 2);
        this.primaryWep2 = this.createGrid(5, 2);
        this.secondaryWep = this.createGrid(2, 2);
        this.meleeSlot = this.createGrid(1, 2);
        this.armorSlot = this.createGrid(3, 3);
        this.helmetSlot = this.createGrid(2, 2);
        this.hotbarSlot = this.createGrid(5, 1);
        this.backpackSlot = this.createGrid(3, 3);

        // Secure Container starts as initial
        this.secureContainerType = "初始保險";
        this.secureContainer = this.createGrid(2, 2);

        this.player.money = 100000; // Starting money for testing

        this.items = []; // Array of { id: uniqueId, typeId: "AWM", x, y, container: "stash"|"backpack", rotated: boolean }
        this.nextId = 1;

        // Add some starting items
        this.addItem("大背包", "backpackSlot", 0, 0, false);

        // Dynamically initialize backpack capacity based on equipped item before adding items to it
        const bpItem = this.items.find(i => i.container === 'backpackSlot');
        if (bpItem) {
            const dbItem = ItemDatabase[bpItem.typeId];
            this.backpack = this.createGrid(dbItem.capW, dbItem.capH);
        } else {
            this.backpack = this.createGrid(0, 0);
        }

        this.addItem("M7", "backpack", 0, 0, false);
        this.addItem("藍甲", "backpack", 0, 2, false);

        // Setup initial knife
        this.addItem("刀", "meleeSlot", 0, 0, false);
    }

    createGrid(w, h) {
        let grid = [];
        for (let y = 0; y < h; y++) {
            grid[y] = new Array(w).fill(null);
        }
        return { w, h, slots: grid };
    }

    // Attempt to add item at specific coordinate
    addItem(typeId, containerName, x, y, rotated = false) {
        const dbItem = ItemDatabase[typeId];
        if (!dbItem) return false;

        const w = rotated ? dbItem.gridH : dbItem.gridW;
        const h = rotated ? dbItem.gridW : dbItem.gridH;

        const container = this[containerName];
        if (this.canPlaceItem(w, h, x, y, container)) {
            const item = { id: this.nextId++, typeId, x, y, container: containerName, rotated };
            if (dbItem.type === 'weapon' && dbItem.stats && dbItem.stats.magSize) {
                item.currentMag = dbItem.stats.magSize;
                item.hasUpgradedMag = false;
            }
            if (dbItem.type === 'ammo') {
                item.amount = dbItem.maxCapacity;
            }
            if (dbItem.type === 'armor' || dbItem.type === 'helmet') {
                item.maxDurability = dbItem.maxDurability;
                item.originalMaxDurability = dbItem.maxDurability;
                item.durability = dbItem.maxDurability;
            }
            if (dbItem.type === 'repair') {
                item.capacity = dbItem.maxCapacity;
            }
            this.items.push(item);
            this.occupyGrid(item, container);
            this.updatePlayerWeight();
            return true;
        }
        return false;
    }

    canPlaceItem(w, h, x, y, container, ignoreItemId = null) {
        if (!container || !container.slots) return false;
        if (x < 0 || y < 0 || x + w > container.w || y + h > container.h) return false;

        for (let iy = y; iy < y + h; iy++) {
            for (let ix = x; ix < x + w; ix++) {
                const cell = container.slots[iy][ix];
                if (cell !== null && cell !== ignoreItemId) return false;
            }
        }
        return true;
    }

    occupyGrid(item, container) {
        const dbItem = ItemDatabase[item.typeId];
        const w = item.rotated ? dbItem.gridH : dbItem.gridW;
        const h = item.rotated ? dbItem.gridW : dbItem.gridH;
        for (let iy = item.y; iy < item.y + h; iy++) {
            for (let ix = item.x; ix < item.x + w; ix++) {
                container.slots[iy][ix] = item.id;
            }
        }
    }

    freeGrid(item, container) {
        const dbItem = ItemDatabase[item.typeId];
        const w = item.rotated ? dbItem.gridH : dbItem.gridW;
        const h = item.rotated ? dbItem.gridW : dbItem.gridH;
        for (let iy = item.y; iy < item.y + h; iy++) {
            for (let ix = item.x; ix < item.x + w; ix++) {
                container.slots[iy][ix] = null;
            }
        }
    }

    moveItem(itemId, targetContainerName, targetX, targetY, forceRotation = null) {
        const item = this.items.find(i => i.id === itemId);
        if (!item) return { success: false };

        const dbItem = ItemDatabase[item.typeId];
        const sourceContainerName = item.container;
        const sourceContainer = this[sourceContainerName];
        const targetContainer = this[targetContainerName];

        // Slot validation
        if (targetContainerName === 'primaryWep' || targetContainerName === 'primaryWep2') {
            if (dbItem.type !== 'weapon') return { success: false };
        } else if (targetContainerName === 'secondaryWep') {
            if (dbItem.type !== 'weapon') return { success: false };
            // Restriction: Only pistols. Simple check: total area <= 2 (e.g. 1x2 or 2x1)
            if (dbItem.gridW * dbItem.gridH > 2) return { success: false };
        } else if (targetContainerName === 'meleeSlot') {
            if (dbItem.type !== 'melee') return { success: false };
        } else if (targetContainerName === 'armorSlot') {
            if (dbItem.type !== 'armor') return { success: false };
        } else if (targetContainerName === 'helmetSlot') {
            if (dbItem.type !== 'helmet') return { success: false };
        } else if (targetContainerName === 'backpackSlot') {
            if (dbItem.type !== 'backpack') return { success: false };
        } else if (targetContainerName === 'secureContainer') {
            // Cannot place backpacks, rigs, or secure containers inside the secure container.
            if (['backpack', 'secure'].includes(dbItem.type)) return { success: false };
        }

        // Temporarily free source
        this.freeGrid(item, sourceContainer);

        // Try orientation
        let testRotated = forceRotation !== null ? forceRotation : item.rotated;
        let w = testRotated ? dbItem.gridH : dbItem.gridW;
        let h = testRotated ? dbItem.gridW : dbItem.gridH;

        if (this.canPlaceItem(w, h, targetX, targetY, targetContainer)) {
            // Important: occupy the backpack's target position FIRST
            // so extracted items do not overlap the newly placed backpack
            item.x = targetX;
            item.y = targetY;
            item.container = targetContainerName;
            item.rotated = testRotated;
            this.occupyGrid(item, targetContainer);

            // Placement is successful, we check for backpack un-equipping logic before finalizing
            if (sourceContainerName === 'backpackSlot' && targetContainerName !== 'backpackSlot') {
                const backpackItems = this.items.filter(i => i.container === 'backpack');
                for (let bItem of backpackItems) {
                    const bDbItem = ItemDatabase[bItem.typeId];
                    const slot = this.findFreeSlot(bDbItem.gridW, bDbItem.gridH, this.stash);
                    if (slot) {
                        this.freeGrid(bItem, this.backpack);
                        bItem.container = 'stash';
                        bItem.x = slot.x;
                        bItem.y = slot.y;
                        bItem.rotated = slot.rotated;
                        this.occupyGrid(bItem, this.stash);
                    } else {
                        console.log("Stash full, discarding internal backpack item: " + bItem.typeId);
                        this.freeGrid(bItem, this.backpack);
                        const idx = this.items.indexOf(bItem);
                        if (idx > -1) this.items.splice(idx, 1);
                    }
                }
            }

            // If we moved a backpack out of the backpackSlot, collapse capacity
            if (sourceContainerName === 'backpackSlot' || targetContainerName === 'backpackSlot') {
                this.updateBackpackCapacity();
            }

            this.updatePlayerWeight();
            return { success: true };
        }

        // Revert if both orientations fail
        this.occupyGrid(item, sourceContainer);
        return { success: false };
    }

    autoEquip(itemId) {
        const item = this.items.find(i => i.id === itemId);
        if (!item) return false;
        
        const dbItem = ItemDatabase[item.typeId];
        let targetContainers = [];
        
        if (dbItem.type === 'weapon') {
            if (dbItem.gridW * dbItem.gridH <= 2) targetContainers = ['secondaryWep', 'primaryWep', 'primaryWep2'];
            else targetContainers = ['primaryWep', 'primaryWep2'];
        } else if (dbItem.type === 'armor') targetContainers = ['armorSlot'];
        else if (dbItem.type === 'helmet') targetContainers = ['helmetSlot'];
        else if (dbItem.type === 'backpack') targetContainers = ['backpackSlot'];
        else if (dbItem.type === 'melee') targetContainers = ['meleeSlot'];
        else if (dbItem.type === 'medical' || dbItem.type === 'medical-buff' || dbItem.type === 'throwable' || dbItem.type === 'ammo') {
            // First try hotbar, then pockets/secure
            targetContainers = ['hotbarSlot', 'secureContainer'];
        }

        // Try equipping it
        for (let cName of targetContainers) {
            if (cName === item.container) continue; // Skip current
            const container = this[cName];
            if (!container) continue;
            
            const slot = this.findFreeSlot(dbItem.gridW, dbItem.gridH, container);
            if (slot) {
                return this.moveItem(itemId, cName, slot.x, slot.y, slot.rotated).success;
            } else if (cName === 'primaryWep' || cName === 'primaryWep2' || cName === 'armorSlot' || cName === 'helmetSlot' || cName === 'backpackSlot' || cName === 'secondaryWep' || cName === 'meleeSlot') {
                // If equipment slot is full, attempt a direct swap with the first item in there!
                const existingItem = this.items.find(i => i.container === cName);
                if (existingItem && this.swapItems(itemId, existingItem.id)) {
                     return true;
                }
            }
        }
        
        // If it was already in a gear slot (not stash), and we double clicked it: unequip to stash
        if (item.container !== 'stash') {
            const slot = this.findFreeSlot(dbItem.gridW, dbItem.gridH, this.stash);
            if (slot) {
                return this.moveItem(itemId, "stash", slot.x, slot.y, slot.rotated).success;
            }
        }
        
        return false;
    }

    swapItems(itemId1, itemId2) {
        const item1 = this.items.find(i => i.id === itemId1);
        const item2 = this.items.find(i => i.id === itemId2);
        if (!item1 || !item2) return false;

        const container1 = this[item1.container];
        const container2 = this[item2.container];

        // Ensure restrictions pass
        const validPlacement = (itemToMove, targetName) => {
            const dbItem = ItemDatabase[itemToMove.typeId];
            if (targetName === 'primaryWep' || targetName === 'primaryWep2') return dbItem.type === 'weapon';
            if (targetName === 'secondaryWep') return dbItem.type === 'weapon' && (dbItem.gridW * dbItem.gridH <= 2);
            if (targetName === 'meleeSlot') return dbItem.type === 'melee';
            if (targetName === 'armorSlot') return dbItem.type === 'armor';
            if (targetName === 'helmetSlot') return dbItem.type === 'helmet';
            if (targetName === 'backpackSlot') return dbItem.type === 'backpack';
            if (targetName === 'secureContainer') return !['backpack', 'secure'].includes(dbItem.type);
            return true;
        };

        if (!validPlacement(item1, item2.container) || !validPlacement(item2, item1.container)) return false;

        // Temporarily free both
        this.freeGrid(item1, container1);
        this.freeGrid(item2, container2);

        const w1 = item1.rotated ? ItemDatabase[item1.typeId].gridH : ItemDatabase[item1.typeId].gridW;
        const h1 = item1.rotated ? ItemDatabase[item1.typeId].gridW : ItemDatabase[item1.typeId].gridH;
        
        const w2 = item2.rotated ? ItemDatabase[item2.typeId].gridH : ItemDatabase[item2.typeId].gridW;
        const h2 = item2.rotated ? ItemDatabase[item2.typeId].gridW : ItemDatabase[item2.typeId].gridH;

        // Check if both fit in each other's EXACT original positions
        if (this.canPlaceItem(w1, h1, item2.x, item2.y, container2) && this.canPlaceItem(w2, h2, item1.x, item1.y, container1)) {
            // Swap
            let tempX = item1.x, tempY = item1.y, tempC = item1.container;
            item1.x = item2.x; item1.y = item2.y; item1.container = item2.container;
            item2.x = tempX; item2.y = tempY; item2.container = tempC;
            
            this.occupyGrid(item1, container2);
            this.occupyGrid(item2, container1);
            
            if (item1.container === 'backpackSlot' || item2.container === 'backpackSlot') {
                this.updateBackpackCapacity();
            }
            this.updatePlayerWeight();
            return true;
        }

        // Revert
        this.occupyGrid(item1, container1);
        this.occupyGrid(item2, container2);
        return false;
    }

    getOverlappingItem(w, h, x, y, containerName, ignoreItemId) {
        const container = this[containerName];
        if (!container || !container.slots) return null;
        if (x < 0 || y < 0 || x + w > container.w || y + h > container.h) return null;

        let foundIds = new Set();
        for (let iy = y; iy < y + h; iy++) {
            for (let ix = x; ix < x + w; ix++) {
                const cell = container.slots[iy][ix];
                if (cell !== null && cell !== ignoreItemId) {
                    foundIds.add(cell);
                }
            }
        }
        
        // If there's exactly one uniquely overlapping item, return it
        if (foundIds.size === 1) {
            return Array.from(foundIds)[0];
        }
        return null;
    }

    updateBackpackCapacity() {
        // Destroy items inside if backpack removed? For now just capacity reset
        const bpItem = this.items.find(i => i.container === 'backpackSlot');
        if (bpItem) {
            const dbItem = ItemDatabase[bpItem.typeId];

            // Re-allocate grid retaining items
            const newGrid = this.createGrid(dbItem.capW, dbItem.capH);
            this.backpack = newGrid;

            // Re-occupy valid items, drop invalid? (Simplified: just recreate and occupy)
            this.items.forEach(i => {
                if (i.container === 'backpack') {
                    // Safety check if it fits, else move to stash or drop (Skipped complex logic for demo)
                    this.occupyGrid(i, this.backpack);
                }
            })
        } else {
            this.backpack = this.createGrid(0, 0);
        }
    }

    buyItem(typeId) {
        const dbItem = ItemDatabase[typeId];
        if (!dbItem) return false;
        if (this.player.money < dbItem.price) {
            console.log("Not enough money");
            return false;
        }

        if (dbItem.type === 'secure') {
            this.player.money -= dbItem.price;
            dbItem.unlocked = true;
            this.setSecureContainer(typeId);
            return true;
        }

        // Auto-find slot in stash (try both orientations)
        const slot = this.findFreeSlot(dbItem.gridW, dbItem.gridH, this.stash);
        if (slot) {
            this.player.money -= dbItem.price;
            this.addItem(typeId, "stash", slot.x, slot.y, slot.rotated);
            return true;
        }
        console.log("Stash full");
        return false;
    }

    sellItem(itemId) {
        const itemIndex = this.items.findIndex(i => i.id === itemId);
        if (itemIndex === -1) return false;

        const item = this.items[itemIndex];
        const dbItem = ItemDatabase[item.typeId];

        const sellValue = Math.floor(dbItem.price * EconomyRules.sellRate);
        this.player.money += sellValue;

        this.freeGrid(item, this[item.container]);
        this.items.splice(itemIndex, 1);
        this.updatePlayerWeight();
        return true;
    }

    findFreeSlot(baseW, baseH, container) {
        // Try original orientation
        for (let y = 0; y <= container.h - baseH; y++) {
            for (let x = 0; x <= container.w - baseW; x++) {
                if (this.canPlaceItem(baseW, baseH, x, y, container)) {
                    return { x, y, rotated: false };
                }
            }
        }
        // Try rotated orientation (swap W and H)
        for (let y = 0; y <= container.h - baseW; y++) {
            for (let x = 0; x <= container.w - baseH; x++) {
                if (this.canPlaceItem(baseH, baseW, x, y, container)) {
                    return { x, y, rotated: true };
                }
            }
        }
        return null;
    }

    updatePlayerWeight() {
        let weight = 0;
        for (let item of this.items) {
            if (item.container !== 'stash') {
                weight += ItemDatabase[item.typeId].weight;
            }
        }
        this.player.weight = parseFloat(weight.toFixed(2));
    }

    // Switch or upgrade Secure Container
    setSecureContainer(typeId) {
        const dbItem = ItemDatabase[typeId];
        if (!dbItem || dbItem.type !== 'secure') return false;

        // Ensure it's unlocked
        if (!dbItem.unlocked) {
            return false; // Not unlocked, must be bought in shop first
        }

        this.secureContainerType = typeId;
        const newGrid = this.createGrid(dbItem.capW, dbItem.capH);

        // Transfer valid items
        const oldGrid = this.secureContainer;
        this.secureContainer = newGrid;

        let leftoverItems = [];
        this.items.forEach(i => {
            if (i.container === 'secureContainer') {
                if (!this.canPlaceItem(
                    i.rotated ? ItemDatabase[i.typeId].gridH : ItemDatabase[i.typeId].gridW,
                    i.rotated ? ItemDatabase[i.typeId].gridW : ItemDatabase[i.typeId].gridH,
                    i.x, i.y, this.secureContainer)
                ) {
                    leftoverItems.push(i);
                } else {
                    this.occupyGrid(i, this.secureContainer);
                }
            }
        });

        // Put leftovers in stash
        leftoverItems.forEach(bItem => {
            const bDbItem = ItemDatabase[bItem.typeId];
            const slot = this.findFreeSlot(bDbItem.gridW, bDbItem.gridH, this.stash);
            if (slot) {
                bItem.container = 'stash';
                bItem.x = slot.x;
                bItem.y = slot.y;
                bItem.rotated = slot.rotated;
                this.occupyGrid(bItem, this.stash);
            } else {
                console.log("Stash full, discarding leftover item: " + bItem.typeId);
                const idx = this.items.indexOf(bItem);
                if (idx > -1) this.items.splice(idx, 1);
            }
        });

        return true;
    }

    clearOnDeath() {
        // Keep only stash and secureContainer items
        this.items = this.items.filter(item => item.container === 'stash' || item.container === 'secureContainer');

        // Backpack capacity gets wiped because the backpack slot is cleared
        this.backpack = this.createGrid(0, 0);
        this.primaryWep = this.createGrid(5, 2);
        this.primaryWep2 = this.createGrid(5, 2);
        this.secondaryWep = this.createGrid(2, 2);
        this.meleeSlot = this.createGrid(1, 2);
        this.armorSlot = this.createGrid(3, 3);
        this.helmetSlot = this.createGrid(2, 2);
        this.hotbarSlot = this.createGrid(5, 1);
        this.backpackSlot = this.createGrid(3, 3);

        this.addItem("刀", "meleeSlot", 0, 0, false);

        // Update Weight
        this.updatePlayerWeight();
    }
}
