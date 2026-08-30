/**
 * GameState — Centralized game state container.
 * 
 * Single source of truth for all game state data.
 * Other systems read/write through GameState rather than accessing raw state.
 * 
 * This is P0-1: Extract & Centralize. No behavior changes.
 */
export class GameState {
    constructor() {
        this.players = {};
        this.bullets = [];
        this.bots = [];
        this.effects = [];
        this.grass = [];
        this.groundItems = [];
        this.time = 0;

        // World / map data
        this.walls = [];
        this.spawnPoints = [];
        this.extractionZones = [];

        // Game timer
        this.gameTimer = 900;

        // Event flags — checked by Game to trigger UI updates, death screens, etc.
        this.events = {
            inventoryDirty: false,
            playerDied: false,
            playerWon: false,
            sessionReset: false,
            messages: []
        };
    }

    // ── Player Accessors ──────────────────────────────────────

    getPlayer(id) {
        return this.players[id];
    }

    addPlayer(player) {
        this.players[player.id] = player;
    }

    removePlayer(id) {
        delete this.players[id];
    }

    forEachPlayer(fn) {
        for (let id in this.players) {
            fn(this.players[id], id);
        }
    }

    // ── Event Helpers ─────────────────────────────────────────

    pushMessage(msg) {
        this.events.messages.push(msg);
    }

    clearEvents() {
        this.events.inventoryDirty = false;
        this.events.playerDied = false;
        this.events.playerWon = false;
        this.events.sessionReset = false;
    }
}
