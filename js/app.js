'use strict';
(() => {
  const $ = id => document.getElementById(id), TAU = Math.PI * 2;
  const qs = new URLSearchParams(location.search);
  const LS = 'cinco-pocket-watch-v1';
  const DEF = { finish: 'brass', prism: false, secStyle: 'sweep', tickSound: true, volume: 0.7, chime: true, sarcasm: true, voice: false, haptics: true, motion: 'auto', reserveMode: 'cinco', digStyle: 'nixie', h24: false, mode: 'analog', friday: false, dst: false, dstSince: 0, gst: false, ach: {}, alarms: [], tried: [], excuses: 0, lid: false, skeleton: false };
  let S = Object.assign({}, DEF);
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(LS) || 'null'); if (saved && saved.S) S = Object.assign({}, DEF, saved.S); } catch (e) { saved = null; }
  if (qs.has('fresh')) saved = null, S = Object.assign({}, DEF);
  ['digital', 'lcd'].forEach(m => { if (qs.get('mode') === m) { S.mode = 'digital'; S.digStyle = m === 'lcd' ? 'lcd' : 'nixie'; } });
  if (qs.has('open')) S.lid = true;
  if (qs.has('skeleton')) S.skeleton = true;
  if (qs.get('finish') && D.finishes[qs.get('finish')]) S.finish = qs.get('finish');

  const RES_DUR = { gerald: 120, cinco: 720, real: 40 * 3600 };
  const W = { wt: Date.now(), reserve: 0.85, dead: false, rate: 1, phase: 0, droop: 0, droopV: 0, pulled: false, snoozeUntil: 0, lastSecInt: -1, lastHour: -1, tickAlt: false, overwind: 0 };
  function resDur() { return RES_DUR[S.reserveMode] || 720; }
  function catchUp(sec) {
    if (W.snoozeUntil || W.pulled) return;
    if (W.dead) return;
    const run = W.reserve * resDur();
    if (sec < run) { W.reserve -= sec / resDur(); W.wt += sec * 1000; }
    else { W.wt += run * 1000; W.reserve = 0; die(true); }
  }
  if (saved && saved.W) {
    W.reserve = saved.W.reserve; W.dead = !!saved.W.dead; W.wt = Date.now() - saved.W.lag - (Date.now() - saved.W.savedAt);
    if (!W.dead) { W.wt = Date.now() - saved.W.lag; const el = (Date.now() - saved.W.savedAt) / 1000; W.wt -= el * 1000; catchUp(el); }
  }
  if (qs.has('full')) { W.reserve = 1; W.dead = false; W.wt = Date.now(); }
  function save() { try { localStorage.setItem(LS, JSON.stringify({ S, W: { reserve: W.reserve, dead: W.dead, lag: Date.now() - W.wt, savedAt: Date.now() } })); } catch (e) { /* private mode */ } }

  /* ---------- helpers ---------- */
  const reduced = () => S.motion === 'reduce' || (S.motion === 'auto' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  function applyMotion() { document.body.classList.toggle('rm', reduced()); }
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const pad = n => String(n).padStart(2, '0');
  function haptic(kind) {
    if (!S.haptics) return;
    if (navigator.vibrate) { try { navigator.vibrate(kind === 'heavy' ? [30, 40, 30] : kind === 'med' ? 18 : 6); } catch (e) { } }
    else { const h = $('hap'); if (h && h.parentNode) h.parentNode.click(); }
  }
  function toast(html, cls, ms) {
    const t = document.createElement('div'); t.className = 'toast ' + (cls || ''); t.innerHTML = html;
    const box = $('toasts'); box.appendChild(t); while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => t.remove(), ms || 4200);
  }
  function unlock(id) {
    if (S.ach[id]) return; const a = D.ach.find(x => x[0] === id); if (!a) return;
    S.ach[id] = Date.now(); save(); renderAch();
    toast('<b>' + a[1] + ' Achievement unlocked:</b> ' + a[2], 'ach'); Snd.fanfare(); haptic('med');
  }
  function say(text) { if (S.voice) Voice.say(text); }
  function fmtTime(d, sec) { let h = d.getHours(); const ap = h < 12 ? 'AM' : 'PM'; if (!S.h24) h = h % 12 || 12; return (S.h24 ? pad(h) : h) + ':' + pad(d.getMinutes()) + (sec ? ':' + pad(d.getSeconds()) : '') + (S.h24 ? '' : ' ' + ap); }

  /* ---------- watch time ---------- */
  function dstOffset() { if (!S.dst) return 0; const days = Math.floor((Date.now() - S.dstSince) / 864e5) + 1; return (days % 24) * 3600e3; }
  function dispMs() { return W.wt + dstOffset(); }
  function dispDate() { // returns a Date whose local fields are the displayed time
    const ms = dispMs();
    if (S.gst) { const u = new Date(ms + 355 * 60000); return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate(), u.getUTCHours(), u.getUTCMinutes(), u.getUTCSeconds(), u.getUTCMilliseconds()); }
    return new Date(ms);
  }
  function gstDate(ms) { const u = new Date((ms == null ? Date.now() : ms) + 355 * 60000); return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate(), u.getUTCHours(), u.getUTCMinutes(), u.getUTCSeconds()); }
  const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  function moonPhase(ms) { const syn = 29.530588853, ref = Date.UTC(2000, 0, 6, 18, 14); let p = ((ms - ref) / 864e5 / syn) % 1; if (p < 0) p += 1; return p; }
  function moonName(p) { return ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'][Math.round(p * 8) % 8]; }
  let dialKey = '';
  function updateDial(force) {
    const d = dispDate(), day = S.friday ? 'FRI' : DAYS[d.getDay()], key = day + d.getDate() + S.finish + Math.round(moonPhase(dispMs()) * 60);
    if (key === dialKey && !force) return; dialKey = key;
    Render.setDialInfo({ day: day + ' ' + d.getDate(), moon: moonPhase(dispMs()), friday: S.friday });
  }

  /* ---------- death and winding ---------- */
  function die(silent) {
    if (W.dead) return; W.dead = true; W.reserve = 0;
    if (!silent) { Snd.sad(); haptic('heavy'); toast('<b>The watch has stopped.</b> Time continues without it. Gerald is not surprised.'); say('The watch has stopped, Sir. Time is carrying on regardless, which is rather rude of it.'); unlock('dead'); }
    updateStatus();
  }
  function wind(amount, quiet) {
    Snd.ensure();
    if (W.reserve >= 1) {
      W.overwind++; Snd.tone(140, 0, 0.12, 'square', 0.1); haptic('med');
      if (W.overwind === 8) { toast('<b>Mainspring at capacity.</b> Further winding is being forwarded to Gerald.'); unlock('overwind'); }
      if (W.overwind === 20) toast('Gerald has received your winding and declined it.');
      return;
    }
    W.reserve = Math.min(1, W.reserve + amount); Snd.ratchet(); if (!quiet) haptic();
    unlock('wind');
    if (W.dead) { W.dead = false; W.droopV = -6; toast('<b>It lives!</b> The watch has been wound back to life. Lost time is not included.'); unlock('lazarus'); say('It lives, Sir. Somewhat behind schedule.'); }
    if (W.reserve >= 1) W.overwind = 0;
    updateStatus();
  }

  /* ---------- DOM refs ---------- */
  const watchEl = $('watch'), pend = $('pendulum'), lid = $('lid'), crown = $('crown'), knurl = $('knurl'), spec = $('spec');
  Render.init($('wc'), $('lid-front'), $('lid-back'));
  let ws = 340;
  function layout() {
    const vw = document.documentElement.clientWidth, vh = window.innerHeight, wide = vw >= 900;
    ws = Math.round(Math.max(240, Math.min(wide ? Math.min(vw / 2 - 80, 470) : vw - 48, 440, Math.max(260, vh - (wide ? 230 : 330)))));
    document.documentElement.style.setProperty('--ws', ws + 'px');
    Render.resize(ws); dialKey = ''; updateDial(true);
    const r = watchEl.getBoundingClientRect();
    document.documentElement.style.setProperty('--lid-open', r.left > ws * 0.8 ? '-162deg' : '-108deg');
    drawNow = true;
  }

  /* ---------- lid ---------- */
  let lidAnimUntil = 0, drawNow = true;
  function setLid(open, quiet) {
    S.lid = open; lid.classList.toggle('open', open); lidAnimUntil = performance.now() + 1200; drawNow = true;
    $('q-lid').textContent = open ? 'Close lid' : 'Open lid';
    if (!quiet) { Snd.lid(); haptic('med'); if (open) unlock('lid'); }
    updateStatus();
  }

  /* ---------- crown gestures ---------- */
  let cg = null;
  crown.addEventListener('pointerdown', e => {
    Snd.ensure(); crown.setPointerCapture(e.pointerId);
    cg = { x: e.clientX, y: e.clientY, last: e.clientX, acc: 0, moved: false, t: performance.now(), lp: setTimeout(() => { if (!cg.moved) { cg.long = true; togglePull(); } }, 550) };
  });
  crown.addEventListener('pointermove', e => {
    if (!cg) return; const dx = e.clientX - cg.last; cg.last = e.clientX;
    if (Math.abs(e.clientX - cg.x) > 6 || Math.abs(e.clientY - cg.y) > 6) { if (!cg.moved) clearTimeout(cg.lp); cg.moved = true; }
    if (!cg.moved) return;
    cg.acc += dx; knurlPos += dx; knurl.style.transform = 'translateX(' + (((knurlPos % 32) + 32) % 32 - 16) + 'px)';
    if (W.pulled) { W.wt += dx * 30000; const m = Math.floor(W.wt / 60000); if (m !== cg.lastMin) { cg.lastMin = m; Snd.tick(false, 0.8); haptic(); } drawNow = true; return; }
    while (Math.abs(cg.acc) >= 12) { cg.acc -= Math.sign(cg.acc) * 12; wind(1 / 60); }
  });
  let knurlPos = 0;
  function endCrown() {
    if (!cg) return; clearTimeout(cg.lp);
    if (!cg.moved && !cg.long) { if (W.pulled) togglePull(); else setLid(!S.lid); }
    cg = null;
  }
  crown.addEventListener('pointerup', endCrown); crown.addEventListener('pointercancel', () => { if (cg) clearTimeout(cg.lp); cg = null; });
  crown.addEventListener('wheel', e => { e.preventDefault(); if (W.pulled) W.wt += Math.sign(e.deltaY) * 60000; else wind(1 / 60); knurlPos += e.deltaY > 0 ? 4 : -4; knurl.style.transform = 'translateX(' + (((knurlPos % 32) + 32) % 32 - 16) + 'px)'; }, { passive: false });
  crown.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (W.pulled) togglePull(); else setLid(!S.lid); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); if (W.pulled) W.wt += 60000; else wind(1 / 30); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); if (W.pulled) W.wt -= 60000; else wind(1 / 30); }
    else if (e.key.toLowerCase() === 's') togglePull();
  });
  function togglePull() {
    W.pulled = !W.pulled; crown.classList.toggle('pulled', W.pulled); Snd.tick(true, 2); haptic('heavy');
    if (W.pulled) { if (!S.lid) setLid(true); toast('<b>Crown pulled.</b> The seconds have stopped (hacking). Drag sideways to set the time, Sir. Tap the crown to push it in.'); }
    else { const lag = Math.round((W.wt - Date.now()) / 60000); toast('Time set. Now ' + (lag === 0 ? 'in agreement with reality, briefly.' : Math.abs(lag) + ' min ' + (lag > 0 ? 'fast' : 'slow') + ' versus reality. Reality has been notified.')); unlock('set'); }
    updateStatus();
  }

  /* ---------- tilt / pendulum / specular ---------- */
  const P = { a: 0, v: 0, target: 0, sx: 0, sy: 0, lastT: '', tiltOn: false };
  function onOrient(e) {
    if (e.gamma == null) return; P.tiltOn = true;
    P.target = Math.max(-40, Math.min(40, -e.gamma));
    P.sx = Math.max(-40, Math.min(40, e.gamma * 1.4)); P.sy = Math.max(-40, Math.min(40, (e.beta - 45) * 1.2));
  }
  function enableTilt(fromButton) {
    const DOE = window.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function') {
      DOE.requestPermission().then(r => { if (r === 'granted') { addEventListener('deviceorientation', onOrient); if (fromButton) toast('Tilt enabled. Swing away, Sir.'); } else if (fromButton) toast('Tilt permission declined. Gerald respects this.'); }).catch(() => fromButton && toast('Tilt needs a tap to enable on this device.'));
    } else if (DOE) { addEventListener('deviceorientation', onOrient); if (fromButton) toast('Tilt enabled (if your device has a gyroscope; desktops mostly do not).'); }
  }
  enableTilt(false);
  addEventListener('click', () => { const DOE = window.DeviceOrientationEvent; if (!P.tiltOn && DOE && typeof DOE.requestPermission === 'function') enableTilt(false); }, { once: true });
  const stage = $('stage');
  stage.addEventListener('pointermove', e => { if (P.tiltOn) return; const r = stage.getBoundingClientRect(); P.sx = ((e.clientX - r.left) / r.width - .5) * 70; P.sy = ((e.clientY - r.top) / r.height - .5) * 70; });
  let flick = null;
  watchEl.addEventListener('pointerdown', e => { flick = { x: e.clientX, t: performance.now() }; Snd.ensure(); });
  watchEl.addEventListener('pointerup', e => { if (!flick) return; const dx = e.clientX - flick.x, dt = Math.max(16, performance.now() - flick.t); if (Math.abs(dx) > 20 && !reduced()) { P.v += dx / dt * 40; } flick = null; });

  /* ---------- digital ---------- */
  const nix = $('nixie'); const tubes = [];
  'hh:mm:ss'.split('').forEach(ch => {
    if (ch === ':') { const c = document.createElement('div'); c.className = 'colon'; c.innerHTML = '<i></i><i></i>'; nix.appendChild(c); return; }
    const t = document.createElement('div'); t.className = 'tube'; let h = ''; for (const n of [1, 0, 2, 9, 3, 8, 4, 7, 5, 6]) h += '<span data-n="' + n + '">' + n + '</span>'; t.innerHTML = h; nix.appendChild(t); tubes.push({ el: t, cur: -1, spans: Array.from(t.children) });
  });
  const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
  const lcd = $('lcd'); const lcdDigits = [];
  (function buildLcd() {
    const NS = 'http://www.w3.org/2000/svg'; let html = '';
    const seg = (x, y, w, h) => `M${x} ${y}h${w}l8 8-8 8h-${w}l-8-8z`;
    const vseg = (x, y, h) => `M${x} ${y}l8 8v${h}l-8 8-8-8v-${h}z`;
    const xs = [20, 100, 205, 285, 390, 470];
    xs.forEach((x0, i) => {
      const sc = i >= 4 ? 0.7 : 1, y0 = i >= 4 ? 45 : 18, s = 1 * sc;
      const P_ = { a: seg(x0 + 10, y0, 44), g: seg(x0 + 10, y0 + 49, 44), d: seg(x0 + 10, y0 + 98, 44), f: vseg(x0 + 2, y0 + 8, 34), b: vseg(x0 + 62, y0 + 8, 34), e: vseg(x0 + 2, y0 + 57, 34), c: vseg(x0 + 62, y0 + 57, 34) };
      html += `<g data-d="${i}" transform="translate(${x0 * (1 - s)} ${0}) scale(${s} ${s})">` + Object.entries(P_).map(([k, d]) => `<path data-s="${k}" d="${d}"/>`).join('') + '</g>';
    });
    html += '<g class="lcol"><rect x="184" y="52" width="10" height="10"/><rect x="184" y="92" width="10" height="10"/><rect x="369" y="70" width="8" height="8"/><rect x="369" y="100" width="8" height="8"/></g><text id="lcd-ap" x="540" y="38" text-anchor="end" font-family="STM" font-size="18" fill="#1b2414">PM</text><text x="20" y="146" font-family="STM" font-size="12" fill="#1b2414" opacity=".7">CINCO LCD-FWIP · SEGMENTS MAY FAULT</text>';
    lcd.innerHTML = html; void NS;
    lcd.querySelectorAll('g[data-d]').forEach(g => lcdDigits.push({ cur: -1, segs: Object.fromEntries(Array.from(g.children).map(p => [p.dataset.s, p])) }));
    lcd.querySelectorAll('path').forEach(p => { p.setAttribute('fill', '#1b2414'); p.style.opacity = '.08'; });
    lcd.querySelectorAll('.lcol rect').forEach(r => r.setAttribute('fill', '#1b2414'));
  })();
  let digKey = '';
  function updateDigital(force) {
    const d = dispDate(); let h = d.getHours(); const ap = h < 12 ? 'AM' : 'PM'; if (!S.h24) h = h % 12 || 12;
    let digits = pad(h) + pad(d.getMinutes()) + pad(d.getSeconds());
    if (!W.dead && Math.random() < 0.004) { const i = Math.floor(Math.random() * 6); digits = digits.slice(0, i) + '5' + digits.slice(i + 1); } // cathode gremlin (CINCO = 5)
    const key = digits + W.dead + S.digStyle + ap;
    if (key !== digKey || force) {
      digKey = key;
      if (S.digStyle === 'nixie') tubes.forEach((t, i) => { const n = +digits[i]; if (t.cur !== n) { t.spans.forEach(s => s.classList.toggle('on', +s.dataset.n === n)); t.cur = n; } t.el.classList.toggle('off', W.dead); });
      else { lcdDigits.forEach((g, i) => { const n = +digits[i]; if (g.cur === n && !force) return; g.cur = n; for (const k in g.segs) g.segs[k].style.opacity = (!W.dead && SEG[n].includes(k)) ? '1' : '.08'; }); $('lcd-ap').textContent = S.h24 ? '24H' : ap; }
      const pct = Math.round(W.reserve * 100);
      $('dig-sub').textContent = (S.friday ? 'FRI' : DAYS[d.getDay()]) + ' ' + d.getDate() + ' · ' + (S.gst ? 'GST' : S.dst ? 'DST×∞' : 'LOCAL') + (S.h24 ? '' : ' · ' + ap) + ' · RES ' + pct + '%' + (W.dead ? ' · STOPPED' : '');
      $('dig-bar').style.transform = 'scaleX(' + W.reserve.toFixed(3) + ')';
    }
    const colOn = W.dead ? false : (d.getMilliseconds() < 500);
    nix.querySelectorAll('.colon').forEach(c => c.classList.toggle('dim', !colOn));
  }
  function setMode(m, quiet) {
    S.mode = m; const dig = m === 'digital';
    $('digital').hidden = !dig; pend.hidden = dig; document.querySelector('.fob').hidden = dig;
    $('m-analog').setAttribute('aria-pressed', !dig); $('m-digital').setAttribute('aria-pressed', dig);
    nix.hidden = S.digStyle !== 'nixie'; lcd.toggleAttribute('hidden', S.digStyle === 'nixie');
    $('dig-style').textContent = S.digStyle === 'nixie' ? 'Switch to LCD' : 'Switch to Nixie';
    digKey = ''; lcdDigits.forEach(g => g.cur = -1); tubes.forEach(t => t.cur = -1); updateDigital(true); drawNow = true;
    if (dig && !quiet) { unlock('digital'); haptic(); }
    save();
  }
  $('m-analog').onclick = () => setMode('analog'); $('m-digital').onclick = () => setMode('digital');
  $('dig-style').onclick = () => { S.digStyle = S.digStyle === 'nixie' ? 'lcd' : 'nixie'; if (S.digStyle === 'lcd') unlock('lcd'); setMode('digital', true); };
  $('dig-24').onclick = () => { S.h24 = !S.h24; digKey = ''; updateDigital(true); renderSettings(); save(); };

  /* ---------- status + readout ---------- */
  function updateStatus() {
    let t;
    const lagMin = Math.round((W.wt - Date.now()) / 60000);
    if (W.snoozeUntil) t = 'Reality is snoozed. The watch is holding its breath.';
    else if (W.pulled) t = 'Crown pulled: drag sideways to set the time, tap to push it in.';
    else if (W.dead) t = 'The watch has stopped. Drag the crown sideways to wind it, Sir.';
    else if (S.mode === 'analog' && !S.lid) t = 'Press the crown to open the lid, Sir. Drag it sideways to wind.';
    else if (W.reserve < 0.12) t = 'Power reserve critical. The watch is slowing down dramatically.';
    else if (lagMin) t = 'Running ' + Math.abs(lagMin) + ' min ' + (lagMin > 0 ? 'fast' : 'slow') + '. Tap Sync to rejoin reality.';
    else t = pick(['All is well, Sir. Time is proceeding in the usual direction.', 'Reserve ' + Math.round(W.reserve * 100) + '%. Gerald approves, grudgingly.', 'Ticking nicely. Time, now with more time.']);
    if ($('status').dataset.t !== t.slice(0, 20)) { $('status').textContent = t; $('status').dataset.t = t.slice(0, 20); }
  }
  function updateReadout() {
    if ($('p-watch').hidden) return;
    const lag = (W.wt - Date.now()) / 1000, p = moonPhase(dispMs());
    const rows = [
      ['Model', 'CINCO Chrono-Fwip 5000 Pocket Edition'], ['Owner', 'Nick (Sir)'], ['Calibre', 'FWIP-5, hand-wound, 18,000 vph'],
      ['Power reserve', Math.round(W.reserve * 100) + '% · ' + (S.reserveMode === 'real' ? '40 h' : S.reserveMode === 'gerald' ? '2 min (Gerald mode)' : '12 min (CINCO mode)') + ' full'],
      ['State', W.dead ? 'Stopped (dramatically)' : W.reserve < .12 ? 'Slowing' : W.pulled ? 'Hacking (crown pulled)' : 'Running'],
      ['Versus reality', Math.abs(lag) < 1 ? 'In agreement, for now' : (Math.abs(lag) >= 60 ? (Math.abs(lag) / 60).toFixed(1) + ' min ' : Math.round(Math.abs(lag)) + ' s ') + (lag > 0 ? 'fast' : 'slow')],
      ['Zone', S.gst ? 'Gerald Standard Time (UTC+5:55)' : 'Local' + (S.dst ? ' + Daylight Saving Every Day (+' + dstOffset() / 3600e3 + ' h)' : '')],
      ['Moon', moonName(p) + ' · ' + Math.round((1 - Math.cos(p * TAU)) / 2 * 100) + '% lit · probably ours'],
      ['Jewels', '5 (one is decaf)'], ['Water resistance', 'Afraid of water. Decaf Water especially.']
    ];
    $('readout').innerHTML = rows.map(r => '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>').join('');
  }

  /* ---------- finishes ---------- */
  function renderFinishes() {
    $('finishes').innerHTML = Object.entries(D.finishes).map(([k, f]) => {
      const locked = f.secret && !S.prism;
      return '<button data-f="' + k + '" aria-pressed="' + (S.finish === k) + '"' + (locked ? ' disabled' : '') + '><i style="background:' + (locked ? '#333' : 'conic-gradient(' + [f.c[1], f.c[0], f.c[2], f.c[3], f.c[1], f.c[0], f.c[1]].join(',') + ')') + '"></i>' + (locked ? '???' : f.name) + '</button>';
    }).join('');
    $('finishes').querySelectorAll('button').forEach(b => b.onclick = () => setFinish(b.dataset.f));
  }
  function setFinish(k, quiet) {
    S.finish = k; Render.setFinish(k); dialKey = ''; updateDial(true); drawNow = true; renderFinishes();
    if (!quiet) { haptic(); if (!S.tried.includes(k) && k !== 'prism') S.tried.push(k); if (['brass', 'silver', 'gunmetal', 'rose'].every(x => S.tried.includes(x))) unlock('collector'); save(); }
    document.querySelector('meta[name=theme-color]').content = k === 'prism' ? '#120a1c' : '#120d07';
  }
  let logoTaps = [];
  $('logo').onclick = () => {
    const now = performance.now(); logoTaps = logoTaps.filter(t => now - t < 2500); logoTaps.push(now); Snd.ensure(); Snd.tick(false, 1);
    if (logoTaps.length >= 5) { logoTaps = []; if (!S.prism) { S.prism = true; toast('<b>Secret finish unlocked: Fwip Prismatic.</b> Gerald did not authorise this. Gerald is furious, quietly.'); unlock('secret'); } setFinish('prism'); }
  };

  /* ---------- quick buttons ---------- */
  $('q-lid').onclick = () => { if (S.mode !== 'analog') setMode('analog'); setLid(!S.lid); };
  $('q-wind').onclick = () => { for (let i = 0; i < 5; i++) setTimeout(() => wind(0.05, i > 0), i * 70); haptic('med'); };
  $('q-rep').onclick = repeater;
  $('q-skel').onclick = () => { S.skeleton = !S.skeleton; if (S.mode !== 'analog') setMode('analog'); if (!S.lid) setLid(true); $('q-skel').textContent = S.skeleton ? 'Dial' : 'Skeleton'; drawNow = true; haptic(); if (S.skeleton) { unlock('skeleton'); toast('Skeleton view. Every gear is real, in the sense that it is drawn.'); } save(); };
  $('q-hyp').onclick = startHypno;
  $('q-sync').onclick = () => { W.wt = Date.now(); drawNow = true; dialKey = ''; updateDial(); toast('Synchronised with reality. Reality did not reciprocate.'); haptic(); updateStatus(); };
  function repeater() {
    const d = dispDate(); const dur = Snd.repeater(d.getHours(), d.getMinutes()); unlock('repeater'); haptic('med');
    const q = Math.floor(d.getMinutes() / 15), mm = d.getMinutes() % 15, hh = d.getHours() % 12 || 12;
    toast('🔔 Minute repeater: ' + hh + ' low, ' + q + ' ding-dong' + (q === 1 ? '' : 's') + ', ' + mm + ' high. It may repeat minutes you have already had.', '', Math.max(4000, dur * 1000));
  }

  /* ---------- hypnosis ---------- */
  let hyp = null;
  function startHypno() {
    if (S.mode !== 'analog') setMode('analog'); if (!S.lid) setLid(true);
    $('hypno').hidden = false; document.body.classList.add('hypnotised'); let i = 0; $('hypno-text').textContent = D.hypno[0];
    say('You are getting very sleepy, Nick.');
    hyp = { t0: performance.now(), iv: setInterval(() => { i = (i + 1) % D.hypno.length; $('hypno-text').textContent = D.hypno[i]; if (S.voice && i % 2 === 0) Voice.say(D.hypno[i].replace(/…/g, '.'), { rate: 0.75, pitch: 0.8 }); }, 3200), ach: setTimeout(() => unlock('hypno'), 10000) };
    stage.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
  }
  function stopHypno() { if (!hyp) return; clearInterval(hyp.iv); clearTimeout(hyp.ach); hyp = null; $('hypno').hidden = true; document.body.classList.remove('hypnotised'); toast('You are awake. You will remember nothing, except to wind the watch.'); }
  $('hypno').onclick = stopHypno;

  /* ---------- modal ---------- */
  let modalCleanup = null, lastFocus = null;
  function modal(title, html, cleanup) { closeModal(); lastFocus = document.activeElement; $('modal-title').textContent = title; $('modal-body').innerHTML = html; $('modal').hidden = false; modalCleanup = cleanup || null; $('modal-x').focus(); }
  function closeModal() { if ($('modal').hidden) return; $('modal').hidden = true; if (modalCleanup) modalCleanup(); modalCleanup = null; if (lastFocus) lastFocus.focus(); }
  $('modal-x').onclick = closeModal; $('modal').addEventListener('click', e => { if (e.target === $('modal')) closeModal(); });
  addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); stopHypno(); } });

  function showRecalls() { modal('Recall Notices', D.recalls.map(r => '<p class="notice"><b>RECALL · ' + r[0] + '</b><br>' + r[1] + '</p>').join('') + '<p class="fine">To return a product, hold it upright and think about CINCO. Nothing ships. Nothing is refunded. Gerald has already decided.</p>'); unlock('recall'); }
  function showWarranty() {
    modal('Warranty Card', '<div class="warranty"><h4>CINCO LIMITED LIFETIME WARRANTY</h4><p>Registered to: <b>Nick</b>.<br>Lifetime of this warranty: <b>4 seconds</b>, beginning on activation. It has been activated.</p><p><b>Covers:</b> the past; any Tuesday detected before purchase; the lid, when closed.</p><p><b>Does not cover:</b> time; extra time; time belonging to others; winding; not winding; the moon; Fridays made by decree; water, including Decaf Water; Gerald.</p><p>Claims may be lodged with the CINCO hotline, where you will be placed behind yourself.</p><span class="stamp">EXPIRED · ' + new Date().toLocaleDateString('en-GB') + '</span></div>');
  }
  $('b-warranty').onclick = showWarranty; $('b-warranty2').onclick = showWarranty; $('b-recalls').onclick = showRecalls; $('recall-btn').onclick = showRecalls;
  $('ticker').textContent = D.recalls.map(r => '⚠ RECALL · ' + r[0] + ' — ' + r[1]).join('     ');
  document.querySelector('.ticker').onclick = showRecalls;
  $('b-engraving').onclick = () => { if (!S.lid) setLid(true); modal('Inside the lid', '<p style="font-family:Vibes;font-size:30px;line-height:1.2;color:#f0d48e">For Nick,<br>Time, Now With More Time.<br>If found, it is still Nick’s.<br>Hand-wound by Gerald, who has already decided.</p><p class="fine">CINCO CORPORATION · WARRANTY VOID IF OPENED (YOU HAVE OPENED IT)</p>'); };
  $('b-manual').onclick = () => modal('Owner’s Manual (abridged by Gerald)', '<ol><li><b>Tap the crown</b> to open or close the lid.</li><li><b>Drag the crown sideways</b> to wind. Watch the power-reserve gauge at twelve o’clock rise.</li><li><b>Long-press the crown</b> to pull it out. The seconds stop (hacking). Drag to set the time. Tap to push it in.</li><li>If you do not wind it, it slows down, stops, and the seconds hand gives up entirely.</li><li><b>Tilt your phone</b> (enable in Settings) or flick the watch to swing it on its chain.</li><li>Tap the CINCO logo enough times and something happens. The number is in the name.</li><li>Keyboard: crown focused, Enter = lid, arrows = wind/set, S = pull. R = repeater, D = digital, H = hypnosis.</li></ol><p class="fine">Do not submerge in Decaf Water.</p>');

  /* ---------- infomercial ---------- */
  $('b-info').onclick = () => {
    const slides = D.info.map((s, i) => {
      let inner = '';
      if (s[0] === 'big') inner = '<div class="big">' + s[1] + '</div>';
      else if (s[0] === 'emoji') inner = '<div class="emoji">' + s[1] + '</div><div class="big" style="font-size:22px">' + s[2] + '</div>';
      else if (s[0] === 'burst') inner = '<div style="text-decoration:line-through;color:#ffcf9a;font-size:18px">' + s[1] + '</div><div class="burst">' + s[2] + '</div>';
      else if (s[0] === 'small') inner = '<div style="font-size:15px;color:#ffcf9a">' + s[1] + '</div>';
      else inner = '<div class="big" style="font-size:22px">' + s[1] + '</div><p><button class="pri" id="info-buy" style="font-size:20px;padding:10px 22px;border-radius:12px;border:0">BUY NOW</button></p><p id="info-buy-msg" style="color:#ffcf9a;min-height:1.4em"></p>';
      return '<div class="slide' + (i ? '' : ' on') + '">' + inner + '</div>';
    }).join('');
    modal('CINCO Presents: An Infomercial', '<div class="info" id="info">' + slides + '</div><div class="info-bar"><i id="info-bar"></i></div><p class="fine">Nothing is for sale. Buy Now does not complete. No card is charged.</p>', () => { clearInterval(iv); if ('speechSynthesis' in window) speechSynthesis.cancel(); });
    const els = Array.from(document.querySelectorAll('#info .slide')); let i = 0;
    const speak = () => { const s = D.info[i]; say((s[2] && s[0] !== 'burst' ? s[2] : s[1]).replace(/\*/g, '')); };
    speak(); Snd.chime();
    const iv = setInterval(() => {
      if (i >= els.length - 1) { clearInterval(iv); return; }
      els[i].classList.remove('on'); i++; els[i].classList.add('on'); speak(); $('info-bar').style.transform = 'scaleX(' + (i / (els.length - 1)) + ')';
      if (i === els.length - 1) { unlock('info'); $('info-buy').onclick = () => { Snd.sad(); haptic('heavy'); $('info-buy-msg').textContent = pick(['Gerald declines the card.', 'Gerald declined a card you did not even provide, which he found suspicious.', 'Gerald has already decided.', 'Purchase declined. Nothing is for sale. This is the best deal yet.']); }; }
    }, reduced() ? 4200 : 3200);
  };

  /* ---------- services ---------- */
  const SVC = [
    ['snooze', 'Snooze Reality', 'Press once and reality pauses for nine minutes. The watch stops. Your obligations stay exactly where they are.', [['Snooze reality (9 min)', snoozeReality]]],
    ['dst', 'Daylight Saving Every Day', 'Why wait for the clocks to change twice a year? Save an hour of daylight every single day, cumulatively.', [['toggle', () => { S.dst = !S.dst; if (S.dst) { S.dstSince = Date.now(); unlock('dst'); } dialKey = ''; updateDial(); save(); return S.dst ? 'Daylight saved so far: ' + dstOffset() / 3600e3 + ' h. Daylight is held in escrow by Gerald.' : 'Daylight returned to the sky. The sky did not want it back.'; }, () => S.dst]]],
    ['excuse', 'Late Excuse Generator', 'Professional-grade excuses, CINCO-certified and pre-declined by Gerald.', [['Generate an excuse', () => { S.excuses++; if (S.excuses >= 5) unlock('excuse'); save(); const e = [pick(D.excuse.a), pick(D.excuse.b), pick(D.excuse.c) + ',', pick(D.excuse.d)].join(' '); lastExcuse = e; say(e); return e; }], ['Copy', () => { if (!lastExcuse) return 'Generate one first, Sir. Even excuses need a reason.'; if (navigator.clipboard) navigator.clipboard.writeText(lastExcuse).catch(() => { }); return 'Copied. Deliver with confidence and a slight wince.'; }]]],
    ['friday', 'Make It Friday', 'Declares it Friday. The day window agrees. Monday has been informed and is upset.', [['toggle', () => { S.friday = !S.friday; dialKey = ''; updateDial(true); save(); if (S.friday) { unlock('friday'); Snd.fanfare(); haptic('heavy'); say('It is now Friday, Sir. Monday has been informed and is upset.'); return 'It is Friday. Officially. By decree. No paperwork was filed.'; } return 'It is no longer Friday. It was lovely while it lasted.'; }, () => S.friday]]],
    ['gst', 'Gerald Standard Time', 'Run the watch on GST: UTC+5:55, give or take Gerald. The 24-hour subdial at nine always shows GST.', [['toggle', () => { S.gst = !S.gst; dialKey = ''; updateDial(true); save(); if (S.gst) { unlock('gst'); return 'Now on Gerald Standard Time: ' + fmtTime(gstDate()) + '. Gerald is at lunch in this zone, and in all others.'; } return 'Back on local time. Gerald did not notice you leave.'; }, () => S.gst]]],
    ['sarcasm', 'Sarcastic Hour Announcements', 'Every hour on the hour, the watch announces the time with all the warmth of a Victorian butler. Voice is British, when the device has one.', [['toggle', () => { S.sarcasm = !S.sarcasm; save(); renderSettings(); return S.sarcasm ? 'Hourly sarcasm enabled. Brace, Sir.' : 'Sarcasm disabled. The watch is sulking, sincerely.'; }, () => S.sarcasm], ['Announce now', () => announce(true)]]],
    ['topup', 'Extra Time Top-Up', 'Adds five complimentary minutes to the watch. They belonged to someone, on a Tuesday.', [['Add 5 minutes', () => { W.wt += 300000; drawNow = true; haptic(); return 'Five minutes added. The watch is now ' + Math.round((W.wt - Date.now()) / 60000) + ' min fast. Please return any time that is not yours.'; }]]],
    ['refund', 'Wasted Time Refund', 'Lodge a claim for time wasted today. CINCO processes all refunds instantly, to the nearest zero.', [['Claim refund', () => { const n = Math.floor(Math.random() * 300) + 15; return 'Claim for ' + n + ' minutes received. Refund of 00:00:00 processed. Thank you for choosing CINCO.'; }]]]
  ];
  let lastExcuse = '';
  function renderServices() {
    $('services').innerHTML = SVC.map(([id, name, desc, btns]) => '<div class="svc" id="svc-' + id + '"><h3>' + name + '</h3><p>' + desc + '</p>' + btns.map((b, i) => '<button data-i="' + i + '"' + (b[0] === 'toggle' ? ' role="switch" aria-checked="' + !!b[2]() + '" class="' + (b[2]() ? 'on' : '') + '"' : '') + '>' + (b[0] === 'toggle' ? (b[2]() ? 'On' : 'Off') : b[0]) + '</button> ').join('') + '<output></output></div>').join('');
    SVC.forEach(([id, , , btns]) => { const box = $('svc-' + id); box.querySelectorAll('button').forEach(b => b.onclick = () => { Snd.ensure(); const def = btns[+b.dataset.i]; const r = def[1](); if (def[0] === 'toggle') { const on = def[2](); b.textContent = on ? 'On' : 'Off'; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); } if (r) box.querySelector('output').textContent = r; }); });
  }
  function snoozeReality() {
    W.snoozeUntil = Date.now() + 9 * 60000; $('snooze').hidden = false; unlock('snooze'); haptic('heavy'); say('Reality snoozed, Sir. It will resume in nine minutes. It has been notified.');
    return 'Reality snoozed.';
  }
  function endSnooze(early) { if (!W.snoozeUntil) return; W.snoozeUntil = 0; $('snooze').hidden = true; toast(early ? 'Reality resumed early. It seemed relieved.' : 'Reality has resumed. Nothing was done in your absence.'); updateStatus(); }
  $('snooze-wake').onclick = () => endSnooze(true);
  function announce(manual) {
    const d = dispDate(), h = d.getHours() % 12, m = d.getMinutes();
    const words = D.hourWords[h] + (m === 0 ? ' o’clock' : m < 10 ? ' oh ' + m : ' ' + m);
    const line = pick(D.sarcasm).replace('{t}', manual ? words : D.hourWords[h] + ' o’clock');
    toast('🎩 ' + line, '', 6000); if (S.voice || manual) Voice.say(line);
    return line;
  }

  /* ---------- stopwatch / timer / alarms ---------- */
  const SW = { run: false, t0: 0, acc: 0, laps: [] };
  const swEl = () => SW.acc + (SW.run ? performance.now() - SW.t0 : 0);
  const fmtSw = ms => pad(Math.floor(ms / 60000)) + ':' + pad(Math.floor(ms / 1000) % 60) + '.' + pad(Math.floor(ms / 10) % 100);
  $('sw-start').onclick = () => { Snd.ensure(); SW.run = !SW.run; if (SW.run) SW.t0 = performance.now(); else SW.acc += performance.now() - SW.t0; $('sw-start').textContent = SW.run ? 'Stop' : 'Start'; Snd.tick(true, 1.5); haptic(); };
  $('sw-lap').onclick = () => { if (!SW.run) return; SW.laps.unshift(swEl()); $('laps').innerHTML = SW.laps.map((l, i) => '<li><span>Lap ' + (SW.laps.length - i) + '</span><span>' + fmtSw(l) + '</span></li>').join(''); if (SW.laps.length >= 3) unlock('laps'); haptic(); };
  $('sw-reset').onclick = () => { SW.run = false; SW.acc = 0; SW.laps = []; $('laps').innerHTML = ''; $('sw-start').textContent = 'Start'; $('sw-read').textContent = '00:00.00'; };
  const TM = { set: 300, end: 0, left: 300 };
  const fmtTm = s => pad(Math.floor(s / 60)) + ':' + pad(Math.floor(s % 60));
  document.querySelectorAll('[data-tm]').forEach(b => b.onclick = () => { if (TM.end) return; TM.set = Math.max(10, Math.min(5940, TM.set + +b.dataset.tm)); TM.left = TM.set; $('tm-read').textContent = fmtTm(TM.left); });
  $('tm-start').onclick = () => { Snd.ensure(); if (TM.end) { TM.left = Math.max(0, (TM.end - Date.now()) / 1000); TM.end = 0; $('tm-start').textContent = 'Start'; } else { TM.end = Date.now() + TM.left * 1000; $('tm-start').textContent = 'Pause'; } };
  $('tm-reset').onclick = () => { TM.end = 0; TM.left = TM.set; $('tm-read').textContent = fmtTm(TM.left); $('tm-start').textContent = 'Start'; };
  function renderAlarms() {
    $('alarms').innerHTML = S.alarms.length ? S.alarms.map((a, i) => '<li><span>' + a.t + ' · ' + (a.label || 'Alarm').replace(/[<>&]/g, '') + '</span><span><button data-tg="' + i + '">' + (a.on ? 'On' : 'Off') + '</button> <button data-rm="' + i + '" aria-label="Delete alarm">✕</button></span></li>').join('') : '<li><span>No alarms. Nothing will wake you. Enjoy that.</span></li>';
    $('alarms').querySelectorAll('[data-tg]').forEach(b => b.onclick = () => { const a = S.alarms[+b.dataset.tg]; a.on = !a.on; save(); renderAlarms(); });
    $('alarms').querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { S.alarms.splice(+b.dataset.rm, 1); save(); renderAlarms(); });
  }
  $('al-add').onclick = () => { const t = $('al-time').value; if (!t) return; S.alarms.push({ t, label: $('al-label').value.slice(0, 40), on: true }); $('al-label').value = ''; save(); renderAlarms(); toast('Alarm set for ' + t + '. CINCO will do its best, which is documented.'); };
  let ringIv = 0;
  function ring(text) {
    $('ring-text').textContent = text; $('ring').hidden = false; unlock('alarm'); clearInterval(ringIv);
    const go = () => { Snd.alarm(); haptic('heavy'); }; go(); ringIv = setInterval(go, 1400); say(text + ', Sir. Do get up.');
  }
  function stopRing() { clearInterval(ringIv); $('ring').hidden = true; }
  $('ring-stop').onclick = stopRing; $('ring-snooze').onclick = () => { stopRing(); snoozeReality(); };
  let lastAlarmMin = '';
  function checkAlarms() {
    const d = new Date(), k = pad(d.getHours()) + ':' + pad(d.getMinutes());
    if (k !== lastAlarmMin) { lastAlarmMin = k; S.alarms.forEach(a => { if (a.on && a.t === k) ring('⏰ ' + (a.label || 'ALARM')); }); }
    if (TM.end && Date.now() >= TM.end) { TM.end = 0; TM.left = TM.set; $('tm-start').textContent = 'Start'; ring('⏳ TIMER DONE'); }
  }

  /* ---------- world ---------- */
  function renderWorld() {
    if ($('p-world').hidden) return;
    const now = Date.now();
    $('world').innerHTML = D.world.map(([name, tz]) => {
      let t, sub;
      if (tz === 'GST') { const g = gstDate(now); t = fmtTime(g); sub = 'UTC+5:55 · give or take Gerald'; }
      else if (tz === 'LUNCH') { const days = Math.floor((now - Date.UTC(2019, 2, 5)) / 864e5); t = S.h24 ? '12:47' : '12:47 PM'; sub = 'Day ' + days.toLocaleString('en-GB') + ' of lunch · going well'; }
      else {
        try { t = new Intl.DateTimeFormat('en-GB', { timeZone: tz || undefined, hour: 'numeric', minute: '2-digit', hour12: !S.h24 }).format(now); sub = new Intl.DateTimeFormat('en-GB', { timeZone: tz || undefined, weekday: 'long' }).format(now); } catch (e) { t = '—'; sub = ''; }
        if (!tz) sub += ' · your watch says ' + fmtTime(dispDate());
      }
      return '<li><span><b>' + name + '</b><small>' + sub + '</small></span><span class="wt">' + t + '</span></li>';
    }).join('');
  }

  /* ---------- hotline ---------- */
  const H = { q: 0, qIv: 0, lineIv: 0 };
  const KEYS = [['1', ''], ['2', 'ABC'], ['3', 'DEF'], ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'], ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'], ['*', ''], ['0', 'GERALD'], ['#', '']];
  $('keypad').innerHTML = KEYS.map(k => '<button data-k="' + k[0] + '">' + k[0] + '<small>' + (k[1] || '&nbsp;') + '</small></button>').join('');
  const viz = $('viz'); viz.innerHTML = '<i></i>'.repeat(10); const bars = Array.from(viz.children);
  $('keypad').querySelectorAll('button').forEach(b => b.onclick = () => {
    const k = b.dataset.k, m = D.menu[k]; Snd.dtmf(k); haptic();
    $('ph-line1').textContent = 'OPTION ' + k + ': ' + m[0]; $('ph-line2').textContent = m[1]; say(m[1]);
    if (k === '0') setTimeout(holdStart, 1800);
  });
  function holdStart() {
    if (H.qIv) return; Snd.holdStart(); H.q = 0;
    $('ph-line1').textContent = 'ON HOLD · QUEUE POSITION ' + D.queue[0]; $('ph-line2').textContent = 'PLEASE ENJOY THIS ORIGINAL WALTZ';
    H.qIv = setInterval(() => { H.q = Math.min(D.queue.length - 1, H.q + 1); $('ph-line1').textContent = 'ON HOLD · QUEUE POSITION ' + D.queue[H.q]; if (D.queue[H.q] === '∞') unlock('hotline'); }, 5000);
    let li = 0; H.lineIv = setInterval(() => { li = (li + 1) % D.hold.length; $('hold-line').textContent = D.hold[li]; }, 6500);
    $('ph-hold').textContent = 'On hold…';
  }
  function holdStop() { Snd.holdStop(); clearInterval(H.qIv); clearInterval(H.lineIv); H.qIv = 0; $('ph-line1').textContent = 'CALL ENDED'; $('ph-line2').textContent = 'GERALD WAS ABOUT TO ANSWER. PROBABLY.'; $('ph-hold').textContent = 'Hold for an operator'; bars.forEach(b => b.style.transform = 'scaleY(.1)'); }
  $('ph-hold').onclick = () => { Snd.ensure(); holdStart(); }; $('ph-hang').onclick = holdStop;

  /* ---------- awards ---------- */
  function renderAch() {
    const n = Object.keys(S.ach).length; $('ach-count').textContent = '(' + n + '/' + D.ach.length + ')';
    $('ach').innerHTML = D.ach.map(a => '<li class="' + (S.ach[a[0]] ? 'got' : '') + '"><i>' + a[1] + '</i><span><b>' + a[2] + '</b><small>' + a[3] + '</small></span></li>').join('');
  }

  /* ---------- settings ---------- */
  const SET = [
    ['secStyle', 'Seconds hand', 'Smooth sweep or a proper tick', 'sel', [['sweep', 'Sweep (8 steps/s)'], ['tick', 'Tick (1/s)']]],
    ['reserveMode', 'Power reserve', 'How long a full wind lasts', 'sel', [['gerald', '2 min (Gerald mode)'], ['cinco', '12 min (CINCO mode)'], ['real', '40 h (realistic)']]],
    ['tickSound', 'Ticking sound', 'Tick-tock, synthesised', 'chk'],
    ['volume', 'Volume', '', 'rng'],
    ['chime', 'Hourly chime', 'Strikes the hour on a bell', 'chk'],
    ['sarcasm', 'Sarcastic hour announcements', 'Butler-grade disdain, hourly', 'chk'],
    ['voice', 'British butler voice', 'Speaks announcements in an en-GB voice', 'chk'],
    ['haptics', 'Haptics', 'Vibration, or the iOS switch tick', 'chk'],
    ['motion', 'Motion', 'Reduced motion stops swinging and sweeping', 'sel', [['auto', 'Follow system'], ['reduce', 'Reduced'], ['full', 'Full']]],
    ['h24', '24-hour time', 'For digital mode and lists', 'chk']
  ];
  function renderSettings() {
    $('settings').innerHTML = SET.map(([k, label, sub, type, opts]) => '<label class="set"><span>' + label + (sub ? '<small>' + sub + '</small>' : '') + '</span>' + (type === 'chk' ? '<input type="checkbox" data-k="' + k + '"' + (S[k] ? ' checked' : '') + '>' : type === 'rng' ? '<input type="range" min="0" max="1" step="0.05" data-k="' + k + '" value="' + S[k] + '">' : '<select data-k="' + k + '">' + opts.map(o => '<option value="' + o[0] + '"' + (S[k] === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>') + '</label>').join('');
    $('settings').querySelectorAll('[data-k]').forEach(el => el.onchange = el.oninput = () => {
      const k = el.dataset.k; S[k] = el.type === 'checkbox' ? el.checked : el.type === 'range' ? +el.value : el.value;
      if (k === 'volume') Snd.setVolume(S.volume); if (k === 'motion') applyMotion(); if (k === 'h24') digKey = '';
      if (k === 'voice' && S.voice) Voice.say('Very good, Sir. I shall speak when spoken about.');
      save();
    });
  }
  $('b-tilt').onclick = () => enableTilt(true);
  $('b-reset-ach').onclick = () => { S.ach = {}; save(); renderAch(); toast('Achievements reset. Gerald has struck them from the record.'); };
  $('b-reset-all').onclick = () => { if (!confirm('Factory reset the watch, Sir? Settings and achievements will be lost.')) return; localStorage.removeItem(LS); location.reload(); };
  let deferredPrompt = null;
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; });
  $('b-install').onclick = () => {
    if (deferredPrompt) { deferredPrompt.prompt(); deferredPrompt = null; }
    else if (matchMedia('(display-mode: standalone)').matches || navigator.standalone) toast('Already installed, Sir. It is in your pocket, digitally.');
    else toast('On iPhone: tap Share, then “Add to Home Screen”. On desktop Chrome: the install icon in the address bar.', '', 6000);
  };
  if ('serviceWorker' in navigator && !qs.has('nosw') && location.protocol !== 'file:') addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { }));

  /* ---------- tabs ---------- */
  document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => {
    document.querySelectorAll('.tabs button').forEach(x => x.setAttribute('aria-selected', x === b));
    document.querySelectorAll('.panel').forEach(p => p.hidden = p.id !== 'p-' + b.dataset.tab);
    if (b.dataset.tab === 'world') renderWorld(); if (b.dataset.tab === 'watch') updateReadout();
  });

  addEventListener('keydown', e => {
    if (e.target.matches('input,select,textarea') || e.metaKey || e.ctrlKey) return;
    const k = e.key.toLowerCase();
    if (k === 'r') repeater(); else if (k === 'd') setMode(S.mode === 'digital' ? 'analog' : 'digital'); else if (k === 'h') (hyp ? stopHypno() : startHypno());
  });

  /* ---------- the one animation loop ---------- */
  let last = performance.now(), secTimer = 0, saveTimer = 0, specX = 0, specY = 0, lastSpec = '';
  function loop(now) {
    requestAnimationFrame(loop);
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.25) { catchUp(dt); dt = 0.016; drawNow = true; }
    if (W.snoozeUntil) { if (Date.now() >= W.snoozeUntil) endSnooze(false); else { const left = (W.snoozeUntil - Date.now()) / 1000; $('snooze-text').textContent = 'Reality snoozed. Resuming in ' + Math.floor(left / 60) + ':' + pad(Math.floor(left % 60)) + '. Reality has been notified.'; } }
    // power + rate
    let rate = 0;
    if (!W.dead && !W.snoozeUntil) {
      rate = W.reserve > 0.12 ? 1 : Math.pow(W.reserve / 0.12, 1.4);
      W.reserve -= dt / resDur();
      if (W.reserve <= 0) die(false);
    }
    W.rate = rate;
    if (!W.pulled) W.wt += dt * 1000 * rate;
    // balance + escapement
    const amp = W.pulled ? 0 : (rate > 0 ? (0.6 + 0.4 * rate) * 3.6 : 0);
    W.amp = W.amp == null ? amp : W.amp + (amp - W.amp) * Math.min(1, dt * 3);
    if (rate > 0 && !W.pulled) W.phase += dt * TAU * 2.5 * Math.max(.25, rate);
    const beats = Math.floor(W.phase / Math.PI), frac = (W.phase / Math.PI) % 1;
    // droop when dead
    const d = dispDate();
    let s = d.getSeconds() + d.getMilliseconds() / 1000;
    if (S.secStyle === 'tick' || reduced()) s = Math.floor(s); else s = Math.floor(s * 8) / 8;
    const secAng = s / 60 * TAU;
    let target = 0;
    if (W.dead) { let down = Math.PI - (secAng % TAU); if (down > Math.PI) down -= TAU; if (down < -Math.PI) down += TAU; target = down; }
    if (reduced()) { W.droop = target; W.droopV = 0; } else { W.droopV += ((target - W.droop) * 40 - W.droopV * 4) * dt; W.droop += W.droopV * dt; }
    // ticking and chimes
    const sInt = Math.floor(d.getTime() / 1000);
    if (sInt !== W.lastSecInt) {
      if (W.lastSecInt !== -1 && rate > 0 && !W.pulled && S.tickSound) { W.tickAlt = !W.tickAlt; Snd.tick(W.tickAlt, (S.mode === 'analog' && !S.lid ? 0.35 : 1) * Math.max(.3, rate)); }
      W.lastSecInt = sInt;
      const hr = d.getHours();
      if (W.lastHour !== -1 && hr !== W.lastHour && rate > 0 && !W.pulled && d.getMinutes() === 0) { if (S.chime) Snd.strike(hr % 12 || 12); if (S.sarcasm) setTimeout(() => announce(false), 1200); }
      W.lastHour = hr;
    }
    // once a second: UI
    secTimer += dt;
    if (secTimer > 0.5) { secTimer = 0; updateStatus(); updateDial(); checkAlarms(); updateReadout(); renderWorld(); if (Math.abs(P.a) > 8) unlock('tilt'); }
    saveTimer += dt; if (saveTimer > 5) { saveTimer = 0; save(); }
    // pendulum
    if (reduced()) P.a = 0;
    else if (hyp) P.a = 26 * Math.sin((now - hyp.t0) / 1000 * TAU / 2.6);
    else { P.v += (-(P.a - P.target) * 26 - P.v * 1.6) * dt; P.a += P.v * dt; }
    const tf = 'rotate(' + P.a.toFixed(2) + 'deg)';
    if (tf !== P.lastT) { pend.style.transform = tf; P.lastT = tf; }
    specX += (P.sx - specX) * Math.min(1, dt * 6); specY += (P.sy - specY) * Math.min(1, dt * 6);
    const st = 'translate3d(' + (specX - P.a * 1.5).toFixed(1) + 'px,' + specY.toFixed(1) + 'px,0)';
    if (st !== lastSpec) { spec.style.transform = st; lastSpec = st; }
    // stopwatch/timer readouts
    const sw = swEl();
    if (SW.run && !$('p-timers').hidden) $('sw-read').textContent = fmtSw(sw);
    if (TM.end && !$('p-timers').hidden) $('tm-read').textContent = fmtTm(Math.max(0, Math.ceil((TM.end - Date.now()) / 1000)));
    // hold-music visualiser
    if (Snd.holding && !$('p-hotline').hidden) { const lv = Snd.levels(); if (lv) bars.forEach((b, i) => { b.style.transform = 'scaleY(' + Math.max(.08, lv[i + 2] / 255).toFixed(2) + ')'; }); }
    // draw
    if (S.mode === 'digital') { updateDigital(false); return; }
    if (!(S.lid || now < lidAnimUntil || drawNow)) return;
    drawNow = false;
    const m = d.getMinutes() + s / 60, h = (d.getHours() % 12) + m / 60, g = gstDate(dispMs());
    const escStep = TAU / 30, snap = Math.min(1, frac * 6);
    Render.frame({
      hAng: h / 12 * TAU, mAng: m / 60 * TAU, secAng: secAng + W.droop,
      gst24: g.getHours() + g.getMinutes() / 60, chMin: (sw / 60000) % 30, chAng: (sw / 1000 % 60) / 60 * TAU, chOn: sw > 0,
      reserve: Math.max(0, W.reserve), bal: W.amp * Math.sin(W.phase), esc: (beats + snap) * escStep, fork: 0.16 * Math.max(-1, Math.min(1, Math.sin(W.phase) * 3)),
      barrel: -W.reserve * TAU * 3 + W.wt / 3600e3 * 0.5, sAng: s / 60 * TAU, skeleton: S.skeleton
    });
  }

  /* ---------- boot ---------- */
  function greet() { const h = new Date().getHours(); $('greet').textContent = (h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening') + ', Nick. Time, Now With More Time.'; }
  applyMotion(); greet(); renderFinishes(); renderServices(); renderAch(); renderSettings(); renderAlarms();
  Render.setFinish(S.finish);
  layout();
  setLid(S.lid, true); setMode(S.mode, true);
  $('q-skel').textContent = S.skeleton ? 'Dial' : 'Skeleton';
  addEventListener('resize', () => { clearTimeout(layout.t); layout.t = setTimeout(layout, 120); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  addEventListener('pagehide', save);
  addEventListener('pointerdown', () => Snd.ensure(), { once: true, capture: true });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { Render.rebuild(); dialKey = ''; updateDial(true); drawNow = true; });
  Promise.all(['700 20px Cinzel', '20px Vibes'].map(f => document.fonts ? document.fonts.load(f) : 0)).then(() => { Render.rebuild(); dialKey = ''; updateDial(true); drawNow = true; }).catch(() => { });
  if (!saved) setTimeout(() => toast('<b>Welcome, Sir.</b> Your CINCO watch arrived 85% wound. The other 15% was used in testing.', '', 6000), 600);
  if (qs.has('hypno')) startHypno();
  requestAnimationFrame(loop);
  window.CINCO = { S, W, setMode, setLid, startHypno, showRecalls, toast, modal };
})();
