export const COLS = 10;
export const ROWS = 20;
export const BLOCK_SIZE = 30; // 30px per block

// Define colors in HSL for vibrant neon effects
export const COLORS = {
  0: null, // Empty
  1: { h: 180, s: 100, l: 50 }, // Cyan (I)
  2: { h: 240, s: 100, l: 60 }, // Blue (J)
  3: { h: 30,  s: 100, l: 50 }, // Orange (L)
  4: { h: 60,  s: 100, l: 50 }, // Yellow (O)
  5: { h: 120, s: 100, l: 40 }, // Green (S)
  6: { h: 280, s: 100, l: 60 }, // Purple (T)
  7: { h: 0,   s: 100, l: 50 }, // Red (Z)
};

export const SHAPES = [
  [], // 0 is empty
  // 1: I piece
  [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0]
  ],
  // 2: J piece
  [
    [2, 0, 0],
    [2, 2, 2],
    [0, 0, 0]
  ],
  // 3: L piece
  [
    [0, 0, 3],
    [3, 3, 3],
    [0, 0, 0]
  ],
  // 4: O piece
  [
    [4, 4],
    [4, 4]
  ],
  // 5: S piece
  [
    [0, 5, 5],
    [5, 5, 0],
    [0, 0, 0]
  ],
  // 6: T piece
  [
    [0, 6, 0],
    [6, 6, 6],
    [0, 0, 0]
  ],
  // 7: Z piece
  [
    [7, 7, 0],
    [0, 7, 7],
    [0, 0, 0]
  ]
];
