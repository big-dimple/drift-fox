/**
 * touchInput.ts — mobile touch controls: left half steers (relative
 * horizontal drag), right half holds drift. Activates on first touch and
 * wins over keyboard while active. Values shape-match the parts of
 * BoatInput the fox reads.
 */
export class TouchInput {
  private steerVal = 0;
  private driftHeld = false;
  private steerTouch: number | null = null;
  private driftTouch: number | null = null;
  private steerStartX = 0;
  /** True once any touch has been seen this session. */
  active = false;

  constructor() {
    window.addEventListener('touchstart', (e) => {
      this.active = true;
      for (const t of Array.from(e.changedTouches)) {
        if (t.clientX < window.innerWidth / 2 && this.steerTouch === null) {
          this.steerTouch = t.identifier;
          this.steerStartX = t.clientX;
          this.steerVal = 0;
        } else if (t.clientX >= window.innerWidth / 2 && this.driftTouch === null) {
          this.driftTouch = t.identifier;
          this.driftHeld = true;
        }
      }
    }, { passive: true });
    window.addEventListener('touchmove', (e) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.steerTouch) {
          this.steerVal = Math.max(-1, Math.min(1, (t.clientX - this.steerStartX) / 70));
        }
      }
    }, { passive: true });
    const end = (e: TouchEvent): void => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.steerTouch) {
          this.steerTouch = null;
          this.steerVal = 0;
        }
        if (t.identifier === this.driftTouch) {
          this.driftTouch = null;
          this.driftHeld = false;
        }
      }
    };
    window.addEventListener('touchend', end, { passive: true });
    window.addEventListener('touchcancel', end, { passive: true });
  }

  /** The touch-driving input, or null when no finger is down. */
  read(): { steer: number; drift: boolean } | null {
    if (this.steerTouch === null && this.driftTouch === null) return null;
    return { steer: this.steerVal, drift: this.driftHeld };
  }
}
