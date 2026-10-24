import { CONFIG } from './config.js';

class DebugManager {
  constructor() {
    this.logs = [];
    this.maxLogs = 250;
    this.speedMultiplier = 1.0;
    this.targetFPS = CONFIG.targetFPS;
    this.viewEl = null;

    // Автоматический перехват любых JS-ошибок
    window.addEventListener('error', e => {
      this.log('ERROR', `${e.message} (${e.filename}:${e.lineno})`);
    });
    window.addEventListener('unhandledrejection', e => {
      this.log('PROMISE_ERR', String(e.reason));
    });
  }

  log(tag, message) {
    const now = new Date();
    const time = now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0');
    const line = `[${time}] [${tag}] ${message}`;
    this.logs.push(line);
    if (this.logs.length > this.maxLogs) this.logs.shift();
    if (this.viewEl && this.viewEl.offsetParent !== null) {
      this.refreshView();
    }
  }

  refreshView() {
    if (!this.viewEl) this.viewEl = document.getElementById('dbg-log-view');
    if (this.viewEl) {
      this.viewEl.value = this.logs.join('\n');
      this.viewEl.scrollTop = this.viewEl.scrollHeight;
    }
  }

  clear() {
    this.logs = [];
    this.log('INFO', 'Журнал логов очищен');
    this.refreshView();
  }

  downloadTxt() {
    const blob = new Blob([this.logs.join('\n')], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `liminal-gothic-log-${Date.now()}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
}

export const debug = new DebugManager();
