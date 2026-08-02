import { emptyInput, type InputState } from './types';

export type Action =
  | 'moveUp'
  | 'moveDown'
  | 'moveLeft'
  | 'moveRight'
  | 'pass'
  | 'shoot'
  | 'tackle'
  | 'jockey'
  | 'sprint'
  | 'cross'
  | 'through'
  | 'skill'
  | 'finesse'
  | 'cancel'
  | 'switchPlayer'
  | 'pause';

export interface ActionMeta {
  action: Action;
  label: string;
  description: string;
  /** Gamepad equivalent, shown alongside the key in the settings screen. */
  pad: string;
  group: 'Movement' | 'Attacking' | 'Defending' | 'System';
}

export const ACTIONS: ActionMeta[] = [
  { action: 'moveUp', label: 'Move Up', description: 'Run toward the far touchline', pad: 'D-Pad ↑', group: 'Movement' },
  { action: 'moveDown', label: 'Move Down', description: 'Run toward the near touchline', pad: 'D-Pad ↓', group: 'Movement' },
  { action: 'moveLeft', label: 'Move Left', description: 'Run left', pad: 'D-Pad ←', group: 'Movement' },
  { action: 'moveRight', label: 'Move Right', description: 'Run right', pad: 'D-Pad →', group: 'Movement' },
  { action: 'sprint', label: 'Sprint', description: 'Explosive pace — drains stamina fast', pad: 'RB', group: 'Movement' },
  { action: 'pass', label: 'Pass', description: 'Short ground pass to a teammate', pad: 'X', group: 'Attacking' },
  { action: 'shoot', label: 'Shoot', description: 'Hold to charge power, release to strike', pad: 'Y', group: 'Attacking' },
  { action: 'cross', label: 'Cross / Lob', description: 'Lofted ball into the box', pad: 'RT', group: 'Attacking' },
  { action: 'through', label: 'Through Ball', description: 'Weighted pass into space behind the line', pad: 'A', group: 'Attacking' },
  { action: 'finesse', label: 'Finesse Shot', description: 'Curled, placed shot — hold with Shoot', pad: 'RB + LB', group: 'Attacking' },
  { action: 'skill', label: 'Skill Move', description: 'Beat your marker — scales with dribbling', pad: 'LT', group: 'Attacking' },
  { action: 'tackle', label: 'Tackle', description: 'Time it right or give away a foul', pad: 'A', group: 'Defending' },
  { action: 'jockey', label: 'Jockey', description: 'Contain the attacker, stay goal-side', pad: 'LB', group: 'Defending' },
  { action: 'switchPlayer', label: 'Switch Player', description: 'Take control of the next nearest player', pad: 'L1', group: 'Defending' },
  { action: 'cancel', label: 'Cancel', description: 'Abort the current action', pad: 'B', group: 'System' },
  { action: 'pause', label: 'Pause', description: 'Open the pause menu', pad: 'Start', group: 'System' },
];

export type Bindings = Record<Action, string>;

/** FIFA-style defaults, matching the brief. */
export const DEFAULT_BINDINGS: Bindings = {
  moveUp: 'KeyW',
  moveDown: 'KeyS',
  moveLeft: 'KeyA',
  moveRight: 'KeyD',
  pass: 'Space',
  shoot: 'ShiftLeft',
  tackle: 'ControlLeft',
  jockey: 'KeyE',
  sprint: 'KeyQ',
  cross: 'KeyR',
  through: 'KeyT',
  skill: 'KeyG',
  finesse: 'KeyV',
  cancel: 'KeyF',
  switchPlayer: 'Tab',
  pause: 'Escape',
};

/** Simplified layout: arrows to move, fewer modifiers to hold. */
export const ARCADE_BINDINGS: Bindings = {
  ...DEFAULT_BINDINGS,
  moveUp: 'ArrowUp',
  moveDown: 'ArrowDown',
  moveLeft: 'ArrowLeft',
  moveRight: 'ArrowRight',
  pass: 'KeyZ',
  shoot: 'KeyX',
  tackle: 'KeyC',
  sprint: 'ShiftLeft',
};

/** Human-readable label for a KeyboardEvent.code. */
export function keyLabel(code: string): string {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Arrow')) return { Up: '↑', Down: '↓', Left: '←', Right: '→' }[code.slice(5)] ?? code;
  const named: Record<string, string> = {
    Space: 'Space',
    ShiftLeft: 'L Shift',
    ShiftRight: 'R Shift',
    ControlLeft: 'L Ctrl',
    ControlRight: 'R Ctrl',
    AltLeft: 'L Alt',
    AltRight: 'R Alt',
    Tab: 'Tab',
    Escape: 'Esc',
    Enter: 'Enter',
    Backspace: 'Bksp',
    MouseRight: 'R Click',
    MouseMiddle: 'M Click',
  };
  return named[code] ?? code;
}

/**
 * Translates raw keyboard/mouse/gamepad state into the engine's InputState.
 * Edge-triggered actions latch until the engine consumes them, so a fast tap
 * is never dropped between frames.
 */
export class InputController {
  bindings: Bindings;
  /** Extra assist and simplified charging. */
  arcade = false;
  private down = new Set<string>();
  private pressed = new Set<string>();
  private state: InputState = emptyInput();
  private padIndex: number | null = null;
  private listening = false;
  /** Raised when the pause key is tapped. */
  onPause: (() => void) | null = null;

  constructor(bindings: Bindings = DEFAULT_BINDINGS) {
    this.bindings = { ...bindings };
  }

  attach(target: HTMLElement | Window = window) {
    if (this.listening) return;
    this.listening = true;
    target.addEventListener('keydown', this.handleKeyDown as EventListener);
    target.addEventListener('keyup', this.handleKeyUp as EventListener);
    target.addEventListener('mousedown', this.handleMouseDown as EventListener);
    target.addEventListener('mouseup', this.handleMouseUp as EventListener);
    target.addEventListener('contextmenu', this.preventMenu as EventListener);
    window.addEventListener('blur', this.clear);
    window.addEventListener('gamepadconnected', this.handleGamepad as EventListener);
  }

  detach(target: HTMLElement | Window = window) {
    if (!this.listening) return;
    this.listening = false;
    target.removeEventListener('keydown', this.handleKeyDown as EventListener);
    target.removeEventListener('keyup', this.handleKeyUp as EventListener);
    target.removeEventListener('mousedown', this.handleMouseDown as EventListener);
    target.removeEventListener('mouseup', this.handleMouseUp as EventListener);
    target.removeEventListener('contextmenu', this.preventMenu as EventListener);
    window.removeEventListener('blur', this.clear);
    window.removeEventListener('gamepadconnected', this.handleGamepad as EventListener);
    this.clear();
  }

  private preventMenu = (e: Event) => e.preventDefault();

  private handleGamepad = (e: Event) => {
    this.padIndex = (e as GamepadEvent).gamepad.index;
  };

  private isBound(code: string): boolean {
    return Object.values(this.bindings).includes(code);
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (!this.isBound(e.code)) return;
    e.preventDefault();
    if (!this.down.has(e.code)) this.pressed.add(e.code);
    this.down.add(e.code);
    if (e.code === this.bindings.pause) this.onPause?.();
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    if (!this.isBound(e.code)) return;
    e.preventDefault();
    this.down.delete(e.code);
  };

  private handleMouseDown = (e: MouseEvent) => {
    const code = e.button === 2 ? 'MouseRight' : e.button === 1 ? 'MouseMiddle' : null;
    if (!code || !this.isBound(code)) return;
    e.preventDefault();
    if (!this.down.has(code)) this.pressed.add(code);
    this.down.add(code);
  };

  private handleMouseUp = (e: MouseEvent) => {
    const code = e.button === 2 ? 'MouseRight' : e.button === 1 ? 'MouseMiddle' : null;
    if (!code) return;
    this.down.delete(code);
  };

  private clear = () => {
    this.down.clear();
    this.pressed.clear();
  };

  /** Virtual buttons for the mobile on-screen pad. */
  setVirtual(action: Action, isDown: boolean) {
    const code = `virtual:${action}`;
    if (isDown) {
      if (!this.down.has(code)) this.pressed.add(code);
      this.down.add(code);
    } else {
      this.down.delete(code);
    }
  }

  private held(a: Action): boolean {
    return this.down.has(this.bindings[a]) || this.down.has(`virtual:${a}`);
  }

  private tapped(a: Action): boolean {
    return this.pressed.has(this.bindings[a]) || this.pressed.has(`virtual:${a}`);
  }

  /** Analogue stick override for the mobile joystick, in -1..1. */
  virtualStick: { x: number; y: number } | null = null;

  /**
   * Produce the frame's input. `shootReleased` fires on the transition from
   * held to not-held so charged shots work; in arcade mode a tap is enough.
   */
  poll(): InputState {
    const s = this.state;
    const prevShoot = s.shootHeld;

    let mx = (this.held('moveRight') ? 1 : 0) - (this.held('moveLeft') ? 1 : 0);
    let my = (this.held('moveDown') ? 1 : 0) - (this.held('moveUp') ? 1 : 0);

    if (this.virtualStick) {
      mx = this.virtualStick.x;
      my = this.virtualStick.y;
    }

    let sprint = this.held('sprint');
    let shoot = this.held('shoot');
    let tackle = this.held('tackle');
    let jockey = this.held('jockey');
    let pass = this.tapped('pass');
    let cross = this.tapped('cross');
    let through = this.tapped('through');
    let skill = this.tapped('skill');
    let switchPlayer = this.tapped('switchPlayer');
    let cancel = this.tapped('cancel');
    const finesse = this.held('finesse');

    // Gamepad overlay: sticks and face buttons on top of the keyboard state.
    const pad = this.readPad();
    if (pad) {
      if (Math.hypot(pad.lx, pad.ly) > 0.18) {
        mx = pad.lx;
        my = pad.ly;
      }
      sprint = sprint || pad.rb;
      shoot = shoot || pad.y;
      tackle = tackle || pad.a;
      jockey = jockey || pad.lb;
      pass = pass || pad.xTap;
      cross = cross || pad.rtTap;
      through = through || pad.aTap;
      skill = skill || pad.ltTap;
      switchPlayer = switchPlayer || pad.l3Tap;
      cancel = cancel || pad.bTap;
    }

    // Normalise diagonal movement so it isn't faster than orthogonal.
    const mag = Math.hypot(mx, my);
    if (mag > 1) {
      mx /= mag;
      my /= mag;
    }

    s.moveX = mx;
    s.moveY = my;
    s.sprint = sprint;
    s.jockey = jockey;
    s.tackleHeld = tackle;
    s.shootHeld = shoot;
    // Arcade: fire on press. Pro: fire on release, after charging.
    s.shootReleased = this.arcade ? this.tapped('shoot') || (pad?.yTap ?? false) : prevShoot && !shoot;
    s.pass = pass;
    s.cross = cross;
    s.through = through;
    s.skill = skill;
    s.finesse = finesse;
    s.cancel = cancel;
    s.switchPlayer = switchPlayer;

    this.pressed.clear();
    return s;
  }

  private padPrev = new Set<number>();

  private readPad() {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    const gp = (this.padIndex !== null ? pads[this.padIndex] : null) ?? pads.find((p) => p) ?? null;
    if (!gp) return null;

    const btn = (i: number) => gp.buttons[i]?.pressed ?? false;
    const tap = (i: number) => {
      const now = btn(i);
      const was = this.padPrev.has(i);
      if (now && !was) {
        this.padPrev.add(i);
        return true;
      }
      if (!now) this.padPrev.delete(i);
      return false;
    };

    const dz = (v: number) => (Math.abs(v) < 0.18 ? 0 : v);
    return {
      lx: dz(gp.axes[0] ?? 0),
      ly: dz(gp.axes[1] ?? 0),
      a: btn(0),
      aTap: tap(0),
      bTap: tap(1),
      xTap: tap(2),
      y: btn(3),
      yTap: tap(3),
      lb: btn(4),
      rb: btn(5),
      ltTap: tap(6),
      rtTap: tap(7),
      l3Tap: tap(10),
    };
  }
}
