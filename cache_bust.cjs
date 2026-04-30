const fs = require('fs');

const version = Date.now();
const files = ['main.js', 'ui.js', 'game_simulation.js', 'inventory.js', 'server.mjs'];

files.forEach(file => {
    if (!fs.existsSync(file)) return;
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(/from '\.\/(.*?\.js)(?:\?v=\d+)?'/g, `from './$1?v=${version}'`);
    fs.writeFileSync(file, content, 'utf8');
});

let html = fs.readFileSync('index.html', 'utf8');
html = html.replace(/src="(.*?\.js)(?:\?v=\d+)?"/g, `src="$1?v=${version}"`);
fs.writeFileSync('index.html', html, 'utf8');
console.log('Cache busting applied.');
