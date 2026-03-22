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

const p1Renderer = new Renderer('p1-game-canvas', 'p1-next-canvas', 'p1-hold-canvas');
const p2Renderer = new Renderer('p2-game-canvas', 'p2-next-canvas', 'p2-hold-canvas');
const audio = new AudioFx();

function getStatsElements(prefix) {
    const scoreValEl = document.getElementById(`${prefix}-score-val`);
    const linesValEl = document.getElementById(`${prefix}-lines-val`);
    const levelValEl = document.getElementById(`${prefix}-level-val`);
    const statCountEls = {};
    for (let i = 1; i <= 7; i++) {
        statCountEls[i] = document.getElementById(`${prefix}-stat-count-${i}`);
    }
    return { scoreValEl, linesValEl, levelValEl, statCountEls };
}

const p1Els = getStatsElements('p1');
const p2Els = getStatsElements('p2');

function createStatsHandler(els) {
    return (stats) => {
        els.scoreValEl.innerText = stats.score;
        els.linesValEl.innerText = stats.lines;
        els.levelValEl.innerText = stats.level;
    };
}

function createPieceStatsHandler(els) {
    return (pieceCounts) => {
        for (let i = 1; i <= 7; i++) {
            els.statCountEls[i].innerText = pieceCounts[i].toString().padStart(3, '0');
        }
    };
}

let p1Game, p2Game;

// onAttack callback will trigger garbage reception on the OTHER player
// onWin callback triggers Game Over with the given loser index (if P1 wins, P2 loses => 2)
p1Game = new Game(p1Renderer, audio,
    createStatsHandler(p1Els),
    createPieceStatsHandler(p1Els),
    (amount) => { if (p2Game) p2Game.receiveGarbage(amount); },
    () => handleGameOver(2)
);

p2Game = new Game(p2Renderer, audio,
    createStatsHandler(p2Els),
    createPieceStatsHandler(p2Els),
    (amount) => { if (p1Game) p1Game.receiveGarbage(amount); },
    () => handleGameOver(1)
);

if (import.meta.env?.DEV) {
    window.p1Game = p1Game; // Exposed for debugging
    window.p2Game = p2Game; // Exposed for debugging
}

let p1DropCounter = 0;
let p2DropCounter = 0;
let lastTime = 0;
let requestID;

const startScreen = document.getElementById('start-screen');
const pauseScreen = document.getElementById('pause-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const gamepadSettingsScreen = document.getElementById('gamepad-settings-screen');
const p1FinalScoreVal = document.getElementById('p1-final-score-val');
const p2FinalScoreVal = document.getElementById('p2-final-score-val');
const winnerText = document.getElementById('winner-text');

let gamepadMappings = {
    left: 14, right: 15, down: 13, up: 12,
    rotateCW: 1, rotateCCW: 0, hold: 4
};
let prevGamepadStateP1 = {};
let prevGamepadStateP2 = {};
let dasTimersP1 = { left: 0, right: 0, down: 0 };
let dasTimersP2 = { left: 0, right: 0, down: 0 };
const GAMEPAD_DAS_DELAY_MS = 233; // TGM 14 frames
const GAMEPAD_ARR_MS = 17; // TGM 1 frame
const AXIS_PRESS_THRESHOLD = 0.55;
const AXIS_RELEASE_THRESHOLD = 0.40;

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

function updatePlayer(gameInstance, dropObj, deltaTime, isP1) {
    if (gameInstance.gameOver) {
        handleGameOver(isP1 ? 1 : 2);
        return;
    }

    dropObj.val += deltaTime;

    const LEVEL_SPEEDS = [
        887, 820, 753, 686, 619, 552, 469, 368, 285, 184,
        167, 151, 134, 117, 100, 100, 84, 84, 67, 67, 50
    ];

    const speedIndex = Math.min(gameInstance.level - 1, LEVEL_SPEEDS.length - 1);
    const dropInterval = LEVEL_SPEEDS[speedIndex];

    if (dropObj.val > dropInterval) {
        gameInstance.moveDown();
        dropObj.val = 0;
    }

    gameInstance.update(deltaTime);
    gameInstance.draw();
}

function updatePlaying(deltaTime) {
    let p1DropObj = { val: p1DropCounter };
    updatePlayer(p1Game, p1DropObj, deltaTime, true);
    p1DropCounter = p1DropObj.val;

    if (appState !== APP_STATES.PLAYING) return;

    let p2DropObj = { val: p2DropCounter };
    updatePlayer(p2Game, p2DropObj, deltaTime, false);
    p2DropCounter = p2DropObj.val;
}

function handleGameOver(loserIndex) {
    audio.stopBGM();
    appState = APP_STATES.GAMEOVER;
    gameOverScreen.classList.add('active');
    p1FinalScoreVal.innerText = p1Game.score;
    p2FinalScoreVal.innerText = p2Game.score;

    if (loserIndex === 1) {
        winnerText.innerText = 'PROF K WINS!';
        winnerText.style.color = '#aa00ff';
    } else {
        winnerText.innerText = 'JONNJON WINS!';
        winnerText.style.color = '#ff6600';
    }
}

function startGame() {
    audio.resume();
    audio.startBGM();
    startScreen.classList.remove('active');
    gameOverScreen.classList.remove('active');
    pauseScreen.classList.remove('active');

    p1Game.reset();
    p2Game.reset();
    p1DropCounter = 0;
    p2DropCounter = 0;
    lastTime = performance.now();
    appState = APP_STATES.PLAYING;
    p1Game.isPaused = false;
    p2Game.isPaused = false;
}

function togglePause() {
    if (appState === APP_STATES.GAMEOVER || appState === APP_STATES.START || appState === APP_STATES.REMAPPING) return;

    if (appState === APP_STATES.PLAYING) {
        appState = APP_STATES.PAUSED;
        p1Game.isPaused = true;
        p2Game.isPaused = true;
        audio.pauseBGM();
        pauseScreen.classList.add('active');
    } else if (appState === APP_STATES.PAUSED) {
        appState = APP_STATES.PLAYING;
        p1Game.isPaused = false;
        p2Game.isPaused = false;
        audio.resumeBGM();
        pauseScreen.classList.remove('active');
        lastTime = performance.now();
    }
}

// Keyboard primarily controls Player 1
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

    if (['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', ' ', 'z', 'Z', 'Enter', 'Shift', 'c', 'C'].includes(event.key)) {
        event.preventDefault(); // Prevents "Enter" or "Space" from clicking focused buttons (like the Start button)
    }

    if (event.repeat) {
        if (event.code === 'ArrowUp' || event.key === 'Enter' || event.key === 'Shift' || event.key === 'c' || event.key === 'C' || event.code === 'Space' || event.key === 'z' || event.key === 'Z') {
            return;
        }
    }

    switch (event.key) {
        case 'ArrowLeft':
            p1Game.moveLeft();
            break;
        case 'ArrowRight':
            p1Game.moveRight();
            break;
        case 'ArrowDown':
            p1Game.moveDown(true);
            p1DropCounter = 0;
            break;
        case 'ArrowUp':
            p1Game.hardDrop();
            p1DropCounter = 0;
            break;
        case ' ': // Space
            p1Game.rotate();
            break;
        case 'z':
        case 'Z':
            p1Game.rotateCCW();
            break;
        case 'Enter':
        case 'Shift':
        case 'c':
        case 'C':
            p1Game.holdPiece();
            p1DropCounter = 0;
            break;
    }

    p1Game.draw();
});

// --- Gamepad Logic ---
function getActiveGamepads() {
    return Array.from(navigator.getGamepads()).filter(gp => gp !== null && gp.connected);
}

function pollGamepadDevice(gp, gameInstance, prevStates, dasTimers, dropCounterObj, deltaTime, isP1) {
    const currentButtons = gp.buttons.map(b => b.pressed);

    const checkPressed = (action) => {
        let mapped = gamepadMappings[action];
        let pressed = false;
        let hasValidMapping = false;

        if (typeof mapped === 'number' && mapped < gp.buttons.length) {
            pressed = currentButtons[mapped];
            hasValidMapping = true;
        } else if (mapped && mapped.type === 'axis' && gp.axes.length > mapped.index) {
            let axisVal = gp.axes[mapped.index];
            let val = mapped.dir > 0 ? axisVal : -axisVal;
            let wasAxisPressed = prevStates[`${action}Axis`] || false;
            
            if (wasAxisPressed) {
                pressed = val > AXIS_RELEASE_THRESHOLD;
            } else {
                pressed = val > AXIS_PRESS_THRESHOLD;
            }
            prevStates[`${action}Axis`] = pressed;
            hasValidMapping = true;
        } else if (mapped && mapped.type === 'pov' && gp.axes.length > mapped.index) {
            pressed = Math.abs(gp.axes[mapped.index] - mapped.value) < 0.05;
            hasValidMapping = true;
        }

        if (!hasValidMapping && !pressed) {
            if (action === 'left' && currentButtons[14]) pressed = true;
            if (action === 'right' && currentButtons[15]) pressed = true;
            if (action === 'up' && currentButtons[12]) pressed = true;
            if (action === 'down' && currentButtons[13]) pressed = true;

            // Standard fallback: left/right bumpers (4/5) and triggers (6/7) trigger hold if not mapped
            if (action === 'hold' && (currentButtons[4] || currentButtons[5] || currentButtons[6] || currentButtons[7])) pressed = true;

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
    const wasPressed = (action) => prevStates[action] || false;
    const justPressed = (action) => isPressed(action) && !wasPressed(action);

    if (justPressed('rotateCW')) { gameInstance.rotate(); }
    if (justPressed('rotateCCW')) { gameInstance.rotateCCW(); }
    if (justPressed('up')) { gameInstance.hardDrop(); dropCounterObj.val = 0; }
    if (justPressed('hold')) { gameInstance.holdPiece(); dropCounterObj.val = 0; }

    if (justPressed('startBtn')) {
        togglePause();
    }

    const handleDAS = (action, moveFunc, isSoftDrop = false) => {
        if (justPressed(action)) {
            moveFunc();
            dasTimers[action] = 0;
            if (isSoftDrop) dropCounterObj.val = 0;
        } else if (isPressed(action)) {
            dasTimers[action] += deltaTime;
            let activeTime = dasTimers[action] - GAMEPAD_DAS_DELAY_MS;
            let prevTime = dasTimers[action] - deltaTime;
            let prevActiveTime = prevTime - GAMEPAD_DAS_DELAY_MS;
            
            if (activeTime >= 0) {
                let repeats = 0;
                if (prevActiveTime < 0) {
                    repeats = Math.floor(activeTime / GAMEPAD_ARR_MS) + 1;
                } else {
                    repeats = Math.floor(activeTime / GAMEPAD_ARR_MS) - Math.floor(prevActiveTime / GAMEPAD_ARR_MS);
                }
                for (let i = 0; i < repeats; i++) {
                    moveFunc();
                }
                if (repeats > 0 && isSoftDrop) dropCounterObj.val = 0;
            }
        } else {
            dasTimers[action] = 0;
        }
    };

    handleDAS('left', () => gameInstance.moveLeft());
    handleDAS('right', () => gameInstance.moveRight());
    handleDAS('down', () => gameInstance.moveDown(true), true);

    // Write back to the global prev state array reference
    Object.assign(prevStates, currentStates);
}

function pollGamepad(deltaTime) {
    const activeGamepads = getActiveGamepads();

    // Process Controller 1 (Player 1)
    if (activeGamepads[0]) {
        let p1DropObj = { val: p1DropCounter };
        pollGamepadDevice(activeGamepads[0], p1Game, prevGamepadStateP1, dasTimersP1, p1DropObj, deltaTime, true);
        p1DropCounter = p1DropObj.val;
    }

    // Process Controller 2 (Player 2)
    if (activeGamepads[1]) {
        let p2DropObj = { val: p2DropCounter };
        pollGamepadDevice(activeGamepads[1], p2Game, prevGamepadStateP2, dasTimersP2, p2DropObj, deltaTime, false);
        p2DropCounter = p2DropObj.val;
    }
}

// --- Menu Polling ---
let lastMenuGamepadState = {};
function pollMenuGamepad() {
    const activeGamepads = getActiveGamepads();
    if (activeGamepads.length === 0) return;

    let cw = false, ccw = false, start = false;

    for (const gp of activeGamepads) {
        if (!gp) continue;
        const checkBtn = (mappingCode) => {
            if (typeof mappingCode === 'number') {
                return gp.buttons[mappingCode]?.pressed;
            }
            return false;
        };

        if (checkBtn(gamepadMappings['rotateCW'])) cw = true;
        if (checkBtn(gamepadMappings['rotateCCW'])) ccw = true;

        // Let Start button (9), Check button (0), or Cancel button (1) wake up / start game
        if (gp.buttons[9]?.pressed || gp.buttons[0]?.pressed || gp.buttons[1]?.pressed) start = true;
    }

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
    e.stopPropagation();
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
    remappingAction = null;
    remappingButtonEl = null;
}

function updateRemapping() {
    if (!remappingButtonEl) return;

    const activeGamepads = getActiveGamepads();

    for (const gp of activeGamepads) {
        if (!gp) continue;
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

p1Renderer.drawGrid(p1Game.getEmptyGrid());
p2Renderer.drawGrid(p2Game.getEmptyGrid());

// Start the loop
requestID = requestAnimationFrame(mainLoop);

// --- Responsive Window Scaling ---
function updateScale() {
    const container = document.querySelector('.game-container');
    if (!container) return;

    // Reset transform to measure intrinsic width/height accurately
    container.style.transform = 'none';

    // Measure the raw, unscaled layout size
    const naturalWidth = container.offsetWidth;
    const naturalHeight = container.offsetHeight;

    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    // Calculate scale to fit within the viewport window, retaining a 4% pad
    const scale = Math.min(
        windowWidth / naturalWidth,
        windowHeight / naturalHeight
    ) * 0.96;

    // Apply the scale back to the container
    container.style.transform = `scale(${scale})`;
}

window.addEventListener('resize', updateScale);
// Call after initial layout tick
setTimeout(updateScale, 0);
