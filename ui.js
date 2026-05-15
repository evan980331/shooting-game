import { ItemDatabase, EconomyRules } from './db.js?v=1778874108';

export class UIManager {
    constructor(game) {
        this.game = game;
        this.inv = game.inventory;

        this.mainMenu = document.getElementById('main-menu');
        this.gameContainer = document.getElementById('game-container');

        this.shopMoney = document.getElementById('money-text');
        this.shopItems = document.getElementById('shop-items');
        this.overlayShopMoney = document.getElementById('overlay-money-text');
        this.overlayShopItems = document.getElementById('overlay-shop-items');

        this.stashGrid = document.getElementById('stash-grid');
        this.backpackGrid = document.getElementById('backpack-grid');
        this.overlayStashGrid = document.getElementById('overlay-stash-grid');
        this.overlayBackpackGrid = document.getElementById('overlay-backpack-grid');

        this.lootGrid = document.getElementById('loot-grid');

        this.primaryGrid = document.getElementById('primary-grid');
        this.primaryGrid2 = document.getElementById('primary-grid-2');
        this.secondaryGrid = document.getElementById('secondary-grid');
        this.meleeGrid = document.getElementById('melee-grid');
        this.armorGrid = document.getElementById('armor-grid');
        this.helmetGrid = document.getElementById('helmet-grid');
        this.hotbarGrid = document.getElementById('hotbar-grid');
        this.backpackEquipGrid = document.getElementById('backpack-equip-grid');
        this.secureGrid = document.getElementById('secure-grid');
        this.secureSelect = document.getElementById('secure-container-select');

        this.shopPanel = document.getElementById('panel-shop');
        this.inventoryPanel = document.getElementById('inventory-panel'); 
        this.overlayInventoryPanel = document.getElementById('overlay-inventory-panel');

        this.cellSize = 50; // Match CSS Grid size

        // Custom Drag & Drop State
        this.attachedItemId = null;
        this.attachedElement = null; // visual element following cursor
        this.dropPreviewElement = null; // transparent green/red shadow

        // Offset for dragging so it attaches from where clicked
        this.grabOffsetX = 0;
        this.grabOffsetY = 0;

        // Hold-to-Drag State (0.5s delay before drag activates)
        this.holdTimer = null;          // setTimeout handle
        this.pendingDragItemId = null;  // item we are holding down on
        this.pendingDragDiv = null;     // element we are holding
        this.pendingDragE = null;       // original mousedown event
        this.isDragActive = false;      // true once drag threshold passed
        this.holdThresholdMs = 300;     // ms before drag activates

        // Stats Modal
        this.statsModal = document.getElementById('item-stats-modal');
        this.statsTitle = document.getElementById('stats-title');
        this.statsContent = document.getElementById('stats-content');

        this.bindEvents();
    }

    bindEvents() {
        // ?Ä?Ä 4-Tab Panel Switching ?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä
        const lobbyTabs = document.querySelectorAll('.menu-tab-btn');
        const lobbyPanels = document.querySelectorAll('.lobby-panel');

        const switchLobbyTab = (targetPanelId) => {
            lobbyTabs.forEach(btn => btn.classList.remove('active'));
            lobbyPanels.forEach(p => p.classList.add('hidden'));
            const targetBtn = document.querySelector(`[data-panel="${targetPanelId}"]`);
            const targetPanel = document.getElementById(targetPanelId);
            if (targetBtn) targetBtn.classList.add('active');
            if (targetPanel) targetPanel.classList.remove('hidden');

            // Trigger refresh logic on specific panels
            if (targetPanelId === 'panel-stash') {
                this.refreshInventory();
            } else if (targetPanelId === 'panel-shop') {
                this.refreshShop();
            }
        };

        lobbyTabs.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const panelId = btn.dataset.panel;
                console.log('[UIManager] Switching to tab:', panelId);
                if (panelId) switchLobbyTab(panelId);
            });
        });

        this.switchLobbyTab = switchLobbyTab; // expose for external use

        // Enter Raid / Back to Menu
        const btnEnterRaid = document.getElementById('btn-enter-raid');
        if (btnEnterRaid) {
            btnEnterRaid.addEventListener('click', () => {
                // Read selected map
                const mapSelect = document.getElementById('map-select');
                if (mapSelect) this.game.currentMap = parseInt(mapSelect.value) || 1;
                this.mainMenu.classList.add('hidden');
                this.gameContainer.classList.remove('hidden');
                this.game.isInMenu = false;
                // Re-calc weight when entering just in case
                this.inv.updatePlayerWeight();
                this.game.switchWeapon(1);
                this.game.updateHUD();
                // Spawn Bot near player after entering raid
                this.game.spawnTestBot();
            });
        }

        const backToMenuAction = () => {
            this.mainMenu.classList.remove('hidden');
            this.gameContainer.classList.add('hidden');
            this.game.resetSession();
            this.game.isInMenu = true;
            this.refreshInventory();
        };

        const btnBackMenu = document.getElementById('btn-back-menu'); // Legacy if still exists
        if (btnBackMenu) btnBackMenu.addEventListener('click', backToMenuAction);

        const btnBackMenuFail = document.getElementById('btn-back-menu-fail');
        if (btnBackMenuFail) btnBackMenuFail.addEventListener('click', backToMenuAction);

        const btnBackMenuWin = document.getElementById('btn-back-menu-win');
        if (btnBackMenuWin) btnBackMenuWin.addEventListener('click', backToMenuAction);

        // ESC to Exit Raid / R for rotation / Drop item if holding
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (this.attachedItemId !== null) {
                    // Cancel drag
                    this.clearAttachment();
                    this.refreshInventory();
                } else if (!this.game.isInMenu) {
                    backToMenuAction();
                }
            }
            if (e.key.toLowerCase() === 'r') {
                if (this.attachedItemId !== null && this.attachedElement) {
                    const item = this.inv.items.find(i => i.id === this.attachedItemId);
                    if (item && item.container !== 'hotbarSlot') {
                        this.dragRotated = !this.dragRotated; // visually update without altering DB
                        const dbItem = ItemDatabase[item.typeId];
                        let w = this.dragRotated ? dbItem.gridH : dbItem.gridW;
                        let h = this.dragRotated ? dbItem.gridW : dbItem.gridH;
                        this.attachedElement.style.width = (w * this.cellSize) + 'px';
                        this.attachedElement.style.height = (h * this.cellSize) + 'px';
                        this.attachedElement.style.borderStyle = this.dragRotated ? "dashed" : "solid";
                        // Update preview immediately
                        this.handleMouseMove(this.lastMouseE);
                    }
                }
            }
            if (e.key.toLowerCase() === 'tab') {
                e.preventDefault();
                if (!this.game.isInMenu) {
                    if (this.inventoryPanel.classList.contains('hidden') || this.inventoryPanel.style.display === 'none') {
                        document.getElementById('game-container').appendChild(this.inventoryPanel);
                        this.inventoryPanel.style.position = 'absolute';
                        this.inventoryPanel.style.top = '0';
                        this.inventoryPanel.style.left = '0';
                        this.inventoryPanel.style.width = '100%';
                        this.inventoryPanel.style.height = '100%';
                        this.inventoryPanel.style.transform = 'none';
                        this.inventoryPanel.style.background = 'rgba(30, 30, 30, 0.95)'; // slightly transparent
                        this.inventoryPanel.style.zIndex = '2000'; // Á¢∫‰???canvas ??hud ‰∏äÂ±§
                        this.inventoryPanel.style.justifyContent = 'center';
                        this.inventoryPanel.style.alignItems = 'flex-start';
                        this.inventoryPanel.style.paddingTop = '40px';
                        this.inventoryPanel.style.boxSizing = 'border-box';
                        this.inventoryPanel.classList.remove('hidden');
                        this.inventoryPanel.style.display = 'flex';
                        
                        document.getElementById('stash-header').style.display = 'none';
                        document.getElementById('stash-grid').style.display = 'none';
                        document.getElementById('loot-header').classList.remove('hidden');
                        document.getElementById('loot-header').style.display = 'flex';
                        document.getElementById('loot-grid').classList.remove('hidden');
                        document.getElementById('loot-grid').style.display = 'grid';
                        
                        // Ensure backpack is visible (it should be since we don't hide it, but just in case)
                        document.getElementById('backpack-panel').style.display = 'block';

                        this.game.populateLootGrid();
                        
                        this.game.isInventoryOpen = true;
                        this.refreshInventory();
                    } else {
                        this.game.flushLootGrid();
                        
                        this.inventoryPanel.classList.add('hidden');
                        this.inventoryPanel.style.display = 'none';
                        const menuContentArea = document.getElementById('menu-content-area');
                        if (menuContentArea) {
                            menuContentArea.appendChild(this.inventoryPanel);
                        }
                        this.inventoryPanel.style.position = '';
                        this.inventoryPanel.style.background = '';
                        this.inventoryPanel.style.paddingTop = '';
                        this.game.isInventoryOpen = false;
                        
                        if (this.attachedItemId !== null) {
                            this.clearAttachment();
                            this.refreshInventory();
                        }
                    }
                    return;
                }
            }
            if (e.key.toLowerCase() === 'f') {
                if (!this.lastMouseE) return; // need mouse pos
                // Check what element we are hovering over
                const elem = document.elementFromPoint(this.lastMouseE.clientX, this.lastMouseE.clientY);
                if (elem) {
                    const invItemDiv = elem.closest('.inventory-item');
                    const shopItemDiv = elem.closest('.shop-buy-btn') ? elem.closest('.shop-buy-btn').parentElement : elem.closest('[data-typeid]');

                    if (invItemDiv && invItemDiv.dataset.itemid) {
                        const itemObj = this.inv.items.find(i => i.id == invItemDiv.dataset.itemid);
                        if (itemObj) {
                            const dbItem = ItemDatabase[itemObj.typeId];
                            this.showItemStats(this.lastMouseE.pageX, this.lastMouseE.pageY, dbItem, itemObj);
                        }
                    } else if (shopItemDiv && shopItemDiv.dataset.typeid) {
                        const dbItem = ItemDatabase[shopItemDiv.dataset.typeid];
                        this.showItemStats(this.lastMouseE.pageX, this.lastMouseE.pageY, dbItem, null);
                    } else if (!this.game.isInMenu) {
                        this.game.pickupClosestItem();
                    }
                } else if (!this.game.isInMenu) {
                    this.game.pickupClosestItem();
                }
            }
        });

        // Global mouse move for attached item
        document.addEventListener('mousemove', (e) => this.handleMouseMove(e));

        // Auto-close stats panel on any click outside it
        document.addEventListener('mousedown', (e) => {
            if (this.statsModal && !this.statsModal.classList.contains('hidden')) {
                if (!this.statsModal.contains(e.target)) {
                    this.statsModal.classList.add('hidden');
                }
            }
        });

        // Global mouse release to handle dropping
        document.addEventListener('mouseup', (e) => {
            if (e.button !== 0) return; // only left click

            // Cancel any pending hold-to-drag
            const quickClickId = this.pendingDragItemId; // capture before _cancelHold clears it
            const wasActive = this.isDragActive;
            this._cancelHold();

            // Quick-click (mouseup before hold threshold) ??move to stash
            if (!wasActive && quickClickId && this.attachedItemId === null) {
                const qItem = this.inv.items.find(i => i.id === quickClickId);
                // If item is not in stash, move it to stash
                if (qItem) {
                    const inMenu = this.game.isInMenu;
                    if (inMenu && qItem.container !== 'stash') {
                        const dbItem = ItemDatabase[qItem.typeId];
                        const slot = this.inv.findFreeSlot(dbItem.gridW, dbItem.gridH, this.inv.stash);
                        if (slot) {
                            const res = this.inv.moveItem(qItem.id, 'stash', slot.x, slot.y, slot.rotated);
                            if (res && res.success) {
                                this.refreshInventory();
                                this.game.updateHUD();
                            }
                        } else {
                            this._showQuickEquipError("?âÂ∫´Á©∫È?‰∏çË∂≥ÔºåÁÑ°Ê≥ïËá™?ïÁßª??);
                        }
                    } else if (!inMenu && qItem.container !== 'backpack' && qItem.container !== 'secureContainer' && qItem.container !== 'hotbarSlot') {
                        const dbItem = ItemDatabase[qItem.typeId];
                        const hasBackpack = this.inv.items.find(i => i.container === 'backpackSlot');
                        if (!hasBackpack) {
                            this._showQuickEquipError("Ê≤íÊ?Ë£ùÂ??åÂ?ÔºåÁÑ°Ê≥ïÂø´?üÂç∏Ë£?);
                            return;
                        }
                        const slot = this.inv.findFreeSlot(dbItem.gridW, dbItem.gridH, this.inv.backpack);
                        if (slot) {
                            const res = this.inv.moveItem(qItem.id, 'backpack', slot.x, slot.y, slot.rotated);
                            if (res && res.success) {
                                this.refreshInventory();
                                this.game.updateHUD();
                            }
                        } else {
                            this._showQuickEquipError("?åÂ?Á©∫È?‰∏çË∂≥");
                        }
                    }
                    return;
                }
            }

            if (this.attachedItemId !== null) {
                // Don't drop immediately if clicking a delete button to sell
                if (e.target.classList && e.target.classList.contains('item-delete-btn')) return;

                if (this.currentHoverContainer && this.hoverValid) {
                    let moveSuccess = false;
                    if (this.hoverSwapTargetId) {
                        moveSuccess = this.inv.swapItems(this.attachedItemId, this.hoverSwapTargetId);
                    } else {
                        moveSuccess = this.inv.moveItem(this.attachedItemId, this.currentHoverContainer, this.currentHoverGridX, this.currentHoverGridY, this.dragRotated);
                    }

                    if (moveSuccess) {
                        this.clearAttachment();
                        this.refreshInventory();
                        this.game.updateHUD();
                    } else {
                        // Move failed (shouldn't happen often if hoverValid is true, but just in case)
                        this.clearAttachment();
                        this.refreshInventory();
                    }
                    this.hoverSwapTargetId = null;
                } else {
                    if (!this.game.isInMenu) {
                        this.game.dropItemToGround(this.attachedItemId);
                        this.clearAttachment();
                        this.refreshInventory();
                        this.game.updateHUD();
                        return;
                    }
                    
                    const elem = document.elementFromPoint(e.clientX, e.clientY);
                    const invItemDiv = elem ? elem.closest('.inventory-item') : null;
                    if (invItemDiv && invItemDiv.dataset.itemid) {
                        const targetItemObj = this.inv.items.find(i => i.id == invItemDiv.dataset.itemid);
                        const sourceItemObj = this.inv.items.find(i => i.id == this.attachedItemId);
                        
                        if (targetItemObj && sourceItemObj) {
                            const dbSource = ItemDatabase[sourceItemObj.typeId];
                            const dbTarget = ItemDatabase[targetItemObj.typeId];
                            
                            if (dbSource.type === 'repair' && (dbTarget.type === 'armor' || dbTarget.type === 'helmet')) {
                                if (this.game.isInMenu) {
                                    this.game.startRepair(sourceItemObj, targetItemObj);
                                } else {
                                    // In-raid: Start repair immediately without modal
                                    this.game.executeRepair(sourceItemObj, targetItemObj);
                                }
                            }
                        }
                    }

                    // Dropped in invalid area, return to original position
                    this.clearAttachment();
                    this.refreshInventory();
                }
            }
        });

        // Global click to hide stats modal (only when clicking outside it)
        document.addEventListener('click', (e) => {
            if (e.button === 0 && !this.statsModal.classList.contains('hidden')) {
                if (!this.statsModal.contains(e.target)) {
                    this.statsModal.classList.add('hidden');
                }
            }
        });

        // Close button for stats modal
        const statsCloseBtn = document.getElementById('stats-close-btn');
        if (statsCloseBtn) {
            statsCloseBtn.addEventListener('click', () => {
                this.statsModal.classList.add('hidden');
            });
        }

        this.setupDropZone(this.stashGrid, 'stash');
        this.setupDropZone(this.backpackGrid, 'backpack');
        this.setupDropZone(this.primaryGrid, 'primaryWep');
        this.setupDropZone(this.primaryGrid2, 'primaryWep2');
        this.setupDropZone(this.secondaryGrid, 'secondaryWep');
        this.setupDropZone(this.meleeGrid, 'meleeSlot');
        this.setupDropZone(this.armorGrid, 'armorSlot');
        this.setupDropZone(this.helmetGrid, 'helmetSlot');
        this.setupDropZone(this.hotbarGrid, 'hotbarSlot');
        this.setupDropZone(this.backpackEquipGrid, 'backpackSlot');
        this.setupDropZone(this.secureGrid, 'secureContainer');
        if (this.lootGrid) this.setupDropZone(this.lootGrid, 'loot');

        if (this.secureSelect) {
            this.secureSelect.addEventListener('change', (e) => {
                const targetType = e.target.value;
                const success = this.inv.setSecureContainer(targetType);
                if (!success) {
                    alert("Ëß??Â§±Ê?ÔºÅÈ??¢‰?Ë∂≥Ê??ÄË¶Å‰ªª?ôËß£?ñ„Ä?);
                    // Revert select visually
                    this.secureSelect.value = this.inv.secureContainerType;
                } else {
                    this.refreshInventory();
                }
            });
        }

        // Repair Modal Buttons
        const repairCancel = document.getElementById('repair-cancel-btn');
        if (repairCancel) {
            repairCancel.onclick = () => {
                document.getElementById('repair-modal').classList.add('hidden');
            };
        }

        const repairConfirm = document.getElementById('repair-confirm-btn');
        if (repairConfirm) {
            repairConfirm.onclick = () => {
                if (this.currentRepairParams) {
                    this.game.executeRepair(this.currentRepairParams.kit, this.currentRepairParams.armor);
                    document.getElementById('repair-modal').classList.add('hidden');
                }
            };
        }
    }

    _cancelHold() {
        if (this.holdTimer !== null) {
            clearTimeout(this.holdTimer);
            this.holdTimer = null;
        }
        this.pendingDragItemId = null;
        this.pendingDragDiv = null;
        this.pendingDragE = null;
        this.isDragActive = false;
    }

    _showQuickEquipError(msg) {
        let existing = document.getElementById('quick-equip-error');
        if (existing) existing.remove();
        const el = document.createElement('div');
        el.id = 'quick-equip-error';
        el.textContent = '?†Ô? ' + msg;
        el.style.cssText = [
            'position:fixed', 'bottom:80px', 'left:50%',
            'transform:translateX(-50%)',
            'background:rgba(200,30,30,0.95)', 'color:#fff',
            'padding:10px 24px', 'border-radius:8px',
            'font-size:16px', 'font-weight:bold',
            'z-index:9999', 'pointer-events:none',
            'box-shadow:0 4px 16px rgba(0,0,0,0.6)',
            'animation:fadeOutToast 2.5s forwards'
        ].join(';');
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 2500);
    }

    clearAttachment() {
        if (this.attachedElement && this.attachedElement.parentNode) {
            this.attachedElement.parentNode.removeChild(this.attachedElement);
        }
        if (this.dropPreviewElement && this.dropPreviewElement.parentNode) {
            this.dropPreviewElement.parentNode.removeChild(this.dropPreviewElement);
        }
        this.attachedItemId = null;
        this.attachedElement = null;
        this.dropPreviewElement = null;
    }

    handleMouseMove(e) {
        if (!e) return;
        this.lastMouseE = e;

        if (this.attachedItemId !== null && this.attachedElement) {
            // Move item with mouse
            this.attachedElement.style.left = (e.pageX - this.grabOffsetX) + 'px';
            this.attachedElement.style.top = (e.pageY - this.grabOffsetY) + 'px';

            // Handle Hover Preview
            // Note: attachedElement and dropPreviewElement already have pointer-events: none
            // so elementFromPoint will correctly ignore them without needing display toggling.
            const elementUnder = document.elementFromPoint(e.clientX, e.clientY);

            const gridContainer = elementUnder ? elementUnder.closest('.grid-container') : null;

            if (gridContainer && gridContainer.id) {
                // Map container DOM id to container name logic
                let containerName = null;
                if (gridContainer.id.includes('stash')) containerName = 'stash';
                else if (gridContainer.id.includes('backpack-equip')) containerName = 'backpackSlot';
                else if (gridContainer.id.includes('backpack')) containerName = 'backpack'; // strict!
                else if (gridContainer.id === 'primary-grid') containerName = 'primaryWep';
                else if (gridContainer.id === 'primary-grid-2') containerName = 'primaryWep2';
                else if (gridContainer.id === 'secondary-grid') containerName = 'secondaryWep';
                else if (gridContainer.id === 'melee-grid') containerName = 'meleeSlot';
                else if (gridContainer.id.includes('armor')) containerName = 'armorSlot';
                else if (gridContainer.id.includes('helmet')) containerName = 'helmetSlot';
                else if (gridContainer.id.includes('hotbar')) containerName = 'hotbarSlot';
                else if (gridContainer.id === 'secure-grid') containerName = 'secureContainer';
                else if (gridContainer.id === 'loot-grid') containerName = 'loot';

                if (containerName) {
                    const rect = gridContainer.getBoundingClientRect();
                    // Cursor relative to the grid top-left
                    let dropX = e.clientX - rect.left - this.grabOffsetX;
                    let dropY = e.clientY - rect.top - this.grabOffsetY;

                    let gridCoordX = Math.round(dropX / this.cellSize);
                    let gridCoordY = Math.round(dropY / this.cellSize);

                    const itemBase = this.inv.items.find(i => i.id === this.attachedItemId);
                    const dbItem = ItemDatabase[itemBase.typeId];
                    let w = this.dragRotated ? dbItem.gridH : dbItem.gridW;
                    let h = this.dragRotated ? dbItem.gridW : dbItem.gridH;

                    let canPlace = false;

                    // Simple logic validation just for visual color
                    let isValidTarget = true;
                    if (containerName === 'primaryWep' || containerName === 'primaryWep2') {
                        if (dbItem.type !== 'weapon') isValidTarget = false;
                    } else if (containerName === 'secondaryWep') {
                        if (dbItem.type !== 'weapon' || (dbItem.gridW * dbItem.gridH > 2)) isValidTarget = false;
                    } else if (containerName === 'meleeSlot') {
                        if (dbItem.type !== 'melee') isValidTarget = false;
                    } else if (containerName === 'armorSlot') {
                        if (dbItem.type !== 'armor') isValidTarget = false;
                    } else if (containerName === 'helmetSlot') {
                        if (dbItem.type !== 'helmet') isValidTarget = false;
                    } else if (containerName === 'backpackSlot') {
                        if (dbItem.type !== 'backpack') isValidTarget = false;
                    }

                    if (isValidTarget && this.inv.canPlaceItem(w, h, gridCoordX, gridCoordY, this.inv[containerName], this.attachedItemId)) {
                        canPlace = true;
                    } else if (isValidTarget) {
                        // Check for exact dimension swap
                        let targetId = this.inv.getOverlappingItem(w, h, gridCoordX, gridCoordY, containerName, this.attachedItemId);
                        if (targetId) {
                            let targetObj = this.inv.items.find(i => i.id === targetId);
                            if (targetObj) {
                                let tDb = ItemDatabase[targetObj.typeId];
                                let tw = targetObj.rotated ? tDb.gridH : tDb.gridW;
                                let th = targetObj.rotated ? tDb.gridW : tDb.gridH;
                                if (w === tw && h === th && targetObj.x === gridCoordX && targetObj.y === gridCoordY) {
                                    canPlace = true;
                                    this.hoverSwapTargetId = targetId;
                                } else {
                                    this.hoverSwapTargetId = null;
                                }
                            } else { this.hoverSwapTargetId = null; }
                        } else { this.hoverSwapTargetId = null; }
                    }

                    // Save the active valid drop target for mouseup
                    this.currentHoverContainer = containerName;
                    this.currentHoverGridX = gridCoordX;
                    this.currentHoverGridY = gridCoordY;
                    this.hoverValid = canPlace;

                    // Render preview block within the grid container
                    if (!this.dropPreviewElement) {
                        this.dropPreviewElement = document.createElement('div');
                        this.dropPreviewElement.style.position = 'absolute';
                        this.dropPreviewElement.style.pointerEvents = 'none';
                        this.dropPreviewElement.style.zIndex = '2999'; // Ensure above inventoryPanel (2000)
                        document.body.appendChild(this.dropPreviewElement);
                    }

                    this.dropPreviewElement.style.left = (rect.left + window.scrollX + gridCoordX * this.cellSize) + 'px';
                    this.dropPreviewElement.style.top = (rect.top + window.scrollY + gridCoordY * this.cellSize) + 'px';
                    this.dropPreviewElement.style.width = (w * this.cellSize) + 'px';
                    this.dropPreviewElement.style.height = (h * this.cellSize) + 'px';
                    this.dropPreviewElement.style.backgroundColor = canPlace ? 'rgba(0, 255, 0, 0.4)' : 'rgba(255, 0, 0, 0.4)';
                    this.dropPreviewElement.style.border = '2px solid ' + (canPlace ? 'lightgreen' : 'red');

                } else {
                    this.removePreview();
                    this.currentHoverContainer = null;
                }
            } else {
                this.removePreview();
                this.currentHoverContainer = null;
            }
        }
    }

    removePreview() {
        if (this.dropPreviewElement && this.dropPreviewElement.parentNode) {
            this.dropPreviewElement.parentNode.removeChild(this.dropPreviewElement);
            this.dropPreviewElement = null;
        }
    }

    closeInRaidInventory() {
        this.inventoryPanel.classList.add('hidden');
        this.inventoryPanel.style.display = '';
        this.inventoryPanel.style.position = '';
        this.inventoryPanel.style.top = '';
        this.inventoryPanel.style.left = '';
        this.inventoryPanel.style.width = '';
        this.inventoryPanel.style.height = '';
        this.inventoryPanel.style.transform = '';
        this.inventoryPanel.style.background = '';
        this.inventoryPanel.style.justifyContent = '';
        this.inventoryPanel.style.alignItems = '';
        this.inventoryPanel.style.paddingTop = '';
        this.inventoryPanel.style.zIndex = ''; // Reset z-index
        document.getElementById('menu-content-area').appendChild(this.inventoryPanel);

        const equipCol = document.getElementById('equip-column');
        if (equipCol) this.inventoryPanel.insertBefore(equipCol, this.inventoryPanel.firstChild);
        
        const bpPanel = document.getElementById('backpack-panel');
        if (bpPanel) equipCol.appendChild(bpPanel);

        if (this.inRaidBgWrapper && this.inRaidBgWrapper.parentNode) {
            this.inRaidBgWrapper.parentNode.removeChild(this.inRaidBgWrapper);
        }

        const stashParent = document.getElementById('stash-grid').closest('.left-panel') || document.getElementById('stash-grid').parentElement;
        if (stashParent) stashParent.style.display = '';
        
        document.getElementById('stash-header').style.display = 'flex';
        document.getElementById('stash-grid').style.display = 'grid';
        document.getElementById('loot-header').classList.add('hidden');
        document.getElementById('loot-grid').classList.add('hidden');
        
        this.game.isInventoryOpen = false;
    }

    initUI() {
        // First explicit UI load
        this.refreshInventory();
        this.refreshShop();
    }

    setupDropZone(element, containerName) {
        // Drop logic is now handled globally centrally in mouseup
    }

    refreshShop() {
        const isOverlay = !this.game.isInMenu; console.log('isOverlay:', isOverlay, 'isInMenu:', this.game.isInMenu);
        const curItemsContainer = isOverlay ? this.overlayShopItems : this.shopItems;
        const curMoneyText = isOverlay ? this.overlayShopMoney : this.shopMoney;
                const categoriesContainerId = isOverlay ? 'overlay-shop-categories' : 'shop-categories';
        const categoriesContainer = document.getElementById(categoriesContainerId);

        const money = (this.inv && this.inv.player && this.inv.player.money !== undefined) ? this.inv.player.money : 0;
        if (curMoneyText) curMoneyText.innerText = money;
        if (curItemsContainer) {
            curItemsContainer.innerHTML = '';
            curItemsContainer.style.display = 'flex';
            curItemsContainer.style.flexWrap = 'wrap';
            curItemsContainer.style.gap = '15px';
        }

        if (categoriesContainer) {
            categoriesContainer.innerHTML = '';
        }

        const categories = {};
        if (EconomyRules && EconomyRules.shopCategories) {
            for (let catName in EconomyRules.shopCategories) {
                categories[catName] = [];
            }
        } else {
            console.error('[UIManager] EconomyRules.shopCategories is MISSING!');
        }

        if (!this.currentShopCategory || !(this.currentShopCategory in categories)) {
            this.currentShopCategory = Object.keys(categories)[0];
        }

        for (let key in ItemDatabase) {
            const item = ItemDatabase[key];
            if (!item.price || item.price <= 0) continue;
            if (item.type === 'secure' && !item.price) continue;

            for (let catName in EconomyRules.shopCategories) {
                if (EconomyRules.shopCategories[catName](item)) {
                    categories[catName].push({ key, item });
                    break;
                }
            }
        }

        // Render Category Buttons
        if (categoriesContainer) {
            for (let catName in categories) {
                const btn = document.createElement('button');
                btn.innerText = catName;
                btn.className = 'shop-cat-btn';
                btn.style.padding = '5px 10px';
                btn.style.cursor = 'pointer';
                btn.style.background = this.currentShopCategory === catName ? '#555' : '#333';
                btn.style.color = '#fff';
                btn.style.border = '1px solid #777';

                btn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('[UIManager] Shop category selected:', catName);
                    this.currentShopCategory = catName;
                    this.refreshShop();
                };
                categoriesContainer.appendChild(btn);
            }
        } else {
            console.warn('[UIManager] Categories container NOT FOUND for:', categoriesContainerId);
        }

        let activeCategoryItems = categories[this.currentShopCategory] || [];
        const isWeaponTab = this.currentShopCategory === 'ÊßçÊ¢∞';

        if (isWeaponTab && curItemsContainer) {
            const weaponClasses = ['?®ÈÉ®', ...new Set(activeCategoryItems.map(({ item }) => item.weaponClass || '?∂‰?'))];
            if (!this.currentWeaponSubCat || !weaponClasses.includes(this.currentWeaponSubCat)) this.currentWeaponSubCat = '?®ÈÉ®';

            let subBarId = isOverlay ? 'overlay-weapon-subcat-bar' : 'lobby-weapon-subcat-bar';
            let subBar = document.getElementById(subBarId);
            if (!subBar) {
                subBar = document.createElement('div');
                subBar.id = subBarId;
                subBar.style.cssText = 'display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px; padding:8px; background:#1a1a1a; border-radius:6px; border:1px solid #444;';
                curItemsContainer.before(subBar);
            }
            subBar.innerHTML = '';
            weaponClasses.forEach(cls => {
                const sbtn = document.createElement('button');
                sbtn.innerText = cls;
                sbtn.style.cssText = `padding:4px 12px; cursor:pointer; border-radius:4px; border:1px solid #666;
                    background:${this.currentWeaponSubCat === cls ? '#0066cc' : '#333'}; color:#fff; font-size:13px;`;
                sbtn.onclick = (e) => { e.stopPropagation(); this.currentWeaponSubCat = cls; this.refreshShop(); };
                subBar.appendChild(sbtn);
            });
            if (this.currentWeaponSubCat !== '?®ÈÉ®') {
                activeCategoryItems = activeCategoryItems.filter(({ item }) => (item.weaponClass || '?∂‰?') === this.currentWeaponSubCat);
            }
        } else if (this.currentShopCategory === 'Â≠êÂ?' && curItemsContainer) {
            const ammoClasses = ['?®ÈÉ®', ...new Set(activeCategoryItems.map(({ item }) => item.ammoClass || '?™Áü•'))];
            if (!this.ammoClassSubCat || !ammoClasses.includes(this.ammoClassSubCat)) this.ammoClassSubCat = '?®ÈÉ®';

            let subBarId = isOverlay ? 'overlay-weapon-subcat-bar' : 'lobby-weapon-subcat-bar';
            let subBar = document.getElementById(subBarId);
            if (!subBar) {
                subBar = document.createElement('div');
                subBar.id = subBarId;
                curItemsContainer.before(subBar);
            }
            subBar.innerHTML = '';
            subBar.style.cssText = 'display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px; padding:8px; background:#1a1a1a; border-radius:6px; border:1px solid #444;';

            const classColors = {
                'Â∞èÂè£Âæ?: '#4a3a00', '‰∏≠Âè£Âæ?: '#003a5a', '?®Â?ÂΩ?: '#3a1a5a',
                'Â§ßÂè£Âæ?: '#5a1a00', '?ôÊ?ÂΩ?: '#1a4a1a', '???': '#5a3a00', '?πÊ?': '#5a0000'
            };
            ammoClasses.forEach(cls => {
                const sbtn = document.createElement('button');
                sbtn.innerText = cls;
                const active = this.ammoClassSubCat === cls;
                sbtn.style.cssText = `padding:4px 14px; cursor:pointer; border-radius:4px; border:1px solid #888;
                    background:${active ? (classColors[cls] || '#555') : '#333'}; color:#fff; font-size:13px;
                    font-weight:${active ? 'bold' : 'normal'};
                    ${active ? 'box-shadow:0 0 6px rgba(255,180,0,0.4); border-color:#fa0;' : ''}`;
                sbtn.onclick = () => { this.ammoClassSubCat = cls; this.refreshShop(); };
                subBar.appendChild(sbtn);
            });

            if (this.ammoClassSubCat !== '?®ÈÉ®') {
                activeCategoryItems = activeCategoryItems.filter(({ item }) => (item.ammoClass || '?™Áü•') === this.ammoClassSubCat);
            }
        } else {
            let subBarId = isOverlay ? 'overlay-weapon-subcat-bar' : 'lobby-weapon-subcat-bar';
            const subBar = document.getElementById(subBarId);
            if (subBar) subBar.remove();
            this.currentWeaponSubCat = '?®ÈÉ®';
        }

        
        activeCategoryItems.sort((a, b) => {
            if (this.currentShopCategory === 'Â≠êÂ?') {
                const tierA = a.item.tier || 0;
                const tierB = b.item.tier || 0;
                if (tierA !== tierB) return tierA - tierB;
            }
            return (a.item.price || 0) - (b.item.price || 0);
        });
        
        activeCategoryItems.forEach(({ key, item }) => {
                const div = document.createElement('div');
                div.className = 'shop-item';
                div.style.flex = '0 0 calc(25% - 15px)'; // 4 columns
                div.style.boxSizing = 'border-box';
                div.style.border = '1px solid #666';
                div.style.padding = '10px';
                div.style.backgroundColor = '#222';
                div.style.display = 'flex';
                div.style.flexDirection = 'column';
                div.style.justifyContent = 'space-between';
                div.dataset.typeid = key;

                let action = () => {
                    if (this.inv.buyItem(key)) {
                        this.showPurchaseToast(item.name || key);
                        this.refreshShop();
                        if (this.attachedItemId === null) {
                            this.refreshInventory();
                        }
                        this.game.updateHUD();
                    }
                };

                let imgHtml = '';
                // TODO: Revert Q-version images when assets are ready
                /*
                if (item.type === 'weapon') {
                    const encodedName = encodeURIComponent(item.name || key);
                    imgHtml = `<div style="flex: 1; display:flex; justify-content:center; align-items:center; overflow:hidden; margin-top:5px; position:relative; min-height:60px;">
                        <img src="ÊßçÊ¢∞?ñÁ?/${encodedName}.png" style="position:absolute; width: 100%; height: 100%; object-fit: fill; transform: scaleX(-1);" onerror="this.style.display='none'">
                    </div>`;
                }
                */

                div.innerHTML = `
                    <div style="display:flex; flex-direction:column; align-items:flex-start;">
                        <strong>${item.name}</strong>
                        <span style="font-size: 12px; color: #aaa;">$${item.price} | ${item.weight}kg | ${item.gridW}x${item.gridH}</span>
                        ${item.specialDesc ? `<span style="font-size: 11px; color: #f90; margin-top:2px;">${item.specialDesc}</span>` : ''}
                    </div>
                    ${imgHtml}
                `;

                const btnContainer = document.createElement('div');
                btnContainer.style.display = 'flex';
                btnContainer.style.gap = '5px';
                btnContainer.style.marginTop = '10px';

                const btn = document.createElement('button');
                btn.className = 'shop-buy-btn';
                btn.innerText = 'Ë≥ºË≤∑ (' + item.price + ')';
                btn.onclick = action;
                btnContainer.appendChild(btn);

                div.appendChild(btnContainer);

                // Context menu removed, now handled by 'f' keydown over data-typeid

                // If it's Gold_Armor, add repair option just for demo
                if (key === '?ëÁî≤' || key === 'Gold_Armor') {
                    const repBtn = document.createElement('button');
                    repBtn.className = 'shop-buy-btn';
                    repBtn.style.background = '#aa5500';
                    repBtn.innerText = '‰øÆÂæ© (Â±ïÁ§∫)';
                    repBtn.onclick = () => {
                        if (this.inv.player.money >= EconomyRules.repairCostGoldArmor) {
                            this.inv.player.money -= EconomyRules.repairCostGoldArmor;
                            this.refreshShop();
                            alert("Â∑≤‰øÆÂæ©Ë???(Â±ïÁ§∫?®ÈÄ?");
                        }
                    };
                    div.appendChild(repBtn);
                }

                this.shopItems.appendChild(div);
            });
    }

    refreshInventory() {
        const overlayBackpackGrid = document.getElementById('overlay-backpack-grid');
        const overlayStashGrid = document.getElementById('overlay-stash-grid');
        const overlayHelmetGrid = document.getElementById('ui-helmet-grid');

        const allGrids = [
            this.stashGrid, this.backpackGrid, this.primaryGrid, this.primaryGrid2,
            this.secondaryGrid, this.meleeGrid, this.armorGrid, this.helmetGrid,
            this.hotbarGrid, this.backpackEquipGrid, this.secureGrid,
            overlayBackpackGrid, overlayStashGrid, overlayHelmetGrid, this.lootGrid
        ];

        allGrids.forEach(g => { if (g) g.innerHTML = ''; });

        const gridMapping = {
            'primaryWep': [this.primaryGrid],
            'primaryWep2': [this.primaryGrid2],
            'secondaryWep': [this.secondaryGrid],
            'meleeSlot': [this.meleeGrid],
            'armorSlot': [this.armorGrid],
            'helmetSlot': [this.helmetGrid, overlayHelmetGrid],
            'hotbarSlot': [this.hotbarGrid],
            'backpackSlot': [this.backpackEquipGrid],
            'secureContainer': [this.secureGrid],
            'backpack': [this.backpackGrid, overlayBackpackGrid],
            'stash': [this.stashGrid, overlayStashGrid],
            'loot': [this.lootGrid]
        };

        // Dynamic Backpack Storage Scaling
        const equippedBackpack = this.inv.items.find(i => i.container === 'backpackSlot');
        const updateBackpackSize = (grid, isBp) => {
            if (!grid) return;
            const section = grid.closest('.inventory-section') || grid.parentElement;
            if (isBp) {
                const bpData = ItemDatabase[equippedBackpack.typeId];
                this.inv.backpack.w = bpData.capW;
                this.inv.backpack.h = bpData.capH;
                if (section) section.style.display = 'block';
                grid.style.width = (bpData.capW * this.cellSize) + 'px';
                grid.style.height = (bpData.capH * this.cellSize) + 'px';
            } else {
                this.inv.backpack.w = 0;
                this.inv.backpack.h = 0;
                if (section) section.style.display = 'none';
            }
        };

        updateBackpackSize(this.backpackGrid, !!equippedBackpack);
        updateBackpackSize(overlayBackpackGrid, !!equippedBackpack);

        // Update Secure Container Grid Visually
        const secureData = ItemDatabase[this.inv.secureContainerType];
        if (secureData && this.secureGrid) {
            this.secureGrid.style.width = (secureData.capW * this.cellSize) + 'px';
            this.secureGrid.style.height = (secureData.capH * this.cellSize) + 'px';
            if (this.secureSelect) this.secureSelect.value = this.inv.secureContainerType;
        }

        // Keep equip slots at default CSS sizes (do not dynamically shrink)
        this.primaryGrid.style.width = '250px'; this.primaryGrid.style.height = '100px';
        this.primaryGrid2.style.width = '250px'; this.primaryGrid2.style.height = '100px';
        this.secondaryGrid.style.width = '100px'; this.secondaryGrid.style.height = '100px';
        this.meleeGrid.style.width = '50px'; this.meleeGrid.style.height = '100px';
        this.armorGrid.style.width = '150px'; this.armorGrid.style.height = '150px';
        this.helmetGrid.style.width = '100px'; this.helmetGrid.style.height = '100px';
        this.hotbarGrid.style.width = '250px'; this.hotbarGrid.style.height = '50px';
        this.backpackEquipGrid.style.width = '150px'; this.backpackEquipGrid.style.height = '150px';

        this.inv.items.forEach(item => {
            const dbItem = ItemDatabase[item.typeId];
            const div = document.createElement('div');
            div.className = 'inventory-item';
            div.dataset.itemid = item.id;

            let renderW = item.rotated ? dbItem.gridH : dbItem.gridW;
            let renderH = item.rotated ? dbItem.gridW : dbItem.gridH;

            div.style.width = (renderW * this.cellSize) + 'px';
            div.style.height = (renderH * this.cellSize) + 'px';
            div.style.left = (item.x * this.cellSize) + 'px';
            div.style.top = (item.y * this.cellSize) + 'px';

            let contentHtml = `<span>${item.typeId}</span>`;
            if (dbItem.type === 'ammo') {
                contentHtml = `<div style="display:flex; flex-direction:column; justify-content:center; align-items:center; width:100%; height:100%; pointer-events:none;">
                    <span style="font-size:12px;">${item.typeId}</span>
                    <strong style="color:#0f0; font-size:14px;">${item.amount !== undefined ? item.amount : 0}</strong>
                </div>`;
            } else if (dbItem.type === 'armor' || dbItem.type === 'helmet') {
                const maxDur = item.maxDurability || dbItem.maxDurability;
                const isBroken = item.isBroken;
                contentHtml = `<div style="display:flex; flex-direction:column; justify-content:center; align-items:center; width:100%; height:100%; pointer-events:none; position:relative;">
                    <span style="font-size:10px;">${item.typeId}</span>
                    <div style="position:absolute; bottom:5px; padding:0 3px; background:rgba(0,0,0,0.7); border-radius:3px;">
                        <span style="color:${isBroken ? '#ff4444' : '#0f0'}; font-size:12px;">${isBroken ? 'Â∑≤Ê?Â£? : item.durability.toFixed(1) + ' / ' + maxDur.toFixed(1)}</span>
                    </div>
                </div>`;
            } else if (dbItem.type === 'repair') {
                contentHtml = `<div style="display:flex; flex-direction:column; justify-content:center; align-items:center; width:100%; height:100%; pointer-events:none; position:relative;">
                    <span style="font-size:12px;">${item.typeId}</span>
                    <div style="position:absolute; bottom:5px; padding:0 3px; background:rgba(0,0,0,0.7); border-radius:3px;">
                        <span style="color:#aaf; font-size:12px;">${item.capacity !== undefined ? Math.ceil(item.capacity) : dbItem.maxCapacity}</span>
                    </div>
                </div>`;
            } else if (dbItem.type === 'medical' || dbItem.type === 'medical-buff') {
                const cap = item.capacity !== undefined ? item.capacity : (dbItem.maxCapacity || 1);
                const maxCap = dbItem.maxCapacity || 1;
                const capPct = Math.max(0, Math.min(100, (cap / maxCap) * 100));
                const capColor = capPct > 50 ? '#4fc' : capPct > 20 ? '#fa0' : '#f44';
                contentHtml = `<div style="display:flex; flex-direction:column; justify-content:center; align-items:center; width:100%; height:100%; pointer-events:none; position:relative;">
                    <span style="font-size:10px; text-align:center; line-height:1.2;">${item.typeId}</span>
                    <div style="position:absolute; bottom:3px; left:3px; right:3px; background:rgba(0,0,0,0.7); border-radius:2px; padding:0 2px; display:flex; justify-content:center;">
                        <span style="color:${capColor}; font-size:11px; font-weight:bold;">${Math.ceil(cap)}/${maxCap}</span>
                    </div>
                </div>`;
            } else if (dbItem.type === 'weapon') {
                const encodedName = encodeURIComponent(dbItem.name || item.typeId);

                let bw = dbItem.gridW * this.cellSize;
                let bh = dbItem.gridH * this.cellSize;

                // Only 2 rotation directions: normal or 90deg
                let transformStr = "translate(-50%, -50%) scaleX(-1)";
                if (item.rotated && item.container !== 'hotbarSlot') {
                    transformStr = "translate(-50%, -50%) rotate(90deg) scaleX(-1)";
                }
                // Try .jpg first (M7.jpg), then .png, fallback to text
                contentHtml = `<img src="ÊßçÊ¢∞?ñÁ?/${encodedName}.jpg"
                    alt="${item.typeId}"
                    style="position:absolute; left:50%; top:50%; width:${bw}px; height:${bh}px; object-fit:fill; transform:${transformStr}; pointer-events:none;"
                    onerror="this.src='ÊßçÊ¢∞?ñÁ?/${encodedName}.png'; this.onerror=function(){this.style.display='none'; this.parentElement.querySelector('.item-text-fallback').style.display='inline';}">
                    <span class="item-text-fallback" style="display:none;">${item.typeId}</span>`;
            }
            div.innerHTML = contentHtml;

            if (item.rotated && item.container !== 'hotbarSlot') {
                div.style.borderStyle = "dashed"; // Visual indicator
            }

            // Delete / Sell button
            if (item.typeId !== '?Ä') {
                const delBtn = document.createElement('button');
                delBtn.className = 'item-delete-btn';
                delBtn.innerText = '$';
                delBtn.title = "?∫ÂîÆ (30%)";
                delBtn.onclick = (e) => {
                    e.stopPropagation(); // Prevent pickup when selling
                    this.inv.sellItem(item.id);
                    this.refreshShop();
                    this.clearAttachment(); // drop it if held
                    this.refreshInventory();
                    this.game.updateHUD();
                };
                div.appendChild(delBtn);
            }

            // Right click to use medical items directly
            div.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                if (item.typeId === '?Ä') return;
                const dbItemObj = ItemDatabase[item.typeId];
                if (dbItemObj && (dbItemObj.type === 'medical' || dbItemObj.type === 'medical-buff')) {
                    this.game.useItemDirectly(item);
                }
            });

            // Double click to quick-equip (with overflow handling)
            div.addEventListener('dblclick', (e) => {
                if (item.typeId === '?Ä') return;
                // Cancel any pending hold-drag
                this._cancelHold();
                if (this.attachedItemId !== null) return;

                const dbItem = ItemDatabase[item.typeId];
                const isInRaid = !this.game.isInMenu;

                // === ?∞Â?‰∏≠Ô?Á¶ÅÊ≠¢?ôÊ??∏Ë?ÔºåÂ??ÅË®±Ë£ùÂ??≥Ê?‰ΩçÊ??åÂ? ===
                if (isInRaid) {
                    const EQUIP_SLOTS = ['primaryWep', 'primaryWep2', 'secondaryWep', 'meleeSlot', 'armorSlot', 'helmetSlot', 'backpackSlot', 'hotbarSlot'];
                    // Â¶ÇÊ??©Â?Â∑≤Âú®Ë£ùÂ?Ê¨Ñ‰∏≠ÔºåÊà∞Â±Ä?ß‰??ÅË®±?ôÊ??∏Ë?
                    if (EQUIP_SLOTS.includes(item.container)) {
                        this._showQuickEquipError('?∞Â?‰∏≠‰??ØÈ??äÂç∏Ë£ùÔ?Ë´ãÊ??≥Ëá≥?åÂ?');
                        return;
                    }
                    // ?©Â?‰∏çÂú®Ë£ùÂ?Ê¨ÑÔ??óË©¶Ë£ùÂ?
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
                            this._showQuickEquipError('‰∏ªÊ≠¶?®Ê?‰ΩçË??åÂ??áÂ∑≤ÊªøÔ??°Ê?Âø´ÈÄüÊîæ??);
                            return;
                        }
                        this.refreshInventory();
                        this.game.updateHUD();
                        return;
                    }
                    // ‰ΩøÁî® autoEquipÔºå‰??•Ê?ÁµÇÂè™?©„ÄåÂç∏?ûstash?çÁ?Ë∑ØÂ??áÈòª??                    if (this.inv.autoEquipRaidSafe(item.id)) {
                        this.refreshInventory();
                        this.game.updateHUD();
                    } else {
                        this._showQuickEquipError('Á©∫È?‰∏çË∂≥?ñÁÑ°Â∞çÊ?Ê¨Ñ‰?ÔºåÁÑ°Ê≥ïÂø´?üÁßª??);
                    }
                    return;
                }

                // === ‰∏ªÈÅ∏?ÆÔ??üÊ?ÂÆåÊï¥?èËºØÔºàÂ?Ë®±Âç∏Ë£ùÔ? ===
                // For weapons: try primaryWep ??primaryWep2 ??backpack ??error
                if (dbItem && dbItem.type === 'weapon' && dbItem.gridW * dbItem.gridH > 2) {
                    // Large weapon: primaryWep1 ??primaryWep2 ??backpack
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
                        this._showQuickEquipError('‰∏ªÊ≠¶?®Ê?‰ΩçË??åÂ??áÂ∑≤ÊªøÔ??°Ê?Âø´ÈÄüÊîæ??);
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
                    this._showQuickEquipError('Á©∫È?‰∏çË∂≥?ñÁÑ°Â∞çÊ?Ê¨Ñ‰?ÔºåÁÑ°Ê≥ïÂø´?üÁßª??);
                }
            });

            // Click to Pickup (with 0.5s hold-to-drag)
            div.addEventListener('mousedown', (e) => {
                if (item.typeId === '?Ä') return;
                if (this.attachedItemId !== null || e.target.classList.contains('item-delete-btn')) return;
                if (e.button !== 0) return;

                const rect = div.getBoundingClientRect();
                const grabX = e.clientX - rect.left;
                const grabY = e.clientY - rect.top;

                // Store pending drag state
                this.pendingDragItemId = item.id;
                this.pendingDragDiv = div;
                this.pendingDragE = e;
                this.isDragActive = false;

                // Start hold timer - activate drag after threshold
                this.holdTimer = setTimeout(() => {
                    if (this.pendingDragItemId !== item.id) return;
                    this.isDragActive = true;

                    this.grabOffsetX = grabX;
                    this.grabOffsetY = grabY;
                    this.attachedItemId = item.id;
                    this.attachedElement = div;
                    this.dragRotated = item.rotated;

                    document.body.appendChild(div);
                    div.style.position = 'fixed';
                    div.style.zIndex = '9999';
                    div.style.left = (this.pendingDragE.clientX - this.grabOffsetX) + 'px';
                    div.style.top = (this.pendingDragE.clientY - this.grabOffsetY) + 'px';
                    div.style.pointerEvents = 'none';
                    div.style.opacity = '1';
                    div.style.display = 'flex';

                    this.handleMouseMove(this.lastMouseE || this.pendingDragE);
                }, this.holdThresholdMs);
            });

            // Prevent attaching this specific element to grids if it is currently actively dragged
            if (this.attachedItemId === item.id) return;

            const targets = gridMapping[item.container] || [];
            targets.forEach((grid, idx) => {
                if (!grid) return;
                if (idx === 0) {
                    grid.appendChild(div);
                } else {
                    // Clone for secondary grids (Overlay)
                    const clone = div.cloneNode(true);
                    // Re-bind events to clone if needed, but for now simple display is enough
                    // Actually, for consistency, clones should also handle drag? 
                    // No, usually only one is visible.
                    grid.appendChild(clone);
                }
            });
        });
    }

    showPurchaseToast(itemName) {
        // Show for 2 seconds, then remove
        let existing = document.getElementById('purchase-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.id = 'purchase-toast';
        toast.innerText = `Â∑≤Ë≥ºË≤?${itemName}ÔºÅ`;
        toast.style.cssText = `
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            background: rgba(0,200,80,0.92); color: white; font-size: 22px; font-weight: bold;
            padding: 14px 32px; border-radius: 10px; z-index: 9999;
            pointer-events: none; box-shadow: 0 4px 20px rgba(0,0,0,0.5);
            animation: fadeOutToast 2s forwards;
        `;
        document.body.appendChild(toast);

        // Inject animation if not present
        if (!document.getElementById('toast-style')) {
            const style = document.createElement('style');
            style.id = 'toast-style';
            style.textContent = `@keyframes fadeOutToast { 0%{opacity:1} 70%{opacity:1} 100%{opacity:0} }`;
            document.head.appendChild(style);
        }

        setTimeout(() => { toast.remove(); }, 2000);
    }

    showItemStats(x, y, dbItem, itemInstance = null) {
        if (!dbItem || !['weapon','armor','helmet','medical','medical-buff','repair','ammo'].includes(dbItem.type)) {
            this.statsModal.classList.add('hidden');
            return;
        }

        this.statsTitle.innerText = dbItem.name;
        const s = dbItem.stats || {};

        let content = '';

        if (dbItem.type === 'weapon') {
            const damage = s.damage !== undefined ? s.damage : '-';
            let magInfo = '';
            if (s.magSize) {
                let currentMagCap = s.magSize;
                if (itemInstance && itemInstance.hasUpgradedMag && s.upMagSize) currentMagCap = s.upMagSize;
                let upgradeText = '';
                if (itemInstance && itemInstance.hasUpgradedMag) {
                    upgradeText = ` <span style='color:#0f0'>(?¥ÂÆπ ${s.upMagSize} ??</span>`;
                } else if (s.upMagSize) {
                    upgradeText = ` <span style='color:#aaa'>???ØÂ???${s.upMagSize} ??/span>`;
                }
                magInfo = `<div>ÂΩàÂå£ÂÆπÈ?: <span style="color:white">${currentMagCap} ??/span>${upgradeText}</div>`;
            }
            // Map ammoType to ammo category label
            const ammoClassLabels = {
                'Â∞èÂè£Âæ?:'Â∞èÂè£Âæ?(SMG/?ãÊ?)', '‰∏≠Âè£Âæ?:'‰∏≠Âè£Âæ?(AR/MG)',
                '?®Â?ÂΩ?:'?®Â?ÂΩ?(DMR/LMG)', 'Â§ßÂè£Âæ?:'Â§ßÂè£Âæ?(M250)',
                '?ôÊ?ÂΩ?:'?ôÊ?ÂΩ?(Sniper)', '???':'??? (Shotgun)',
                '?çÂÇ∑ÂΩ?:'?çÂÇ∑ÂΩ?(ASH-12)', 'Á¥ÖË?':'Á¥ÖË? (AWM)'
            };
            const ammoLabel = ammoClassLabels[dbItem.ammoType] || dbItem.ammoType || '-';
            const tierRestriction = dbItem.maxAmmoTier ? `ÔºàÊ?È´?${['','Á∂?,'??,'Á¥?,'??][dbItem.maxAmmoTier] || dbItem.maxAmmoTier}ÂΩàÔ?` : '';

            content = `
                <div>?∑ÂÆ≥: <span style="color:white">${damage}</span></div>
                <div>Â∞ÑÈÄ? <span style="color:white">${s.fireRate ?? '-'}</span></div>
                <div>?¥Áî≤?ΩÂ?: <span style="color:${s.armorPen ? '#00ffff' : 'white'}">${s.armorPen ? s.armorPen.toFixed(1) + 'x' : '1.0x'}</span></div>
                <div>?õÂ??çÁ?: <span style="color:${(s.reloadMult||1) > 1 ? '#ff8800' : 'white'}">${s.reloadMult ? s.reloadMult.toFixed(1) + 'x' : '1.0x'}</span></div>
                <div>ÂæåÂ∫ß?ßÂà∂: <span style="color:white">${s.recoil ?? '-'}</span></div>
                <div>Á≤æÊ?Â∫? <span style="color:white">${s.accuracy ?? '-'}</span></div>
                <div>ÁØÑÂ?: <span style="color:white">${s.range ?? '-'}</span></div>
                <div>Â≠êÂ??∫ÈÄ? <span style="color:white">${s.velocity ?? '-'}</span></div>
                ${magInfo}
                <div style="color:#fa0; margin-top:6px;">ÂΩàËó•È°ûÂ?: <span style="color:white">${ammoLabel}</span>${tierRestriction}</div>
                <hr style="border-color:#444; margin:8px 0;">
                <div>?çÈ?: ${dbItem.weight} kg | Â∞∫ÂØ∏: ${dbItem.gridW}x${dbItem.gridH}</div>
            `;
        } else if (dbItem.type === 'armor' || dbItem.type === 'helmet') {
            const maxDur = itemInstance ? (itemInstance.maxDurability || dbItem.maxDurability) : dbItem.maxDurability;
            const durText = itemInstance ? `${itemInstance.durability.toFixed(1)} / ${maxDur.toFixed(1)}` : dbItem.maxDurability;
            const brokenStatus = itemInstance && itemInstance.isBroken ? `<div style="color:#ff4444; font-weight:bold; margin-top:5px;">?Ä?ãÔ?Â∑≤Á£®?çÈ?Â∫¶Ô??°Ê?‰øÆÂæ©</div>` : '';
            content = `
                <div>Ë≠∑Áî≤Á≠âÁ?: <span style="color:white">Lv ${dbItem.level}</span></div>
                <div>?∑ÂÆ≥Ê∏õÂ?: <span style="color:white">${Math.round((dbItem.damageReduction || 0) * 100)}%</span></div>
                <div>?ê‰?Â∫? <span style="color:white">${durText}</span></div>
                ${itemInstance && itemInstance.originalMaxDurability ? `<div>?üÂ?‰∏äÈ?: ${itemInstance.originalMaxDurability}</div>` : ''}
                ${brokenStatus}
                <hr style="border-color:#444; margin:8px 0;">
                <div>?çÈ?: ${dbItem.weight} kg | Â∞∫ÂØ∏: ${dbItem.gridW}x${dbItem.gridH}</div>
            `;
        } else if (dbItem.type === 'medical' || dbItem.type === 'medical-buff') {
            const uses = itemInstance ? `?©È? ${itemInstance.capacity ?? '-'} Ê¨°` : `?ÄÂ§?${dbItem.maxCapacity ?? '-'} Ê¨°`;
            content = `
                <div>È°ûÂ?: <span style="color:white">${dbItem.healType || dbItem.effectType || '-'}</span></div>
                <div>‰ΩøÁî®?ÇÈ?: <span style="color:white">${((dbItem.useTime || 0)/1000).toFixed(1)}s</span></div>
                <div>${uses}</div>
                <hr style="border-color:#444; margin:8px 0;">
                <div>?çÈ?: ${dbItem.weight} kg | Â∞∫ÂØ∏: ${dbItem.gridW}x${dbItem.gridH}</div>
            `;
        } else if (dbItem.type === 'repair') {
            content = `
                <div>‰øÆÁ?Á≠âÁ?: <span style="color:white">Lv ${dbItem.level}</span></div>
                <div>ÂÆπÈ?: <span style="color:white">${itemInstance ? (itemInstance.capacity ?? dbItem.maxCapacity) : dbItem.maxCapacity}</span></div>
                <div>‰ΩøÁî®?üÁ?: <span style="color:white">${dbItem.useRate} ??Ê¨?/span></div>
                <hr style="border-color:#444; margin:8px 0;">
                <div>?çÈ?: ${dbItem.weight} kg | Â∞∫ÂØ∏: ${dbItem.gridW}x${dbItem.gridH}</div>
            `;
        } else if (dbItem.type === 'ammo') {
            const tierNames = ['','Á∂†Â?','?çÂ?','Á¥´Â?','?ëË?'];
            const mods = dbItem.armorDamageMods || {};
            content = `
                <div>ÂΩàËó•?ÜÈ?: <span style="color:#fa0">${dbItem.ammoClass || '-'}</span></div>
                <div>Á≠âÁ?: <span style="color:white">${tierNames[dbItem.tier] || dbItem.tier || '-'}</span></div>
                <div>Á©øÁî≤Á≠âÁ?: <span style="color:white">Lv ${dbItem.penLevel || 0} ‰ª•‰?Ë≠∑Áî≤?¥Êé•Á©øÈÄ?/span></div>
                <div style="margin-top:6px">Ë≠∑Áî≤?∑ÂÆ≥?çÁ?:</div>
                ${[1,2,3,4].map(l=>`<div style="padding-left:8px">Lv${l}: <span style="color:white">x${mods[l] ?? '-'}</span></div>`).join('')}
                ${dbItem.hpDamageMod !== undefined && dbItem.hpDamageMod !== 1.0 ? `<div>HP?∑ÂÆ≥?çÁ?: <span style="color:#f90">x${dbItem.hpDamageMod}</span></div>` : ''}
                ${dbItem.specialDesc ? `<div style="color:#f90; margin-top:4px">${dbItem.specialDesc}</div>` : ''}
                <hr style="border-color:#444; margin:8px 0;">
                <div>?çÈ?: ${dbItem.weight} kg | ?∏È?: ${dbItem.maxCapacity}????/div>
            `;
        }

        this.statsContent.innerHTML = content;

        // Mag upgrade button (weapon only)
        if (dbItem.type === 'weapon' && itemInstance && !itemInstance.hasUpgradedMag && s.upMagPrice && s.upMagSize) {
            const magIncrease = s.upMagSize - s.magSize;
            const priceDiff = s.upMagPrice - (dbItem.price || 0);
            const upBtn = document.createElement('button');
            upBtn.innerText = `?áÁ?ÂΩàÂå£ (+${magIncrease}?? ?πÂ∑Æ $${priceDiff > 0 ? '+' + priceDiff : priceDiff})`;
            upBtn.style.cssText = 'margin-top:8px; padding:5px; background:#0066cc; color:#fff; border:none; cursor:pointer; width:100%; border-radius:3px; font-weight:bold;';
            upBtn.onclick = () => {
                if (this.inv.player.money >= s.upMagPrice) {
                    this.inv.player.money -= s.upMagPrice;
                    itemInstance.hasUpgradedMag = true;
                    itemInstance.currentMag = s.upMagSize;
                    this.refreshShop();
                    this.refreshInventory();
                    this.game.updateHUD();
                    this.showItemStats(x, y, dbItem, itemInstance);
                } else { alert('?ëÈå¢‰∏çË∂≥Ôº?); }
            };
            this.statsContent.appendChild(upBtn);
        }

        // Buy Ammo shortcut (weapon only)
        if (dbItem.type === 'weapon' && dbItem.ammoType) {
            const buyAmmoBtn = document.createElement('button');
            buyAmmoBtn.innerText = `Ë≥ºË≤∑ÂΩàËó• ??${dbItem.ammoType}`;
            buyAmmoBtn.style.cssText = 'margin-top:6px; padding:5px; background:#664400; color:#fff; border:none; cursor:pointer; width:100%; border-radius:3px; font-weight:bold;';
            buyAmmoBtn.onclick = () => {
                this.statsModal.classList.add('hidden');
                // Find the ammo tab name that matches this weapon's ammoType
                const ammoTabName = Object.keys(EconomyRules.shopCategories).find(cat => {
                    const testItem = { type: 'ammo', ammoClass: dbItem.ammoType };
                    return EconomyRules.shopCategories[cat](testItem);
                });
                if (ammoTabName) {
                    this.currentShopCategory = ammoTabName;
                    // Switch to shop view if in stash view
                    const shopBtn = document.getElementById('shop-tab-btn') || [...document.querySelectorAll('button')].find(b => b.innerText.includes('?ÜÂ?'));
                    if (shopBtn) shopBtn.click();
                    this.refreshShop();
                }
            };
            this.statsContent.appendChild(buyAmmoBtn);
        }

        this.statsModal.style.left = (x + 15) + 'px';
        this.statsModal.style.top = (y + 15) + 'px';
        this.statsModal.classList.remove('hidden');
    }

    openRepairModal(kit, armor) {
        this.currentRepairParams = { kit, armor };
        const result = this.game.calculateRepair(kit, armor);
        if (!result) return;

        const modal = document.getElementById('repair-modal');
        const info = document.getElementById('repair-info');
        if (!modal || !info) return;

        const kitName = ItemDatabase[kit.typeId].name;
        const armorName = ItemDatabase[armor.typeId].name;
        const ratePct = Math.round(result.decayRate * 100);

        let content = `
            <div><strong>‰øÆÁ?ÁÆ±Ô?</strong> ${kitName}</div>
            <div><strong>?ÆÊ?Ë£ùÂ?Ôº?/strong> ${armorName}</div>
            <hr style="border-color:#333; margin:10px 0;">
            <div>?∂Â??ê‰?‰∏äÈ?Ôº?{result.currentMax.toFixed(1)}</div>
            <div>Á£®Ê??çÁ?Ôº?span style="color:#ff8800">${ratePct}%</span></div>
            <div style="font-size:16px; margin-top:10px;">
                ‰øÆÂæ©ÂæåÈ?Ë®à‰??êÔ?<span style="color:#00ffaa; font-weight:bold;">${result.predictedMax.toFixed(1)} / ${result.predictedMax.toFixed(1)}</span>
                <span style="color:#888; font-size:12px;"> (??${result.originalMax})</span>
            </div>
        `;

        if (result.isBroken) {
            content += `<div style="color:#ff4444; font-weight:bold; margin-top:10px; padding:10px; background:rgba(255,0,0,0.1); border-radius:5px;">
                Ë≠¶Â?Ôºö‰øÆÂæ©Â??ê‰?‰∏äÈ?Â∞á‰??ºÂ?ÂßãÂÄºÁ? 20%ÔºåË©≤Ë£ùÂ?Â∞áÊ?Â£û‰??°Ê??ç‰øÆÂæ©Ô?
            </div>`;
        }

        info.innerHTML = content;
        modal.classList.remove('hidden');
    }
}
