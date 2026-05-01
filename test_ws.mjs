import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:8081');
let myId = null;

ws.on('open', () => {
    console.log("Connected to server");
});

ws.on('message', (data) => {
    const msg = JSON.parse(data);
    if (msg.type === 'init') {
        myId = msg.playerId;
        console.log("Received init, myId:", myId);
    } else if (msg.type === 'state') {
        const state = JSON.parse(msg.data);
        console.log("Received state. Has myId?", !!state.players[myId]);
        if (state.players[myId]) {
            const p = state.players[myId];
            console.log(`Player data: x=${p.x}, y=${p.y}, isDead=${p.isDead}, health=${p.health}, weight=${p.weight}`);
        } else {
            console.log("PLAYERS:", Object.keys(state.players));
        }
        ws.close();
    }
});
