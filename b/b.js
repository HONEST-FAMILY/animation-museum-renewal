(function () {
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var root = document.documentElement;
  var hero = document.querySelector(".hero");
  var title = document.querySelector(".hero-title");
  var stacked = function () { return window.matchMedia("(orientation: portrait), (max-width: 760px)").matches; };

  function fitTitle() {
    var t1 = title.querySelector(".t1"), t2 = title.querySelector(".t2");
    root.style.setProperty("--tfs", "100px");
    var w1 = t1.getBoundingClientRect().width, w2 = t2.getBoundingClientRect().width;
    var avail = hero.clientWidth;
    var size = stacked() ? 100 * avail * 0.95 / Math.max(w1, w2) : 100 * avail * 0.988 / (w1 + w2);
    root.style.setProperty("--tfs", size.toFixed(2) + "px");
  }

  var DAYS = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
  var FIXED_CLOSED = ["2026-02-17", "2026-09-25"];
  function ymd(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function isClosed(d) { return d.getDay() === 1 || (d.getMonth() === 0 && d.getDate() === 1) || FIXED_CLOSED.indexOf(ymd(d)) >= 0; }
  function nextOpen(d) {
    var n = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    for (var i = 0; i < 10 && isClosed(n); i++) n.setDate(n.getDate() + 1);
    var diff = Math.round((n - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
    return diff === 1 ? "내일" : DAYS[n.getDay()];
  }
  function renderToday() {
    var d = new Date();
    var mins = d.getHours() * 60 + d.getMinutes();
    var label = (d.getMonth() + 1) + "월 " + d.getDate() + "일 " + DAYS[d.getDay()];
    var dateEl = document.querySelector("[data-today-date]");
    var stateEl = document.querySelector("[data-today-state]");
    var lineEl = document.querySelector("[data-today-line]");
    var closed = isClosed(d), text;
    if (closed) text = "오늘은 쉬는 날 · " + nextOpen(d) + " 10:00에 열어요";
    else if (mins < 600) text = "오늘 10:00에 문을 열어요";
    else if (mins < 1020) text = "지금 관람할 수 있어요 · 입장 마감 17:00";
    else if (mins < 1080) text = "입장 마감 · 18:00까지 관람";
    else text = "오늘 관람 끝 · " + nextOpen(d) + " 10:00에 열어요";
    dateEl.textContent = label + (closed ? " · 휴관" : " · 10:00 – 18:00");
    stateEl.innerHTML = '<span class="dot"></span>' + text;
    stateEl.classList.toggle("closed", closed);
    if (lineEl) lineEl.textContent = closed ? "오늘(" + label + ")은 쉬는 날입니다. 매주 월요일과 1월 1일, 설·추석 당일에 쉽니다." : "오늘(" + label + ")은 문을 엽니다. 10:00부터 18:00까지, 입장 마감은 17:00입니다.";
    var today = ymd(d);
    document.querySelectorAll("[data-route] li").forEach(function (li) {
      li.classList.toggle("past", li.dataset.to < today);
      li.classList.toggle("on", li.dataset.from <= today && today <= li.dataset.to);
    });
  }

  function splitReveal(el) {
    var text = el.textContent.trim();
    el.setAttribute("aria-label", text);
    var i = 0, html = "";
    text.split(" ").forEach(function (word, wi) {
      if (wi) html += '<span class="sp"></span>';
      html += '<span style="white-space:nowrap">';
      for (var c of word) html += '<span class="ch" aria-hidden="true"><i style="--i:' + (i++) + '">' + c + "</i></span>";
      html += "</span>";
    });
    el.innerHTML = html;
  }

  function rollNumber(el, from, to, ms, fmt) {
    if (reduce) { el.textContent = fmt(to); return; }
    var t0 = performance.now();
    (function step(now) {
      var k = Math.min(1, (now - t0) / ms);
      var e = 1 - Math.pow(1 - k, 4);
      el.textContent = fmt(Math.round(from + (to - from) * e));
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  }

  var PAGES = [1, 2, 2, 3, 3, 4, 4, 5, 6, 6, 7, 8, 9, 10, 10, 11, 11];
  var N = PAGES.length;
  var imgs = [];
  var book = document.querySelector("[data-book]");
  var canvas = book.querySelector("canvas");
  var ctx = canvas.getContext("2d");
  var noEl = book.querySelector("[data-book-no]");
  var speedEl = document.querySelector("[data-speed]");
  var sayEl = document.querySelector("[data-speed-say]");
  var scaleEls = document.querySelectorAll(".speed-scale li");
  var dpr = 1, cw = 0, ch = 0, px0 = 0, py0 = 0, pw = 0, ph = 0;

  var st = { p: 0, v: 0, mode: "idle", target: 0, playSpeed: 12, onion: 0, lift: 0, liftV: 0, speed: 0, lastP: 0, auto: 0 };
  var drag = null, justDragged = false, ready = false, heroVisible = true, lastDrawKey = "", idleSince = 0;

  function frameOf(pg) { return imgs[PAGES[((pg % N) + N) % N] - 1]; }

  function resize() {
    var r = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cw = Math.max(2, Math.round(r.width * dpr));
    ch = Math.max(2, Math.round(r.height * dpr));
    canvas.width = cw; canvas.height = ch;
    px0 = cw * (0.3 / 1.6); pw = cw / 1.6;
    py0 = ch * (0.22 / 1.44); ph = ch / 1.44;
    lastDrawKey = "";
    var right = document.querySelector(".hero-right");
    if (!stacked()) {
      var br = book.getBoundingClientRect(), rr = right.getBoundingClientRect();
      right.style.setProperty("--lead", Math.max(20, rr.left - br.right - 28) + "px");
    }
  }

  function poly(c, pts) { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (var i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); }

  function clipHalf(pts, M, n, sign) {
    var out = [];
    for (var i = 0; i < pts.length; i++) {
      var a = pts[i], b = pts[(i + 1) % pts.length];
      var da = ((a[0] - M[0]) * n[0] + (a[1] - M[1]) * n[1]) * sign;
      var db = ((b[0] - M[0]) * n[0] + (b[1] - M[1]) * n[1]) * sign;
      if (da >= 0) out.push(a);
      if ((da >= 0) !== (db >= 0)) {
        var k = da / (da - db);
        out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]);
      }
    }
    return out;
  }

  function drawPage(img, alpha) {
    if (!img) { ctx.fillStyle = "#f1ece3"; ctx.fillRect(px0, py0, pw, ph); return; }
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.drawImage(img, px0, py0, pw, ph);
    ctx.globalAlpha = 1;
  }

  function draw() {
    var i = Math.floor(st.p), t = st.p - i;
    var lift = st.lift;
    var peel = t > 0.0005 ? t : lift;
    var top = t > 0.0005 ? frameOf(i) : frameOf(Math.round(st.p));
    var under = t > 0.0005 ? frameOf(i + 1) : frameOf(Math.round(st.p) + 1);
    var key = st.p.toFixed(4) + "|" + lift.toFixed(4) + "|" + st.onion.toFixed(3) + "|" + cw + "x" + ch;
    if (key === lastDrawKey) return;
    lastDrawKey = key;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cw, ch);

    ctx.save();
    ctx.shadowColor = "rgba(70, 52, 30, 0.22)";
    ctx.shadowBlur = pw * 0.1;
    ctx.shadowOffsetY = pw * 0.05;
    ctx.shadowOffsetX = pw * 0.012;
    ctx.fillStyle = "#ede7dc";
    ctx.fillRect(px0, py0, pw + 6 * dpr, ph + 6 * dpr);
    ctx.restore();
    for (var k = 6; k >= 1; k--) {
      ctx.fillStyle = k % 2 ? "#e6dfd2" : "#f2ede4";
      ctx.fillRect(px0 + k * dpr, py0 + k * dpr, pw, ph);
    }
    ctx.fillStyle = "rgba(29,29,31,0.18)";
    ctx.fillRect(px0 - 1 * dpr, py0, 2.5 * dpr, ph + 6 * dpr);

    var rect = [[px0, py0], [px0 + pw, py0], [px0 + pw, py0 + ph], [px0, py0 + ph]];

    if (peel <= 0.0005) {
      drawPage(top);
      if (st.onion > 0.005) {
        ctx.save(); ctx.globalCompositeOperation = "multiply"; drawPage(under, st.onion); ctx.restore();
      }
      return;
    }

    drawPage(under);

    var C = [px0 + pw, py0 + ph];
    var P = [C[0] - peel * 1.62 * pw, C[1] - Math.sin(Math.PI * Math.min(1, peel)) * 0.12 * ph - peel * 0.04 * ph];
    var M = [(C[0] + P[0]) / 2, (C[1] + P[1]) / 2];
    var dx = C[0] - P[0], dy = C[1] - P[1], len = Math.hypot(dx, dy) || 1;
    var n = [dx / len, dy / len];
    var keep = clipHalf(rect, M, n, -1);
    var fold = clipHalf(rect, M, n, 1);
    var fade = peel < 0.45 ? 1 : Math.max(0, 1 - (peel - 0.45) / 0.45);
    fade = fade * fade * (3 - 2 * fade);

    if (fold.length > 2) {
      ctx.save();
      poly(ctx, fold); ctx.clip();
      var g0 = ctx.createLinearGradient(M[0], M[1], M[0] + n[0] * pw * 0.32, M[1] + n[1] * pw * 0.32);
      g0.addColorStop(0, "rgba(60,44,26," + (0.26 * fade).toFixed(3) + ")");
      g0.addColorStop(1, "rgba(60,44,26,0)");
      ctx.fillStyle = g0; ctx.fillRect(px0, py0, pw, ph);
      ctx.restore();
    }

    if (keep.length > 2) {
      ctx.save();
      poly(ctx, keep); ctx.clip();
      drawPage(top, fade);
      if (st.onion > 0.005) { ctx.globalCompositeOperation = "multiply"; drawPage(under, st.onion * fade); ctx.globalCompositeOperation = "source-over"; }
      var g1 = ctx.createLinearGradient(M[0], M[1], M[0] - n[0] * pw * 0.14, M[1] - n[1] * pw * 0.14);
      g1.addColorStop(0, "rgba(60,44,26," + (0.2 * fade).toFixed(3) + ")");
      g1.addColorStop(1, "rgba(60,44,26,0)");
      ctx.fillStyle = g1; ctx.fillRect(px0, py0, pw, ph);
      ctx.restore();
    }

    if (fold.length > 2 && fade > 0.01) {
      var flap = fold.map(function (q) {
        var d = (q[0] - M[0]) * n[0] + (q[1] - M[1]) * n[1];
        return [q[0] - 2 * d * n[0], q[1] - 2 * d * n[1]];
      });
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.shadowColor = "rgba(60,44,26,0.25)";
      ctx.shadowBlur = pw * 0.05;
      ctx.shadowOffsetX = -pw * 0.01;
      ctx.shadowOffsetY = pw * 0.012;
      poly(ctx, flap);
      ctx.fillStyle = "#efe9de";
      ctx.fill();
      ctx.shadowColor = "transparent";
      poly(ctx, flap); ctx.clip();
      var a = 1 - 2 * n[0] * n[0], b = -2 * n[0] * n[1], d2 = 1 - 2 * n[1] * n[1];
      var e = 2 * n[0] * (M[0] * n[0] + M[1] * n[1]), f = 2 * n[1] * (M[0] * n[0] + M[1] * n[1]);
      ctx.save();
      ctx.transform(a, b, b, d2, e, f);
      ctx.globalAlpha = 0.13 * fade;
      if (top) ctx.drawImage(top, px0, py0, pw, ph);
      ctx.restore();
      var far = Math.max.apply(null, flap.map(function (q) { return -((q[0] - M[0]) * n[0] + (q[1] - M[1]) * n[1]); }));
      var g2 = ctx.createLinearGradient(M[0], M[1], M[0] - n[0] * far, M[1] - n[1] * far);
      g2.addColorStop(0, "rgba(90,70,45,0.16)");
      g2.addColorStop(0.12, "rgba(255,255,255,0.20)");
      g2.addColorStop(0.5, "rgba(255,255,255,0)");
      g2.addColorStop(1, "rgba(90,70,45,0.08)");
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, cw, ch);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = fade * 0.5;
      poly(ctx, flap);
      ctx.strokeStyle = "rgba(29,29,31,0.18)";
      ctx.lineWidth = dpr;
      ctx.stroke();
      ctx.restore();
    }
  }

  function setPlay(target, speed) { st.mode = "play"; st.target = target; st.playSpeed = speed; }

  function step(dt, now) {
    var prev = st.p;
    if (st.mode === "auto") {
      st.auto += dt;
      var k = Math.min(1, st.auto / 1.5);
      var s = 2 + 10 * (k * k * (3 - 2 * k));
      st.p = Math.min(N - 1, st.p + s * dt);
      if (st.p >= N - 1) { st.p = N - 1; st.mode = "idle"; idleSince = now; }
    } else if (st.mode === "play") {
      var dir = Math.sign(st.target - st.p);
      st.p += dir * st.playSpeed * dt;
      if ((dir > 0 && st.p >= st.target) || (dir < 0 && st.p <= st.target) || dir === 0) {
        st.p = st.target;
        if (st.after) { var a = st.after; st.after = null; a(); } else { st.mode = "idle"; idleSince = now; }
      }
    } else if (st.mode === "coast") {
      st.p += st.v * dt;
      st.v *= Math.exp(-2.6 * dt);
      if (Math.abs(st.v) < 1.4) { st.mode = "settle"; st.target = st.v >= 0 ? Math.ceil(st.p - 0.001) : Math.floor(st.p + 0.001); }
    } else if (st.mode === "settle" || st.mode === "wheel") {
      if (st.mode === "wheel" && now - st.wheelAt > 160) { st.mode = "settle"; st.target = Math.round(st.p); st.v = 0; }
      if (st.mode === "settle") {
        var acc = 170 * (st.target - st.p) - 26 * st.v;
        st.v += acc * dt; st.p += st.v * dt;
        if (Math.abs(st.target - st.p) < 0.002 && Math.abs(st.v) < 0.05) { st.p = st.target; st.v = 0; st.mode = "idle"; idleSince = now; }
      }
    }
    if (st.p > N * 50 || st.p < -N * 50) { st.p = ((st.p % N) + N) % N; }

    var inst = Math.abs(st.p - prev) / Math.max(dt, 1e-3);
    st.speed += (inst - st.speed) * (1 - Math.exp(-dt / 0.25));

    var onionTarget = drag && drag.active && st.speed < 6 ? 0.25 : 0;
    st.onion += (onionTarget - st.onion) * (1 - Math.exp(-dt * (onionTarget ? 10 : 3.3)));
    if (st.onion < 0.004) st.onion = 0;

    var liftTarget = 0;
    if (!reduce && st.mode === "idle" && !drag && ready) {
      var u = ((now - idleSince) / 1000) % 4;
      if (now - idleSince > 1500 && u < 0.9) liftTarget = 0.075 * Math.sin(Math.PI * (u / 0.9));
    }
    var la = 180 * (liftTarget - st.lift) - 20 * st.liftV;
    st.liftV += la * dt; st.lift += st.liftV * dt;
    if (st.lift < 0) { st.lift = 0; st.liftV = 0; }
  }

  var shownSpeed = -1, shownPage = -1, shownBand = -1;
  function updateLabels() {
    var sp = Math.round(st.speed);
    if (sp !== shownSpeed) { shownSpeed = sp; speedEl.textContent = sp; }
    var band = st.speed < 5.5 ? 0 : st.speed < 11.5 ? 1 : 2;
    if (band !== shownBand) {
      shownBand = band;
      sayEl.textContent = ["한 장씩 — 그림", "이어지기 시작", "움직임 — 숨을 쉰다"][band];
      scaleEls.forEach(function (li, j) { li.classList.toggle("on", j === band); });
    }
    var pg = ((Math.round(st.p) % N) + N) % N + 1;
    if (pg !== shownPage) { shownPage = pg; noEl.textContent = String(pg).padStart(2, "0"); }
  }

  var last = performance.now(), acc = 0;
  function loop(now) {
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    acc += dt;
    var stepDt = 1 / 60, n = 0;
    while (acc >= stepDt && n < 3) { step(stepDt, now); acc -= stepDt; n++; }
    if (n === 3) acc = 0;
    if (ready && heroVisible) draw();
    updateLabels();
    requestAnimationFrame(loop);
  }

  function pagePx() { return book.getBoundingClientRect().width * 0.16; }

  book.addEventListener("pointerdown", function (e) {
    if (e.button !== undefined && e.button !== 0) return;
    drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, p0: st.p, active: false, lx: e.clientX, lt: performance.now(), v: 0 };
  });
  book.addEventListener("pointermove", function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    var dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (!drag.active) {
      if (Math.abs(dx) > 7 && Math.abs(dx) > Math.abs(dy) * 1.1) {
        drag.active = true; drag.x0 = e.clientX; drag.p0 = st.p; st.mode = "drag"; st.v = 0;
        book.classList.add("is-drag");
        try { book.setPointerCapture(e.pointerId); } catch (err) {}
      } else if (Math.abs(dy) > 10) { drag = null; }
      return;
    }
    var now = performance.now();
    var np = drag.p0 + (drag.x0 - e.clientX) / pagePx();
    var dtm = Math.max(1, now - drag.lt) / 1000;
    var inst = (np - st.p) / dtm;
    drag.v += (inst - drag.v) * Math.min(1, dtm * 14);
    st.p = np;
    drag.lt = now;
    e.preventDefault();
  });
  function endDrag(e) {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    if (drag.active) {
      justDragged = true;
      setTimeout(function () { justDragged = false; }, 60);
      var fresh = performance.now() - drag.lt < 90;
      st.v = fresh ? Math.max(-30, Math.min(30, drag.v)) : 0;
      st.mode = "coast";
      book.classList.remove("is-drag");
    }
    drag = null;
  }
  book.addEventListener("pointerup", endDrag);
  book.addEventListener("pointercancel", function (e) { if (drag && drag.active) endDrag(e); else drag = null; });
  book.addEventListener("click", function () {
    if (justDragged) return;
    var base = Math.round(st.p);
    var pos = ((base % N) + N) % N;
    if (pos === N - 1) {
      setPlay(base - (N - 1), 24);
      st.after = function () { setPlay(st.p + (N - 1), 12); };
    } else {
      setPlay(base + (N - 1 - pos), 12);
    }
  });
  book.addEventListener("wheel", function (e) {
    var dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : (e.shiftKey ? e.deltaY : 0);
    if (!dx) return;
    e.preventDefault();
    st.p += dx / 120;
    st.mode = "wheel"; st.wheelAt = performance.now(); st.v = 0;
  }, { passive: false });
  book.setAttribute("tabindex", "0");
  book.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight") { setPlay(Math.round(st.p) + 1, 12); e.preventDefault(); }
    if (e.key === "ArrowLeft") { setPlay(Math.round(st.p) - 1, 12); e.preventDefault(); }
    if (e.key === "Enter" || e.key === " ") { book.click(); e.preventDefault(); }
  });

  function loadImages() {
    var files = [];
    for (var i = 1; i <= 11; i++) files.push("img/f" + String(i).padStart(2, "0") + ".webp");
    return Promise.all(files.map(function (src, j) {
      return new Promise(function (res) {
        var im = new Image();
        im.decoding = "async";
        im.onload = function () { (im.decode ? im.decode() : Promise.resolve()).catch(function () {}).then(function () { res(im); }); };
        im.onerror = function () { res(null); };
        im.src = src;
        imgs[j] = im;
      });
    })).then(function (list) { imgs = list; });
  }

  var fontReady = document.fonts && document.fonts.load ? Promise.race([document.fonts.load('900 100px "Pretendard Variable"', "애니메이션박물관"), new Promise(function (r) { setTimeout(r, 1400); })]) : Promise.resolve();

  fitTitle();
  renderToday();
  setInterval(renderToday, 60000);
  document.querySelectorAll(".reveal").forEach(splitReveal);
  resize();
  requestAnimationFrame(loop);

  fontReady.then(function () { fitTitle(); resize(); });
  Promise.all([loadImages(), fontReady]).then(function () {
    ready = true;
    lastDrawKey = "";
    hero.classList.add("is-in");
    rollNumber(document.querySelector("[data-roll-year]"), 2003, 2026, 1600, String);
    if (!reduce) { st.mode = "auto"; st.auto = 0; st.p = 0; } else { st.p = N - 1; idleSince = performance.now(); }
  });

  var resizeTimer = 0, lastW = window.innerWidth;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (window.innerWidth === lastW && Math.abs(canvas.getBoundingClientRect().height * dpr - ch) < 4) return;
      lastW = window.innerWidth;
      fitTitle(); resize();
    }, 150);
  });
  if (window.ResizeObserver) new ResizeObserver(function () { resize(); }).observe(book);

  if (window.IntersectionObserver) {
    new IntersectionObserver(function (es) { es.forEach(function (en) { heroVisible = en.isIntersecting; if (heroVisible) lastDrawKey = ""; }); }).observe(hero);
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target;
        io.unobserve(el);
        if (el.classList.contains("reveal")) el.classList.add("is-on");
        if (el.dataset.count) {
          var to = +el.dataset.count;
          rollNumber(el, 0, to, 900, function (v) { return v.toLocaleString("ko-KR"); });
        }
      });
    }, { rootMargin: "0px 0px -8% 0px" });
    document.querySelectorAll(".reveal, [data-count]").forEach(function (el) { io.observe(el); });
  } else {
    document.querySelectorAll(".reveal").forEach(function (el) { el.classList.add("is-on"); });
  }

  var nav = document.querySelector(".nav");
  var bar = document.querySelector(".progress i");
  function onScroll() {
    var y = window.scrollY, h = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.transform = "scaleX(" + (h > 0 ? Math.min(1, y / h) : 0).toFixed(4) + ")";
    nav.classList.toggle("is-top", y < hero.offsetHeight * 0.55);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
})();
