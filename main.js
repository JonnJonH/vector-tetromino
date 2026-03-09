import { Game } from './game.js';
import { Renderer } from './renderer.js';
import { AudioFx } from './audio.js';

const APP_STATES = {
    START: 'start',
    PLAYING: 'playing',
    PAUSED: 'paused',
    GAMEOVER: 'gameover',
    REMAPPING: 'remapping'
};
let appState = APP_STATES.START;

const renderer = new Renderer('game-canvas', 'next-canvas', 'hold-canvas');
const audio = new AudioFx();

const scoreValEl = document.getElementById('score-val');
const linesValEl = document.getElementById('lines-val');
const levelValEl = document.getElementById('level-val');
const statCountEls = {};
for (let i = 1; i <= 7; i++) {
    statCountEls[i] = document.getElementById(`stat-count-${i}`);
}

function handleStatsChange(stats) {
    scoreValEl.innerText = stats.score;
    linesValEl.innerText = stats.lines;
    levelValEl.innerText = stats.level;
}

function handlePieceStatsChange(pieceCounts) {
    for (let i = 1; i <= 7; i++) {
        statCountEls[i].innerText = pieceCounts[i].toString().padStart(3, '0');
    }
}

const game = new Game(renderer, audio, handleStatsChange, handlePieceStatsChange);

if (import.meta.env?.DEV) {
    window.game = game; // Exposed for debugging
    window.renderer = renderer; // Exposed for debugging
}

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

let remappingAction = null;
let remappingButtonEl = null;

function mainLoop(time) {
    requestID = requestAnimationFrame(mainLoop);

    if (!lastTime) lastTime = time;
    const deltaTime = time - lastTime;
    lastTime = time;

    switch (appState) {
        case APP_STATES.REMAPPING:
            updateRemapping();
            break;
        case APP_STATES.PLAYING:
            pollGamepad(deltaTime);
            updatePlaying(deltaTime);
            break;
        case APP_STATES.START:
        case APP_STATES.PAUSED:
        case APP_STATES.GAMEOVER:
            pollMenuGamepad();
            break;
    }
}

function updatePlaying(deltaTime) {
    if (game.gameOver) {
        handleGameOver();
        return;
    }

    dropCounter += deltaTime;

    const LEVEL_SPEEDS = [
        887, 820, 753, 686, 619, 552, 469, 368, 285, 184,
        167, 151, 134, 117, 100, 100, 84, 84, 67, 67, 50
    ];

    const speedIndex = Math.min(game.level - 1, LEVEL_SPEEDS.length - 1);
    dropInterval = LEVEL_SPEEDS[speedIndex];

    if (dropCounter > dropInterval) {
        game.moveDown();
        dropCounter = 0;
    }

    game.update(deltaTime);
    game.draw();
}

function handleGameOver() {
    audio.stopBGM();
    appState = APP_STATES.GAMEOVER;
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
    appState = APP_STATES.PLAYING;
    game.isPaused = false;
}

function togglePause() {
    if (appState === APP_STATES.GAMEOVER || appState === APP_STATES.START || appState === APP_STATES.REMAPPING) return;

    if (appState === APP_STATES.PLAYING) {
        appState = APP_STATES.PAUSED;
        game.isPaused = true;
        audio.pauseBGM();
        pauseScreen.classList.add('active');
    } else if (appState === APP_STATES.PAUSED) {
        appState = APP_STATES.PLAYING;
        game.isPaused = false;
        audio.resumeBGM();
        pauseScreen.classList.remove('active');
        lastTime = performance.now();
    }
}

document.addEventListener('keydown', event => {
    if (appState === APP_STATES.START || appState === APP_STATES.GAMEOVER) {
        if (event.code === 'Space') {
            startGame();
        }
        return;
    }

    if (event.code === 'Escape' || event.code === 'KeyP') {
        togglePause();
        return;
    }

    if (appState !== APP_STATES.PLAYING) return;

    if (event.repeat) {
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

    game.draw();
});

// --- Gamepad Logic ---
function pollGamepad(deltaTime) {
    const gamepads = navigator.getGamepads();
    const gp = gamepads[0];

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
            pressed = Math.abs(gp.axes[mapped.index] - mapped.value) < 0.05;
        }

        if (!pressed) {
            if (action === 'left' && currentButtons[14]) pressed = true;
            if (action === 'right' && currentButtons[15]) pressed = true;
            if (action === 'up' && currentButtons[12]) pressed = true;
            if (action === 'down' && currentButtons[13]) pressed = true;

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

    if (justPressed('rotateCW')) { game.rotate(); game.draw(); }
    if (justPressed('rotateCCW')) { game.rotateCCW(); game.draw(); }
    if (justPressed('up')) { game.hardDrop(); game.draw(); dropCounter = 0; }
    if (justPressed('hold')) { game.holdPiece(); game.draw(); dropCounter = 0; }

    if (justPressed('startBtn')) {
        togglePause();
    }

    const handleDAS = (action, moveFunc, isSoftDrop = false) => {
        if (justPressed(action)) {
            moveFunc();
            game.draw();
            dasTimers[action] = 0;
            if (isSoftDrop) dropCounter = 0;
        } else if (isPressed(action)) {
            dasTimers[action] += deltaTime;
            if (dasTimers[action] > DAS_DELAY) {
                if (dasTimers[action] > DAS_DELAY + DAS_REPEAT) {
                    moveFunc();
                    game.draw();
                    dasTimers[action] = DAS_DELAY;
                    if (isSoftDrop) dropCounter = 0;
                }
            }
        } else {
            dasTimers[action] = 0;
        }
    };

    handleDAS('left', () => game.moveLeft());
    handleDAS('right', () => game.moveRight());
    handleDAS('down', () => game.moveDown(true), true);

    prevGamepadState = currentStates;
}

// --- Menu Polling ---
let lastMenuGamepadState = {};
function pollMenuGamepad() {
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
        if (appState === APP_STATES.START || appState === APP_STATES.GAMEOVER) {
            startGame();
        } else if (appState === APP_STATES.PAUSED) {
            togglePause();
        }
    }

    lastMenuGamepadState = { cw, ccw, start };
}

// --- Gamepad Settings UI ---
document.getElementById('btn-gamepad-settings').addEventListener('click', (e) => {
    e.stopPropagation(); // prevent startGame
    appState = APP_STATES.REMAPPING;
    startScreen.classList.remove('active');
    gamepadSettingsScreen.classList.add('active');
});

document.getElementById('btn-save-mappings').addEventListener('click', () => {
    gamepadSettingsScreen.classList.remove('active');
    startScreen.classList.add('active');
    if (remappingButtonEl) cancelRemapping();
    appState = APP_STATES.START;
});

document.querySelectorAll('.mapping-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        if (remappingButtonEl) cancelRemapping();

        remappingAction = e.target.dataset.action;
        remappingButtonEl = e.target;

        remappingButtonEl.classList.add('listening');
        remappingButtonEl.innerText = "Press Btn...";
    });
});

function formatMap(mapped) {
    if (typeof mapped === 'number') return `Btn ${mapped}`;
    if (mapped && mapped.type === 'axis') return `Axis ${mapped.index} ${mapped.dir > 0 ? '+' : '-'}`;
    if (mapped && mapped.type === 'pov') return `PoV ${mapped.value.toFixed(2)}`;
    return 'None';
}

function cancelRemapping() {
    if (remappingButtonEl) {
        remappingButtonEl.classList.remove('listening');
        remappingButtonEl.innerText = formatMap(gamepadMappings[remappingAction]);
    }
    remappingAction = null;
    remappingButtonEl = null;
}

function finishRemap() {
    remappingButtonEl.classList.remove('listening');
    // Prevent immediate re-triggering with a slight delay if necessary,
    // although clearing it right away should be fine because it won't check again next frame
    remappingAction = null;
    remappingButtonEl = null;
}

function updateRemapping() {
    if (!remappingButtonEl) return;

    const gamepads = navigator.getGamepads();
    const gp = gamepads[0];

    if (gp) {
        for (let i = 0; i < gp.buttons.length; i++) {
            if (gp.buttons[i].pressed) {
                gamepadMappings[remappingAction] = i;
                remappingButtonEl.innerText = formatMap(i);
                finishRemap();
                return;
            }
        }

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
}

document.addEventListener('keydown', () => audio.resume(), { once: true });
document.addEventListener('click', () => audio.resume(), { once: true });

startScreen.addEventListener('click', () => {
    if (appState === APP_STATES.START) startGame();
});
gameOverScreen.addEventListener('click', () => {
    if (appState === APP_STATES.GAMEOVER) startGame();
});

renderer.drawGrid(game.getEmptyGrid());

// Start the loop
requestID = requestAnimationFrame(mainLoop);
