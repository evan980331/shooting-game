const fs = require('fs');
let db = fs.readFileSync('db.js', 'utf8');
db = db.replace('"刀": { name: "刀", weaponClass: "近戰", type: "melee", price: 1000', '"刀": { name: "刀", weaponClass: "近戰", type: "melee", price: 0');
fs.writeFileSync('db.js', db, 'utf8');
console.log('Knife price removed successfully.');
