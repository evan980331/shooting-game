const puppeteer = require('puppeteer');
(async () => {
    const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage();
    
    const logs = [];
    page.on('console', msg => logs.push(msg.text()));
    page.on('pageerror', err => logs.push('PAGE ERROR: ' + err.message));
    
    await page.goto('http://localhost:8080');
    await new Promise(r => setTimeout(r, 1000));
    
    await page.click('#btn-enter-raid');
    await new Promise(r => setTimeout(r, 3000));
    
    const fs = require('fs');
    fs.writeFileSync('raid_logs.txt', logs.join('\n'));
    await page.screenshot({ path: 'raid_screen.png' });
    
    await browser.close();
    console.log('Logs and screenshot saved.');
})();
