/**
 * frostHud.ts — the minimal frost-charge slot (寒气槽). M1 placeholder:
 * one bottom-center bar; full charge reads as a pulsing cyan glow. M2 grows
 * the leap cue; M4 completes the HUD set.
 */

const CSS = `
#hud-frost {
  position: fixed;
  left: 50%;
  bottom: 26px;
  transform: translateX(-50%);
  width: min(320px, 52vw);
  height: 14px;
  border: 2px solid rgba(16, 23, 58, 0.85);
  border-radius: 8px;
  background: rgba(16, 23, 58, 0.55);
  overflow: hidden;
  pointer-events: none;
  z-index: 5;
}
#hud-frost .frost-fill {
  height: 100%;
  width: 0%;
  background: linear-gradient(90deg, #2e7ec0, #8ff4ff);
  transition: none;
}
#hud-frost.full {
  animation: frost-pulse 0.9s ease-in-out infinite;
  border-color: #8ff4ff;
}
@keyframes frost-pulse {
  0%, 100% { box-shadow: 0 0 4px rgba(143, 244, 255, 0.5); }
  50% { box-shadow: 0 0 16px rgba(143, 244, 255, 0.95); }
}
`;

export class FrostHud {
  private readonly fill: HTMLDivElement;
  private readonly rootEl: HTMLDivElement;

  constructor() {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.rootEl = document.createElement('div');
    this.rootEl.id = 'hud-frost';
    this.fill = document.createElement('div');
    this.fill.className = 'frost-fill';
    this.rootEl.appendChild(this.fill);
    document.body.appendChild(this.rootEl);
  }

  update(frost: number): void {
    const v = Math.max(0, Math.min(1, frost));
    this.fill.style.width = `${(v * 100).toFixed(1)}%`;
    this.rootEl.classList.toggle('full', v >= 0.98);
  }
}
