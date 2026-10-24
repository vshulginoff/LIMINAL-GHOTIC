import { CONFIG, DIRS, rawMap, LANGS } from './config.js';
import { assets } from './assets.js';
import { audio } from './audio.js';
import { sdkState } from './sdk.js';
import { debug } from './debug.js';

export const mapW = rawMap[0].length;
export const mapH = rawMap.length;

export const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x193a46, 0.016);
scene.background = new THREE.Color(0x0b1820);

// Дальность 160 ед. гарантирует, что никакие объекты и лес перед игроком не исчезают вдали
export const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 160);
export let renderer;
export let skyboxMesh = null;

export function initRenderer() {
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true
    });
  } catch (e) {
    document.body.innerHTML = '<div style="color:white;background:black;padding:30px;font:20px Arial;text-align:center">WebGL is not supported on this device.</div>';
    throw e;
  }
  renderer.setPixelRatio(1);
  renderer.sortObjects = false;

  if ('outputColorSpace' in renderer && THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
  else if ('outputEncoding' in renderer && THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;

  document.getElementById('game-container').appendChild(renderer.domElement);
}

export function resizeGame() {
  const viewW = Math.max(1, window.visualViewport?.width || window.innerWidth);
  const viewH = Math.max(1, window.visualViewport?.height || window.innerHeight);
  camera.aspect = viewW / viewH;
  camera.updateProjectionMatrix();

  const scale = Math.min(1, CONFIG.maxRenderSize / Math.max(viewW, viewH));
  const renderW = Math.max(1, Math.round(viewW * scale));
  const renderH = Math.max(1, Math.round(viewH * scale));

  renderer.setPixelRatio(1);
  renderer.setSize(renderW, renderH, false);
}

scene.add(new THREE.AmbientLight(0xc2d6ca, 1.1));
export const lantern = new THREE.PointLight(0xffdf9e, 0.9, 18, 1.5);
scene.add(lantern);

export let walls = [];
export let dots = [];
export let powers = [];
export let ghosts = [];
export const playerStartPos = new THREE.Vector3(0, 1.7, 0);

let sharedMatWall = null;
let sharedMatTree = null;
let sharedMatDot = null;
let sharedMatBonus = null;

const placedPosts = new Set();

let floorMesh = null;
export let weaponMesh = null;
let weaponAttackTimer = 0;

export function gridToWorldX(gx) {
  return (gx - mapW / 2) * 4;
}
export function gridToWorldZ(gz) {
  return (gz - mapH / 2) * 4;
}
export function worldToGridX(wx) {
  return Math.max(0, Math.min(mapW - 1, Math.round(wx / 4 + mapW / 2)));
}
export function worldToGridZ(wz) {
  return Math.max(0, Math.min(mapH - 1, Math.round(wz / 4 + mapH / 2)));
}
function isCellWalkable(gx, gz) {
  return rawMap[gz] !== undefined && rawMap[gz][gx] !== undefined && rawMap[gz][gx] !== 1;
}

function freezeStaticObject(obj) {
  obj.matrixAutoUpdate = false;
  obj.updateMatrix();
}

function findNextStepBFS(startX, startZ, goalX, goalZ) {
  if (startX === goalX && startZ === goalZ) return -1;
  const visited = new Uint8Array(mapW * mapH);
  const queue = [];
  visited[startZ * mapW + startX] = 1;

  for (let d = 0; d < 4; d++) {
    const nx = startX + DIRS[d].x;
    const nz = startZ + DIRS[d].z;
    if (isCellWalkable(nx, nz)) {
      if (nx === goalX && nz === goalZ) return d;
      visited[nz * mapW + nx] = 1;
      queue.push({ x: nx, z: nz, firstDir: d });
    }
  }

  let head = 0;
  while (head < queue.length) {
    const curr = queue[head++];
    for (let d = 0; d < 4; d++) {
      const nx = curr.x + DIRS[d].x;
      const nz = curr.z + DIRS[d].z;
      const idx = nz * mapW + nx;
      if (isCellWalkable(nx, nz) && !visited[idx]) {
        if (nx === goalX && nz === goalZ) return curr.firstDir;
        visited[idx] = 1;
        queue.push({ x: nx, z: nz, firstDir: curr.firstDir });
      }
    }
  }
  return -1;
}

export function initStaticWorld() {
  sharedMatWall = new THREE.SpriteMaterial({ map: assets.get('wall'), transparent: false, alphaTest: 0.45 });
  sharedMatTree = new THREE.SpriteMaterial({ map: assets.get('tree'), transparent: false, alphaTest: 0.45 });
  sharedMatDot = new THREE.SpriteMaterial({ map: assets.get('dot'), transparent: false, alphaTest: 0.25 });
  sharedMatBonus = new THREE.SpriteMaterial({ map: assets.get('bonus'), transparent: false, alphaTest: 0.35 });

  // 1. Купол скайбокса
  const skyGeo = new THREE.SphereGeometry(115, 20, 12);
  const skyMat = new THREE.MeshBasicMaterial({
    map: assets.get('skybox'),
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
    fog: false
  });
  skyboxMesh = new THREE.Mesh(skyGeo, skyMat);
  skyboxMesh.frustumCulled = false;
  scene.add(skyboxMesh);

  // 2. Пол
  floorMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(110, 110),
    new THREE.MeshLambertMaterial({ map: assets.get('floor') })
  );
  floorMesh.rotation.x = -Math.PI / 2;
  freezeStaticObject(floorMesh);
  scene.add(floorMesh);

  // 3. Стены густого леса по периметру карты
  const borderW = mapW * 4 + 12;
  const borderD = mapH * 4 + 12;
  const borderH = 18;
  const borderMat = new THREE.MeshLambertMaterial({
    map: assets.get('forestBorder'),
    transparent: false,
    alphaTest: 0.4,
    side: THREE.DoubleSide
  });

  const northWall = new THREE.Mesh(new THREE.PlaneGeometry(borderW, borderH), borderMat);
  northWall.position.set(0, borderH / 2 - 0.5, -borderD / 2);
  freezeStaticObject(northWall);
  scene.add(northWall);

  const southWall = new THREE.Mesh(new THREE.PlaneGeometry(borderW, borderH), borderMat);
  southWall.position.set(0, borderH / 2 - 0.5, borderD / 2);
  southWall.rotation.y = Math.PI;
  freezeStaticObject(southWall);
  scene.add(southWall);

  const westWall = new THREE.Mesh(new THREE.PlaneGeometry(borderD, borderH), borderMat);
  westWall.position.set(-borderW / 2, borderH / 2 - 0.5, 0);
  westWall.rotation.y = Math.PI / 2;
  freezeStaticObject(westWall);
  scene.add(westWall);

  const eastWall = new THREE.Mesh(new THREE.PlaneGeometry(borderD, borderH), borderMat);
  eastWall.position.set(borderW / 2, borderH / 2 - 0.5, 0);
  eastWall.rotation.y = -Math.PI / 2;
  freezeStaticObject(eastWall);
  scene.add(eastWall);

  // 4. Оружие в руках: расположено на z = -0.2 (вплотную к камере) и пишет глубину в Z-буфер,
  // поэтому никакие спрайты столбов или деревьев никогда не нарисуются поверх руки!
  const weaponMat = new THREE.MeshBasicMaterial({
    map: assets.get('weaponIdle'),
    transparent: false,
    alphaTest: 0.3,
    depthTest: true,
    depthWrite: true,
    fog: false
  });
  weaponMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.18), weaponMat);
  weaponMesh.position.set(0.096, -0.09, -0.2);
  weaponMesh.visible = false;
  camera.add(weaponMesh);
  scene.add(camera);
}

export function triggerWeaponSwing() {
  weaponAttackTimer = 0.28;
  if (weaponMesh) {
    weaponMesh.visible = true;
    weaponMesh.material.map = assets.get('weaponAttack');
  }
}

export function updateWeapon(dt, isMoving, powerLeft) {
  if (!weaponMesh) return;
  const shouldShow = powerLeft > 0 || weaponAttackTimer > 0;
  weaponMesh.visible = shouldShow;
  if (!shouldShow) return;

  if (powerLeft > 0 && powerLeft < 1.5 && weaponAttackTimer <= 0) {
    weaponMesh.visible = Math.floor(powerLeft * 10) % 2 === 0;
  }

  if (weaponAttackTimer > 0) {
    weaponAttackTimer = Math.max(0, weaponAttackTimer - dt);
    const swing = Math.sin((1 - weaponAttackTimer / 0.28) * Math.PI);
    weaponMesh.position.set(0.096 - swing * 0.05, -0.09 + swing * 0.03, -0.2 + swing * 0.03);
    weaponMesh.rotation.z = swing * 0.65;
    if (weaponAttackTimer === 0) {
      weaponMesh.material.map = assets.get('weaponIdle');
      weaponMesh.rotation.z = 0;
    }
  } else {
    weaponMesh.position.x = 0.096;
    weaponMesh.position.y = isMoving ? -0.09 + Math.sin(performance.now() * 0.015) * 0.007 : -0.09;
    weaponMesh.position.z = -0.2;
  }
}

function createBlock(x, z) {
  const corners = [[-2, 2], [2, 2], [2, -2], [-2, -2]];
  for (let i = 0; i < corners.length; i++) {
    const px = x + corners[i][0];
    const pz = z + corners[i][1];
    const key = `${px},${pz}`;
    if (!placedPosts.has(key)) {
      placedPosts.add(key);
      const postSprite = new THREE.Sprite(sharedMatWall);
      postSprite.scale.set(0.85, 1.9, 1);
      postSprite.position.set(px, 0.95, pz);
      freezeStaticObject(postSprite);
      scene.add(postSprite);
    }
  }

  const treeSprite = new THREE.Sprite(sharedMatTree);
  treeSprite.scale.set(3.2, 6.0, 1);
  treeSprite.position.set(x, 3.0, z);
  freezeStaticObject(treeSprite);
  scene.add(treeSprite);

  walls.push({ x, z });
}

export class Ghost {
  constructor(tintColor, startGX, startGZ, onAggroCallback) {
    this.tintColor = tintColor;
    this.startGX = startGX;
    this.startGZ = startGZ;
    this.startPos = new THREE.Vector3(gridToWorldX(startGX), 1.8, gridToWorldZ(startGZ));
    this.onAggroCallback = onAggroCallback;

    this.material = new THREE.SpriteMaterial({
      map: assets.get('enemyNormal'),
      color: tintColor,
      transparent: false,
      alphaTest: 0.35
    });
    this.mesh = new THREE.Sprite(this.material);
    this.mesh.scale.set(2.2, 2.6, 1);
    this.mesh.position.copy(this.startPos);
    scene.add(this.mesh);

    this.gx = startGX;
    this.gz = startGZ;
    this.targetGX = startGX;
    this.targetGZ = startGZ;
    this.stepProgress = 0;
    this.lastDirIdx = -1;
    this.forceSteerTowardsPlayer = false;

    this.state = 'normal';
    this.visualState = '';
    this.isChasing = false;
    this.aggroCooldown = 0;
    this.respawn = 0;
    this.phaseOffset = Math.random() * Math.PI * 2;

    this.chooseNextCell(0.2);
  }

  resetToStart() {
    this.respawn = 0;
    this.isChasing = false;
    this.forceSteerTowardsPlayer = false;
    this.state = 'normal';
    this.applyVisualState();
    this.gx = this.startGX;
    this.gz = this.startGZ;
    this.targetGX = this.startGX;
    this.targetGZ = this.startGZ;
    this.stepProgress = 0;
    this.lastDirIdx = -1;
    this.mesh.position.set(gridToWorldX(this.startGX), 1.8, gridToWorldZ(this.startGZ));
    this.mesh.visible = true;
    this.chooseNextCell(0.2);
  }

  orientTowardsPlayerImmediately() {
    const pGX = worldToGridX(camera.position.x);
    const pGZ = worldToGridZ(camera.position.z);
    this.forceSteerTowardsPlayer = true;

    const distFromOrigin = Math.hypot(pGX - this.gx, pGZ - this.gz);
    const distFromTarget = Math.hypot(pGX - this.targetGX, pGZ - this.targetGZ);

    if (this.stepProgress > 0 && distFromOrigin < distFromTarget) {
      const tmpX = this.gx, tmpZ = this.gz;
      this.gx = this.targetGX;
      this.gz = this.targetGZ;
      this.targetGX = tmpX;
      this.targetGZ = tmpZ;
      this.stepProgress = 1 - this.stepProgress;
      if (this.lastDirIdx >= 0) this.lastDirIdx = (this.lastDirIdx + 2) % 4;
    } else if (this.stepProgress === 0) {
      this.chooseNextCell(1.0);
    }
  }

  chooseNextCell(smartness = 0.2) {
    const validDirs = [];
    const oppositeDir = this.lastDirIdx >= 0 ? (this.lastDirIdx + 2) % 4 : -1;

    for (let i = 0; i < 4; i++) {
      const nx = this.gx + DIRS[i].x;
      const nz = this.gz + DIRS[i].z;
      if (isCellWalkable(nx, nz)) {
        validDirs.push(i);
      }
    }

    if (validDirs.length === 0) {
      this.targetGX = this.gx;
      this.targetGZ = this.gz;
      this.stepProgress = 0;
      return;
    }

    let candidates = validDirs.length > 1
      ? validDirs.filter(d => d !== oppositeDir)
      : validDirs;

    let chosenDir = candidates[Math.floor(Math.random() * candidates.length)];
    const pGX = worldToGridX(camera.position.x);
    const pGZ = worldToGridZ(camera.position.z);

    if (this.state === 'chase' && (this.forceSteerTowardsPlayer || Math.random() < smartness)) {
      this.forceSteerTowardsPlayer = false;
      const bfsDir = findNextStepBFS(this.gx, this.gz, pGX, pGZ);
      if (bfsDir >= 0 && validDirs.includes(bfsDir)) {
        chosenDir = bfsDir;
      }
    } else if (this.state === 'frightened') {
      let maxDist = -1;
      for (let i = 0; i < candidates.length; i++) {
        const dIdx = candidates[i];
        const wx = gridToWorldX(this.gx + DIRS[dIdx].x);
        const wz = gridToWorldZ(this.gz + DIRS[dIdx].z);
        const dist = Math.hypot(camera.position.x - wx, camera.position.z - wz);
        if (dist > maxDist) {
          maxDist = dist;
          chosenDir = dIdx;
        }
      }
    }

    this.lastDirIdx = chosenDir;
    this.targetGX = this.gx + DIRS[chosenDir].x;
    this.targetGZ = this.gz + DIRS[chosenDir].z;
    this.stepProgress = 0;
  }

  applyVisualState() {
    if (this.visualState === this.state) return;
    this.visualState = this.state;
    if (this.state === 'frightened') {
      this.material.map = assets.get('enemyScared');
      this.material.color.setHex(0xffffff);
    } else if (this.state === 'chase') {
      this.material.map = assets.get('enemyChase');
      this.material.color.setHex(0xffffff);
    } else {
      this.material.map = assets.get('enemyNormal');
      this.material.color.setHex(this.tintColor);
    }
  }

  update(dt, diff, graceTimer) {
    if (this.respawn > 0) {
      this.respawn -= dt;
      if (this.respawn <= 0) {
        this.resetToStart();
      }
      return;
    }

    this.aggroCooldown = Math.max(0, this.aggroCooldown - dt);

    const dxPlayer = camera.position.x - this.mesh.position.x;
    const dzPlayer = camera.position.z - this.mesh.position.z;
    const distToPlayer = Math.hypot(dxPlayer, dzPlayer);

    if (this.state !== 'frightened') {
      if (graceTimer <= 0 && !this.isChasing && distToPlayer < diff.aggroRadius) {
        this.isChasing = true;
        this.state = 'chase';
        this.orientTowardsPlayerImmediately();

        if (this.aggroCooldown <= 0) {
          this.aggroCooldown = CONFIG.aggroSoundCooldown;
          audio.triggerEnemyAggro();
          debug.log('AI', 'Враг заметил игрока и повернул в погоню');
          if (this.onAggroCallback) {
            const t = LANGS[sdkState.currentLang] || LANGS.en;
            this.onAggroCallback(t.chaseAlert, '#ff5e6c');
          }
        }
      } else if (this.isChasing && (distToPlayer > diff.deaggroRadius || graceTimer > 0)) {
        this.isChasing = false;
        this.forceSteerTowardsPlayer = false;
        this.state = 'normal';
      } else {
        this.state = this.isChasing ? 'chase' : 'normal';
      }
    } else {
      this.isChasing = false;
      this.forceSteerTowardsPlayer = false;
    }

    this.applyVisualState();

    let speed = diff.ghostSpeed * debug.speedMultiplier;
    if (this.state === 'frightened') speed = 1.65 * debug.speedMultiplier;
    else if (this.state === 'chase') speed = diff.ghostSpeed * diff.chaseMult * debug.speedMultiplier;

    let progressStep = (speed * dt) / CONFIG.blockSize;

    while (progressStep > 0) {
      if (this.gx === this.targetGX && this.gz === this.targetGZ) {
        this.chooseNextCell(diff.smartness);
        if (this.gx === this.targetGX && this.gz === this.targetGZ) break;
      }

      const needed = 1 - this.stepProgress;
      if (progressStep >= needed) {
        this.gx = this.targetGX;
        this.gz = this.targetGZ;
        this.stepProgress = 0;
        progressStep -= needed;
        this.chooseNextCell(diff.smartness);
      } else {
        this.stepProgress += progressStep;
        progressStep = 0;
      }
    }

    const startWX = gridToWorldX(this.gx);
    const startWZ = gridToWorldZ(this.gz);
    const endWX = gridToWorldX(this.targetGX);
    const endWZ = gridToWorldZ(this.targetGZ);

    this.mesh.position.x = startWX + (endWX - startWX) * this.stepProgress;
    this.mesh.position.z = startWZ + (endWZ - startWZ) * this.stepProgress;
    this.mesh.position.y = 1.8 + Math.sin(performance.now() * 0.004 + this.phaseOffset) * 0.18;
  }
}

let levelBuiltOnce = false;

export function buildLevel(gameState, extraBonusesCount, onAggroCallback) {
  if (!levelBuiltOnce) {
    levelBuiltOnce = true;
    for (let z = 0; z < mapH; z++) {
      for (let x = 0; x < mapW; x++) {
        const t = rawMap[z][x];
        const wx = gridToWorldX(x);
        const wz = gridToWorldZ(z);

        if (t === 1) createBlock(wx, wz);

        if (t === 0 || t === 9) {
          const d = new THREE.Sprite(sharedMatDot);
          d.scale.set(0.75, 0.75, 1);
          d.position.set(wx, 1.0, wz);
          freezeStaticObject(d);
          scene.add(d);
          dots.push(d);
        }

        if (t === 3) {
          const p = new THREE.Sprite(sharedMatBonus);
          p.scale.set(1.3, 1.3, 1);
          p.position.set(wx, 1.1, wz);
          p.userData.isBase = true;
          freezeStaticObject(p);
          scene.add(p);
          powers.push(p);
        }

        if (t === 2) playerStartPos.set(wx, 1.7, wz);

        if (t === 9) {
          const colors = [0xffffff, 0xe2d4f0, 0xc8f0e4];
          ghosts.push(new Ghost(colors[ghosts.length % 3], x, z, onAggroCallback));
        }
      }
    }
  }

  gameState.dotsLeft = dots.length;
  for (let i = 0; i < dots.length; i++) {
    dots[i].visible = true;
  }

  for (let i = powers.length - 1; i >= 0; i--) {
    if (!powers[i].userData.isBase) {
      scene.remove(powers[i]);
      powers.splice(i, 1);
    } else {
      powers[i].visible = true;
    }
  }

  if (extraBonusesCount > 0) {
    const candidates = dots.filter(d => d.position.distanceTo(playerStartPos) > 8);
    for (let i = 0; i < extraBonusesCount && candidates.length; i++) {
      const n = Math.floor((i + 0.5) * candidates.length / extraBonusesCount);
      const d = candidates[Math.min(n, candidates.length - 1)];
      const p = new THREE.Sprite(sharedMatBonus);
      p.scale.set(1.3, 1.3, 1);
      p.position.copy(d.position);
      p.userData.isBase = false;
      freezeStaticObject(p);
      scene.add(p);
      powers.push(p);
    }
  }

  for (let i = 0; i < ghosts.length; i++) {
    ghosts[i].resetToStart();
  }
}

const particleGeometry = new THREE.BufferGeometry();
const particlePositions = new Float32Array(96 * 3);
const particleColors = new Float32Array(96 * 3);
export const particles = Array.from({ length: 96 }, () => ({ life: 0, vx: 0, vy: 0, vz: 0 }));
particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
particleGeometry.setAttribute('color', new THREE.BufferAttribute(particleColors, 3));
const particleMaterial = new THREE.PointsMaterial({
  size: 0.17,
  vertexColors: true,
  transparent: true,
  opacity: 0.7,
  depthWrite: false
});
const particleMesh = new THREE.Points(particleGeometry, particleMaterial);
particleMesh.frustumCulled = false;
scene.add(particleMesh);

let particleCursor = 0;
let activeParticlesCount = 0;

export function burst(pos, color) {
  const c = new THREE.Color(color);
  for (let i = 0; i < 32; i++) {
    const k = particleCursor++ % particles.length;
    const p = particles[k];
    p.life = 0.8 + Math.random() * 0.4;
    p.vx = (Math.random() - 0.5) * 4;
    p.vy = Math.random() * 2 + 0.5;
    p.vz = (Math.random() - 0.5) * 4;
    particlePositions[k * 3] = pos.x;
    particlePositions[k * 3 + 1] = pos.y;
    particlePositions[k * 3 + 2] = pos.z;
    particleColors[k * 3] = c.r;
    particleColors[k * 3 + 1] = c.g;
    particleColors[k * 3 + 2] = c.b;
  }
  activeParticlesCount = 32;
  particleGeometry.attributes.position.needsUpdate = true;
  particleGeometry.attributes.color.needsUpdate = true;
}

export function resetParticles() {
  for (let i = 0; i < particles.length; i++) {
    particles[i].life = 0;
    particlePositions[i * 3 + 1] = -1000;
  }
  activeParticlesCount = 0;
  particleGeometry.attributes.position.needsUpdate = true;
}

export function stepParticles(dt) {
  if (activeParticlesCount <= 0) return;
  let alive = 0;
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    if (p.life > 0) {
      p.life -= dt;
      if (p.life > 0) {
        alive++;
        particlePositions[i * 3] += p.vx * dt;
        particlePositions[i * 3 + 1] += p.vy * dt;
        particlePositions[i * 3 + 2] += p.vz * dt;
        p.vx *= Math.exp(-2 * dt);
        p.vz *= Math.exp(-2 * dt);
      } else {
        particlePositions[i * 3 + 1] = -1000;
      }
    }
  }
  activeParticlesCount = alive;
  particleGeometry.attributes.position.needsUpdate = true;
}