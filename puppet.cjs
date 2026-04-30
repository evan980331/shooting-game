const puppeteer = require('puppeteer');
(async () => {
    const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.goto('http://localhost:8080');
    await new Promise(r => setTimeout(r, 1000));
    
    await page.click('#tab-shop');
    await new Promise(r => setTimeout(r, 1000));
    
    const html = await page.$eval('#panel-shop', el => el.innerHTML);
    const fs = require('fs');
    fs.writeFileSync('shop_dom.txt', html);
    
    const logs = [];
    page.on('console', msg => logs.push(msg.text()));
    await new Promise(r => setTimeout(r, 1000));
    fs.writeFileSync('browser_logs.txt', logs.join('\n'));
    
    await browser.close();
    console.log('DOM saved.');
})();
