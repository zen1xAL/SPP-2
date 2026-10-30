import { CONFIG } from '../config.js';
import type { Direction, Position, Tank } from './types.js';
import { DIRECTION_VECTORS } from './constants.js';

export const COLLISION_CONFIG = {
  TANK_BOX_SIZE: 26,
  CORNER_ASSIST_PX: 14,
  EPSILON: 0.001
} as const;

export interface BoundingBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export function getTankBox(
  x: number,
  y: number,
  size = COLLISION_CONFIG.TANK_BOX_SIZE
): BoundingBox {
  const half = size / 2;
  return {
    left: x - half,
    right: x + half,
    top: y - half,
    bottom: y + half
  };
}

export function getTileBox(
  tileX: number,
  tileY: number,
  tileSize = CONFIG.TILE_SIZE
): BoundingBox {
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

export function checkTankTankCollision(
  tankId: string,
  box: BoundingBox,
  otherTanks: Tank[]
): boolean {
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
  return DIRECTION_VECTORS[dir];
}

function evaluateCornerAssist(
  mainDelta: number,
  crossCoord: number,
  currentMain: number,
  targetMain: number,
  ts: number,
  isVertical: boolean,
  canMoveTo: (box: BoundingBox, x: number, y: number) => boolean
): Position | null {
  const currentTileCross = Math.floor(crossCoord / ts);
  const candidates = [
    (currentTileCross + 0.5) * ts,
    (currentTileCross - 1 + 0.5) * ts,
    (currentTileCross + 1 + 0.5) * ts
  ].sort((a, b) => Math.abs(a - crossCoord) - Math.abs(b - crossCoord));

  for (const candCross of candidates) {
    const dist = Math.abs(candCross - crossCoord);
    if (dist > COLLISION_CONFIG.CORNER_ASSIST_PX) continue;

    const testX = isVertical ? candCross : targetMain;
    const testY = isVertical ? targetMain : candCross;
    const candBox = getTankBox(testX, testY);

    if (canMoveTo(candBox, testX, testY)) {
      const maxSlide = Math.abs(mainDelta);
      const nudge = Math.sign(candCross - crossCoord) * Math.min(dist, maxSlide);
      const newCross = crossCoord + nudge;

      const fullX = isVertical ? newCross : targetMain;
      const fullY = isVertical ? targetMain : newCross;
      const testFull = getTankBox(fullX, fullY);
      if (canMoveTo(testFull, fullX, fullY)) {
        return { x: fullX, y: fullY };
      }

      const slideX = isVertical ? newCross : currentMain;
      const slideY = isVertical ? currentMain : newCross;
      const testSlide = getTankBox(slideX, slideY);
      if (canMoveTo(testSlide, slideX, slideY)) {
        return { x: slideX, y: slideY };
      }
    }
  }

  return null;
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
  const alreadyInTankCollision = checkTankTankCollision(
    tankId,
    currentBox,
    otherTanks
  );

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

  if (deltaY !== 0 && deltaX === 0) {
    const verticalAssist = evaluateCornerAssist(
      deltaY,
      currentX,
      currentY,
      targetY,
      ts,
      true,
      canMoveTo
    );
    if (verticalAssist) {
      return verticalAssist;
    }
  }

  if (deltaX !== 0 && deltaY === 0) {
    const horizontalAssist = evaluateCornerAssist(
      deltaX,
      currentY,
      currentX,
      targetX,
      ts,
      false,
      canMoveTo
    );
    if (horizontalAssist) {
      return horizontalAssist;
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
