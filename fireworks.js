(() => {
  const canvas = document.getElementById("sky");
  const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });

  const COLORS = [
    "#ff4d6d",
    "#ff85a1",
    "#ffd166",
    "#7bdff2",
    "#b388ff",
    "#ff9eed",
    "#ffffff",
  ];

  const HEART_COLORS = [
    "#ff2d5c",
    "#ff3b6b",
    "#ff5c85",
    "#ff8fb3",
    "#ffc0d4",
    "#ffffff",
  ];

  // 池容量按桌面峰值分配；移动端用运行时上限节流
  const FW_POOL = 260;
  const HEART_POOL = 560;
  const MAX_ROCKETS_DESKTOP = 4;
  const MAX_ROCKETS_MOBILE = 3;

  let width = 0;
  let height = 0;
  let dpr = 1;
  let isMobile = false;
  let maxFw = 220;
  let maxRockets = MAX_ROCKETS_DESKTOP;
  let maxHeart = 560;
  let heartEmitPerSec = 260;
  let lastRandomBurst = 0;
  let running = true;
  let rafId = 0;
  let fwActive = 0;
  let fwCursor = 0;
  let heartActive = 0;
  let heartCursor = 0;
  let lastTime = 0;
  let heartCx = 0;
  let heartCy = 0;
  let heartScale = 1;

  const fw = new Array(FW_POOL);
  for (let i = 0; i < FW_POOL; i++) {
    fw[i] = {
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      color: COLORS[0],
      life: 0,
      decay: 0.02,
      size: 2,
      gravity: 0.04,
      friction: 0.985,
    };
  }

  const heart = new Array(HEART_POOL);
  for (let i = 0; i < HEART_POOL; i++) {
    heart[i] = {
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 1,
      size: 2,
      color: HEART_COLORS[0],
    };
  }

  const rockets = [];
  const rocketPool = [];
  const stars = [];

  function detectMobile() {
    return (
      window.matchMedia("(max-width: 640px)").matches ||
      window.matchMedia("(pointer: coarse)").matches ||
      /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    );
  }

  function applyQualityProfile() {
    isMobile = detectMobile();
    const small = Math.min(width, height) < 500;
    if (isMobile || small) {
      maxFw = 120;
      maxHeart = 380;
      maxRockets = MAX_ROCKETS_MOBILE;
      heartEmitPerSec = 180;
      dpr = Math.min(window.devicePixelRatio || 1, 1.15);
    } else {
      maxFw = 220;
      maxHeart = 560;
      maxRockets = MAX_ROCKETS_DESKTOP;
      heartEmitPerSec = 260;
      dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    }
  }

  function viewportSize() {
    const vv = window.visualViewport;
    if (vv) {
      return { w: Math.round(vv.width), h: Math.round(vv.height) };
    }
    return { w: window.innerWidth, h: window.innerHeight };
  }

  function acquireRocket() {
    const r = rocketPool.pop() || {
      x: 0,
      y: 0,
      tx: 0,
      ty: 0,
      vx: 0,
      vy: 0,
      color: COLORS[0],
      trailX: new Float32Array(6),
      trailY: new Float32Array(6),
      trailLen: 0,
      trailIdx: 0,
    };
    r.trailLen = 0;
    r.trailIdx = 0;
    return r;
  }

  function releaseRocket(r) {
    rocketPool.push(r);
  }

  function pointOnHeart(t, scale) {
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = -(
      13 * Math.cos(t) -
      5 * Math.cos(2 * t) -
      2 * Math.cos(3 * t) -
      Math.cos(4 * t)
    );
    return { x: x * scale, y: y * scale };
  }

  function layoutHeart() {
    const portrait = height >= width;
    const landscapePhone = isMobile && !portrait;

    heartCx = width * 0.5;
    if (landscapePhone) {
      heartCy = height * 0.42;
      heartScale = Math.min(width, height) * 0.028;
    } else if (isMobile) {
      // 竖屏：爱心偏上，给底部文案留空
      heartCy = height * 0.34;
      heartScale = Math.min(width, height) * 0.024;
    } else {
      heartCy = height * 0.36;
      heartScale = Math.min(width, height) * 0.02;
    }
  }

  function resize() {
    const size = viewportSize();
    width = size.w;
    height = size.h;
    applyQualityProfile();

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#050510";
    ctx.fillRect(0, 0, width, height);

    layoutHeart();
    buildStars();
  }

  function buildStars() {
    const dens = isMobile ? 42000 : 30000;
    const cap = isMobile ? 24 : 40;
    const count = Math.min(cap, Math.floor((width * height) / dens));
    stars.length = 0;
    for (let i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * width,
        y: Math.random() * height * 0.7,
        r: Math.random() * 1.1 + 0.3,
        a: Math.random() * 0.45 + 0.2,
        twinkle: Math.random() * Math.PI * 2,
        speed: 0.3 + Math.random() * 0.8,
      });
    }
  }

  function pickColor() {
    return COLORS[(Math.random() * COLORS.length) | 0];
  }

  function spawnFw(x, y, vx, vy, color, opts) {
    if (fwActive >= maxFw) return;
    for (let n = 0; n < FW_POOL; n++) {
      const i = (fwCursor + n) % FW_POOL;
      const p = fw[i];
      if (p.active) continue;
      fwCursor = (i + 1) % FW_POOL;
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = vx;
      p.vy = vy;
      p.color = color;
      p.life = opts.life;
      p.decay = opts.decay;
      p.size = opts.size;
      p.gravity = opts.gravity;
      p.friction = opts.friction;
      fwActive++;
      return;
    }
  }

  function spawnHeartParticle(x, y, vx, vy, color, life, size) {
    if (heartActive >= maxHeart) return;
    for (let n = 0; n < HEART_POOL; n++) {
      const i = (heartCursor + n) % HEART_POOL;
      const p = heart[i];
      if (p.active) continue;
      heartCursor = (i + 1) % HEART_POOL;
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = vx;
      p.vy = vy;
      p.color = color;
      p.life = life;
      p.maxLife = life;
      p.size = size;
      heartActive++;
      return;
    }
  }

  function emitHeart(dt, time) {
    const pulse = 1 + Math.sin(time * 0.0022) * 0.035;
    const scale = heartScale * pulse;
    const amount = heartEmitPerSec * dt;
    const sizeBoost = isMobile ? 1.15 : 1;

    for (let i = 0; i < amount; i++) {
      const t = Math.random() * Math.PI * 2;
      const edge = 0.92 + Math.random() * 0.12;
      const pt = pointOnHeart(t, scale * edge);
      const len = Math.hypot(pt.x, pt.y) || 1;
      const speed = (18 + Math.random() * 28) / 60;
      spawnHeartParticle(
        heartCx + pt.x,
        heartCy + pt.y,
        (pt.x / len) * speed * (0.2 + Math.random() * 0.5),
        (pt.y / len) * speed * (0.2 + Math.random() * 0.5),
        HEART_COLORS[(Math.random() * HEART_COLORS.length) | 0],
        0.9 + Math.random() * 1.1,
        (2.2 + Math.random() * 2.8) * sizeBoost
      );
    }

    const fill = amount * (isMobile ? 0.95 : 0.85);
    for (let i = 0; i < fill; i++) {
      const t = Math.random() * Math.PI * 2;
      const r = Math.pow(Math.random(), 0.55) * 0.88;
      const pt = pointOnHeart(t, scale * r);
      spawnHeartParticle(
        heartCx + pt.x + (Math.random() - 0.5) * 3,
        heartCy + pt.y + (Math.random() - 0.5) * 3,
        (Math.random() - 0.5) * 0.2,
        (Math.random() - 0.5) * 0.2,
        HEART_COLORS[(Math.random() * 4) | 0],
        0.7 + Math.random() * 0.7,
        (1.8 + Math.random() * 2.2) * sizeBoost
      );
    }
  }

  function updateHeart(dt) {
    for (let i = 0; i < HEART_POOL; i++) {
      const p = heart[i];
      if (!p.active) continue;
      p.vx *= 0.97;
      p.vy *= 0.97;
      p.x += p.vx * dt * 60;
      p.y += p.vy * dt * 60;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        heartActive--;
      }
    }
    if (heartActive < 0) heartActive = 0;
  }

  function drawHeart() {
    for (let i = 0; i < HEART_POOL; i++) {
      const p = heart[i];
      if (!p.active) continue;
      const k = p.life / p.maxLife;
      const s = p.size * (0.55 + 0.55 * k);
      ctx.globalAlpha = Math.min(1, 0.35 + k * 0.95);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - s * 0.5, p.y - s * 0.5, s, s);
    }
    ctx.globalAlpha = 1;
  }

  function explodeCircle(x, y, color) {
    const count = Math.min(isMobile ? 28 : 36, Math.max(0, maxFw - fwActive));
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.15;
      const speed = 2 + Math.random() * 4;
      spawnFw(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, color, {
        life: 1.8,
        decay: 0.007 + Math.random() * 0.005,
        size: 1.2 + Math.random() * 1.5,
        gravity: 0.038,
        friction: 0.985,
      });
    }
  }

  function launchRocket(targetX, targetY, color) {
    if (rockets.length >= maxRockets) return;
    const r = acquireRocket();
    const ox = (Math.random() - 0.5) * 36;
    r.x = targetX + ox;
    r.y = height + 8;
    r.tx = targetX;
    r.ty = targetY;
    r.vx = -ox * 0.015;
    r.vy = -(7 + Math.random() * 2);
    r.color = color;
    rockets.push(r);
  }

  function scheduleBursts(now) {
    if (fwActive > maxFw * 0.85) return;
    const gap = isMobile ? 1400 + Math.random() * 1000 : 1000 + Math.random() * 800;
    if (now - lastRandomBurst > gap) {
      lastRandomBurst = now;
      const side =
        Math.random() < 0.5 ? 0.12 + Math.random() * 0.2 : 0.68 + Math.random() * 0.2;
      launchRocket(width * side, height * (0.12 + Math.random() * 0.28), pickColor());
    }
  }

  function updateRockets() {
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i];
      const ti = r.trailIdx % 6;
      r.trailX[ti] = r.x;
      r.trailY[ti] = r.y;
      r.trailIdx++;
      if (r.trailLen < 6) r.trailLen++;

      r.x += r.vx;
      r.y += r.vy;
      r.vy += 0.05;
      r.vx += (r.tx - r.x) * 0.002;

      if (r.vy >= -1.1 || r.y <= r.ty) {
        explodeCircle(r.x, r.y, r.color);
        releaseRocket(r);
        rockets.splice(i, 1);
      }
    }
  }

  function updateFw() {
    for (let i = 0; i < FW_POOL; i++) {
      const p = fw[i];
      if (!p.active) continue;
      p.vx *= p.friction;
      p.vy *= p.friction;
      p.vy += p.gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.life -= p.decay;
      if (p.life <= 0) {
        p.active = false;
        fwActive--;
      }
    }
    if (fwActive < 0) fwActive = 0;
  }

  function drawBackground() {
    // 略减每帧淡化强度，烟花拖尾保留更久
    ctx.fillStyle = "rgba(5, 5, 16, 0.14)";
    ctx.fillRect(0, 0, width, height);
  }

  function drawStars(time) {
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      ctx.globalAlpha =
        s.a * (0.6 + 0.4 * Math.sin(time * 0.001 * s.speed + s.twinkle));
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }
    ctx.globalAlpha = 1;
  }

  function drawRockets() {
    for (let i = 0; i < rockets.length; i++) {
      const r = rockets[i];
      const start = r.trailIdx - r.trailLen;
      for (let t = 0; t < r.trailLen; t++) {
        const idx = (start + t + 6000) % 6;
        ctx.globalAlpha = ((t + 1) / r.trailLen) * 0.45;
        ctx.fillStyle = "#ffdcc8";
        ctx.fillRect(r.trailX[idx] - 1, r.trailY[idx] - 1, 2, 2);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = r.color;
      ctx.fillRect(r.x - 2, r.y - 2, 4, 4);
    }
  }

  function drawFw() {
    for (let i = 0; i < FW_POOL; i++) {
      const p = fw[i];
      if (!p.active) continue;
      const s = p.size * (0.65 + 0.35 * p.life);
      ctx.globalAlpha = Math.min(1, p.life * 1.05);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - s * 0.5, p.y - s * 0.5, s, s);
    }
    ctx.globalAlpha = 1;
  }

  function burstAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * width;
    const y = ((clientY - rect.top) / rect.height) * height;
    explodeCircle(x, y, pickColor());
  }

  function loop(now) {
    if (!running) return;
    if (!lastTime) lastTime = now;
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    if (dt > 0.05) dt = 0.05;

    scheduleBursts(now);
    drawBackground();
    drawStars(now);
    updateRockets();
    updateFw();
    emitHeart(dt, now);
    updateHeart(dt);
    drawRockets();
    drawFw();
    drawHeart();

    rafId = requestAnimationFrame(loop);
  }

  function start() {
    if (running) return;
    running = true;
    lastTime = 0;
    rafId = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else start();
  });

  let resizeTimer = 0;
  function scheduleResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 100);
  }

  window.addEventListener("resize", scheduleResize);
  window.addEventListener("orientationchange", scheduleResize);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", scheduleResize);
  }

  // 移动端点击/轻触放烟花
  canvas.addEventListener(
    "pointerdown",
    (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      burstAt(e.clientX, e.clientY);
    },
    { passive: true }
  );

  // 阻止移动端橡皮筋滚动
  document.addEventListener(
    "touchmove",
    (e) => {
      e.preventDefault();
    },
    { passive: false }
  );

  resize();
  running = true;

  for (let i = 0; i < (isMobile ? 100 : 160); i++) emitHeart(0.02, 0);

  launchRocket(width * 0.2, height * 0.2, pickColor());
  setTimeout(() => launchRocket(width * 0.8, height * 0.18, pickColor()), 500);

  rafId = requestAnimationFrame(loop);
})();

(() => {
  const bgm = document.getElementById("bgm");
  const btn = document.getElementById("musicBtn");
  if (!bgm || !btn) return;

  let playing = false;
  let userEnabled = false;

  function updateBtn() {
    btn.classList.toggle("is-playing", playing);
    btn.setAttribute("aria-label", playing ? "暂停音乐" : "播放音乐");
  }

  async function play() {
    try {
      await bgm.play();
      playing = true;
      userEnabled = true;
      updateBtn();
    } catch (_) {
      playing = false;
      updateBtn();
    }
  }

  function pause() {
    bgm.pause();
    playing = false;
    updateBtn();
  }

  function toggle() {
    if (playing) {
      userEnabled = false;
      pause();
    } else {
      play();
    }
  }

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggle();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (playing) bgm.pause();
    } else if (userEnabled) {
      bgm.play().catch(() => {});
    }
  });
})();
