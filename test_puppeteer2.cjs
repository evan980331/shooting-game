const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    
    page.on('console', msg => console.log(`[PAGE LOG] ${msg.text()}`));
    page.on('pageerror', err => console.log(`[PAGE ERROR] ${err.toString()}`));
    
    await page.goto('http://localhost:8080/');
    await new Promise(r => setTimeout(r, 1000));
    await page.click('#btn-enter-raid');
    await new Promise(r => setTimeout(r, 1000));
    
    const state = await page.evaluate(() => {
        if (!window.game) return 'No window.game';
        return {
            px: window.game.player ? window.game.player.x : 'undefined',
            py: window.game.player ? window.game.player.y : 'undefined',
            cx: window.game.cameraX,
            cy: window.game.cameraY,
            instances: window.game.renderInstances ? window.game.renderInstances.length : -1,
            minimap: !!window.game.minimapCtx,
            walls: window.game.walls ? window.game.walls.length : -1,
            recoilOffset: window.game.player ? window.game.player.recoilOffset : 'undefined',
            isInMenu: window.game.isInMenu,
            isDead: window.game.player ? window.game.player.isDead : 'undefined'
        };
    });
    console.log("GAME STATE:", JSON.stringify(state, null, 2));
    await browser.close();
})();
