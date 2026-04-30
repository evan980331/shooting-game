const fs = require('fs');
let ui = fs.readFileSync('ui.js', 'utf8');
ui = ui.replace("const subBar = document.getElementById('weapon-subcat-bar');", "let subBarId = isOverlay ? 'overlay-weapon-subcat-bar' : 'lobby-weapon-subcat-bar';\n            const subBar = document.getElementById(subBarId);");
fs.writeFileSync('ui.js', ui, 'utf8');
console.log('Replaced successfully.');
