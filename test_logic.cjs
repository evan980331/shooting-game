const { JSDOM } = require('jsdom');
const fs = require('fs');

const dom = new JSDOM(fs.readFileSync('index.html', 'utf8'), { url: 'http://localhost/', runScripts: 'outside-only' });
global.window = dom.window;
global.document = dom.window.document;
global.requestAnimationFrame = (cb) => {}; // don't loop
global.navigator = { gpu: null };
global.WebSocket = class { constructor() {} set onopen(cb){} set onmessage(cb){} set onclose(cb){ setTimeout(cb, 100); } };
global.performance = { now: () => 0 };

import('./db.js?v=' + Date.now()).then(dbModule => {
    import('./main.js?v=' + Date.now()).then(mainModule => {
        const game = window.game;
        
        setTimeout(() => {
            console.log('isInMenu:', game.isInMenu);
            console.log('player isDead:', game.player.isDead);
            console.log('player health:', game.player.health);
            document.getElementById('btn-enter-raid').click();
            
            setTimeout(() => {
                console.log('After click isInMenu:', game.isInMenu);
                game.update(0.16);
                console.log('Instances after update:', game.renderInstances ? game.renderInstances.length : 0);
                game.render();
                console.log('Instances after render:', game.renderInstances ? game.renderInstances.length : 0);
            }, 500);
        }, 1000);
    }).catch(console.error);
});
