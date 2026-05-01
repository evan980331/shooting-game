const fs = require('fs');
let main = fs.readFileSync('main.js', 'utf8');
main = main.replace('if (this.player.isDead || this.player.won || this.isInMenu) return;', 'if (this.player.isDead || this.player.won || this.isInMenu) { console.log("UPDATE RETURN EARLY:", this.player.isDead, this.player.won, this.isInMenu); return; }');
fs.writeFileSync('main.js', main, 'utf8');
console.log('Added debug log.');
