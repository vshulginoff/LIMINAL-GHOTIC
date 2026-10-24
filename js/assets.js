import { ASSETS } from './config.js';
import { debug } from './debug.js';

const SPRITE_KEYS = new Set([
  'wall',
  'tree',
  'dot',
  'bonus',
  'enemyNormal',
  'enemyChase',
  'enemyScared',
  'weaponIdle',
  'weaponAttack',
  'forestBorder'
]);

class AssetManager {
  constructor() {
    this.textures = {};
    this.loader = new THREE.TextureLoader();
  }

  applyColorSpace(tex) {
    if ('colorSpace' in tex && THREE.SRGBColorSpace) {
      tex.colorSpace = THREE.SRGBColorSpace;
    } else if ('encoding' in tex && THREE.sRGBEncoding) {
      tex.encoding = THREE.sRGBEncoding;
    }
    return tex;
  }

  configureWrapping(key, tex) {
    if (key === 'floor') {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(25, 25);
    } else if (key === 'forestBorder') {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.repeat.set(4, 1);
      tex.generateMipmaps = false;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
    } else if (SPRITE_KEYS.has(key)) {
      tex.generateMipmaps = false;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
    }
  }

  defringeSprite(image, key) {
    const w = image.width;
    const h = image.height;
    if (!w || !h) return image;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0);

    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;
    const total = w * h;

    for (let i = 0; i < total; i++) {
      const idx = i * 4;
      if (d[idx + 3] < 215) {
        d[idx + 3] = 0;
      } else {
        d[idx + 3] = 255;
      }
    }

    const dirs = [-1, 0, 1, 0, 0, -1, 0, 1, -1, -1, 1, -1, -1, 1, 1, 1];
    for (let pass = 0; pass < 2; pass++) {
      const toRemove = [];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          const idx = i * 4;
          if (d[idx + 3] === 0) continue;

          let isEdge = false;
          for (let k = 0; k < 16; k += 2) {
            const nx = x + dirs[k];
            const ny = y + dirs[k + 1];
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) {
              if (key !== 'forestBorder') isEdge = true;
              continue;
            }
            if (d[(ny * w + nx) * 4 + 3] === 0) {
              isEdge = true;
              break;
            }
          }

          if (!isEdge) continue;

          const r = d[idx];
          const g = d[idx + 1];
          const b = d[idx + 2];
          const isBrightOrWhite = (r > 155 && g > 155 && b > 155) || ((r + g + b) > 500);

          if (pass === 0 || isBrightOrWhite) {
            toRemove.push(idx);
          }
        }
      }

      for (let i = 0; i < toRemove.length; i++) {
        d[toRemove[i] + 3] = 0;
      }
    }

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        if (d[idx + 3] > 0) continue;

        let rSum = 0, gSum = 0, bSum = 0, count = 0;
        for (let k = 0; k < 16; k += 2) {
          const nx = x + dirs[k];
          const ny = y + dirs[k + 1];
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          const nIdx = (ny * w + nx) * 4;
          if (d[nIdx + 3] > 0) {
            rSum += d[nIdx];
            gSum += d[nIdx + 1];
            bSum += d[nIdx + 2];
            count++;
          }
        }

        if (count > 0) {
          d[idx]     = Math.round(rSum / count);
          d[idx + 1] = Math.round(gSum / count);
          d[idx + 2] = Math.round(bSum / count);
          d[idx + 3] = 0;
        } else {
          d[idx] = d[idx + 1] = d[idx + 2] = 0;
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
    return canvas;
  }

  createFallbackTexture(key) {
    const canvas = document.createElement('canvas');

    if (key === 'skybox') {
      canvas.width = 1024;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');
      const grad = ctx.createLinearGradient(0, 0, 0, 512);
      grad.addColorStop(0, '#050b12');
      grad.addColorStop(0.55, '#122632');
      grad.addColorStop(1, '#193a46');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1024, 512);

      ctx.fillStyle = 'rgba(220, 240, 255, 0.75)';
      for (let i = 0; i < 140; i++) {
        const sx = (Math.sin(i * 78.233) * 0.5 + 0.5) * 1024;
        const sy = (Math.cos(i * 45.164) * 0.5 + 0.5) * 250;
        ctx.fillRect(sx, sy, 2, 2);
      }

      const mx = 256, my = 150;
      const moonGlow = ctx.createRadialGradient(mx, my, 18, mx, my, 145);
      moonGlow.addColorStop(0, 'rgba(255, 252, 225, 1)');
      moonGlow.addColorStop(0.32, 'rgba(235, 245, 215, 0.95)');
      moonGlow.addColorStop(0.52, 'rgba(150, 210, 210, 0.25)');
      moonGlow.addColorStop(1, 'rgba(25, 58, 70, 0)');
      ctx.fillStyle = moonGlow;
      ctx.beginPath();
      ctx.arc(mx, my, 145, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(165, 180, 170, 0.35)';
      ctx.beginPath();
      ctx.arc(mx - 18, my - 10, 13, 0, Math.PI * 2);
      ctx.arc(mx + 20, my + 12, 17, 0, Math.PI * 2);
      ctx.arc(mx - 5, my + 24, 9, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(10, 22, 30, 0.55)';
      for (let i = 0; i < 12; i++) {
        ctx.beginPath();
        ctx.ellipse(i * 95 + 30, 185 + (i % 3) * 20, 88, 18, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      return this.applyColorSpace(new THREE.CanvasTexture(canvas));
    }

    if (key === 'forestBorder') {
      canvas.width = 512;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, 512, 256);

      for (let layer = 0; layer < 2; layer++) {
        const count = layer === 0 ? 18 : 14;
        for (let i = 0; i <= count; i++) {
          const tx = (i / count) * 512;
          const th = layer === 0 ? 195 + (i % 3) * 16 : 155 + (i % 2) * 20;
          const tw = layer === 0 ? 48 : 56;
          ctx.fillStyle = layer === 0 ? '#0c2024' : '#13302c';
          ctx.beginPath();
          ctx.moveTo(tx, 256 - th);
          ctx.lineTo(tx + tw, 256);
          ctx.lineTo(tx - tw, 256);
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.fillStyle = '#0a181a';
      ctx.fillRect(0, 232, 512, 24);

      return this.applyColorSpace(new THREE.CanvasTexture(canvas));
    }

    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    const palettes = {
      floor:        { bg: '#626e68', fg: '#535e59', shape: 'grid' },
      wall:         { bg: '#766c50', fg: '#5c533c', shape: 'wood' },
      tree:         { bg: 'transparent', fg: '#315c40', shape: 'cone' },
      dot:          { bg: 'transparent', fg: '#ffe7a0', shape: 'circle' },
      bonus:        { bg: 'transparent', fg: '#90e6c1', shape: 'diamond' },
      enemyNormal:  { bg: 'transparent', fg: '#9facbb', shape: 'ghost' },
      enemyChase:   { bg: 'transparent', fg: '#ff4d5e', shape: 'ghost' },
      enemyScared:  { bg: 'transparent', fg: '#5566ff', shape: 'ghost' },
      weaponIdle:   { bg: 'transparent', fg: '#888899', shape: 'axe' },
      weaponAttack: { bg: 'transparent', fg: '#ff9999', shape: 'axe' }
    };

    const p = palettes[key] || { bg: '#777', fg: '#fff', shape: 'circle' };
    if (p.bg !== 'transparent') {
      ctx.fillStyle = p.bg;
      ctx.fillRect(0, 0, 64, 64);
    }

    ctx.fillStyle = p.fg;
    if (p.shape === 'grid') {
      ctx.strokeStyle = p.fg; ctx.lineWidth = 2; ctx.strokeRect(2, 2, 60, 60);
    } else if (p.shape === 'wood') {
      ctx.fillRect(8, 0, 12, 64); ctx.fillRect(44, 0, 12, 64);
    } else if (p.shape === 'cone') {
      ctx.beginPath(); ctx.moveTo(32, 4); ctx.lineTo(58, 60); ctx.lineTo(6, 60); ctx.closePath(); ctx.fill();
    } else if (p.shape === 'circle') {
      ctx.beginPath(); ctx.arc(32, 32, 16, 0, Math.PI * 2); ctx.fill();
    } else if (p.shape === 'diamond') {
      ctx.beginPath(); ctx.moveTo(32, 8); ctx.lineTo(56, 32); ctx.lineTo(32, 56); ctx.lineTo(8, 32); ctx.closePath(); ctx.fill();
    } else if (p.shape === 'ghost') {
      ctx.beginPath();
      ctx.arc(32, 24, 18, Math.PI, 0);
      ctx.lineTo(50, 58); ctx.lineTo(38, 50); ctx.lineTo(32, 58); ctx.lineTo(26, 50); ctx.lineTo(14, 58);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(22, 20, 6, 6); ctx.fillRect(36, 20, 6, 6);
    } else if (p.shape === 'axe') {
      ctx.fillStyle = '#766c50'; ctx.fillRect(30, 16, 6, 46);
      ctx.fillStyle = p.fg;
      ctx.beginPath(); ctx.moveTo(32, 12); ctx.lineTo(54, 6); ctx.lineTo(54, 30); ctx.lineTo(32, 24); ctx.closePath(); ctx.fill();
    }

    return this.applyColorSpace(new THREE.CanvasTexture(canvas));
  }

  createFallbackUIPlateDataURL(key) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = key === 'uiPanel' ? 192 : 72;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;

    const styles = {
      uiTitle: { bg1: '#1a2224', bg2: '#0e1415', border: '#5c706b', glow: '#1f2b28' },
      uiPanel: { bg1: '#182126', bg2: '#0d1316', border: '#526663', glow: '#202e2c' },
      uiBtn:   { bg1: '#28383b', bg2: '#152022', border: '#75968f', glow: '#2f4540' },
      uiHud:   { bg1: '#1a2224', bg2: '#0e1415', border: '#5c706b', glow: '#1f2b28' },
      uiPopup: { bg1: '#1a2d27', bg2: '#0c1714', border: '#65b891', glow: '#204a37' }
    };
    const s = styles[key] || styles.uiHud;

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, s.bg1);
    grad.addColorStop(1, s.bg2);

    ctx.fillStyle = grad;
    ctx.strokeStyle = s.border;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(3, 3, w - 6, h - 6, 8);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = s.glow;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(8, 8, w - 16, h - 16);

    ctx.fillStyle = s.border;
    [[12, 12], [w - 12, 12], [12, h - 12], [w - 12, h - 12]].forEach(([rx, ry]) => {
      ctx.beginPath();
      ctx.arc(rx, ry, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });

    return canvas.toDataURL('image/png');
  }

  loadUIPlate(key, url, cssVarName) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        document.documentElement.style.setProperty(cssVarName, `url('${url}')`);
        resolve();
      };
      img.onerror = () => {
        // Если нет отдельного файла ui_title.png, пробуем применить существующий ui_hud.png
        if (key === 'uiTitle') {
          const fallbackHud = new Image();
          fallbackHud.onload = () => {
            document.documentElement.style.setProperty(cssVarName, `url('${ASSETS.uiPlates.uiHud}')`);
            resolve();
          };
          fallbackHud.onerror = () => {
            const dataUrl = this.createFallbackUIPlateDataURL(key);
            document.documentElement.style.setProperty(cssVarName, `url('${dataUrl}')`);
            resolve();
          };
          fallbackHud.src = ASSETS.uiPlates.uiHud;
          return;
        }
        const dataUrl = this.createFallbackUIPlateDataURL(key);
        document.documentElement.style.setProperty(cssVarName, `url('${dataUrl}')`);
        resolve();
      };
      img.src = url;
    });
  }

  loadTexture(key, url) {
    return new Promise(resolve => {
      this.loader.load(
        url,
        tex => {
          if (SPRITE_KEYS.has(key) && tex.image) {
            tex.image = this.defringeSprite(tex.image, key);
            tex.needsUpdate = true;
          }
          this.applyColorSpace(tex);
          this.configureWrapping(key, tex);
          this.textures[key] = tex;
          debug.log('ASSET', `Загружена текстура: ${url}`);
          resolve(tex);
        },
        undefined,
        () => {
          const fallback = this.createFallbackTexture(key);
          this.configureWrapping(key, fallback);
          this.textures[key] = fallback;
          debug.log('ASSET_FALLBACK', `Текстура ${url} заменена процедурной`);
          resolve(fallback);
        }
      );
    });
  }

  async loadAll() {
    const texPromises = Object.entries(ASSETS.textures).map(([k, url]) => this.loadTexture(k, url));
    const cssMap = {
      uiTitle: '--plate-title',
      uiPanel: '--plate-panel',
      uiBtn:   '--plate-btn',
      uiHud:   '--plate-hud',
      uiPopup: '--plate-popup'
    };
    const platePromises = Object.entries(ASSETS.uiPlates).map(([k, url]) =>
      this.loadUIPlate(k, url, cssMap[k])
    );
    await Promise.all([...texPromises, ...platePromises]);
  }

  get(key) {
    return this.textures[key];
  }
}

export const assets = new AssetManager();