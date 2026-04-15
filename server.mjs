import { WebSocketServer } from 'ws';
import { GameSimulation } from './game_simulation.js';

const wss = new WebSocketServer({ port: 8081 });
const sim = new GameSimulation();
sim.isInMenu = false; // Ensure simulation starts

let lastTickTime = performance.now();
const tickRate = 60;
const tickIntervalMs = 1000 / tickRate;

wss.on('connection', (ws) => {
    const playerId = `player_${Math.random().toString(36).substr(2, 9)}`;
    console.log(`[Server] Player connected: ${playerId}`);
    
    // Create player in simulation
    const p = sim.addPlayer(playerId);
    p.x += (Math.random() - 0.5) * 100; // Slight spawn offset
    p.y += (Math.random() - 0.5) * 100;

    // Send initial Handshake
    ws.send(JSON.stringify({
        type: 'init',
        playerId: playerId
    }));

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'input') {
                sim.applyInput(playerId, data);
            }
        } catch (e) {
            console.error('Invalid WS message', e);
        }
    });

    ws.on('close', () => {
        console.log(`[Server] Player disconnected: ${playerId}`);
        sim.removePlayer(playerId);
    });
});

setInterval(() => {
    const now = performance.now();
    const dt = (now - lastTickTime) / 1000;
    if (dt <= 0) return;
    lastTickTime = now;

    sim.update(dt);

    const statePayload = sim.exportState();
    const message = JSON.stringify({
        type: 'state',
        data: statePayload
    });

    for (let client of wss.clients) {
        if (client.readyState === 1) { // WebSocket.OPEN
            client.send(message);
        }
    }
}, tickIntervalMs);

console.log('[Server] WebSocket Game Server running on ws://localhost:8081');
