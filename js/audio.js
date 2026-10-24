import { ASSETS, CONFIG } from './config.js';
import { debug } from './debug.js';

const AudioContextClass = window.AudioContext || window.webkitAudioContext;

class AudioManager {
  constructor() {
    this.ctx = null;
    this.buffers = {};
    this.ready = false;
    this.bgmSource = null;
    this.bgmGain = null;
    this.musicTimer = null;
    this.currentVoiceSource = null;
    this.afterAttackTimer = null;
    this.stepCooldown = 0;

    // Громкость по каналам (0.0 .. 1.0)
    this.bgmVol = 0.35;
    this.sfxVol = 0.70;
    this.voVol  = 0.95;
    this.loadSettings();
  }

  loadSettings() {
    try {
      const b = localStorage.getItem('gothic_vol_bgm');
      const s = localStorage.getItem('gothic_vol_sfx');
      const v = localStorage.getItem('gothic_vol_vo');
      if (b !== null) this.bgmVol = Number(b) / 100;
      if (s !== null) this.sfxVol = Number(s) / 100;
      if (v !== null) this.voVol  = Number(v) / 100;
    } catch (e) {}
  }

  setVolume(type, percent) {
    const val = Math.max(0, Math.min(100, Number(percent))) / 100;
    if (type === 'bgm') {
      this.bgmVol = val;
      if (this.bgmGain && this.ctx) {
        this.bgmGain.gain.setValueAtTime(val, this.ctx.currentTime);
      }
      try { localStorage.setItem('gothic_vol_bgm', String(Math.round(val * 100))); } catch (e) {}
    } else if (type === 'sfx') {
      this.sfxVol = val;
      try { localStorage.setItem('gothic_vol_sfx', String(Math.round(val * 100))); } catch (e) {}
    } else if (type === 'vo') {
      this.voVol = val;
      try { localStorage.setItem('gothic_vol_vo', String(Math.round(val * 100))); } catch (e) {}
    }
  }

  ensureContext() {
    if (!AudioContextClass) return false;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContextClass();
      } catch (e) {
        return false;
      }
    }
    return true;
  }

  async preloadAll() {
    if (!this.ensureContext()) return;
    const entries = Object.entries(ASSETS.audio);
    await Promise.all(entries.map(async ([key, url]) => {
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const arr = await res.arrayBuffer();
        this.buffers[key] = await this.ctx.decodeAudioData(arr);
        debug.log('AUDIO', `Загружен семпл: ${url}`);
      } catch (e) {}
    }));
  }

  unlock() {
    if (!this.ensureContext()) return;
    this.ctx.resume().catch(() => {});
    this.ready = true;
  }

  synthFallback(freq, type, dur, vol) {
    if (!this.ready || !this.ctx || document.hidden || this.ctx.state !== 'running' || vol <= 0.001) return;
    try {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
      o.connect(g);
      g.connect(this.ctx.destination);
      o.onended = () => {
        o.disconnect();
        g.disconnect();
      };
      o.start();
      o.stop(this.ctx.currentTime + dur);
    } catch (e) {}
  }

  playSample(key, baseVolume = 0.6, fallback = null, channelMult = this.sfxVol) {
    const finalVol = baseVolume * channelMult;
    if (!this.ready || !this.ctx || document.hidden || this.ctx.state !== 'running' || finalVol <= 0.001) return null;
    const buf = this.buffers[key];
    if (buf) {
      try {
        const src = this.ctx.createBufferSource();
        const gain = this.ctx.createGain();
        src.buffer = buf;
        gain.gain.value = finalVol;
        src.connect(gain);
        gain.connect(this.ctx.destination);
        src.onended = () => {
          src.disconnect();
          gain.disconnect();
        };
        src.start(0);
        return src;
      } catch (e) {}
    } else if (fallback) {
      this.synthFallback(fallback.freq, fallback.type, fallback.dur, fallback.vol * channelMult);
    }
    return null;
  }

  playVoice(key, fallback = null) {
    if (!this.ready || !this.ctx || document.hidden || this.ctx.state !== 'running') return;
    if (this.currentVoiceSource) {
      try { this.currentVoiceSource.stop(); } catch (e) {}
      this.currentVoiceSource = null;
    }
    this.currentVoiceSource = this.playSample(key, 1.0, fallback, this.voVol);
  }

  triggerAttackSequence() {
    this.playSample('attackSfx', 0.8, { freq: 400, type: 'triangle', dur: 0.3, vol: 0.3 }, this.sfxVol);
    this.playVoice('voAttack', { freq: 520, type: 'sawtooth', dur: 0.18, vol: 0.25 });

    if (this.afterAttackTimer) clearTimeout(this.afterAttackTimer);
    this.afterAttackTimer = setTimeout(() => {
      this.afterAttackTimer = null;
      this.playVoice('voAfterAttack', { freq: 620, type: 'triangle', dur: 0.25, vol: 0.25 });
    }, CONFIG.afterAttackDelay * 1000);
  }

  triggerDamageSequence() {
    if (this.afterAttackTimer) {
      clearTimeout(this.afterAttackTimer);
      this.afterAttackTimer = null;
    }
    this.playSample('damageSfx', 0.9, { freq: 100, type: 'sawtooth', dur: 0.5, vol: 0.35 }, this.sfxVol);
    this.playVoice('voDamage', { freq: 140, type: 'square', dur: 0.35, vol: 0.3 });
  }

  triggerBonusSequence() {
    this.playSample('bonusSfx', 0.8, { freq: 200, type: 'sawtooth', dur: 0.5, vol: 0.3 }, this.sfxVol);
    this.playVoice('voBonus', { freq: 440, type: 'sine', dur: 0.3, vol: 0.3 });
  }

  triggerEnemyAggro() {
    this.playSample('enemyAggro', 0.9, { freq: 165, type: 'sawtooth', dur: 0.4, vol: 0.3 }, this.sfxVol);
  }

  playStep(dt) {
    this.stepCooldown = Math.max(0, this.stepCooldown - dt);
    if (this.stepCooldown > 0) return;
    this.stepCooldown = 0.38;
    this.playSample('step', 0.4, { freq: 90, type: 'triangle', dur: 0.05, vol: 0.06 }, this.sfxVol);
  }

  startMusic(isPlayingFn) {
    this.stopMusic();
    if (!isPlayingFn() || document.hidden || !this.ensureContext()) return;

    if (this.buffers.bgm) {
      try {
        const src = this.ctx.createBufferSource();
        const gain = this.ctx.createGain();
        src.buffer = this.buffers.bgm;
        src.loop = true;
        gain.gain.value = this.bgmVol;
        src.connect(gain);
        gain.connect(this.ctx.destination);
        src.start(0);
        this.bgmSource = src;
        this.bgmGain = gain;
        return;
      } catch (e) {}
    }

    let i = 0;
    const notes = [65.41, 98, 130.81, 155.56];
    this.musicTimer = setInterval(() => {
      if (!isPlayingFn() || document.hidden || !this.ctx || this.ctx.state !== 'running') {
        this.stopMusic();
        return;
      }
      this.synthFallback(notes[i++ % notes.length], 'sawtooth', 1.5, 0.22 * this.bgmVol);
    }, 800);
  }

  stopMusic() {
    if (this.bgmSource) {
      try {
        this.bgmSource.stop();
        this.bgmSource.disconnect();
      } catch (e) {}
      this.bgmSource = null;
    }
    if (this.bgmGain) {
      try { this.bgmGain.disconnect(); } catch (e) {}
      this.bgmGain = null;
    }
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  pauseAll() {
    this.stopMusic();
    if (this.afterAttackTimer) {
      clearTimeout(this.afterAttackTimer);
      this.afterAttackTimer = null;
    }
    if (this.ctx && this.ctx.state === 'running') {
      this.ctx.suspend().catch(() => {});
    }
  }

  resumeAll(isPlayingFn) {
    if (!isPlayingFn() || document.hidden || !this.ensureContext()) return;
    this.ctx.resume().then(() => {
      if (isPlayingFn() && !document.hidden) {
        this.startMusic(isPlayingFn);
      }
    }).catch(() => {});
  }
}

export const audio = new AudioManager();

