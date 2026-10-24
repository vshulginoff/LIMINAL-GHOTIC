export const ASSETS = {
  textures: {
    floor:        'assets/img/floor.png',
    wall:         'assets/img/wall.png',
    tree:         'assets/img/tree.png',
    dot:          'assets/img/dot.png',
    bonus:        'assets/img/bonus.png',
    enemyNormal:  'assets/img/enemy_normal.png',
    enemyChase:   'assets/img/enemy_chase.png',
    enemyScared:  'assets/img/enemy_scared.png',
    weaponIdle:   'assets/img/weapon_idle.png',
    weaponAttack: 'assets/img/weapon_attack.png',
    skybox:       'assets/img/skybox.png',
    forestBorder: 'assets/img/forest_border.png'
  },
  uiPlates: {
    uiTitle: 'assets/img/ui_title.png',
    uiPanel: 'assets/img/ui_panel.png',
    uiBtn:   'assets/img/ui_btn.png',
    uiHud:   'assets/img/ui_hud.png',
    uiPopup: 'assets/img/ui_popup.png'
  },
  audio: {
    bgm:            'assets/audio/bgm.mp3',
    step:           'assets/audio/step.mp3',
    dot:            'assets/audio/dot.mp3',
    bonusSfx:       'assets/audio/bonus_sfx.mp3',
    attackSfx:      'assets/audio/attack_sfx.mp3',
    damageSfx:      'assets/audio/damage_sfx.mp3',
    levelUp:        'assets/audio/level_up.mp3',
    gameOver:       'assets/audio/game_over.mp3',
    enemyAggro:     'assets/audio/enemy_aggro.mp3',
    voBonus:        'assets/audio/vo_bonus.mp3',
    voDamage:       'assets/audio/vo_damage.mp3',
    voAttack:       'assets/audio/vo_attack.mp3',
    voAfterAttack:  'assets/audio/vo_after_attack.mp3'
  }
};

export const CONFIG = {
  maxRenderSize: 800,
  targetFPS: 30,
  blockSize: 4,
  baseMoveSpeed: 7.8,
  ghostSpeedLvl1: 1.65,
  ghostSpeedLvl10: 2.88,
  chaseMultLvl1: 1.0,
  chaseMultLvl10: 1.18,
  aggroRadiusLvl1: 3.2,
  aggroRadiusLvl10: 6.8,
  deaggroRadiusLvl1: 5.2,
  deaggroRadiusLvl10: 9.8,
  aiReactionLvl1: 0.65,
  aiReactionLvl10: 0.05,
  aggroSoundCooldown: 5.0,
  afterAttackDelay: 0.65,
  powerDuration: 8500,
  heroCycle: 8,
  bonusCycle: 8,
  maxExtraBonuses: 2,
  turnDuration: 0.22,
  swayAmount: 0.004,
  impactAmount: 0.025,
  hitStop: 0.075,
  deathDelay: 1.15,
  popupDuration: 1.1
};

export const LANGS = {
  ru: {
    title: 'Лиминал Готик Лабиринт Снов',
    lbTitle: 'РЕКОРДЫ',
    start: '[ ИГРАТЬ ]',
    continueBtn: '[ ПРОДОЛЖИТЬ ]',
    settings: '[ НАСТРОЙКИ ]',
    langBtn: '[ ЯЗЫК: РУССКИЙ ]',
    settingsTitle: 'НАСТРОЙКИ',
    back: '[ НАЗАД ]',
    bgm: 'Музыка',
    sfx: 'Звуки',
    vo: 'Голос',
    died: 'ПОПЫТКА ОКОНЧЕНА',
    final: 'СЧЁТ',
    menu: '[ МЕНЮ ]',
    lvl: 'УР',
    pts: 'ОЧК',
    online: 'Онлайн',
    local: 'Локально',
    onlineEmpty: 'Онлайн — пока пусто',
    player: 'Игрок',
    noScores: '---',
    chaseAlert: 'ОНИ ВИДЯТ ТЕБЯ!'
  },
  en: {
    title: 'Liminal Gothic Dream Maze',
    lbTitle: 'LEADERBOARD',
    start: '[ PLAY ]',
    continueBtn: '[ CONTINUE ]',
    settings: '[ SETTINGS ]',
    langBtn: '[ LANGUAGE: ENGLISH ]',
    settingsTitle: 'SETTINGS',
    back: '[ BACK ]',
    bgm: 'Music',
    sfx: 'SFX',
    vo: 'Voice',
    died: 'RUN OVER',
    final: 'SCORE',
    menu: '[ MENU ]',
    lvl: 'LVL',
    pts: 'PTS',
    online: 'Online',
    local: 'Local',
    onlineEmpty: 'Online — empty',
    player: 'Player',
    noScores: '---',
    chaseAlert: 'THEY SEE YOU!'
  }
};

export const DIRS = [
  { x: 0, z: -1 },
  { x: 1, z: 0 },
  { x: 0, z: 1 },
  { x: -1, z: 0 }
];

export const rawMap = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,9,0,0,3,0,0,1,0,0,3,0,0,9,1],
  [1,0,1,1,1,1,0,1,0,1,1,1,1,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,1,1,0,1,0,0,0,1,0,1,1,0,1],
  [1,0,0,0,0,1,0,2,0,1,0,0,0,0,1],
  [1,0,1,1,0,1,1,0,1,1,0,1,1,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,1,1,1,1,0,1,0,1,1,1,1,0,1],
  [1,0,1,3,0,0,0,9,0,0,0,3,1,0,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
];