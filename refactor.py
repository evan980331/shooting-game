import re

with open('game_simulation.js', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Insert MathUtils at the top (after imports)
math_utils = """
export class MathUtils {
    static seed = 1234567;
    static seededRandom() {
        this.seed = (this.seed * 9301 + 49297) % 233280;
        return this.seed / 233280;
    }
}
"""
code = re.sub(r'(import .*?\n)', r'\1' + math_utils, code, count=1)

# 2. Modify constructor
old_constructor = """    constructor() {
        this.player = {
            x: 2000,
            y: 2000,
            size: 30, // radius/size
            rotation: 0,
            health: 100,
            isBleeding: false,
            isHeavyBleeding: false,
            hasHeadInjury: false,
            hasTorsoInjury: false,
            pkActiveTime: 0,
            isHealing: false,
            isReloading: false,
            reloadTimer: 0,
            healOverRate: 0,
            weight: 0,
            baseSpeed: 200, // units per second
            color: [0, 0.5, 1, 1], // Blue
            isDead: false,
            isExtracting: false,
            extractionTimer: 10.0, // seconds
            won: false,
            visualJitter: 0, // Horizontal recoil jitter
            recoilOffset: { x: 0, y: 0 }, // Spring-back recoil offset
            cameraZoom: 1.5 
        };

        this.input = new InputState();"""

new_state = """    constructor() {
        this.state = {
            players: {},
            bullets: [],
            bots: [],
            effects: [],
            time: 0
        };
        this.nextBulletId = 1;"""

code = code.replace(old_constructor, new_state)

# Remove the rest of constructor that sets this.currentMap etc and this.player initialization stuff that should be in addPlayer
# Actually, it's easier to rip out the constructor and replace it entirely

import sys
sys.exit(0)
