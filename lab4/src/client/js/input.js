export class InputController {
  constructor() {
    this.keysDown = new Set();
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
        this.updateMovement();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keysDown.delete(e.key.toLowerCase());
      this.updateMovement();
    });

    window.addEventListener('blur', () => {
      this.keysDown.clear();
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
    const k = key.toLowerCase();
    if (k === 'w' || k === 'arrowup') return 'UP';
    if (k === 's' || k === 'arrowdown') return 'DOWN';
    if (k === 'a' || k === 'arrowleft') return 'LEFT';
    if (k === 'd' || k === 'arrowright') return 'RIGHT';
    return null;
  }

  updateMovement() {
    let nextDir = null;

    if (this.keysDown.has('w') || this.keysDown.has('arrowup')) nextDir = 'UP';
    else if (this.keysDown.has('s') || this.keysDown.has('arrowdown')) nextDir = 'DOWN';
    else if (this.keysDown.has('a') || this.keysDown.has('arrowleft')) nextDir = 'LEFT';
    else if (this.keysDown.has('d') || this.keysDown.has('arrowright')) nextDir = 'RIGHT';

    if (this.activeTouchDir) {
      nextDir = this.activeTouchDir;
    }

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
        if (navigator.vibrate) navigator.vibrate(10);
      };

      const handleRelease = (e) => {
        e.preventDefault();
        btn.classList.remove('active');
        if (this.activeTouchDir === dir) {
          this.activeTouchDir = null;
          this.updateMovement();
        }
      };

      btn.addEventListener('touchstart', handlePress, { passive: false });
      btn.addEventListener('touchend', handleRelease, { passive: false });
      btn.addEventListener('touchcancel', handleRelease, { passive: false });
      btn.addEventListener('mousedown', handlePress);
      btn.addEventListener('mouseup', handleRelease);
      btn.addEventListener('mouseleave', handleRelease);
    });

    const fireBtn = document.getElementById('touchFire');
    if (fireBtn) {
      const handleFire = (e) => {
        e.preventDefault();
        fireBtn.classList.add('active');
        if (this.onFireCallback) this.onFireCallback();
        if (navigator.vibrate) navigator.vibrate(25);
        setTimeout(() => fireBtn.classList.remove('active'), 120);
      };

      fireBtn.addEventListener('touchstart', handleFire, { passive: false });
      fireBtn.addEventListener('mousedown', handleFire);
    }
  }
}
