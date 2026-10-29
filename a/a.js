(function () {
  const D = window.SCENE_DATA;
  const W = D.W, H = D.H;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const canvas = document.getElementById("scene");
  const ctx = canvas.getContext("2d");
  const windowEl = document.getElementById("window");
  const hint = document.getElementById("hint");
  const SKY = "#ffca36";
  const SHOTS = [
    ["f1-cave", "1층 · 동굴벽화"], ["f1-projector", "1층 · 영사기"], ["f1-hall", "1층 · 탄생과 발전"],
    ["f2-pinscreen", "2층 · 핀스크린 체험"], ["f2-dubbing", "2층 · 더빙 체험"], ["f2-world", "2층 · 세계관"], ["shop", "1층 · 뮤지엄샵"]
  ];
  const CLOUD = { x: 1690, y: 40, w: 420, h: 150 };

  const img = {};
  function load(name, src) {
    return new Promise((res) => { const i = new Image(); i.decoding = "async"; i.onload = () => { img[name] = i; res(); }; i.onerror = () => res(); i.src = src; });
  }

  const chars = ["proj", "pencil", "bison", "reel"].map((name, i) => {
    const p = D.parts[name];
    return {
      name, p, eyes: D.eyes[name] || [], i,
      bx: p.x + p.w / 2, by: p.y + p.h,
      dx: 0, scale: 1,
      y: 0, vy: 0, st: 0, sv: 0, rot: 0, rv: 0, shake: 0, roll: 0, rollV: 0,
      blink: 0, nextBlink: 1 + Math.random() * 3, lookX: 0, lookY: 0, tgtX: 0, tgtY: 0,
      phase: i * 1.7, drop: reduce ? 0 : -1400, dropV: 0, dropDelay: 0.15 + i * 0.13, landed: reduce,
      mask: null, trail: []
    };
  });
  const byName = Object.fromEntries(chars.map((c) => [c.name, c]));
  const drawOrder = ["proj", "pencil", "bison", "reel"].map((n) => byName[n]);

  let cw = 0, ch = 0, dpr = 1, s = 1, ox = 0, oy = 0, portrait = false, avail = 0;
  let screen = { x: 2280, y: 330, w: 610, h: 330 };
  let par = { x: 0, y: 0, tx: 0, ty: 0 };
  let pointer = { x: 0, y: 0, has: false, lastMove: 0 };
  let reelA = 0, reelV = 0.9, frame = 0, shutter = 0, beam = 0.85;
  let t = 0, started = false, interacted = false, visible = true;
  let dust = [];
  let idle = -2;
  let scrollVel = 0, lastScroll = scrollY;

  function layout() {
    const r = canvas.getBoundingClientRect();
    cw = Math.max(1, r.width); ch = Math.max(1, r.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    portrait = cw / ch < 1.05;
    const set = {
      wide: { proj: [0, 1, 0], pencil: [0, 1, 0], bison: [0, 1, 0], reel: [0, 1, 0] },
      tall: { proj: [10, 0.92, -20], pencil: [352, 0.78, 66], bison: [-470, 0.78, 60], reel: [150, 0.82, 78] }
    }[portrait ? "tall" : "wide"];
    chars.forEach((c) => { c.dx = set[c.name][0]; c.scale = set[c.name][1]; c.dy = set[c.name][2]; });
    if (!portrait) {
      s = Math.max(cw / W, ch / H);
      ox = (cw - W * s) / 2;
      oy = ch - H * s;
      avail = Math.max(0, -oy / s);
      const sh = 330, sw = sh * 1.85;
      screen = { x: Math.min(2240, (cw - ox) / s - sw / 2 - 90), y: 300 + avail * 0.5, w: sw, h: sh };
    } else {
      const visW = 1180;
      s = cw / visW;
      ox = cw / 2 - 1376 * s;
      oy = ch - H * s;
      avail = oy / s;
      const pj = byName.proj;
      const projTop = pj.by + pj.dy - (pj.by - pj.p.y) * pj.scale;
      const bottom = projTop - 60, top = -avail + 150;
      const sw = Math.min(visW * 0.8, Math.max(380, (bottom - top)) * 1.85);
      const sh = sw / 1.85;
      screen = { x: 1376 + 30, y: Math.max(top + sh / 2, bottom - sh / 2), w: sw, h: sh };
    }
  }

  function buildMask(c) {
    const im = img[c.name];
    if (!im) return;
    const k = 0.25;
    const w = Math.max(1, Math.round(im.width * k)), h = Math.max(1, Math.round(im.height * k));
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    const g = cv.getContext("2d"); g.drawImage(im, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data;
    const a = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) a[i] = d[i * 4 + 3];
    c.mask = { w, h, a, k };
  }

  function toStage(px, py) { return { x: (px - ox) / s, y: (py - oy) / s }; }

  function charAnchor(c) {
    const pd = 1 + (c.name === "reel" ? 0.25 : 0);
    return { x: c.bx + c.dx + par.x * pd * 22 + c.shake + c.roll, y: c.by + (c.dy || 0) + c.y + c.drop + par.y * pd * 10 };
  }

  function charLocal(c, sx, sy) {
    const a = charAnchor(c);
    const br = breath(c);
    const kx = c.scale * br.sx, ky = c.scale * br.sy;
    const hc = c.p.h * ky / 2;
    let x = sx - a.x, y = sy - (a.y - hc);
    const cs = Math.cos(-c.rot), sn = Math.sin(-c.rot);
    const rx = x * cs - y * sn, ry = x * sn + y * cs + hc;
    return { x: rx / kx + c.p.w / 2, y: ry / ky + c.p.h };
  }

  function hitChar(px, py) {
    const st = toStage(px, py);
    for (let i = drawOrder.length - 1; i >= 0; i--) {
      const c = drawOrder[i];
      if (!c.mask) continue;
      const l = charLocal(c, st.x, st.y);
      const mx = Math.floor(l.x * c.mask.k), my = Math.floor(l.y * c.mask.k);
      if (mx < 0 || my < 0 || mx >= c.mask.w || my >= c.mask.h) continue;
      let hit = false;
      for (let yy = -2; yy <= 2 && !hit; yy++) for (let xx = -2; xx <= 2 && !hit; xx++) {
        const X = mx + xx, Y = my + yy;
        if (X >= 0 && Y >= 0 && X < c.mask.w && Y < c.mask.h && c.mask.a[Y * c.mask.w + X] > 100) hit = true;
      }
      if (hit) return c;
    }
    return null;
  }

  function breath(c) {
    const b = reduce ? 0 : Math.sin(t * Math.PI * 2 * 0.32 + c.phase);
    const st = c.st;
    return { sx: (1 - st * 0.55) * (1 - b * 0.006), sy: (1 + st) * (1 + b * 0.013) };
  }

  function poke(c, strong) {
    interacted = true;
    idle = -4;
    hint.classList.add("gone");
    if (c.y < -2) { c.vy -= 500; c.sv += 6; return; }
    c.sv -= strong ? 9 : 6;
    c.pending = 0.085;
    c.blink = 1;
    if (c.name === "proj") { reelV += 14; beam = 1; }
    if (c.name === "pencil") { c.spin = Math.random() < 0.5 ? -1 : 1; c.trail = []; }
    if (c.name === "bison") { c.shakeT = 0.9; for (let i = 0; i < 5; i++) dust.push({ x: c.bx + c.dx + 260 * c.scale + Math.random() * 80, y: c.by + (c.dy || 0) - 10, r: 20 + Math.random() * 20, v: 120 + Math.random() * 160, life: 0 }); }
    if (c.name === "reel") { c.rollV = 900; }
  }

  function step(dt) {
    t += dt;
    const sy = scrollY; scrollVel += ((sy - lastScroll) - scrollVel) * 0.25; lastScroll = sy;
    const lookAt = pointer.has && t - pointer.lastMove < 2.2 ? toStage(pointer.x, pointer.y) : null;
    par.tx = pointer.has && finePointer ? (pointer.x / cw - 0.5) * 2 : 0;
    par.ty = pointer.has && finePointer ? (pointer.y / ch - 0.5) * 2 : 0;
    const kp = 1 - Math.exp(-dt * 4);
    par.x += (par.tx - par.x) * kp; par.y += (par.ty - par.y) * kp;

    chars.forEach((c) => {
      if (!c.landed) {
        if (t > c.dropDelay) {
          c.dropV += 7200 * dt; c.drop += c.dropV * dt;
          if (c.drop >= 0) { c.drop = 0; c.landed = true; c.sv -= Math.min(10, c.dropV / 260); c.dropV = 0; }
        }
      }
      if (c.pending !== undefined) {
        c.pending -= dt;
        if (c.pending <= 0) { c.vy = -(c.small ? 820 : c.name === "proj" ? 1250 : c.name === "pencil" ? 1900 : 1600); if (c.name === "pencil" && !c.small) c.rv = c.spin * Math.PI * 2 / (2 * 1900 / 5200); c.sv += c.small ? 5 : 9; c.pending = undefined; c.small = false; }
      }
      if (c.y < 0 || c.vy < 0) {
        c.vy += 5200 * dt; c.y += c.vy * dt;
        c.st += (Math.min(0.16, Math.abs(c.vy) / 9000) - c.st) * (1 - Math.exp(-dt * 18));
        if (c.y >= 0) { c.y = 0; c.sv -= Math.min(9, c.vy / 220); c.vy = 0; c.rot = 0; c.rv = 0; }
      }
      const acc = -190 * c.st - 13 * c.sv;
      c.sv += acc * dt; c.st += c.sv * dt;
      c.st = Math.max(-0.32, Math.min(0.3, c.st));
      if (c.rv) c.rot += c.rv * dt;
      if (c.shakeT > 0) { c.shakeT -= dt; c.shake = Math.sin(t * 64) * 16 * Math.min(1, c.shakeT * 2); } else c.shake *= 0.8;
      if (c.rollV || c.roll) {
        c.rollV += (-c.roll * 26 - c.rollV * 5.2) * dt;
        c.roll += c.rollV * dt;
        if (Math.abs(c.roll) < 0.3 && Math.abs(c.rollV) < 2) { c.roll = 0; c.rollV = 0; }
      }
      if (c.y >= 0 && c.pending === undefined && c.landed) c.rot *= Math.exp(-dt * 10);
      c.nextBlink -= dt;
      if (c.nextBlink <= 0 && !reduce) { c.blink = 1; c.nextBlink = 2 + Math.random() * 3.4; }
      c.blink = Math.max(0, c.blink - dt * 7);
      if (lookAt) {
        const a = charAnchor(c);
        const e = c.eyes[0] || { cx: c.bx, cy: c.by - c.p.h / 2 };
        const ex = a.x + (e.cx - c.bx) * c.scale, ey = a.y + (e.cy - c.by) * c.scale;
        const dx = lookAt.x - ex, dy = lookAt.y - ey;
        const L = Math.hypot(dx, dy) || 1;
        const m = Math.min(1, L / 260);
        c.tgtX = dx / L * m; c.tgtY = dy / L * m;
      } else if (Math.abs(scrollVel) > 1.5) {
        c.tgtX = 0; c.tgtY = Math.max(-0.95, Math.min(0.95, scrollVel * 0.08)); c.wander = 0.8;
      } else if (!reduce) {
        c.wander = (c.wander || 0) - dt;
        if (c.wander <= 0) { c.wander = 1.4 + Math.random() * 2.2; const ang = Math.random() * Math.PI * 2; const m = Math.random() < 0.35 ? 0 : 0.35 + Math.random() * 0.5; c.tgtX = Math.cos(ang) * m; c.tgtY = Math.sin(ang) * m * 0.7; }
      } else { c.tgtX = 0; c.tgtY = 0; }
      const kl = 1 - Math.exp(-dt * 14);
      c.lookX += (c.tgtX - c.lookX) * kl; c.lookY += (c.tgtY - c.lookY) * kl;
      if (c.name === "pencil" && c.y < -1) {
        const a = charAnchor(c);
        const half = c.p.h * c.scale * (1 + c.st) / 2;
        c.trail.push({ x: a.x + Math.sin(c.rot) * half, y: a.y - half - Math.cos(c.rot) * half, t });
      }
    });

    idle += dt;
    if (!reduce && started && idle > 4.5) {
      idle = 1.5 - Math.random() * 1.5;
      const k = chars[Math.floor(Math.random() * chars.length)];
      if (k.y >= 0 && k.landed && k.pending === undefined) { k.small = true; k.sv -= 4; k.pending = 0.08; k.blink = 1; if (k.name === "proj") reelV += 5; }
    }
    const base = reduce ? 0 : 0.9;
    reelV += (base - reelV) * (1 - Math.exp(-dt * 0.9));
    reelA += reelV * dt;
    const nf = Math.floor(reelA / (Math.PI / 3));
    if (nf !== frame) { frame = nf; shutter = 1; }
    shutter = Math.max(0, shutter - dt * 16);
    beam += (0.82 - beam) * (1 - Math.exp(-dt * 2));
    dust.forEach((p) => { p.life += dt; p.x += p.v * dt; p.v *= Math.exp(-dt * 3); p.r += 50 * dt; });
    dust = dust.filter((p) => p.life < 0.9);
  }

  function X(x) { return ox + x * s; }
  function Y(y) { return oy + y * s; }

  function drawSky() {
    ctx.fillStyle = SKY;
    ctx.fillRect(0, 0, cw, ch);
    const bgx = par.x * -10, bgy = par.y * -6;
    if (img.bg) ctx.drawImage(img.bg, X(0) + bgx - 12, Y(0) + bgy, W * s + 24, H * s + 6);
    if (img.bg && avail > 120) {
      const sc = img.bg.width / W;
      const spots = portrait ? [[620, -avail * 0.82, 0.9, false], [1720, -avail * 0.42, 0.75, true]] : [];
      spots.forEach(([x, y, k, flip]) => {
        ctx.save();
        ctx.translate(X(x) + bgx * 0.6, Y(y) + bgy * 0.6);
        if (flip) ctx.scale(-1, 1);
        ctx.drawImage(img.bg, CLOUD.x * sc, CLOUD.y * sc, CLOUD.w * sc, CLOUD.h * sc, -CLOUD.w * s * k / 2, 0, CLOUD.w * s * k, CLOUD.h * s * k);
        ctx.restore();
      });
    }
  }

  function drawBeamAndScreen() {
    const pj = byName.proj;
    const a = charAnchor(pj);
    const lx = a.x + (D.lens[0] - pj.bx) * pj.scale, ly = a.y + (D.lens[1] - pj.by) * pj.scale * (1 + pj.st);
    const sx0 = screen.x - screen.w / 2 + par.x * -6, sy0 = screen.y - screen.h / 2 + par.y * -4;
    const flick = 0.92 + 0.08 * Math.sin(t * 75) * Math.min(1, reelV / 6);
    ctx.save();
    ctx.globalAlpha = 0.34 * beam * flick;
    ctx.fillStyle = "#fff8e6";
    ctx.beginPath();
    ctx.moveTo(X(lx), Y(ly - 26));
    const corners = [[sx0, sy0], [sx0 + screen.w, sy0], [sx0 + screen.w, sy0 + screen.h], [sx0, sy0 + screen.h]];
    const pts = corners.map(([x, y]) => [X(x), Y(y)]);
    const L = [X(lx), Y(ly)];
    const ang = pts.map(([x, y]) => Math.atan2(y - L[1], x - L[0]));
    let iMin = 0, iMax = 0;
    ang.forEach((v, i) => { if (v < ang[iMin]) iMin = i; if (v > ang[iMax]) iMax = i; });
    ctx.lineTo(pts[iMin][0], pts[iMin][1]);
    ctx.lineTo(pts[iMax][0], pts[iMax][1]);
    ctx.lineTo(X(lx), Y(ly + 26));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    const fx = X(sx0), fy = Y(sy0), fw = screen.w * s, fh = screen.h * s;
    const lw = Math.max(2, 7 * s);
    ctx.fillStyle = "#16161a";
    roundRect(fx - lw, fy - lw, fw + lw * 2, fh + lw * 2, 10 * s + lw);
    ctx.fill();
    const shot = SHOTS[((frame % SHOTS.length) + SHOTS.length) % SHOTS.length];
    const im = img[shot[0]];
    ctx.save();
    roundRect(fx, fy, fw, fh, 10 * s);
    ctx.clip();
    if (im) {
      const r = Math.max(fw / im.width, fh / im.height);
      ctx.drawImage(im, fx + (fw - im.width * r) / 2, fy + (fh - im.height * r) / 2, im.width * r, im.height * r);
    }
    ctx.fillStyle = "rgba(255,236,190," + (0.1 + 0.05 * Math.sin(t * 50)) + ")";
    ctx.fillRect(fx, fy, fw, fh);
    if (shutter > 0) { ctx.fillStyle = "rgba(22,22,26," + shutter * 0.55 + ")"; ctx.fillRect(fx, fy, fw, fh); }
    ctx.restore();
    const fs = Math.max(11, Math.min(16, 34 * s));
    ctx.font = "800 " + fs + "px 'Pretendard Variable', Pretendard, sans-serif";
    const label = shot[1];
    const tw = ctx.measureText(label).width;
    const px = fx + 10 * s + 8, py = fy + fh - 10 * s - fs - 12;
    ctx.fillStyle = "rgba(22,22,26,.86)";
    roundRect(px - 8, py - 4, tw + 16, fs + 12, (fs + 12) / 2);
    ctx.fill();
    ctx.fillStyle = "#fff4e2";
    ctx.textBaseline = "top";
    ctx.fillText(label, px, py + 2);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawShadow(c) {
    const a = charAnchor(c);
    const h = Math.max(0, -c.y - c.drop);
    const k = Math.max(0.35, 1 - h / 700);
    const w = (c.name === "proj" ? 520 : c.name === "bison" ? 560 : c.name === "reel" ? 300 : 230) * c.scale * k;
    ctx.save();
    ctx.globalAlpha = 0.24 * k;
    ctx.fillStyle = "#2b6a32";
    ctx.beginPath();
    ctx.ellipse(X(c.bx + c.dx + c.shake + c.roll + par.x * 22), Y(c.by + (c.dy || 0) - 14), w * s / 2, 30 * s * k, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawTrail(c) {
    if (!c.trail.length) return;
    c.trail = c.trail.filter((p) => t - p.t < 1.3);
    if (c.trail.length < 2) return;
    ctx.save();
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (let i = 1; i < c.trail.length; i++) {
      const p0 = c.trail[i - 1], p1 = c.trail[i];
      const age = t - p1.t;
      ctx.strokeStyle = "rgba(40,40,46," + Math.max(0, 0.85 - age * 0.65) + ")";
      ctx.lineWidth = Math.max(1.2, 9 * s);
      ctx.beginPath(); ctx.moveTo(X(p0.x), Y(p0.y)); ctx.lineTo(X(p1.x), Y(p1.y)); ctx.stroke();
    }
    ctx.restore();
  }

  function drawChar(c) {
    const im = img[c.name];
    if (!im) return;
    const a = charAnchor(c);
    const br = breath(c);
    ctx.save();
    const hc = c.p.h * c.scale * br.sy * s / 2;
    ctx.translate(X(a.x), Y(a.y) - hc);
    ctx.rotate(c.rot);
    ctx.translate(0, hc);
    ctx.scale(c.scale * br.sx * s, c.scale * br.sy * s);
    ctx.translate(-c.p.w / 2, -c.p.h);
    if (c.name === "reel" && c.roll) {
      const e0 = c.eyes[0], e1 = c.eyes[1];
      const cx = c.p.w * 0.5, cy = c.p.h * 0.45;
      ctx.translate(cx, cy); ctx.rotate(c.roll / 160); ctx.translate(-cx, -cy);
    }
    ctx.drawImage(im, 0, 0, c.p.w, c.p.h);
    if (c.name === "proj") {
      D.reels.forEach(([rx, ry, rr], i) => {
        const lx = rx - c.p.x, ly = ry - c.p.y;
        ctx.save();
        ctx.beginPath(); ctx.arc(lx, ly, rr * 0.965, 0, Math.PI * 2); ctx.clip();
        ctx.translate(lx, ly); ctx.rotate(reelA * (i ? 1 : 1.08)); ctx.translate(-lx, -ly);
        ctx.drawImage(im, 0, 0, c.p.w, c.p.h);
        ctx.restore();
      });
    }
    c.eyes.forEach((e) => drawEye(c, e));
    ctx.restore();
  }

  function drawEye(c, e) {
    const x = e.cx - c.p.x, y = e.cy - c.p.y;
    const rx = e.rx * 0.97, ry = e.ry * 0.97;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((e.ang * Math.PI) / 180);
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff"; ctx.fill();
    ctx.clip();
    ctx.rotate((-e.ang * Math.PI) / 180);
    const pr = Math.min(rx, ry) * 0.5;
    const px = c.lookX * rx * 0.46, py = c.lookY * ry * 0.46;
    ctx.fillStyle = "#16161a";
    ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.arc(px - pr * 0.34, py - pr * 0.36, pr * 0.27, 0, Math.PI * 2); ctx.fill();
    const bl = Math.min(1, c.blink * 1.6);
    if (bl > 0.02) {
      const edge = -ry + ry * 2 * bl;
      ctx.fillStyle = e.skin;
      ctx.fillRect(-rx - 2, -ry - 2, rx * 2 + 4, edge + ry + 2);
      ctx.strokeStyle = "#16161a"; ctx.lineWidth = Math.max(3, rx * 0.14);
      ctx.beginPath(); ctx.moveTo(-rx, edge); ctx.lineTo(rx, edge); ctx.stroke();
    }
    ctx.restore();
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((e.ang * Math.PI) / 180);
    ctx.strokeStyle = "#16161a"; ctx.lineWidth = Math.max(3, rx * 0.13);
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  function drawDust() {
    dust.forEach((p) => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, 0.9 - p.life);
      ctx.fillStyle = "#fff4e2";
      ctx.strokeStyle = "#16161a"; ctx.lineWidth = Math.max(1.5, 5 * s);
      ctx.beginPath(); ctx.arc(X(p.x), Y(p.y - p.r), p.r * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.restore();
    });
  }

  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawSky();
    drawBeamAndScreen();
    drawOrder.forEach(drawShadow);
    drawDust();
    drawOrder.forEach((c) => { drawChar(c); if (c.name === "pencil") drawTrail(c); });
  }

  let last = 0, acc = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    if (!visible || !started) return;
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    acc += dt;
    let n = 0;
    while (acc >= 1 / 60 && n < 3) { step(1 / 60); acc -= 1 / 60; n++; }
    if (n === 3) acc = 0;
    render();
  }

  let down = null;
  canvas.addEventListener("pointerdown", (e) => {
    const r = canvas.getBoundingClientRect();
    down = { x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now(), id: e.pointerId, moved: false, lastX: e.clientX, crank: false, type: e.pointerType };
    pointer = { x: down.x, y: down.y, has: true, lastMove: t };
  });
  canvas.addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top; pointer.has = true; pointer.lastMove = t;
    if (down && e.pointerId === down.id) {
      const dx = e.clientX - down.lastX;
      down.lastX = e.clientX;
      if (Math.abs(e.clientX - (down.x + r.left)) > 8) down.moved = true;
      if (down.moved) {
        if (!down.crank) { down.crank = true; canvas.classList.add("dragging"); try { canvas.setPointerCapture(e.pointerId); } catch (_) {} }
        reelV += dx * 0.09;
        idle = -4;
        reelV = Math.max(-26, Math.min(26, reelV));
        beam = 1;
        interacted = true; hint.classList.add("gone");
      }
    } else if (finePointer) {
      canvas.classList.toggle("over", !!hitChar(pointer.x, pointer.y));
    }
  });
  function end(e) {
    if (!down || e.pointerId !== down.id) return;
    canvas.classList.remove("dragging");
    down = null;
  }
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  canvas.addEventListener("pointerleave", () => { if (!down) pointer.has = false; });
  canvas.addEventListener("click", (e) => {
    const r = canvas.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    if (Math.abs(px - pointer.x) > 12 && pointer.has) return;
    const c = hitChar(px, py);
    pointer = { x: px, y: py, has: true, lastMove: t };
    if (c) poke(c, true);
    else chars.forEach((k, i) => { k.blink = 1; if (!reduce) setTimeout(() => poke(k, false), i * 70); });
  });

  new IntersectionObserver((en) => { visible = en[0].isIntersecting; last = 0; }, { threshold: 0 }).observe(canvas);
  document.addEventListener("visibilitychange", () => { last = 0; });

  let rt = 0, lastW = 0, lastH = 0;
  addEventListener("resize", () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      const r = canvas.getBoundingClientRect();
      if (Math.abs(r.width - lastW) < 1 && Math.abs(r.height - lastH) < 80) return;
      lastW = r.width; lastH = r.height;
      layout(); sprockets();
    }, 200);
  });

  function sprockets() {
    const el = document.getElementById("sprockets");
    const r = windowEl.getBoundingClientRect();
    const w = r.width, h = r.height;
    const holeW = w < 700 ? 14 : 20, holeH = w < 700 ? 10 : 14, gap = w < 700 ? 22 : 30;
    const n = Math.floor((w - 40) / (holeW + gap));
    const start = (w - (n * holeW + (n - 1) * gap)) / 2;
    let out = "";
    for (let i = 0; i < n; i++) {
      const x = start + i * (holeW + gap);
      out += '<rect x="' + x.toFixed(1) + '" y="8" width="' + holeW + '" height="' + holeH + '" rx="3"/>';
      out += '<rect x="' + x.toFixed(1) + '" y="' + (h - 8 - holeH).toFixed(1) + '" width="' + holeW + '" height="' + holeH + '" rx="3"/>';
    }
    el.setAttribute("viewBox", "0 0 " + w.toFixed(1) + " " + h.toFixed(1));
    el.innerHTML = '<g fill="#16161a" opacity=".9">' + out + "</g>";
  }

  function today() {
    const now = new Date();
    const kst = new Date(now.getTime() + (now.getTimezoneOffset() + 540) * 60000);
    const dow = kst.getDay();
    const md = (kst.getMonth() + 1) * 100 + kst.getDate();
    const mins = kst.getHours() * 60 + kst.getMinutes();
    const closedDay = dow === 1 || md === 101;
    const el = document.getElementById("today");
    const st = document.getElementById("today-state"), tm = document.getElementById("today-time");
    const ps = document.getElementById("panel-state"), pb = document.getElementById("panel-sub");
    if (closedDay) {
      el.classList.add("closed");
      st.textContent = "오늘은 쉬어요"; tm.textContent = "내일 10:00에 문 열어요";
      ps.textContent = "쉬어요"; pb.textContent = "매주 월요일 휴관 · 내일 10:00 개관";
    } else if (mins < 600) {
      st.textContent = "오늘 10:00에 열어요"; tm.textContent = "입장 마감 17:00";
      ps.textContent = "10시에 열어요"; pb.textContent = "10:00–18:00 · 입장 마감 17:00";
    } else if (mins < 1020) {
      st.textContent = "지금 관람할 수 있어요"; tm.textContent = "18:00까지 · 입장 마감 17:00";
      ps.textContent = "문 열었어요"; pb.textContent = "18:00까지 · 입장 마감 17:00";
    } else {
      el.classList.add("closed");
      st.textContent = "오늘 입장 마감"; tm.textContent = dow === 0 ? "화요일 10:00에 만나요" : "내일 10:00에 만나요";
      ps.textContent = "입장 마감"; pb.textContent = "오늘 관람은 17:00에 마감됐어요";
    }
  }

  function page() {
    const nav = document.getElementById("nav");
    const band = document.getElementById("band");
    let lastY = scrollY, vel = 0, bx = 0;
    const stageH = () => document.getElementById("top").offsetHeight;
    function tick() {
      const y = scrollY;
      const d = y - lastY;
      lastY = y;
      vel += (d - vel) * 0.2;
      nav.classList.toggle("solid", y > stageH() - 70);
      nav.classList.toggle("hide", y > stageH() && d > 2);
      if (d < -2) nav.classList.remove("hide");
      if (!reduce) {
        bx -= 0.6 + Math.abs(vel) * 0.35;
        const half = band.scrollWidth / 2;
        if (-bx > half) bx += half;
        band.style.transform = "translate3d(" + bx.toFixed(1) + "px,0,0) skewX(" + Math.max(-12, Math.min(12, -vel * 0.5)).toFixed(2) + "deg)";
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);

    document.querySelectorAll(".big .ln").forEach((ln) => {
      const words = ln.textContent.split(" "); ln.textContent = "";
      let k = 0;
      words.forEach((wd, wi) => {
        const w = document.createElement("span"); w.className = "w";
        [...wd].forEach((ch) => { const s = document.createElement("i"); s.textContent = ch; s.style.transitionDelay = (k++ * 0.026) + "s"; w.appendChild(s); });
        ln.appendChild(w);
        if (wi < words.length - 1) ln.appendChild(document.createTextNode(" "));
      });
    });
    const targets = document.querySelectorAll(".sec-head, .lead, .stats, .panel, .ch, .poster, .now-body, .addr, .routes, .more-line");
    targets.forEach((el) => el.classList.add("rv"));
    const io = new IntersectionObserver((en) => en.forEach((x) => {
      if (!x.isIntersecting) return;
      x.target.classList.add("in");
      io.unobserve(x.target);
      x.target.querySelectorAll && x.target.querySelectorAll("[data-count]").forEach(countUp);
    }), { rootMargin: "0px 0px -8% 0px" });
    targets.forEach((el) => io.observe(el));
    document.querySelectorAll(".big").forEach((el) => io.observe(el));
    setTimeout(() => targets.forEach((el) => { if (el.getBoundingClientRect().top < innerHeight) el.classList.add("in"); }), 900);

    function countUp(el) {
      const to = +el.dataset.count, suf = el.dataset.suffix || "";
      if (reduce) { el.textContent = to.toLocaleString("ko-KR") + suf; return; }
      const from = to > 1000 ? to - 23 : 0, t0 = performance.now();
      (function f(n) {
        const k = Math.min(1, (n - t0) / 1400), e = 1 - Math.pow(1 - k, 4);
        el.textContent = Math.round(from + (to - from) * e).toString() + suf;
        if (k < 1) requestAnimationFrame(f);
      })(t0);
    }

    if (finePointer && !reduce) {
      document.querySelectorAll(".tilt").forEach((el) => {
        el.addEventListener("pointermove", (e) => {
          const r = el.getBoundingClientRect();
          const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
          el.style.transform = "perspective(900px) rotateX(" + (-y * 6).toFixed(2) + "deg) rotateY(" + (x * 7).toFixed(2) + "deg) translateY(-3px)";
        });
        el.addEventListener("pointerleave", () => { el.style.transition = "transform .6s cubic-bezier(.16,1,.3,1)"; el.style.transform = ""; setTimeout(() => (el.style.transition = ""), 600); });
      });
      document.querySelectorAll(".mag").forEach((el) => {
        const inner = el.querySelector("span");
        let st = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 }, raf = 0;
        function run() {
          st.vx += ((st.tx - st.x) * 0.16); st.vy += ((st.ty - st.y) * 0.16);
          st.vx *= 0.74; st.vy *= 0.74; st.x += st.vx; st.y += st.vy;
          el.style.transform = "translate(" + st.x.toFixed(2) + "px," + st.y.toFixed(2) + "px)";
          if (inner) inner.style.transform = "translate(" + (st.x * 0.4).toFixed(2) + "px," + (st.y * 0.4).toFixed(2) + "px)";
          if (Math.abs(st.tx - st.x) + Math.abs(st.vx) + Math.abs(st.ty - st.y) + Math.abs(st.vy) > 0.05) raf = requestAnimationFrame(run); else raf = 0;
        }
        addEventListener("pointermove", (e) => {
          const r = el.getBoundingClientRect();
          const cx = r.left + r.width / 2 - st.x, cy = r.top + r.height / 2 - st.y;
          const dx = e.clientX - cx, dy = e.clientY - cy;
          const rad = Math.max(r.width, r.height) / 2 + 56;
          if (Math.hypot(dx, dy) < rad) { st.tx = dx * 0.32; st.ty = dy * 0.32; } else { st.tx = 0; st.ty = 0; }
          if (!raf) raf = requestAnimationFrame(run);
        }, { passive: true });
      });
    }
  }

  today();
  page();
  layout();
  sprockets();
  const r0 = canvas.getBoundingClientRect(); lastW = r0.width; lastH = r0.height;
  const shotLoads = SHOTS.map(([n]) => load(n, "../shared/photos/" + n + ".jpg"));
  Promise.all([load("bg", "img/bg.jpg"), ...chars.map((c) => load(c.name, "img/" + c.name + ".webp"))]).then(() => {
    chars.forEach(buildMask);
    started = true;
    last = 0;
    requestAnimationFrame(loop);
    const f = document.fonts && document.fonts.load ? document.fonts.load("800 16px 'Pretendard Variable'", "1층 동굴벽화") : Promise.resolve();
    f.catch(() => {});
  });
  Promise.all(shotLoads);
  setTimeout(() => { if (!interacted) hint.classList.add("gone"); }, 9000);
})();
