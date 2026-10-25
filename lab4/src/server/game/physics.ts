import { CONFIG } from '../config.js';
import type { Direction, Position, Tank } from './types.js';

export interface BoundingBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export function getTankBox(x: number, y: number, size = CONFIG.TANK_SIZE): BoundingBox {
  const half = size / 2;
  return {
    left: x - half,
    right: x + half,
    top: y - half,
    bottom: y + half
  };
}

export function getTileBox(tileX: number, tileY: number, tileSize = CONFIG.TILE_SIZE): BoundingBox {
  return {
    left: tileX * tileSize,
    right: (tileX + 1) * tileSize,
    top: tileY * tileSize,
    bottom: (tileY + 1) * tileSize
  };
}

export function checkAABB(a: BoundingBox, b: BoundingBox): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

export function isTileBlocked(grid: number[][], tileX: number, tileY: number): boolean {
  if (tileY < 0 || tileY >= grid.length || tileX < 0 || tileX >= grid[0].length) {
    return true;
  }
  return grid[tileY][tileX] !== 0;
}

export function checkWallCollision(grid: number[][], box: BoundingBox): boolean {
  const ts = CONFIG.TILE_SIZE;
  const minTileX = Math.floor(box.left / ts);
  const maxTileX = Math.floor(box.right / ts);
  const minTileY = Math.floor(box.top / ts);
  const maxTileY = Math.floor(box.bottom / ts);

  for (let ty = minTileY; ty <= maxTileY; ty++) {
    for (let tx = minTileX; tx <= maxTileX; tx++) {
      if (isTileBlocked(grid, tx, ty)) {
        return true;
      }
    }
  }

  return false;
}

export function checkTankTankCollision(tankId: string, box: BoundingBox, otherTanks: Tank[]): boolean {
  for (const other of otherTanks) {
    if (other.id === tankId || !other.isAlive) continue;
    const otherBox = getTankBox(other.x, other.y);
    if (checkAABB(box, otherBox)) {
      return true;
    }
  }
  return false;
}

export function getDirectionVector(dir: Direction): Position {
  switch (dir) {
    case 'UP':
      return { x: 0, y: -1 };
    case 'RIGHT':
      return { x: 1, y: 0 };
    case 'DOWN':
      return { x: 0, y: 1 };
    case 'LEFT':
      return { x: -1, y: 0 };
  }
}

export function moveWithSlide(
  currentX: number,
  currentY: number,
  deltaX: number,
  deltaY: number,
  grid: number[][],
  tankId: string,
  otherTanks: Tank[]
): Position {
  let targetX = currentX + deltaX;
  let targetY = currentY + deltaY;

  const fullBox = getTankBox(targetX, targetY);
  if (!checkWallCollision(grid, fullBox) && !checkTankTankCollision(tankId, fullBox, otherTanks)) {
    return { x: targetX, y: targetY };
  }

  const xOnlyBox = getTankBox(targetX, currentY);
  if (!checkWallCollision(grid, xOnlyBox) && !checkTankTankCollision(tankId, xOnlyBox, otherTanks)) {
    return { x: targetX, y: currentY };
  }

  const yOnlyBox = getTankBox(currentX, targetY);
  if (!checkWallCollision(grid, yOnlyBox) && !checkTankTankCollision(tankId, yOnlyBox, otherTanks)) {
    return { x: currentX, y: targetY };
  }

  return { x: currentX, y: currentY };
}
