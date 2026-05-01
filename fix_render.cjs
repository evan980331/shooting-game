const fs = require('fs');
let main = fs.readFileSync('main.js', 'utf8');
main = main.replace('render() {', 'render() { if (!this._loggedRender) { console.log("RENDER CALLED", this.renderInstances ? this.renderInstances.length : -1); this._loggedRender = true; }');
fs.writeFileSync('main.js', main, 'utf8');
console.log('Added log.');
