import { CONFIG } from '../config.js';
import type { GameMap, Position } from './types.js';

export function createStandardMap(): GameMap {
  const width = CONFIG.MAP_WIDTH;
  const height = CONFIG.MAP_HEIGHT;
  const grid: number[][] = [];

  for (let y = 0; y < height; y++) {
    const row: number[] = [];
    for (let x = 0; x < width; x++) {
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        row.push(1);
      } else {
        row.push(0);
      }
    }
    grid.push(row);
  }

  const spawns = [
    { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 },
    { x: width - 2, y: 1 }, { x: width - 3, y: 1 }, { x: width - 2, y: 2 },
    { x: 1, y: height - 2 }, { x: 2, y: height - 2 }, { x: 1, y: height - 3 },
    { x: width - 2, y: height - 2 }, { x: width - 3, y: height - 2 }, { x: width - 2, y: height - 3 }
  ];

  const isNearSpawn = (x: number, y: number): boolean => {
    return spawns.some((s) => Math.abs(s.x - x) <= 1 && Math.abs(s.y - y) <= 1);
  };

  for (let y = 2; y < height - 2; y++) {
    for (let x = 2; x < width - 2; x++) {
      if (isNearSpawn(x, y)) continue;

      if (x % 2 === 0 && y % 2 === 0) {
        grid[y][x] = 1;
      } else if ((x + y) % 3 === 0 || (x * y) % 5 === 0) {
        grid[y][x] = 2;
      }
    }
  }

  const midX = Math.floor(width / 2);
  const midY = Math.floor(height / 2);
  grid[midY][midX] = 0;
  grid[midY - 1][midX] = 2;
  grid[midY + 1][midX] = 2;
  grid[midY][midX - 1] = 2;
  grid[midY][midX + 1] = 2;

  return {
    width,
    height,
    tileSize: CONFIG.TILE_SIZE,
    grid
  };
}

export function getSpawnPositions(): Position[] {
  const ts = CONFIG.TILE_SIZE;
  const offset = ts / 2;
  const w = CONFIG.MAP_WIDTH;
  const h = CONFIG.MAP_HEIGHT;

  return [
    { x: 1 * ts + offset, y: 1 * ts + offset },
    { x: (w - 2) * ts + offset, y: 1 * ts + offset },
    { x: 1 * ts + offset, y: (h - 2) * ts + offset },
    { x: (w - 2) * ts + offset, y: (h - 2) * ts + offset },
    { x: Math.floor(w / 2) * ts + offset, y: 1 * ts + offset },
    { x: Math.floor(w / 2) * ts + offset, y: (h - 2) * ts + offset }
  ];
}

export function destroyWall(grid: number[][], tileX: number, tileY: number): boolean {
  if (tileY < 0 || tileY >= grid.length || tileX < 0 || tileX >= grid[0].length) {
    return false;
  }
  if (grid[tileY][tileX] === 2) {
    grid[tileY][tileX] = 0;
    return true;
  }
  return false;
}
