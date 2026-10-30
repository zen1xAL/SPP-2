import { KEY_DIRECTION_MAP } from './constants.js';

export class InputController {
  constructor() {
    this.keysDown = new Set();
    this.keyStack = [];
    this.currentDirection = 'UP';
    this.isMoving = false;
    this.sequence = 0;
    this.onMoveCallback = null;
    this.onFireCallback = null;
    this.activeTouchDir = null;

    this.initKeyboard();
    this.initTouch();
  }

  setCallbacks({ onMove, onFire }) {
    this.onMoveCallback = onMove;
    this.onFireCallback = onFire;
  }

  initKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
      }

      if (e.repeat) return;

      if (e.key === ' ' || e.code === 'Space') {
        if (this.onFireCallback) this.onFireCallback();
        return;
      }

      const dir = this.keyToDirection(e.key);
      if (dir) {
        this.keysDown.add(e.key.toLowerCase());
        this.keyStack = this.keyStack.filter((d) => d !== dir);
        this.keyStack.push(dir);
        this.updateMovement();
      }
    });

    window.addEventListener('keyup', (e) => {
      const dir = this.keyToDirection(e.key);
      this.keysDown.delete(e.key.toLowerCase());
      if (dir) {
        this.keyStack = this.keyStack.filter((d) => d !== dir);
      }
      this.updateMovement();
    });

    window.addEventListener('blur', () => {
      this.keysDown.clear();
      this.keyStack = [];
      this.activeTouchDir = null;
      this.updateMovement();
    });

    const canvas = document.getElementById('gameCanvas');
    if (canvas) {
      canvas.addEventListener('mousedown', (e) => {
        if (e.button === 0 && this.onFireCallback) {
          this.onFireCallback();
        }
      });
    }
  }

  keyToDirection(key) {
    return KEY_DIRECTION_MAP[key.toLowerCase()] || null;
  }

  updateMovement() {
    const nextDir = this.activeTouchDir || (this.keyStack.length > 0 ? this.keyStack[this.keyStack.length - 1] : null);
    const wasMoving = this.isMoving;
    const prevDir = this.currentDirection;

    if (nextDir) {
      this.currentDirection = nextDir;
      this.isMoving = true;
    } else {
      this.isMoving = false;
    }

    if ((wasMoving !== this.isMoving || prevDir !== this.currentDirection) && this.onMoveCallback) {
      this.sequence += 1;
      this.onMoveCallback(this.currentDirection, this.isMoving, this.sequence);
    }
  }

  initTouch() {
    const dpadButtons = document.querySelectorAll('.dpad-btn');
    dpadButtons.forEach((btn) => {
      const dir = btn.getAttribute('data-dir');

      const handlePress = (e) => {
        e.preventDefault();
        btn.classList.add('active');
        this.activeTouchDir = dir;
        this.updateMovement();
      };

      const handleRelease = (e) => {
        e.preventDefault();
        btn.classList.remove('active');
        if (this.activeTouchDir === dir) {
          this.activeTouchDir = null;
          this.updateMovement();
        }
      };

      btn.addEventListener('pointerdown', handlePress);
      btn.addEventListener('pointerup', handleRelease);
      btn.addEventListener('pointercancel', handleRelease);
      btn.addEventListener('pointerleave', handleRelease);
    });

    const fireBtn = document.getElementById('touchFire');
    if (fireBtn) {
      const handleFire = (e) => {
        e.preventDefault();
        fireBtn.classList.add('active');
        if (this.onFireCallback) this.onFireCallback();
        if (navigator.vibrate) {
          try { navigator.vibrate(15); } catch {}
        }
        setTimeout(() => fireBtn.classList.remove('active'), 120);
      };

      fireBtn.addEventListener('pointerdown', handleFire);
    }
  }
}
