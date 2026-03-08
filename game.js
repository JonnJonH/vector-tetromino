import { COLS, ROWS, SHAPES } from './tetrominos.js';

export class Game {
    constructor(renderer, audio) {
        this.renderer = renderer;
        this.audio = audio;
        this.reset();
    }

    reset() {
        this.grid = this.getEmptyGrid();
        this.score = 0;
        this.lines = 0;
        this.level = 1;
        this.gameOver = false;
        this.isPaused = false;
        this.activePiece = null;
        this.heldPieceType = null;
        this.nextPieceType = this.randomPiece();
        this.pieceCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };
        this.lockDelayActive = false;
        this.lockDelayTimer = 0;
        this.LOCK_DELAY_MS = 500;
        this.renderer.clearHold();
        this.spawnPiece();
        this.updateStats();
    }

    getEmptyGrid() {
        return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    }

    randomPiece() {
        return Math.floor(Math.random() * 7) + 1; // 1 to 7
    }

    spawnPiece() {
        const typeId = this.nextPieceType;
        this.activePiece = {
            typeId: typeId,
            shape: SHAPES[typeId],
            x: Math.floor(COLS / 2) - Math.floor(SHAPES[typeId][0].length / 2),
            y: 0
        };

        // Track stats
        this.pieceCounts[typeId]++;
        this.updatePieceStats();

        this.nextPieceType = this.randomPiece();
        this.renderer.drawNextPiece(this.nextPieceType, SHAPES[this.nextPieceType]);
        this.canHold = true;
        this.hasHardDropped = false;
        this.lockDelayActive = false;
        this.lockDelayTimer = 0;

        if (this.checkCollision(this.activePiece.x, this.activePiece.y, this.activePiece.shape)) {
            this.gameOver = true;
            this.audio.gameOver();
        }
    }

    checkCollision(x, y, shape) {
        for (let r = 0; r < shape.length; r++) {
            for (let c = 0; c < shape[r].length; c++) {
                if (shape[r][c] !== 0) {
                    let newX = x + c;
                    let newY = y + r;

                    if (newX < 0 || newX >= COLS || newY >= ROWS) return true; // Wall/Floor
                    if (newY >= 0 && this.grid[newY][newX] !== 0) return true; // Other blocks
                }
            }
        }
        return false;
    }

    moveLeft() {
        if (this.hasHardDropped) return;
        if (!this.checkCollision(this.activePiece.x - 1, this.activePiece.y, this.activePiece.shape)) {
            this.activePiece.x--;
            this.audio.move();
            if (this.lockDelayActive) this.lockDelayTimer = 0;
        }
    }

    moveRight() {
        if (this.hasHardDropped) return;
        if (!this.checkCollision(this.activePiece.x + 1, this.activePiece.y, this.activePiece.shape)) {
            this.activePiece.x++;
            this.audio.move();
            if (this.lockDelayActive) this.lockDelayTimer = 0;
        }
    }

    moveDown(isSoftDrop = false) {
        if (!this.checkCollision(this.activePiece.x, this.activePiece.y + 1, this.activePiece.shape)) {
            this.activePiece.y++;
            if (isSoftDrop) this.audio.softDrop();
            return true;
        }

        // Block hit bottom or another block
        if (!this.lockDelayActive) {
            this.lockDelayActive = true;
            this.lockDelayTimer = 0;
        } else if (isSoftDrop) {
            // "Down" flick to cement in place
            this.lockPiece();
        }
        return false;
    }

    hardDrop() {
        if (this.hasHardDropped) return;

        this.hasHardDropped = true;
        this.audio.hardDrop();
        const ghost = this.getGhostPosition();
        this.activePiece.y = ghost.y;
        this.lockDelayActive = true;
        this.lockDelayTimer = 0;
    }

    holdPiece() {
        if (!this.canHold) return;

        if (this.heldPieceType === null) {
            this.heldPieceType = this.activePiece.typeId;
            this.renderer.drawHoldPiece(this.heldPieceType, SHAPES[this.heldPieceType]);
            this.activePiece = null;
            this.spawnPiece();
        } else {
            const temp = this.activePiece.typeId;

            this.activePiece = {
                typeId: this.heldPieceType,
                shape: SHAPES[this.heldPieceType],
                x: Math.floor(COLS / 2) - Math.floor(SHAPES[this.heldPieceType][0].length / 2),
                y: 0
            };

            this.heldPieceType = temp;
            this.renderer.drawHoldPiece(this.heldPieceType, SHAPES[this.heldPieceType]);

            if (this.checkCollision(this.activePiece.x, this.activePiece.y, this.activePiece.shape)) {
                this.gameOver = true;
                this.audio.gameOver();
            }
        }

        this.audio.hold();
        this.canHold = false;
        this.hasHardDropped = false;
    }

    rotate() { // Clockwise
        const shape = this.activePiece.shape;
        const rows = shape.length;
        const cols = shape[0].length;
        const rotated = [];

        for (let i = 0; i < cols; i++) {
            const row = [];
            for (let j = rows - 1; j >= 0; j--) {
                row.push(shape[j][i]);
            }
            rotated.push(row);
        }

        this.applyRotation(rotated);
    }

    rotateCCW() { // Anti-Clockwise
        const shape = this.activePiece.shape;
        const rows = shape.length;
        const cols = shape[0].length;
        const rotated = [];

        for (let i = cols - 1; i >= 0; i--) {
            const row = [];
            for (let j = 0; j < rows; j++) {
                row.push(shape[j][i]);
            }
            rotated.push(row);
        }

        this.applyRotation(rotated);
    }

    applyRotation(rotatedShape) {
        let newX = this.activePiece.x;
        let newY = this.activePiece.y;

        // Try rotation at current position
        if (!this.checkCollision(newX, newY, rotatedShape)) {
            this.commitRotation(rotatedShape, newX, newY);
            return;
        }

        // Wall Kicks (Right, Left, Right x2, Left x2)
        if (!this.checkCollision(newX + 1, newY, rotatedShape)) {
            this.commitRotation(rotatedShape, newX + 1, newY);
            return;
        }
        if (!this.checkCollision(newX - 1, newY, rotatedShape)) {
            this.commitRotation(rotatedShape, newX - 1, newY);
            return;
        }
        if (!this.checkCollision(newX + 2, newY, rotatedShape)) {
            this.commitRotation(rotatedShape, newX + 2, newY);
            return;
        }
        if (!this.checkCollision(newX - 2, newY, rotatedShape)) {
            this.commitRotation(rotatedShape, newX - 2, newY);
            return;
        }

        // If all kicks fail, rotation fails. Do NOT play sound or reset lock delay.
    }

    commitRotation(rotatedShape, newX, newY) {
        this.activePiece.shape = rotatedShape;
        this.activePiece.x = newX;
        this.activePiece.y = newY;
        this.audio.rotate();

        // Only reset lock delay if rotation was successful and we are resting on something
        if (this.lockDelayActive) {
            this.lockDelayTimer = 0;
        }
    }

    getGhostPosition() {
        let ghostY = this.activePiece.y;
        while (!this.checkCollision(this.activePiece.x, ghostY + 1, this.activePiece.shape)) {
            ghostY++;
        }
        return { ...this.activePiece, y: ghostY };
    }

    lockPiece() {
        this.activePiece.shape.forEach((row, r) => {
            row.forEach((value, c) => {
                if (value !== 0) {
                    if (this.activePiece.y + r < 0) {
                        this.gameOver = true;
                    } else {
                        this.grid[this.activePiece.y + r][this.activePiece.x + c] = value;
                    }
                }
            });
        });

        this.audio.lock();

        if (!this.gameOver) {
            this.clearLines();
            this.spawnPiece();
        }
    }

    clearLines() {
        let linesCleared = 0;

        for (let r = ROWS - 1; r >= 0; r--) {
            if (this.grid[r].every(value => value !== 0)) {
                // Line is full
                this.grid.splice(r, 1);
                this.grid.unshift(Array(COLS).fill(0));
                linesCleared++;
                r++; // check the same row index again because lines shifted down
            }
        }

        if (linesCleared > 0) {
            if (linesCleared === 4) {
                this.audio.tetrisClear();
            } else {
                this.audio.clear();
            }
            this.lines += linesCleared;
            const points = [0, 100, 300, 500, 800];
            this.score += points[linesCleared] * this.level;

            const oldLevel = this.level;
            this.level = Math.floor(this.lines / 10) + 1;

            if (this.level > oldLevel) {
                this.audio.levelUp();
            }

            this.updateStats();
        }
    }

    updateStats() {
        document.getElementById('score-val').innerText = this.score;
        document.getElementById('lines-val').innerText = this.lines;
        document.getElementById('level-val').innerText = this.level;
    }

    updatePieceStats() {
        for (let i = 1; i <= 7; i++) {
            const countStr = this.pieceCounts[i].toString().padStart(3, '0');
            document.getElementById(`stat-count-${i}`).innerText = countStr;
        }
    }

    update(deltaTime) {
        if (this.isPaused || this.gameOver) return;

        if (this.lockDelayActive) {
            this.lockDelayTimer += deltaTime;
            if (this.lockDelayTimer >= this.LOCK_DELAY_MS) {
                this.lockPiece();
            }
        }
    }

    draw() {
        this.renderer.clear();
        this.renderer.drawGrid(this.grid);
        if (this.activePiece && !this.gameOver) {
            // Draw ghost piece
            const ghost = this.getGhostPosition();
            this.renderer.drawPiece(ghost, true);
            // Draw active piece
            this.renderer.drawPiece(this.activePiece, false);
        }
    }
}
