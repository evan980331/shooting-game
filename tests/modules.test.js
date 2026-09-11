/**
 * 模組匯入測試 — Day 1
 *
 * 驗證 P0-1（GameState）、P0-2（Player）、P0-3（Weapon）
 * 三個已提取類別可以正確匯入並實例化。
 *
 * 注意：原始碼使用 ?v=NNNN cache-busting query string（瀏覽器用），
 * Vitest 原生支援帶 query 的 import 路徑解析，無需額外設定。
 */
import { describe, it, expect } from 'vitest';
import { GameState } from '../core/GameState.js?v=1778846971';
import { Player } from '../gameplay/Player.js?v=1778846971';
import { Weapon } from '../gameplay/Weapon.js?v=1778846971';

describe('模組匯入測試', () => {

    // ── GameState ──────────────────────────────────────────

    describe('GameState', () => {
        it('應能正確實例化 GameState', () => {
            const gs = new GameState();
            expect(gs).toBeInstanceOf(GameState);
        });

        it('應初始化所有核心狀態容器', () => {
            const gs = new GameState();
            expect(gs.players).toEqual({});
            expect(gs.bullets).toEqual([]);
            expect(gs.bots).toEqual([]);
            expect(gs.effects).toEqual([]);
            expect(gs.groundItems).toEqual([]);
            expect(gs.time).toBe(0);
        });

        it('應初始化世界資料與遊戲計時器', () => {
            const gs = new GameState();
            expect(gs.walls).toEqual([]);
            expect(gs.spawnPoints).toEqual([]);
            expect(gs.extractionZones).toEqual([]);
            expect(gs.gameTimer).toBe(900);
        });

        it('應初始化事件旗標', () => {
            const gs = new GameState();
            expect(gs.events.inventoryDirty).toBe(false);
            expect(gs.events.playerDied).toBe(false);
            expect(gs.events.playerWon).toBe(false);
            expect(gs.events.sessionReset).toBe(false);
            expect(gs.events.messages).toEqual([]);
        });

        it('getPlayer / addPlayer / removePlayer 應正確操作 players 字典', () => {
            const gs = new GameState();
            const mockPlayer = { id: 'p1' };
            gs.addPlayer(mockPlayer);
            expect(gs.getPlayer('p1')).toBe(mockPlayer);
            gs.removePlayer('p1');
            expect(gs.getPlayer('p1')).toBeUndefined();
        });

        it('forEachPlayer 應遍歷所有玩家', () => {
            const gs = new GameState();
            gs.addPlayer({ id: 'p1' });
            gs.addPlayer({ id: 'p2' });
            const ids = [];
            gs.forEachPlayer((p) => ids.push(p.id));
            expect(ids.sort()).toEqual(['p1', 'p2']);
        });

        it('pushMessage 應將訊息加入 messages 陣列', () => {
            const gs = new GameState();
            gs.pushMessage('hello');
            gs.pushMessage('world');
            expect(gs.events.messages).toEqual(['hello', 'world']);
        });

        it('clearEvents 應重置事件旗標但保留 messages', () => {
            const gs = new GameState();
            gs.events.inventoryDirty = true;
            gs.events.playerDied = true;
            gs.pushMessage('test');
            gs.clearEvents();
            expect(gs.events.inventoryDirty).toBe(false);
            expect(gs.events.playerDied).toBe(false);
            expect(gs.events.messages).toEqual(['test']);
        });

        it('getNewGroundItemId 應遞增 ID', () => {
            const gs = new GameState();
            expect(gs.getNewGroundItemId()).toBe(1);
            expect(gs.getNewGroundItemId()).toBe(2);
            expect(gs.getNewGroundItemId()).toBe(3);
        });
    });

    // ── Player ─────────────────────────────────────────────

    describe('Player', () => {
        it('應能正確實例化 Player', () => {
            const gs = new GameState();
            const p = new Player('test-player', gs);
            expect(p).toBeInstanceOf(Player);
        });

        it('應初始化位置與物理屬性', () => {
            const gs = new GameState();
            const p = new Player('p1', gs);
            expect(p.x).toBe(2000);
            expect(p.y).toBe(2000);
            expect(p.size).toBe(30);
            expect(p.baseSpeed).toBe(200);
        });

        it('應初始化血量與死亡狀態', () => {
            const gs = new GameState();
            const p = new Player('p1', gs);
            expect(p.health).toBe(100);
            expect(p.isDead).toBe(false);
            expect(p.won).toBe(false);
        });

        it('應初始化換彈狀態', () => {
            const gs = new GameState();
            const p = new Player('p1', gs);
            expect(p.isReloading).toBe(false);
            expect(p.reloadTimer).toBe(0);
            expect(p.reloadTargetWeapon).toBeNull();
            expect(p.reloadAmount).toBe(0);
        });

        it('應初始化戰鬥狀態', () => {
            const gs = new GameState();
            const p = new Player('p1', gs);
            expect(p.consecutiveShots).toBe(0);
            expect(p.lastShotTime).toBe(0);
            expect(p.shootTimer).toBe(0);
        });

        it('應初始化輸入與武器槽', () => {
            const gs = new GameState();
            const p = new Player('p1', gs);
            expect(p.input).toEqual({ moveX: 0, moveY: 0, isShooting: false });
            expect(p.activeWeaponSlot).toBe('primaryWep');
        });

        it('die() 應設定 isDead、清零血量、觸發 playerDied 事件', () => {
            const gs = new GameState();
            const p = new Player('p1', gs);
            p.inventory = { clearOnDeath: () => {} };
            p.die();
            expect(p.isDead).toBe(true);
            expect(p.health).toBe(0);
            expect(gs.events.playerDied).toBe(true);
            expect(gs.events.inventoryDirty).toBe(true);
        });

        it('win() 應設定 won 並觸發 playerWon 事件', () => {
            const gs = new GameState();
            const p = new Player('p1', gs);
            p.win();
            expect(p.won).toBe(true);
            expect(gs.events.playerWon).toBe(true);
        });
    });

    // ── Weapon ─────────────────────────────────────────────

    describe('Weapon', () => {
        // 使用 ItemDatabase 中的真實武器定義作為測試資料
        const mockDbDef = {
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

        const mockItem = {
            currentMag: 15,
            loadedAmmoId: null,
            durability: 100,
            maxDurability: 100,
            hasUpgradedMag: false,
        };

        it('應能正確實例化 Weapon', () => {
            const w = new Weapon(mockDbDef, mockItem);
            expect(w).toBeInstanceOf(Weapon);
        });

        it('應正確回傳靜態屬性', () => {
            const w = new Weapon(mockDbDef, mockItem);
            expect(w.damage).toBe(19);
            expect(w.fireRate).toBe(75);
            expect(w.recoil).toBe(60);
            expect(w.accuracy).toBe(80);
            expect(w.range).toBe(70);
            expect(w.velocity).toBe(75);
            expect(w.reloadMult).toBe(1.0);
            expect(w.ammoType).toBe('中口徑');
        });

        it('isWeapon / isMelee / isValid 應正確判斷武器類型', () => {
            const w = new Weapon(mockDbDef, mockItem);
            expect(w.isWeapon).toBe(true);
            expect(w.isMelee).toBe(false);
            expect(w.isValid).toBe(true);
        });

        it('baseMagSize / maxMagSize 應回傳正確的彈匣大小', () => {
            const w = new Weapon(mockDbDef, mockItem);
            expect(w.baseMagSize).toBe(30);
            expect(w.maxMagSize).toBe(30);
        });

        it('maxMagSize 應使用升級彈匣大小當 hasUpgradedMag 為 true', () => {
            const upgradedItem = { ...mockItem, hasUpgradedMag: true };
            const w = new Weapon(mockDbDef, upgradedItem);
            expect(w.maxMagSize).toBe(40);
        });

        it('currentMag 應從 inventory item 讀取', () => {
            const w = new Weapon(mockDbDef, mockItem);
            expect(w.currentMag).toBe(15);
        });

        it('isMagFull / isMagEmpty 應正確判斷彈匣狀態', () => {
            const fullItem = { ...mockItem, currentMag: 30 };
            const w1 = new Weapon(mockDbDef, fullItem);
            expect(w1.isMagFull).toBe(true);
            expect(w1.isMagEmpty).toBe(false);

            const emptyItem = { ...mockItem, currentMag: 0 };
            const w2 = new Weapon(mockDbDef, emptyItem);
            expect(w2.isMagFull).toBe(false);
            expect(w2.isMagEmpty).toBe(true);
        });

        it('cooldown 應回傳正確的射擊間隔（10.0 / fireRate）', () => {
            const w = new Weapon(mockDbDef, mockItem);
            expect(w.cooldown).toBeCloseTo(10.0 / 75, 10);
        });

        it('canFire 應在彈匣有彈藥時回傳 true', () => {
            const w = new Weapon(mockDbDef, mockItem);
            expect(w.canFire()).toBe(true);
        });

        it('canFire 應在彈匣空時回傳 false', () => {
            const emptyItem = { ...mockItem, currentMag: 0 };
            const w = new Weapon(mockDbDef, emptyItem);
            expect(w.canFire()).toBe(false);
        });

        it('consumeRound 應消耗一發彈藥並回傳 true', () => {
            const item = { ...mockItem, currentMag: 5 };
            const w = new Weapon(mockDbDef, item);
            expect(w.consumeRound()).toBe(true);
            expect(item.currentMag).toBe(4);
        });

        it('consumeRound 在彈匣空時應回傳 false', () => {
            const emptyItem = { ...mockItem, currentMag: 0 };
            const w = new Weapon(mockDbDef, emptyItem);
            expect(w.consumeRound()).toBe(false);
        });

        it('parseDamage 應正確解析數字傷害', () => {
            const w = new Weapon(mockDbDef, mockItem);
            const result = w.parseDamage();
            expect(result.damage).toBe(19);
            expect(result.pelletCount).toBe(1);
        });

        it('parseDamage 應正確解析散彈格式的傷害（"10x8"）', () => {
            const shotgunDef = {
                ...mockDbDef,
                stats: { ...mockDbDef.stats, damage: '10x8' },
            };
            const w = new Weapon(shotgunDef, mockItem);
            const result = w.parseDamage();
            expect(result.damage).toBe(10);
            expect(result.pelletCount).toBe(8);
        });

        it('getSpread 應回傳 currentSpread 和 maxSpreadRad', () => {
            const w = new Weapon(mockDbDef, mockItem);
            const result = w.getSpread(0, 1);
            expect(result).toHaveProperty('currentSpread');
            expect(result).toHaveProperty('maxSpreadRad');
            expect(result.maxSpreadRad).toBe(0.33);
        });

        it('getJitterMagnitude 應回傳正值', () => {
            const w = new Weapon(mockDbDef, mockItem);
            const jitter = w.getJitterMagnitude(0);
            expect(jitter).toBeGreaterThan(0);
        });

        it('getKickback 應回傳 kickX 和 kickY', () => {
            const w = new Weapon(mockDbDef, mockItem);
            const result = w.getKickback(0, 0);
            expect(result).toHaveProperty('kickX');
            expect(result).toHaveProperty('kickY');
        });

        it('getProjectileData 應回傳 bulletSpeed 和 effectiveRange', () => {
            const w = new Weapon(mockDbDef, mockItem);
            const result = w.getProjectileData();
            expect(result.bulletSpeed).toBe(75 * 20);
            expect(result.effectiveRange).toBe(70 * 20);
        });

        it('getReloadTime 應回傳至少 0.8 秒的換彈時間', () => {
            const w = new Weapon(mockDbDef, mockItem);
            const time = w.getReloadTime(30);
            expect(time).toBeGreaterThanOrEqual(0.8);
        });

        it('applyReload 應將彈藥加入 currentMag', () => {
            const item = { ...mockItem, currentMag: 10 };
            const w = new Weapon(mockDbDef, item);
            w.applyReload(20);
            expect(item.currentMag).toBe(30);
        });
    });
});
