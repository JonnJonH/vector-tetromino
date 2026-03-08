import { BLOCK_SIZE, COLORS, COLS, ROWS } from './tetrominos.js';

export class Renderer {
    constructor(canvasId, nextCanvasId, holdCanvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.nextCanvas = document.getElementById(nextCanvasId);
        this.nextCtx = this.nextCanvas.getContext('2d');
        this.holdCanvas = document.getElementById(holdCanvasId);
        this.holdCtx = this.holdCanvas.getContext('2d');
    }

    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    clearNext() {
        this.nextCtx.clearRect(0, 0, this.nextCanvas.width, this.nextCanvas.height);
    }

    clearHold() {
        this.holdCtx.clearRect(0, 0, this.holdCanvas.width, this.holdCanvas.height);
    }

    drawBlock(ctx, x, y, colorCode, isGhost = false) {
        if (!colorCode || colorCode === 0) return;

        const color = COLORS[colorCode];
        if (!color) return;

        const fillStyle = `hsla(${color.h}, ${color.s}%, ${color.l}%, ${isGhost ? 0.3 : 1})`;
        const strokeStyle = `hsla(${color.h}, ${color.s}%, ${color.l + 20}%, ${isGhost ? 0.5 : 1})`;

        ctx.save();

        // Draw base fill
        ctx.fillStyle = fillStyle;
        ctx.fillRect(x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);

        // Draw vector styling (inner stroke, gradient look)
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = 2;
        // Inside stroke
        ctx.strokeRect(x * BLOCK_SIZE + 1, y * BLOCK_SIZE + 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2);

        // Add specular highlight (vector gradient trick)
        ctx.fillStyle = `rgba(255,255,255,${isGhost ? 0.1 : 0.4})`;
        ctx.beginPath();
        ctx.moveTo(x * BLOCK_SIZE, y * BLOCK_SIZE);
        ctx.lineTo(x * BLOCK_SIZE + BLOCK_SIZE, y * BLOCK_SIZE);
        ctx.lineTo(x * BLOCK_SIZE + BLOCK_SIZE - 5, y * BLOCK_SIZE + 5);
        ctx.lineTo(x * BLOCK_SIZE + 5, y * BLOCK_SIZE + 5);
        ctx.fill();

        // Add neon glow only for solid blocks
        if (!isGhost) {
            ctx.shadowBlur = 15;
            ctx.shadowColor = `hsl(${color.h}, ${color.s}%, 50%)`;
            // Draw a thin border to trigger the glow
            ctx.strokeRect(x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
        }

        ctx.restore();
    }

    drawGrid(grid) {
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (grid[r][c] !== 0) {
                    this.drawBlock(this.ctx, c, r, grid[r][c]);
                }
            }
        }
    }

    drawPiece(piece, isGhost = false) {
        piece.shape.forEach((row, r) => {
            row.forEach((value, c) => {
                if (value > 0) {
                    this.drawBlock(this.ctx, piece.x + c, piece.y + r, piece.typeId, isGhost);
                }
            });
        });
    }

    drawPreviewPiece(ctx, canvas, typeId, shape) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (!typeId || typeId === 0) return;

        const blockSz = 25; // slightly smaller blocks for the preview
        const offsetX = (canvas.width - shape[0].length * blockSz) / 2;
        const offsetY = (canvas.height - shape.length * blockSz) / 2;

        shape.forEach((row, r) => {
            row.forEach((value, c) => {
                if (value > 0) {
                    const color = COLORS[typeId];
                    const x = offsetX + c * blockSz;
                    const y = offsetY + r * blockSz;

                    ctx.save();
                    ctx.fillStyle = `hsl(${color.h}, ${color.s}%, ${color.l}%)`;
                    ctx.fillRect(x, y, blockSz, blockSz);

                    ctx.strokeStyle = `hsl(${color.h}, ${color.s}%, ${color.l + 20}%)`;
                    ctx.lineWidth = 2;
                    ctx.strokeRect(x + 1, y + 1, blockSz - 2, blockSz - 2);

                    ctx.shadowBlur = 10;
                    ctx.shadowColor = `hsl(${color.h}, ${color.s}%, 50%)`;
                    ctx.strokeRect(x, y, blockSz, blockSz);
                    ctx.restore();
                }
            });
        });
    }

    drawNextPiece(typeId, shape) {
        this.drawPreviewPiece(this.nextCtx, this.nextCanvas, typeId, shape);
    }

    drawHoldPiece(typeId, shape) {
        this.drawPreviewPiece(this.holdCtx, this.holdCanvas, typeId, shape);
    }
}
