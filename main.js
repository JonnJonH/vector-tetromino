import { Game } from './game.js';
import { Renderer } from './renderer.js';
import { AudioFx } from './audio.js';

const renderer = new Renderer('game-canvas', 'next-canvas', 'hold-canvas');
const audio = new AudioFx();
const game = new Game(renderer, audio);

window.game = game; // Exposed for debugging
window.renderer = renderer; // Exposed for debugging

let dropCounter = 0;
let dropInterval = 1000;
let lastTime = 0;
let requestID;

const startScreen = document.getElementById('start-screen');
const pauseScreen = document.getElementById('pause-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const gamepadSettingsScreen = document.getElementById('gamepad-settings-screen');
const finalScoreVal = document.getElementById('final-score-val');

let gamepadMappings = {
    left: 14, right: 15, down: 13, up: 12,
    rotateCW: 1, rotateCCW: 0, hold: 4
};
let prevGamepadState = {};
let dasTimers = { left: 0, right: 0, down: 0 };
const DAS_DELAY = 150; // ms before repeat starts
const DAS_REPEAT = 40; // ms between repeats
let isRemapping = false;
let remappingAction = null;
let remappingButtonEl = null;
let remappingLoopId = null;

function update(time = 0) {
    if (game.gameOver) {
        handleGameOver();
        return;
    }

    if (game.isPaused || isRemapping || gamepadSettingsScreen.classList.contains('active')) {
        return;
    }

    const deltaTime = time - lastTime;
    lastTime = time;

    pollGamepad(deltaTime);

    dropCounter += deltaTime;

    // Game Boy Tetris Type A millisecond drop intervals (Levels 0-20 mapped to 1-21)
    const LEVEL_SPEEDS = [
        887, 820, 753, 686, 619, 552, 469, 368, 285, 184,
        167, 151, 134, 117, 100, 100, 84, 84, 67, 67, 50
    ];

    // Level 1 uses index 0. Re-trigger last index for high levels.
    const speedIndex = Math.min(game.level - 1, LEVEL_SPEEDS.length - 1);
    dropInterval = LEVEL_SPEEDS[speedIndex];

    if (dropCounter > dropInterval) {
        game.moveDown();
        dropCounter = 0;
    }

    game.update(deltaTime);
    game.draw();
    requestID = requestAnimationFrame(update);
}

function handleGameOver() {
    audio.stopBGM();
    cancelAnimationFrame(requestID);
    gameOverScreen.classList.add('active');
    finalScoreVal.innerText = game.score;
}

function startGame() {
    audio.resume();
    audio.startBGM();
    startScreen.classList.remove('active');
    gameOverScreen.classList.remove('active');
    pauseScreen.classList.remove('active');

    game.reset();
    dropCounter = 0;
    lastTime = performance.now();
    requestID = requestAnimationFrame(update);
}

function togglePause() {
    if (game.gameOver || startScreen.classList.contains('active')) return;

    game.isPaused = !game.isPaused;
    if (game.isPaused) {
        audio.pauseBGM();
        pauseScreen.classList.add('active');
        cancelAnimationFrame(requestID);
    } else {
        audio.resumeBGM();
        pauseScreen.classList.remove('active');
        lastTime = performance.now();
        requestAnimationFrame(update);
    }
}

document.addEventListener('keydown', event => {
    if (game.gameOver || startScreen.classList.contains('active')) {
        if (event.code === 'Space') {
            startGame();
        }
        return;
    }

    if (event.code === 'Escape' || event.code === 'KeyP') {
        togglePause();
        return;
    }

    if (game.isPaused) return;

    if (event.repeat) {
        // Prevent key repeating (stalling/holding down keys) for these buttons
        if (event.code === 'ArrowUp' || event.code === 'Enter' || event.code === 'Space' || event.key === 'z') {
            return;
        }
    }

    switch (event.key) {
        case 'ArrowLeft':
            game.moveLeft();
            break;
        case 'ArrowRight':
            game.moveRight();
            break;
        case 'ArrowDown':
            game.moveDown(true);
            dropCounter = 0;
            break;
        case 'ArrowUp':
            game.hardDrop();
            dropCounter = 0;
            break;
        case ' ': // Space
            game.rotate();
            break;
        case 'z':
        case 'Z':
            game.rotateCCW();
            break;
        case 'Enter':
            game.holdPiece();
            dropCounter = 0;
            break;
    }

    // Force draw immediately on input for responsiveness
    game.draw();
});

// --- Gamepad Logic ---
function pollGamepad(deltaTime) {
    const gamepads = navigator.getGamepads();
    const gp = gamepads[0]; // Just grab the first connected gamepad for now

    if (!gp) return;

    const currentButtons = gp.buttons.map(b => b.pressed);

    const checkPressed = (action) => {
        let mapped = gamepadMappings[action];
        let pressed = false;

        if (typeof mapped === 'number') {
            pressed = currentButtons[mapped];
        } else if (mapped && mapped.type === 'axis' && gp.axes.length > mapped.index) {
            pressed = (mapped.dir > 0) ? gp.axes[mapped.index] > 0.5 : gp.axes[mapped.index] < -0.5;
        } else if (mapped && mapped.type === 'pov' && gp.axes.length > mapped.index) {
            // PoV hat maps a single axis to a varying float value. It must match within a tiny margin of error.
            pressed = Math.abs(gp.axes[mapped.index] - mapped.value) < 0.05;
        }

        // Implicitly map standard d-pads and pov hats if not mapped directly for robustness
        if (!pressed) {
            // Standard D-Pad buttons
            if (action === 'left' && currentButtons[14]) pressed = true;
            if (action === 'right' && currentButtons[15]) pressed = true;
            if (action === 'up' && currentButtons[12]) pressed = true;
            if (action === 'down' && currentButtons[13]) pressed = true;

            // Common PoV Hat (Axis 9) fallback
            // Values: Top=-1.0, TR=-0.71, R=-0.42, BR=-0.14, B=0.14, BL=0.42, L=0.71, TL=1.0
            if (gp.axes.length > 9) {
                const val = gp.axes[9];
                if (val >= -1.1 && val <= 1.1) {
                    if (action === 'up' && (Math.abs(val - -1.0) < 0.1 || Math.abs(val - -0.71) < 0.1 || Math.abs(val - 1.0) < 0.1)) pressed = true;
                    if (action === 'right' && (Math.abs(val - -0.42) < 0.1 || Math.abs(val - -0.14) < 0.1 || Math.abs(val - -0.71) < 0.1)) pressed = true;
                    if (action === 'down' && (Math.abs(val - 0.14) < 0.1 || Math.abs(val - 0.42) < 0.1 || Math.abs(val - -0.14) < 0.1)) pressed = true;
                    if (action === 'left' && (Math.abs(val - 0.71) < 0.1 || Math.abs(val - 1.0) < 0.1 || Math.abs(val - 0.42) < 0.1)) pressed = true;
                }
            }
        }

        return pressed;
    };

    const currentStates = {
        left: checkPressed('left'),
        right: checkPressed('right'),
        down: checkPressed('down'),
        up: checkPressed('up'),
        rotateCW: checkPressed('rotateCW'),
        rotateCCW: checkPressed('rotateCCW'),
        hold: checkPressed('hold'),
        startBtn: currentButtons[9]
    };

    const isPressed = (action) => currentStates[action];
    const wasPressed = (action) => prevGamepadState[action];
    const justPressed = (action) => isPressed(action) && !wasPressed(action);

    // Single-fire actions
    if (justPressed('rotateCW')) { game.rotate(); game.draw(); }
    if (justPressed('rotateCCW')) { game.rotateCCW(); game.draw(); }
    if (justPressed('up')) { game.hardDrop(); game.draw(); dropCounter = 0; }
    if (justPressed('hold')) { game.holdPiece(); game.draw(); dropCounter = 0; }

    // Start button logic
    if (justPressed('startBtn')) {
        togglePause();
    }

    // Continuous/DAS actions (Left, Right, Down)
    const handleDAS = (action, moveFunc, isSoftDrop = false) => {
        if (justPressed(action)) {
            moveFunc();
            game.draw();
            dasTimers[action] = 0;
            if (isSoftDrop) dropCounter = 0;
        } else if (isPressed(action)) {
            dasTimers[action] += deltaTime;
            // If held longer than the initial delay
            if (dasTimers[action] > DAS_DELAY) {
                // If held longer than the repeat interval since last trigger
                if (dasTimers[action] > DAS_DELAY + DAS_REPEAT) {
                    moveFunc();
                    game.draw();
                    dasTimers[action] = DAS_DELAY; // Reset to just after delay to trigger next repeat
                    if (isSoftDrop) dropCounter = 0;
                }
            }
        } else {
            dasTimers[action] = 0; // Reset if released
        }
    };

    handleDAS('left', () => game.moveLeft());
    handleDAS('right', () => game.moveRight());
    handleDAS('down', () => game.moveDown(true), true);

    prevGamepadState = currentStates;
}

// --- Gamepad Settings UI ---
document.getElementById('btn-gamepad-settings').addEventListener('click', (e) => {
    e.stopPropagation(); // prevent startGame
    startScreen.classList.remove('active');
    gamepadSettingsScreen.classList.add('active');
});

document.getElementById('btn-save-mappings').addEventListener('click', () => {
    gamepadSettingsScreen.classList.remove('active');
    startScreen.classList.add('active');
    if (isRemapping) cancelRemapping();
});

document.querySelectorAll('.mapping-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        if (isRemapping) cancelRemapping();

        isRemapping = true;
        remappingAction = e.target.dataset.action;
        remappingButtonEl = e.target;

        remappingButtonEl.classList.add('listening');
        remappingButtonEl.innerText = "Press Btn...";

        startRemappingLoop();
    });
});

function formatMap(mapped) {
    if (typeof mapped === 'number') return `Btn ${mapped}`;
    if (mapped && mapped.type === 'axis') return `Axis ${mapped.index} ${mapped.dir > 0 ? '+' : '-'}`;
    if (mapped && mapped.type === 'pov') return `PoV ${mapped.value.toFixed(2)}`;
    return 'None';
}

function cancelRemapping() {
    isRemapping = false;
    cancelAnimationFrame(remappingLoopId);
    if (remappingButtonEl) {
        remappingButtonEl.classList.remove('listening');
        remappingButtonEl.innerText = formatMap(gamepadMappings[remappingAction]);
    }
    remappingAction = null;
    remappingButtonEl = null;
}

function finishRemap() {
    remappingButtonEl.classList.remove('listening');
    setTimeout(() => { isRemapping = false; }, 200); // Small timeout to prevent immediate re-triggering
    remappingAction = null;
    remappingButtonEl = null;
}

function startRemappingLoop() {
    const gamepads = navigator.getGamepads();
    const gp = gamepads[0];

    if (gp) {
        // Check buttons
        for (let i = 0; i < gp.buttons.length; i++) {
            if (gp.buttons[i].pressed) {
                // Found a pressed button!
                gamepadMappings[remappingAction] = i;
                remappingButtonEl.innerText = formatMap(i);
                finishRemap();
                return; // Stop looping
            }
        }

        // Only check for PoV Hats (Axis 9) - disable all other analog stick remapping completely
        if (gp.axes && gp.axes.length > 9) {
            const val = gp.axes[9];
            if (val > -1.1 && val < 1.1 && val !== Math.round(val) && Math.abs(val) > 0.05) {
                const mapping = { type: 'pov', index: 9, value: val };
                gamepadMappings[remappingAction] = mapping;
                remappingButtonEl.innerText = `PoV ${val.toFixed(2)}`;
                finishRemap();
                return;
            }
        }
    }
    remappingLoopId = requestAnimationFrame(startRemappingLoop);
}

document.addEventListener('keydown', () => audio.resume(), { once: true });
document.addEventListener('click', () => audio.resume(), { once: true });

// Click to start on overlays
startScreen.addEventListener('click', startGame);
gameOverScreen.addEventListener('click', startGame);

// Initial draw of the empty grid and overlays
renderer.drawGrid(game.getEmptyGrid());

// --- Global Menu Polling ---
// The main update() loop completely halts on the Start, Game Over, and Pause screens.
// This lightweight loop runs perpetually to allow the gamepad to start/unpause the game.
let lastMenuGamepadState = {};
function menuPollLoop() {
    requestAnimationFrame(menuPollLoop);

    if (isRemapping) return; // Don't interfere with the remapping listener

    const isStartOverlay = startScreen.classList.contains('active') || gameOverScreen.classList.contains('active');
    const isPaused = pauseScreen.classList.contains('active');

    if (!isStartOverlay && !isPaused) return; // If game is running normally, let update() handle everything

    const gamepads = navigator.getGamepads();
    const gp = gamepads[0];
    if (!gp) return;

    const checkBtn = (mappingCode) => {
        if (typeof mappingCode === 'number') {
            return gp.buttons[mappingCode]?.pressed;
        }
        return false;
    };

    const cw = checkBtn(gamepadMappings['rotateCW']);
    const ccw = checkBtn(gamepadMappings['rotateCCW']);
    const start = gp.buttons[9]?.pressed;

    const wasCW = lastMenuGamepadState['cw'];
    const wasCCW = lastMenuGamepadState['ccw'];
    const wasStart = lastMenuGamepadState['start'];

    const justPressed = (curr, prev) => curr && !prev;

    if (justPressed(cw, wasCW) || justPressed(ccw, wasCCW) || justPressed(start, wasStart)) {
        if (isStartOverlay) {
            startGame();
        } else if (isPaused) {
            togglePause();
        }
    }

    lastMenuGamepadState = { cw, ccw, start };
}
menuPollLoop();
