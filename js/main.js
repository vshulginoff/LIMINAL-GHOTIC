import { CONFIG, DIRS, rawMap, LANGS } from './config.js';
import { assets } from './assets.js';
import { audio } from './audio.js';
import { debug } from './debug.js';
import {
  sdkState, updateMotionLabel, toggleLanguage, initPlatform,
  markLoadingComplete, gameplayStart, gameplayStop,
  saveScorePlatform, refreshLeaderboard, showAd
} from './sdk.js';
import {
  scene, camera, renderer, initRenderer, resizeGame, initStaticWorld,
  skyboxMesh, lantern, dots, powers, ghosts, playerStartPos, mapW, mapH,
  buildLevel, triggerWeaponSwing, updateWeapon,
  burst, resetParticles, stepParticles
} from './world.js';

const $ = id => document.getElementById(id);

const gameState = {
  score: 0,
  lives: 3,
  level: 1,
  playing: false,
  paused: false,
  powerMode: false,
  dotsLeft: 0
};

const ui = {
  score: $('ui-score'),
  lives: $('ui-lives'),
  level: $('ui-level'),
  startScreen: $('start-screen'),
  settingsScreen: $('settings-screen'),
  debugScreen: $('debug-screen'),
  gameOverScreen: $('game-over-screen'),
  gameUI: $('ui-layer'),
  finalScore: $('final-score'),
  continueBtn: $('continue-btn'),
  startBtn: $('start-btn')
};

const fxText = $('fx-text');
const fxFlash = $('fx-flash');

let viewYaw = 0, turnTween = null, deathLeft = 0, hitStopLeft = 0;
let heading = 0, step = null, moveTap = 0, turnQueue = [];
let pagePaused = false, powerLeft = 0, invulnerable = 0, graceTimer = 0, adBusy = false;
let effectTime = 0, shakeLeft = 0, shakeDuration = 0.4, flashLeft = 0, flashDuration = 0.35, popupLeft = 0;
let forceSingleRender = true;
const held = new Map();

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function difficulty() {
  const t = Math.min(1, Math.max(0, (gameState.level - 1) / 9));
  const post10 = Math.max(0, Math.min(5, gameState.level - 10)) * 0.04;

  return {
    player: CONFIG.baseMoveSpeed * (1 + Math.min(3, Math.floor((gameState.level - 1) / CONFIG.heroCycle)) * 0.04),
    ghostSpeed: lerp(CONFIG.ghostSpeedLvl1, CONFIG.ghostSpeedLvl10, t) + post10,
    chaseMult: lerp(CONFIG.chaseMultLvl1, CONFIG.chaseMultLvl10, t),
    aggroRadius: lerp(CONFIG.aggroRadiusLvl1, CONFIG.aggroRadiusLvl10, t),
    deaggroRadius: lerp(CONFIG.deaggroRadiusLvl1, CONFIG.deaggroRadiusLvl10, t),
    aiReaction: lerp(CONFIG.aiReactionLvl1, CONFIG.aiReactionLvl10, t),
    smartness: lerp(0.2, 1.0, t),
    graceDuration: lerp(3.0, 1.4, t),
    extra: Math.min(CONFIG.maxExtraBonuses, Math.floor((gameState.level - 1) / CONFIG.bonusCycle))
  };
}

function popup(text, color) {
  fxText.textContent = text;
  fxText.style.color = color;
  popupLeft = CONFIG.popupDuration;
  fxText.style.opacity = '1';
  fxText.style.transform = 'translate(-50%,0) scale(.9)';
}

function impact(color, strength = 1) {
  shakeLeft = 0.4 * strength;
  shakeDuration = shakeLeft;
  flashLeft = flashDuration;
  fxFlash.style.background = 'radial-gradient(ellipse,transparent 35%,' + color + ' 100%)';
  hitStopLeft = CONFIG.hitStop;
}

function clearEffects() {
  resetParticles();
  shakeLeft = flashLeft = popupLeft = 0;
  fxText.style.opacity = '0';
  fxFlash.style.opacity = '0';
}

function updateEffects(dt) {
  effectTime += dt;
  shakeLeft = Math.max(0, shakeLeft - dt);

  if (flashLeft > 0) {
    flashLeft = Math.max(0, flashLeft - dt);
    fxFlash.style.opacity = flashLeft > 0 ? String((flashLeft / flashDuration) * 0.45) : '0';
  }
  if (popupLeft > 0) {
    popupLeft = Math.max(0, popupLeft - dt);
    if (popupLeft > 0) {
      const t = 1 - popupLeft / CONFIG.popupDuration;
      fxText.style.opacity = String(Math.min(1, popupLeft / 0.25));
      fxText.style.transform = 'translate(-50%,' + (-t * 65) + 'px) scale(' + (1 + 0.12 * Math.sin(Math.PI * t)) + ')';
    } else {
      fxText.style.opacity = '0';
    }
  }
  stepParticles(dt);
}

function clearControls() {
  held.clear();
  moveTap = 0;
  turnQueue = [];
  document.querySelectorAll('#dpad button').forEach(b => b.classList.remove('held'));
}

function walkable(x, z) {
  return rawMap[z] && rawMap[z][x] !== undefined && rawMap[z][x] !== 1;
}

function resetPlayer() {
  step = null;
  turnTween = null;
  viewYaw = 0;
  heading = 0;
  clearControls();
  camera.position.copy(playerStartPos);
  camera.rotation.set(0, 0, 0);
}

function updatePlayer(dt, playerSpeed) {
  let remaining = dt;
  for (let guard = 0; guard < 8 && remaining > 0; guard++) {
    if (turnTween) {
      const used = Math.min(remaining, CONFIG.turnDuration - turnTween.time);
      turnTween.time += used;
      remaining -= used;
      const t = Math.min(1, turnTween.time / CONFIG.turnDuration);
      const smooth = t * t * (3 - 2 * t);
      viewYaw = turnTween.from + (turnTween.to - turnTween.from) * smooth;
      camera.rotation.y = viewYaw;
      if (t >= 1) {
        viewYaw = turnTween.to;
        turnTween = null;
      } else break;
      continue;
    }
    if (!step) {
      if (turnQueue.length) {
        const dir = turnQueue.shift();
        heading = (heading + dir + 4) % 4;
        turnTween = { from: viewYaw, to: viewYaw - dir * Math.PI / 2, time: 0 };
        continue;
      }
      const active = [...held.values()].filter(a => a === 'forward' || a === 'back');
      const movement = moveTap || (active.length ? (active[active.length - 1] === 'forward' ? 1 : -1) : 0);
      moveTap = 0;
      if (!movement) break;
      const x = Math.round(camera.position.x / 4 + mapW / 2);
      const z = Math.round(camera.position.z / 4 + mapH / 2);
      const d = DIRS[heading];
      const nx = x + d.x * movement;
      const nz = z + d.z * movement;
      if (!walkable(nx, nz)) break;
      step = {
        x: (nx - mapW / 2) * 4,
        z: (nz - mapH / 2) * 4,
        speed: playerSpeed * (movement < 0 ? 0.75 : 1)
      };
    }
    const dx = step.x - camera.position.x;
    const dz = step.z - camera.position.z;
    const dist = Math.hypot(dx, dz);
    const travel = step.speed * remaining;
    if (travel >= dist) {
      camera.position.x = step.x;
      camera.position.z = step.z;
      remaining -= dist / step.speed;
      step = null;
    } else {
      camera.position.x += (dx / dist) * travel;
      camera.position.z += (dz / dist) * travel;
      remaining = 0;
    }
  }
  camera.position.y = 1.7;
  if (step) audio.playStep(dt);
  updateWeapon(dt, Boolean(step), powerLeft);
}

function setupLevel() {
  powerLeft = 0;
  gameState.powerMode = false;
  const diff = difficulty();
  buildLevel(gameState, diff.extra, popup);
  resetPlayer();
  updateWeapon(0, false, 0);
  invulnerable = 2.5;
  graceTimer = diff.graceDuration;
  forceSingleRender = true;
  $('dbg-level').value = String(gameState.level);
  debug.log('LEVEL', 'Запущен уровень ' + gameState.level + ' (скорость врагов: ' + diff.ghostSpeed.toFixed(2) + ', агро: ' + diff.aggroRadius.toFixed(1) + ')');
}

function startNewGame() {
  if (adBusy) return;
  clearEffects();
  deathLeft = 0;
  hitStopLeft = 0;
  ui.startScreen.style.display = 'none';
  ui.settingsScreen.style.display = 'none';
  ui.debugScreen.style.display = 'none';
  ui.gameOverScreen.style.display = 'none';
  ui.gameUI.style.display = 'block';
  gameState.score = 0;
  gameState.lives = 3;
  gameState.level = Number($('dbg-level').value) || 1;
  gameState.powerMode = false;
  gameState.paused = false;
  ui.score.textContent = '0';
  ui.lives.textContent = '3';
  ui.level.textContent = String(gameState.level);

  audio.unlock();
  setupLevel();
  gameState.playing = true;
  pagePaused = document.hidden;
  if (!pagePaused) {
    audio.startMusic(() => isSimulationActive());
    gameplayStart();
  }
}

function isSimulationActive() {
  return gameState.playing && !gameState.paused && !pagePaused && !document.hidden;
}

function togglePause(forceState) {
  if (!gameState.playing || deathLeft > 0) return;
  const next = typeof forceState === 'boolean' ? forceState : !gameState.paused;
  if (next === gameState.paused) return;

  gameState.paused = next;
  clearControls();

  if (gameState.paused) {
    ui.continueBtn.style.display = 'block';
    ui.continueBtn.classList.add('blink');
    ui.startBtn.classList.remove('blink');
    ui.startScreen.style.display = 'flex';
    audio.pauseAll();
    gameplayStop();
    debug.log('STATE', 'Игра поставлена на паузу (открыто меню)');
  } else {
    ui.startScreen.style.display = 'none';
    ui.settingsScreen.style.display = 'none';
    ui.debugScreen.style.display = 'none';
    forceSingleRender = true;
    gameplayStart();
    audio.resumeAll(() => isSimulationActive());
    debug.log('STATE', 'Игра продолжена');
  }
}

function openSettings() {
  ui.startScreen.style.display = 'none';
  ui.settingsScreen.style.display = 'flex';
}

function closeSettings() {
  ui.settingsScreen.style.display = 'none';
  ui.startScreen.style.display = 'flex';
}

function openDebugMenu() {
  debug.refreshView();
  ui.debugScreen.style.display = 'flex';
}

function closeDebugMenu() {
  ui.debugScreen.style.display = 'none';
}

function gameOver() {
  if (!gameState.playing) return;
  gameState.playing = false;
  gameState.paused = false;
  clearControls();
  audio.stopMusic();
  audio.playSample('gameOver', 0.8, { freq: 110, type: 'sawtooth', dur: 0.8, vol: 0.3 });
  gameplayStop();
  saveScorePlatform(gameState.score);
  ui.finalScore.textContent = gameState.score;
  ui.gameUI.style.display = 'none';
  ui.startScreen.style.display = 'none';
  ui.settingsScreen.style.display = 'none';
  ui.debugScreen.style.display = 'none';
  ui.continueBtn.style.display = 'none';
  ui.startBtn.classList.add('blink');
  ui.gameOverScreen.style.display = 'flex';
  debug.log('STATE', 'Игра окончена со счётом ' + gameState.score);
}

function toMenu() {
  if (adBusy) return;
  gameState.playing = false;
  gameState.paused = false;
  clearControls();
  audio.stopMusic();
  gameplayStop();
  ui.settingsScreen.style.display = 'none';
  ui.debugScreen.style.display = 'none';
  ui.gameUI.style.display = 'none';
  ui.continueBtn.style.display = 'none';
  ui.startBtn.classList.add('blink');

  adBusy = true;
  let completed = false;
  showAd(() => {
    if (completed) return;
    completed = true;
    adBusy = false;
    ui.gameOverScreen.style.display = 'none';
    ui.startScreen.style.display = 'flex';
    refreshLeaderboard();
  });
}

function pageHidden() {
  pagePaused = true;
  clearControls();
  audio.pauseAll();
  if (gameState.playing) gameplayStop();
}

function pageVisible() {
  if (document.hidden) return;
  pagePaused = false;
  forceSingleRender = true;
  if (isSimulationActive()) {
    gameplayStart();
    audio.resumeAll(() => isSimulationActive());
  }
}

document.addEventListener('visibilitychange', () => document.hidden ? pageHidden() : pageVisible());
window.addEventListener('blur', pageHidden);
window.addEventListener('pagehide', pageHidden);
window.addEventListener('focus', pageVisible);
window.addEventListener('pageshow', pageVisible);

function press(action, id) {
  if (!isSimulationActive() || deathLeft > 0 || held.has(id)) return;
  held.set(id, action);
  if (action === 'left' || action === 'right') {
    if (turnQueue.length < 2) turnQueue.push(action === 'left' ? -1 : 1);
  } else {
    moveTap = action === 'forward' ? 1 : -1;
  }
}

const keyActions = {
  ArrowUp: 'forward', KeyW: 'forward',
  ArrowDown: 'back', KeyS: 'back',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right'
};

window.addEventListener('keydown', e => {
  if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
    return;
  }

  if (e.code === 'F2' || e.code === 'Backquote') {
    e.preventDefault();
    if (ui.debugScreen.style.display !== 'none') closeDebugMenu();
    else {
      if (gameState.playing && !gameState.paused) togglePause(true);
      openDebugMenu();
    }
    return;
  }

  if (e.code === 'Escape' && !e.repeat) {
    e.preventDefault();
    if (ui.debugScreen.style.display !== 'none') {
      closeDebugMenu();
      return;
    }
    if (ui.settingsScreen.style.display !== 'none') {
      closeSettings();
      return;
    }
    if (gameState.playing && deathLeft <= 0) {
      togglePause();
    }
    return;
  }

  if (keyActions[e.code]) {
    e.preventDefault();
    if (!e.repeat) press(keyActions[e.code], e.code);
    return;
  }

  if (e.code === 'Enter' && !e.repeat) {
    e.preventDefault();
    if (ui.settingsScreen.style.display !== 'none') closeSettings();
    else if (ui.startScreen.style.display !== 'none') {
      if (gameState.playing && gameState.paused) togglePause(false);
      else startNewGame();
    } else if (ui.gameOverScreen.style.display !== 'none') toMenu();
  }
});
window.addEventListener('keyup', e => held.delete(e.code));

document.querySelectorAll('#dpad button').forEach(b => {
  b.addEventListener('pointerdown', e => {
    e.preventDefault();
    b.setPointerCapture(e.pointerId);
    b.classList.add('held');
    press(b.dataset.action, 'p' + e.pointerId);
  });
  const release = e => {
    held.delete('p' + e.pointerId);
    b.classList.remove('held');
  };
  b.addEventListener('pointerup', release);
  b.addEventListener('pointercancel', release);
  b.addEventListener('lostpointercapture', release);
});

['contextmenu', 'selectstart', 'dragstart'].forEach(n =>
  document.addEventListener(n, e => {
    if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT')) return;
    e.preventDefault();
    e.stopPropagation();
  }, { passive: false })
);

function bindUIEvents() {
  $('motion-toggle').addEventListener('click', () => {
    sdkState.motionEnabled = !sdkState.motionEnabled;
    try { localStorage.setItem('gothic_motion', sdkState.motionEnabled ? '1' : '0'); } catch (e) {}
    updateMotionLabel();
  });

  $('hud-pause-btn').addEventListener('click', () => togglePause(true));
  $('continue-btn').addEventListener('click', () => togglePause(false));
  $('settings-btn').addEventListener('click', openSettings);
  $('settings-back-btn').addEventListener('click', closeSettings);
  $('lang-btn').addEventListener('click', toggleLanguage);

  // Секретный вход в Дебаг-меню по 3 нажатиям в правом верхнем углу экрана
  let secretTapCount = 0;
  let secretTapTimer = null;
  $('secret-debug-trigger').addEventListener('pointerdown', () => {
    if (isSimulationActive()) return;
    secretTapCount++;
    if (secretTapTimer) clearTimeout(secretTapTimer);
    if (secretTapCount >= 3) {
      secretTapCount = 0;
      openDebugMenu();
    } else {
      secretTapTimer = setTimeout(() => {
        secretTapCount = 0;
      }, 900);
    }
  });

  $('dbg-close').addEventListener('click', closeDebugMenu);
  $('dbg-clear').addEventListener('click', () => debug.clear());
  $('dbg-download').addEventListener('click', () => debug.downloadTxt());

  $('dbg-apply-lvl').addEventListener('click', () => {
    const lvl = Math.max(1, Math.min(15, Number($('dbg-level').value) || 1));
    gameState.level = lvl;
    ui.level.textContent = String(lvl);
    if (gameState.playing) setupLevel();
    debug.log('DEBUG', 'Уровень принудительно изменён на ' + lvl);
  });

  $('dbg-speed-mult').addEventListener('change', e => {
    debug.speedMultiplier = Number(e.target.value);
    debug.log('DEBUG', 'Множитель скорости врагов: ' + debug.speedMultiplier + 'x');
  });

  $('dbg-fps').addEventListener('change', e => {
    debug.targetFPS = Number(e.target.value) || 30;
    debug.log('DEBUG', 'Лимит кадров установлен на ' + debug.targetFPS + ' FPS');
  });

  $('dbg-add-msg').addEventListener('click', () => {
    const input = $('dbg-custom-msg');
    const txt = input.value.trim();
    if (txt) {
      debug.log('USER_NOTE', txt + ' [УР:' + gameState.level + ', ОЧК:' + gameState.score + ', HP:' + gameState.lives + ']');
      input.value = '';
    }
  });

  function syncSliders(selector, type, initialVal) {
    const list = document.querySelectorAll(selector);
    list.forEach(s => {
      s.value = String(Math.round(initialVal * 100));
      s.addEventListener('input', e => {
        const v = e.target.value;
        audio.setVolume(type, v);
        list.forEach(other => { if (other !== e.target) other.value = v; });
      });
    });
  }
  syncSliders('.vol-bgm', 'bgm', audio.bgmVol);
  syncSliders('.vol-sfx', 'sfx', audio.sfxVol);
  syncSliders('.vol-vo',  'vo',  audio.voVol);
}

function renderScene() {
  const x = camera.position.x, y = camera.position.y, z = camera.position.z;
  const rx = camera.rotation.x, ry = camera.rotation.y, rz = camera.rotation.z;
  lantern.position.set(x, y + 1, z);
  if (skyboxMesh) skyboxMesh.position.set(x, y, z);

  if (isSimulationActive() && sdkState.motionEnabled) {
    const sway = CONFIG.swayAmount;
    const shock = shakeLeft > 0 ? CONFIG.impactAmount * shakeLeft / shakeDuration : 0;
    camera.rotation.x += Math.sin(effectTime * 1.8) * sway + Math.sin(effectTime * 67) * shock;
    camera.rotation.z += Math.sin(effectTime * 1.1) * sway * 0.6 + Math.sin(effectTime * 53) * shock * 0.6;
    camera.rotation.y += Math.sin(effectTime * 2.3) * sway * 0.4 + Math.sin(effectTime * 83) * shock * 0.6;
    camera.position.y += Math.sin(effectTime * (step ? 10 : 1.9)) * (step ? 0.018 : 0.007);
  }
  renderer.render(scene, camera);
  camera.position.set(x, y, z);
  camera.rotation.set(rx, ry, rz);
}

let lastRenderTime = 0;

function animate(now = 0) {
  requestAnimationFrame(animate);

  const frameInterval = 1000 / debug.targetFPS;
  const elapsed = now - lastRenderTime;
  if (elapsed < frameInterval) return;

  lastRenderTime = now - (elapsed % frameInterval);
  const dt = Math.min(0.06, Math.max(0, elapsed / 1000));

  if (!isSimulationActive()) {
    if (forceSingleRender) {
      forceSingleRender = false;
      renderScene();
    }
    return;
  }

  updateEffects(dt);
  const diff = difficulty();

  if (deathLeft > 0) {
    deathLeft = Math.max(0, deathLeft - dt);
    if (deathLeft === 0) {
      if (gameState.lives <= 0) {
        gameOver();
      } else {
        resetPlayer();
        invulnerable = 2.5;
        graceTimer = diff.graceDuration;
        for (let i = 0; i < ghosts.length; i++) {
          ghosts[i].resetToStart();
        }
      }
    }
    renderScene();
    return;
  }

  if (hitStopLeft > 0) {
    hitStopLeft = Math.max(0, hitStopLeft - dt);
    renderScene();
    return;
  }

  if (powerLeft > 0) {
    powerLeft = Math.max(0, powerLeft - dt);
    gameState.powerMode = powerLeft > 0;
    for (let i = 0; i < ghosts.length; i++) {
      if (gameState.powerMode) ghosts[i].state = 'frightened';
      else if (ghosts[i].state === 'frightened') ghosts[i].state = 'normal';
    }
  }

  updatePlayer(dt, diff.player);
  invulnerable = Math.max(0, invulnerable - dt);
  graceTimer = Math.max(0, graceTimer - dt);

  const px = camera.position.x;
  const pz = camera.position.z;

  for (let i = 0, len = dots.length; i < len; i++) {
    const d = dots[i];
    if (!d.visible) continue;
    if (Math.abs(px - d.position.x) < 0.95 && Math.abs(pz - d.position.z) < 0.95) {
      d.visible = false;
      gameState.score += 10;
      ui.score.textContent = gameState.score;
      gameState.dotsLeft--;
      audio.playSample('dot', 0.45, { freq: 880, type: 'square', dur: 0.08, vol: 0.08 });
    }
  }

  if (gameState.dotsLeft === 0) {
    gameState.level++;
    ui.level.textContent = gameState.level;
    setupLevel();
    popup((sdkState.currentLang === 'ru' ? 'УРОВЕНЬ ' : 'LEVEL ') + gameState.level, '#91ffb0');
    audio.playSample('levelUp', 0.7, { freq: 660, type: 'triangle', dur: 0.5, vol: 0.18 });
    renderScene();
    return;
  }

  for (let i = 0, len = powers.length; i < len; i++) {
    const p = powers[i];
    if (!p.visible) continue;
    if (Math.abs(px - p.position.x) < 1.05 && Math.abs(pz - p.position.z) < 1.05) {
      p.visible = false;
      gameState.powerMode = true;
      powerLeft = CONFIG.powerDuration / 1000;
      updateWeapon(0, false, powerLeft);
      for (let j = 0; j < ghosts.length; j++) {
        ghosts[j].state = 'frightened';
        ghosts[j].isChasing = false;
      }
      audio.triggerBonusSequence();
      debug.log('BONUS', 'Подобран бонус: оружие в руках активно');
    }
  }

  for (let i = 0; i < ghosts.length; i++) {
    const g = ghosts[i];
    g.update(dt, diff, graceTimer);
    if (!g.mesh.visible || g.respawn > 0) continue;

    const hitRadius = g.state === 'frightened' ? 1.75 : 1.35;
    if (Math.hypot(px - g.mesh.position.x, pz - g.mesh.position.z) < hitRadius) {
      if (g.state === 'frightened') {
        triggerWeaponSwing();
        burst(g.mesh.position, 0xc6fff0);
        impact('#87dbb3', 0.5);
        popup('+200', '#b8ffce');
        g.mesh.visible = false;
        g.respawn = 5;
        gameState.score += 200;
        ui.score.textContent = gameState.score;
        audio.triggerAttackSequence();
        debug.log('COMBAT', 'Враг повержен оружием (+200 очков)');
        break;
      } else if (invulnerable <= 0) {
        gameState.lives--;
        ui.lives.textContent = gameState.lives;
        clearControls();
        deathLeft = CONFIG.deathDelay;
        impact('#dc334c');
        popup((sdkState.currentLang === 'ru' ? 'ЖИЗНИ: ' : 'LIVES: ') + (gameState.lives + 1) + ' → ' + gameState.lives, '#ff737d');
        audio.triggerDamageSequence();
        debug.log('COMBAT', 'Получен урон от врага (осталось жизней: ' + gameState.lives + ')');
        break;
      }
    }
  }

  renderScene();
}

function onWindowResize() {
  resizeGame();
  forceSingleRender = true;
}

async function bootstrap() {
  debug.log('INIT', 'Инициализация рендера (макс. 800px, high-performance, 30 FPS)');
  initRenderer();
  renderer.domElement.addEventListener('webglcontextlost', e => {
    e.preventDefault();
    pageHidden();
    debug.log('WEBGL_ERR', 'Потерян контекст WebGL');
  }, false);
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    onWindowResize();
    pageVisible();
    debug.log('WEBGL', 'Контекст WebGL восстановлен');
  }, false);

  window.addEventListener('resize', onWindowResize);
  window.addEventListener('orientationchange', onWindowResize);
  window.visualViewport?.addEventListener('resize', onWindowResize);
  onWindowResize();

  bindUIEvents();

  await Promise.all([
    initPlatform(),
    assets.loadAll(),
    audio.preloadAll()
  ]);

  initStaticWorld();
  clearEffects();

  const t = LANGS[sdkState.currentLang] || LANGS.en;
  ui.startBtn.textContent = t.start;
  ui.startBtn.addEventListener('click', startNewGame);
  $('restart-btn').addEventListener('click', toMenu);
  markLoadingComplete();
  debug.log('READY', 'Все модули загружены, игра готова к старту');

  animate();
}

bootstrap();