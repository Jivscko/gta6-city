// Keyboard and mouse state for the game: held keys, one-frame presses, and the pointer's position
// in canvas pixels. Nothing here knows what the keys mean; the player and menus decide that.

const BLOCK_DEFAULT = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyQ', 'KeyR', 'KeyM',
  'Digit1', 'Digit2', 'Digit3', 'ShiftLeft', 'ShiftRight',
]);

export class Input {
  constructor() {
    this.keys = new Set();
    this.pressedKeys = new Set();
    this.mouse = { x: 0, y: 0, down: false, pressed: false, released: false, wheel: 0 };
    this.canvas = null;
    this._bind();
  }

  _bind() {
    window.addEventListener('keydown', (event) => {
      if (event.repeat) {
        if (BLOCK_DEFAULT.has(event.code)) event.preventDefault();
        return;
      }
      this.keys.add(event.code);
      this.pressedKeys.add(event.code);
      if (BLOCK_DEFAULT.has(event.code)) event.preventDefault();
    });
    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.down = false;
    });
  }

  attach(canvas) {
    this.canvas = canvas;
    const update = (event) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / Math.max(1, rect.width);
      const scaleY = canvas.height / Math.max(1, rect.height);
      this.mouse.x = (event.clientX - rect.left) * scaleX;
      this.mouse.y = (event.clientY - rect.top) * scaleY;
    };
    canvas.addEventListener('mousemove', update);
    canvas.addEventListener('mousedown', (event) => {
      if (event.button !== 0) return;
      update(event);
      this.mouse.down = true;
      this.mouse.pressed = true;
      canvas.focus();
    });
    window.addEventListener('mouseup', (event) => {
      if (event.button !== 0) return;
      this.mouse.down = false;
      this.mouse.released = true;
    });
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    canvas.addEventListener('wheel', (event) => {
      this.mouse.wheel += Math.sign(event.deltaY);
      event.preventDefault();
    }, { passive: false });
  }

  /** Is a key held right now? Takes KeyboardEvent.code names. */
  held(code) {
    return this.keys.has(code);
  }

  /** Was a key pressed this frame? Consumes nothing; call endFrame once per frame. */
  pressed(code) {
    return this.pressedKeys.has(code);
  }

  /** Movement axis from WASD and the arrow keys. */
  moveAxis() {
    const x = (this.held('KeyD') || this.held('ArrowRight') ? 1 : 0) - (this.held('KeyA') || this.held('ArrowLeft') ? 1 : 0);
    const y = (this.held('KeyS') || this.held('ArrowDown') ? 1 : 0) - (this.held('KeyW') || this.held('ArrowUp') ? 1 : 0);
    const len = Math.hypot(x, y) || 1;
    return { x: x / len, y: y / len, any: x !== 0 || y !== 0 };
  }

  get sprinting() {
    return this.held('ShiftLeft') || this.held('ShiftRight');
  }

  /** Call at the end of every frame to clear one-shot presses. */
  endFrame() {
    this.pressedKeys.clear();
    this.mouse.pressed = false;
    this.mouse.released = false;
    this.mouse.wheel = 0;
  }
}
