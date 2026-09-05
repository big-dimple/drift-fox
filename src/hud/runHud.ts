/**
 * runHud.ts — the run presentation: gate counter, contextual center prompts
 * (start hint / frost-ready / fall), and the finish overlay with restart.
 * DOM only; the canvas stays the game's.
 */
import { PALETTE } from '../core/palette';

const CSS = `
#hud-run {
  position: fixed;
  left: 16px;
  top: 14px;
  color: ${PALETTE.uiTextCss};
  font-size: 15px;
  letter-spacing: 0.06em;
  text-shadow: 0 1px 3px rgba(16, 23, 58, 0.8);
  pointer-events: none;
  z-index: 5;
  line-height: 1.5;
}
#hud-run .gates { font-size: 20px; font-weight: bold; }
#hud-prompt {
  position: fixed;
  left: 50%;
  top: 22%;
  transform: translateX(-50%);
  color: ${PALETTE.uiTextCss};
  background: ${PALETTE.uiPanelCss};
  border: 2px solid ${PALETTE.iceGlowCss};
  border-radius: 10px;
  padding: 10px 22px;
  font-size: 17px;
  letter-spacing: 0.05em;
  white-space: nowrap;
  pointer-events: none;
  z-index: 6;
  transition: opacity 0.18s ease;
}
#hud-prompt.hidden { opacity: 0; }
#hud-end {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  background: rgba(7, 11, 33, 0.42);
  z-index: 8;
}
#hud-end.hidden { display: none; }
#hud-end .end-title {
  color: ${PALETTE.uiTextCss};
  font-size: 34px;
  letter-spacing: 0.12em;
  text-shadow: 0 2px 12px rgba(16, 23, 58, 0.9);
}
#hud-end .end-sub {
  color: ${PALETTE.iceGlowCss};
  font-size: 16px;
  letter-spacing: 0.06em;
}
#hud-end .end-btn {
  margin-top: 10px;
  padding: 12px 34px;
  font-size: 17px;
  letter-spacing: 0.1em;
  color: #0b1030;
  background: ${PALETTE.iceGlowCss};
  border: none;
  border-radius: 10px;
  cursor: pointer;
}
`;

export class RunHud {
  private readonly runEl: HTMLDivElement;
  private readonly promptEl: HTMLDivElement;
  private readonly endEl: HTMLDivElement;
  private readonly endTitle: HTMLDivElement;
  private readonly endSub: HTMLDivElement;
  private endShown = false;

  constructor(onRestart: () => void) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    this.runEl = document.createElement('div');
    this.runEl.id = 'hud-run';
    document.body.appendChild(this.runEl);

    this.promptEl = document.createElement('div');
    this.promptEl.id = 'hud-prompt';
    this.promptEl.className = 'hidden';
    document.body.appendChild(this.promptEl);

    this.endEl = document.createElement('div');
    this.endEl.id = 'hud-end';
    this.endEl.className = 'hidden';
    this.endTitle = document.createElement('div');
    this.endTitle.className = 'end-title';
    this.endSub = document.createElement('div');
    this.endSub.className = 'end-sub';
    const btn = document.createElement('button');
    btn.className = 'end-btn';
    btn.textContent = '再来一局';
    btn.addEventListener('click', onRestart);
    this.endEl.appendChild(this.endTitle);
    this.endEl.appendChild(this.endSub);
    this.endEl.appendChild(btn);
    document.body.appendChild(this.endEl);
  }

  /** Per-frame run presentation. */
  update(run: { gatesPassed: number; falls: number; finished: boolean; raceTime: number },
    frostReady: boolean, falling: boolean, onTouch = false): void {
    this.runEl.innerHTML =
      `<span class="gates">飞跃 ${run.gatesPassed}/5</span><br>` +
      `${run.raceTime.toFixed(1)}s${run.falls > 0 ? ` · 坠落 ${run.falls}` : ''}`;

    if (run.finished) {
      if (!this.endShown) {
        this.endShown = true;
        this.endTitle.textContent = '全程通关！';
        this.endSub.textContent = `5 个飞跃点 · 用时 ${run.raceTime.toFixed(1)}s · 坠落 ${run.falls} 次`;
        this.endEl.classList.remove('hidden');
      }
    } else {
      this.endShown = false;
      this.endEl.classList.add('hidden');
    }

    let prompt = '';
    if (falling) prompt = '坠落！回到上一个飞跃点';
    else if (frostReady) prompt = '寒气已满——冲门飞跃！';
    else if (run.raceTime < 6 && run.gatesPassed === 0) {
      prompt = onTouch
        ? '左半屏滑动转向 · 右半屏按住漂移蓄寒气'
        : '按住 Shift 抓地漂移蓄寒气 · A/D 转向';
    }
    if (prompt) {
      this.promptEl.textContent = prompt;
      this.promptEl.classList.remove('hidden');
    } else {
      this.promptEl.classList.add('hidden');
    }
  }
}
