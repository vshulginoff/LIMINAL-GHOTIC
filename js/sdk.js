import { LANGS } from './config.js';
import { audio } from './audio.js';
import { debug } from './debug.js';

const LB_NAME = 'Leaderboard1';
const STORAGE_SCORES_KEY = 'gothic_scores_v3';
const $ = id => document.getElementById(id);

export const sdkState = {
  platform: 'local', // 'yandex' | 'vk' | 'crazygames' | 'local'
  ysdk: null,
  lb: null,
  vkBridge: null,
  cgSdk: null,
  isLocalMode: true,
  currentLang: 'ru',
  motionEnabled: !window.matchMedia('(prefers-reduced-motion: reduce)').matches
};

try {
  const saved = localStorage.getItem('gothic_motion');
  if (saved !== null) sdkState.motionEnabled = saved === '1';
} catch (e) {}

// Динамическая подгрузка внешнего скрипта SDK (для VK и CrazyGames, чтобы не засорять index.html)
function loadExternalScript(src, timeoutMs = 4500) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    const timer = setTimeout(() => {
      s.onload = s.onerror = null;
      reject(new Error('Timeout loading ' + src));
    }, timeoutMs);
    s.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    s.onerror = () => {
      clearTimeout(timer);
      reject(new Error('Failed loading ' + src));
    };
    document.head.appendChild(s);
  });
}

// Определение целевой платформы по окружению и URL
function detectTargetPlatform() {
  const params = new URLSearchParams(window.location.search);
  const forced = params.get('platform');
  if (forced && ['yandex', 'vk', 'crazygames', 'local'].includes(forced)) {
    return forced;
  }
  if (params.has('vk_app_id') || params.has('api_id') || window.vkBridge) {
    return 'vk';
  }
  const host = (window.location.hostname || '').toLowerCase();
  if (window.CrazyGames || host.includes('crazygames') || params.has('crazygames')) {
    return 'crazygames';
  }
  if (window.YaGames || host.includes('yandex')) {
    return 'yandex';
  }
  return 'local';
}

export function normalizeLanguage(lang) {
  const s = String(lang || '').toLowerCase().split('-')[0];
  return ['ru', 'be', 'kk', 'uk'].includes(s) ? 'ru' : 'en';
}

export function browserLanguage() {
  try {
    const savedLang = localStorage.getItem('gothic_lang');
    if (savedLang === 'ru' || savedLang === 'en') return savedLang;
  } catch (e) {}

  // Проверяем язык из параметров запуска ВК
  const params = new URLSearchParams(window.location.search);
  const vkLang = params.get('vk_language');
  if (vkLang) return normalizeLanguage(vkLang);

  return normalizeLanguage(navigator.language || (navigator.languages && navigator.languages[0]) || 'en');
}

export function updateMotionLabel() {
  const ru = sdkState.currentLang === 'ru';
  const btn = $('motion-toggle');
  if (!btn) return;
  btn.textContent = (ru ? 'Покачивание камеры: ' : 'Camera sway: ') + (sdkState.motionEnabled ? (ru ? 'ВКЛ' : 'ON') : (ru ? 'ВЫКЛ' : 'OFF'));
  btn.setAttribute('aria-pressed', String(sdkState.motionEnabled));
}

export function applyLang(lang, isLoaded = true) {
  const t = LANGS[lang] || LANGS.en;
  sdkState.currentLang = lang;
  document.documentElement.lang = lang;
  document.title = t.title;
  $('title-text').textContent = t.title;
  $('lb-title').textContent = t.lbTitle;
  if (isLoaded) $('start-btn').textContent = t.start;
  $('continue-btn').textContent = t.continueBtn;
  $('settings-btn').textContent = t.settings;
  if ($('lang-btn')) $('lang-btn').textContent = t.langBtn;
  $('settings-title').textContent = t.settingsTitle;
  $('settings-back-btn').textContent = t.back;
  $('lbl-bgm').textContent = t.bgm;
  $('lbl-sfx').textContent = t.sfx;
  $('lbl-vo').textContent = t.vo;
  $('died-text').textContent = t.died;
  $('score-text').textContent = t.final;
  $('restart-btn').textContent = t.menu;
  $('txt-lvl').textContent = t.lvl;
  $('txt-pts').textContent = t.pts;
  updateMotionLabel();

  const ru = lang === 'ru';
  $('control-help').textContent = ru
    ? '↑/↓ или W/S — вперёд/назад. ←/→ или A/D — поворот на 90°. Короткое нажатие — один шаг.'
    : '↑/↓ or W/S: forward/back. ←/→ or A/D: turn 90°. Tap to move one cell.';

  document.querySelectorAll('#dpad button').forEach(b => {
    b.setAttribute('aria-label', ({
      forward: ru ? 'Вперёд' : 'Forward',
      back: ru ? 'Назад' : 'Back',
      left: ru ? 'Поворот налево' : 'Turn left',
      right: ru ? 'Поворот направо' : 'Turn right'
    })[b.dataset.action]);
  });
}

export function toggleLanguage() {
  const nextLang = sdkState.currentLang === 'ru' ? 'en' : 'ru';
  try {
    localStorage.setItem('gothic_lang', nextLang);
  } catch (e) {}
  applyLang(nextLang, true);
  refreshLeaderboard();
}

function loadScoresLocal() {
  try {
    const a = JSON.parse(localStorage.getItem(STORAGE_SCORES_KEY) || '[]');
    return Array.isArray(a) ? a : [];
  } catch (e) {
    return [];
  }
}

function saveScoresLocal(a) {
  try {
    localStorage.setItem(STORAGE_SCORES_KEY, JSON.stringify(a));
  } catch (e) {}
}

function renderList(type, data) {
  const list = $('score-list');
  const status = $('status-text');
  const t = LANGS[sdkState.currentLang] || LANGS.en;
  list.textContent = '';

  const platformBadge = sdkState.platform === 'local' ? '' : sdkState.platform.toUpperCase() + ' • ';

  if (type === 'yandex' && data && Array.isArray(data.entries) && data.entries.length) {
    status.textContent = platformBadge + t.online;
    data.entries.forEach(e => {
      const li = document.createElement('li');
      const name = e.player && e.player.publicName ? e.player.publicName : t.player;
      li.append(document.createTextNode(e.rank + '. ' + name));
      const sc = document.createElement('span');
      sc.textContent = e.score;
      li.append(sc);
      list.append(li);
    });
    return;
  }

  if (type === 'yandex') {
    status.textContent = platformBadge + t.onlineEmpty;
    list.innerHTML = '<li>...</li>';
    return;
  }

  status.textContent = platformBadge + (sdkState.isLocalMode ? t.local : t.online);
  const scores = loadScoresLocal();
  scores.forEach((s, i) => {
    if (Number(s) > 0) {
      const li = document.createElement('li');
      li.append(document.createTextNode('#' + (i + 1) + ' ' + t.player));
      const sc = document.createElement('span');
      sc.textContent = s;
      li.append(sc);
      list.append(li);
    }
  });
  if (!list.children.length) list.innerHTML = '<li>' + t.noScores + '</li>';
}

export function markLoadingComplete() {
  try {
    if (sdkState.platform === 'yandex' && sdkState.ysdk?.features?.LoadingAPI?.ready) {
      sdkState.ysdk.features.LoadingAPI.ready();
    } else if (sdkState.platform === 'crazygames' && sdkState.cgSdk?.game?.loadingStop) {
      sdkState.cgSdk.game.loadingStop();
    }
  } catch (e) {}
}

export function gameplayStart() {
  try {
    if (sdkState.platform === 'yandex' && sdkState.ysdk?.features?.GameplayAPI?.start) {
      sdkState.ysdk.features.GameplayAPI.start();
    } else if (sdkState.platform === 'crazygames' && sdkState.cgSdk?.game?.gameplayStart) {
      sdkState.cgSdk.game.gameplayStart();
    }
  } catch (e) {}
}

export function gameplayStop() {
  try {
    if (sdkState.platform === 'yandex' && sdkState.ysdk?.features?.GameplayAPI?.stop) {
      sdkState.ysdk.features.GameplayAPI.stop();
    } else if (sdkState.platform === 'crazygames' && sdkState.cgSdk?.game?.gameplayStop) {
      sdkState.cgSdk.game.gameplayStop();
    }
  } catch (e) {}
}

// Инициализация Яндекс Игр
async function initYandex(hasSavedLang) {
  if (!window.YaGames) throw new Error('YaGames not found');
  const sdk = await window.YaGames.init();
  sdkState.ysdk = sdk;
  sdkState.platform = 'yandex';
  sdkState.isLocalMode = false;

  if (!hasSavedLang) {
    const l = sdk?.environment?.i18n?.lang;
    if (l) applyLang(normalizeLanguage(l), false);
  }

  try {
    const _lb = await sdk.getLeaderboards();
    sdkState.lb = _lb;
    const r = await _lb.getLeaderboardEntries(LB_NAME, { quantity: 5, includeUser: true });
    renderList('yandex', r);
  } catch (e) {
    renderList('local');
  }
  debug.log('SDK', 'Инициализирована платформа: Яндекс Игры');
}

// Инициализация ВКонтакте (VK Mini Apps)
async function initVK() {
  if (!window.vkBridge) {
    await loadExternalScript('https://unpkg.com/@vkontakte/vk-bridge/dist/browser.min.js');
  }
  if (!window.vkBridge) throw new Error('vkBridge unavailable');

  sdkState.vkBridge = window.vkBridge;
  await sdkState.vkBridge.send('VKWebAppInit');
  sdkState.platform = 'vk';
  sdkState.isLocalMode = false;

  // Загружаем сохранённые рекорды игрока из облака ВК
  try {
    const res = await sdkState.vkBridge.send('VKWebAppStorageGet', { keys: [STORAGE_SCORES_KEY] });
    const entry = res?.keys?.find(k => k.key === STORAGE_SCORES_KEY);
    if (entry && entry.value) {
      const cloudScores = JSON.parse(entry.value);
      if (Array.isArray(cloudScores) && cloudScores.length) {
        const merged = [...new Set([...loadScoresLocal(), ...cloudScores])]
          .map(Number)
          .filter(n => n > 0)
          .sort((x, y) => y - x)
          .slice(0, 5);
        saveScoresLocal(merged);
      }
    }
  } catch (e) {}

  renderList('local');
  debug.log('SDK', 'Инициализирована платформа: ВКонтакте (vkBridge)');
}

// Инициализация CrazyGames
async function initCrazyGames(hasSavedLang) {
  if (!window.CrazyGames) {
    await loadExternalScript('https://sdk.crazygames.com/crazygames-sdk-v3.js');
  }
  if (!window.CrazyGames?.SDK) throw new Error('CrazyGames SDK unavailable');

  await window.CrazyGames.SDK.init();
  sdkState.cgSdk = window.CrazyGames.SDK;
  sdkState.platform = 'crazygames';
  sdkState.isLocalMode = false;

  if (sdkState.cgSdk.game?.loadingStart) {
    sdkState.cgSdk.game.loadingStart();
  }
  if (!hasSavedLang) {
    const cgLang = sdkState.cgSdk.user?.systemInfo?.countryCode;
    if (cgLang) applyLang(normalizeLanguage(cgLang), false);
  }

  renderList('local');
  debug.log('SDK', 'Инициализирована платформа: CrazyGames');
}

export async function initPlatform() {
  let savedLang = null;
  try { savedLang = localStorage.getItem('gothic_lang'); } catch (e) {}
  const hasSavedLang = savedLang === 'ru' || savedLang === 'en';

  applyLang(browserLanguage(), false);
  const target = detectTargetPlatform();

  try {
    if (target === 'vk') {
      await initVK();
      return;
    }
    if (target === 'crazygames') {
      await initCrazyGames(hasSavedLang);
      return;
    }
    if (target === 'yandex') {
      await initYandex(hasSavedLang);
      return;
    }
  } catch (e) {
    debug.log('SDK_FALLBACK', 'Переход в автономный режим (' + e.message + ')');
  }

  sdkState.platform = 'local';
  sdkState.isLocalMode = true;
  renderList('local');
  debug.log('SDK', 'Активирован автономный режим (Local / Itch.io)');
}

export function refreshLeaderboard() {
  if (sdkState.platform === 'yandex' && !sdkState.isLocalMode && sdkState.lb) {
    $('score-list').innerHTML = '<li>...</li>';
    sdkState.lb.getLeaderboardEntries(LB_NAME, { quantity: 5, includeUser: true })
      .then(r => renderList('yandex', r))
      .catch(() => renderList('local'));
    return;
  }
  renderList('local');
}

export function saveScorePlatform(score) {
  const numScore = Number(score) || 0;
  const a = loadScoresLocal();
  a.push(numScore);
  a.sort((x, y) => y - x);
  const top5 = a.slice(0, 5);
  saveScoresLocal(top5);

  if (sdkState.platform === 'yandex' && sdkState.ysdk && sdkState.lb && !sdkState.isLocalMode) {
    if (sdkState.lb.setLeaderboardScore) {
      sdkState.lb.setLeaderboardScore(LB_NAME, numScore).catch(() => {});
    }
  } else if (sdkState.platform === 'vk' && sdkState.vkBridge && !sdkState.isLocalMode) {
    // Сохраняем рекорды в облачное хранилище ВК
    sdkState.vkBridge.send('VKWebAppStorageSet', {
      key: STORAGE_SCORES_KEY,
      value: JSON.stringify(top5)
    }).catch(() => {});
  }
}

export function showAd(callback) {
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    callback();
  };

  // 1. Реклама Яндекс Игр
  if (sdkState.platform === 'yandex' && sdkState.ysdk && !sdkState.isLocalMode && sdkState.ysdk.adv?.showFullscreenAdv) {
    audio.pauseAll();
    sdkState.ysdk.adv.showFullscreenAdv({
      callbacks: {
        onClose: finish,
        onError: finish
      }
    });
    return;
  }

  // 2. Реклама ВКонтакте (Interstitial)
  if (sdkState.platform === 'vk' && sdkState.vkBridge && !sdkState.isLocalMode) {
    audio.pauseAll();
    sdkState.vkBridge.send('VKWebAppShowNativeAds', { ad_format: 'interstitial' })
      .then(finish)
      .catch(finish);
    return;
  }

  // 3. Реклама CrazyGames (Midgame)
  if (sdkState.platform === 'crazygames' && sdkState.cgSdk?.ad?.requestAd && !sdkState.isLocalMode) {
    audio.pauseAll();
    sdkState.cgSdk.ad.requestAd('midgame', {
      adStarted: () => audio.pauseAll(),
      adFinished: finish,
      adError: finish
    });
    return;
  }

  // 4. Автономный режим (Itch.io / локально) — без рекламы
  finish();
}