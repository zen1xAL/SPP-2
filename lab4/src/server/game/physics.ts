import { CONFIG } from '../config.js';
import type { Direction, Position, Tank } from './types.js';

export const COLLISION_CONFIG = {
  TANK_BOX_SIZE: 26,
  CORNER_ASSIST_PX: 14,
  EPSILON: 0.001
};

export interface BoundingBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export function getTankBox(x: number, y: number, size = COLLISION_CONFIG.TANK_BOX_SIZE): BoundingBox {
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
  const eps = COLLISION_CONFIG.EPSILON;
  const minTileX = Math.floor((box.left + eps) / ts);
  const maxTileX = Math.floor((box.right - eps) / ts);
  const minTileY = Math.floor((box.top + eps) / ts);
  const maxTileY = Math.floor((box.bottom - eps) / ts);

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
  const ts = CONFIG.TILE_SIZE;
  const currentBox = getTankBox(currentX, currentY);
  const alreadyInTankCollision = checkTankTankCollision(tankId, currentBox, otherTanks);

  const canMoveTo = (box: BoundingBox, tx: number, ty: number): boolean => {
    if (checkWallCollision(grid, box)) return false;
    if (!alreadyInTankCollision) {
      return !checkTankTankCollision(tankId, box, otherTanks);
    }
    for (const other of otherTanks) {
      if (other.id === tankId || !other.isAlive) continue;
      const otherBox = getTankBox(other.x, other.y);
      if (checkAABB(currentBox, otherBox)) {
        const curDist = Math.hypot(other.x - currentX, other.y - currentY);
        const newDist = Math.hypot(other.x - tx, other.y - ty);
        if (newDist <= curDist) return false;
      }
    }
    return true;
  };

  const targetX = currentX + deltaX;
  const targetY = currentY + deltaY;

  const fullBox = getTankBox(targetX, targetY);
  if (canMoveTo(fullBox, targetX, targetY)) {
    return { x: targetX, y: targetY };
  }

  if (deltaX !== 0 && deltaY !== 0) {
    const xOnlyBox = getTankBox(targetX, currentY);
    if (canMoveTo(xOnlyBox, targetX, currentY)) {
      return { x: targetX, y: currentY };
    }
    const yOnlyBox = getTankBox(currentX, targetY);
    if (canMoveTo(yOnlyBox, currentX, targetY)) {
      return { x: currentX, y: targetY };
    }
  }

  const cornerAssistPx = COLLISION_CONFIG.CORNER_ASSIST_PX;

  if (deltaY !== 0 && deltaX === 0) {
    const currentTileX = Math.floor(currentX / ts);
    const candidateColumns = [
      (currentTileX + 0.5) * ts,
      (currentTileX - 1 + 0.5) * ts,
      (currentTileX + 1 + 0.5) * ts
    ].sort((a, b) => Math.abs(a - currentX) - Math.abs(b - currentX));

    for (const candX of candidateColumns) {
      const dist = Math.abs(candX - currentX);
      if (dist <= cornerAssistPx) {
        const candVerticalBox = getTankBox(candX, targetY);
        if (canMoveTo(candVerticalBox, candX, targetY)) {
          const maxSlide = Math.abs(deltaY);
          const nudge = Math.sign(candX - currentX) * Math.min(dist, maxSlide);
          const newX = currentX + nudge;

          const testFull = getTankBox(newX, targetY);
          if (canMoveTo(testFull, newX, targetY)) {
            return { x: newX, y: targetY };
          }
          const testSlideX = getTankBox(newX, currentY);
          if (canMoveTo(testSlideX, newX, currentY)) {
            return { x: newX, y: currentY };
          }
        }
      }
    }
  }

  if (deltaX !== 0 && deltaY === 0) {
    const currentTileY = Math.floor(currentY / ts);
    const candidateRows = [
      (currentTileY + 0.5) * ts,
      (currentTileY - 1 + 0.5) * ts,
      (currentTileY + 1 + 0.5) * ts
    ].sort((a, b) => Math.abs(a - currentY) - Math.abs(b - currentY));

    for (const candY of candidateRows) {
      const dist = Math.abs(candY - currentY);
      if (dist <= cornerAssistPx) {
        const candHorizontalBox = getTankBox(targetX, candY);
        if (canMoveTo(candHorizontalBox, targetX, candY)) {
          const maxSlide = Math.abs(deltaX);
          const nudge = Math.sign(candY - currentY) * Math.min(dist, maxSlide);
          const newY = currentY + nudge;

          const testFull = getTankBox(targetX, newY);
          if (canMoveTo(testFull, targetX, newY)) {
            return { x: targetX, y: newY };
          }
          const testSlideY = getTankBox(currentX, newY);
          if (canMoveTo(testSlideY, currentX, newY)) {
            return { x: currentX, y: newY };
          }
        }
      }
    }
  }

  const xOnlyBox = getTankBox(targetX, currentY);
  if (canMoveTo(xOnlyBox, targetX, currentY)) {
    return { x: targetX, y: currentY };
  }

  const yOnlyBox = getTankBox(currentX, targetY);
  if (canMoveTo(yOnlyBox, currentX, targetY)) {
    return { x: currentX, y: targetY };
  }

  return { x: currentX, y: currentY };
}

