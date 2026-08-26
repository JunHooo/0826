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

  const HEART_COLORS = ["#ff2d5c", "#ff3b6b", "#ff5c85", "#ff8fb3", "#ffc0d4", "#ffffff"];

  const MAX_FW = 220;
  const FW_POOL = 260;
  const MAX_ROCKETS = 4;
  const HEART_POOL = 560;
  const HEART_EMIT_PER_SEC = 260;

  let width = 0;
  let height = 0;
  let dpr = 1;
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

  // 背景烟花粒子池
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

  // 中央大爱心专用粒子池（与烟花隔离，保证爱心始终饱满）
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

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#050510";
    ctx.fillRect(0, 0, width, height);

    // 大爱心居中，落在文字上方
    heartCx = width * 0.5;
    heartCy = height * 0.36;
    heartScale = Math.min(width, height) * 0.02;

    buildStars();
  }

  function buildStars() {
    const count = Math.min(40, Math.floor((width * height) / 30000));
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
    if (fwActive >= MAX_FW) return;
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
    if (heartActive >= HEART_POOL) return;
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
    const amount = HEART_EMIT_PER_SEC * dt;

    // 轮廓：高密度、慢飘散，粒子停留更久 → 爱心更清晰
    for (let i = 0; i < amount; i++) {
      const t = Math.random() * Math.PI * 2;
      // 轻微厚度抖动，轮廓更饱满
      const edge = 0.92 + Math.random() * 0.12;
      const pt = pointOnHeart(t, scale * edge);
      const len = Math.hypot(pt.x, pt.y) || 1;
      const speed = (18 + Math.random() * 28) / 60;
      const vx = (pt.x / len) * speed * (0.2 + Math.random() * 0.5);
      const vy = (pt.y / len) * speed * (0.2 + Math.random() * 0.5);
      spawnHeartParticle(
        heartCx + pt.x,
        heartCy + pt.y,
        vx,
        vy,
        HEART_COLORS[(Math.random() * HEART_COLORS.length) | 0],
        0.9 + Math.random() * 1.1,
        2.2 + Math.random() * 2.8
      );
    }

    // 内部填充：大幅加强，形成实心粒子爱心
    const fill = amount * 0.85;
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
        1.8 + Math.random() * 2.2
      );
    }
  }

  function updateHeart(dt) {
    for (let i = 0; i < HEART_POOL; i++) {
      const p = heart[i];
      if (!p.active) continue;
      // 轻微减速，形成向外绽放的轨迹
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
      // 前半段寿命保持高不透明度，爱心更醒目
      ctx.globalAlpha = Math.min(1, 0.35 + k * 0.95);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - s * 0.5, p.y - s * 0.5, s, s);
    }
    ctx.globalAlpha = 1;
  }

  function explodeCircle(x, y, color) {
    const count = Math.min(36, Math.max(0, MAX_FW - fwActive));
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.15;
      const speed = 2 + Math.random() * 4;
      spawnFw(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, color, {
        life: 1,
        decay: 0.02 + Math.random() * 0.012,
        size: 1.2 + Math.random() * 1.5,
        gravity: 0.045,
        friction: 0.98,
      });
    }
  }

  function launchRocket(targetX, targetY, color) {
    if (rockets.length >= MAX_ROCKETS) return;
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
    if (fwActive > MAX_FW * 0.85) return;
    if (now - lastRandomBurst > 1000 + Math.random() * 800) {
      lastRandomBurst = now;
      // 避开中央爱心区域，只在两侧/上方放烟花
      const side = Math.random() < 0.5 ? 0.12 + Math.random() * 0.2 : 0.68 + Math.random() * 0.2;
      launchRocket(
        width * side,
        height * (0.12 + Math.random() * 0.28),
        pickColor()
      );
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
    // 略减拖尾淡化，保留爱心粒子残留感
    ctx.fillStyle = "rgba(5, 5, 16, 0.2)";
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
      const s = p.size * (0.55 + 0.45 * p.life);
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - s * 0.5, p.y - s * 0.5, s, s);
    }
    ctx.globalAlpha = 1;
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
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 120);
  });

  resize();
  running = true;

  // 预热：快速铺满爱心，开场即明显
  for (let i = 0; i < 160; i++) emitHeart(0.02, 0);

  launchRocket(width * 0.2, height * 0.2, pickColor());
  setTimeout(() => launchRocket(width * 0.8, height * 0.18, pickColor()), 500);

  rafId = requestAnimationFrame(loop);
})();
