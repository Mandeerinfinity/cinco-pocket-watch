'use strict';
/* All sound is synthesised live with Web Audio. No files, no samples. */
const Snd = (() => {
  let ctx = null, master = null, analyser = null, tickBuf = null, tockBuf = null, holdTimer = 0, holdStep = 0, holdNext = 0;
  let volume = 0.7;
  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = volume;
      analyser = ctx.createAnalyser(); analyser.fftSize = 64;
      master.connect(analyser); analyser.connect(ctx.destination);
      tickBuf = click(3400, 0.012); tockBuf = click(2300, 0.014);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function click(freq, dur) {
    const n = Math.floor(ctx.sampleRate * dur), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) { const e = Math.exp(-i / (n * 0.18)); d[i] = (Math.random() * 2 - 1) * e * 0.5 + Math.sin(i / ctx.sampleRate * freq * 6.283) * e * 0.6; }
    return b;
  }
  function tick(tock, gain) {
    if (!ctx || ctx.state !== 'running') return;
    const s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = tock ? tockBuf : tickBuf; g.gain.value = 0.35 * (gain == null ? 1 : gain);
    s.connect(g); g.connect(master); s.start();
  }
  function bell(freq, when, dur, gain) {
    if (!ensure()) return;
    const t = when || ctx.currentTime, partials = [[1, 1], [2.0, .5], [2.76, .35], [5.4, .18], [8.93, .08]];
    const out = ctx.createGain(); out.gain.value = gain || 0.28; out.connect(master);
    partials.forEach(([m, a]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = freq * m; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(a, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 2.2) / (1 + m * 0.25));
      o.connect(g); g.connect(out); o.start(t); o.stop(t + (dur || 2.2) + 0.1);
    });
  }
  function tone(freq, when, dur, type, gain) {
    if (!ensure()) return;
    const t = when || ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain || 0.15, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  // Minute repeater: hours (low), quarters (high-low), minutes (high). Returns duration in seconds.
  function repeater(h, m) {
    if (!ensure()) return 0;
    let t = ctx.currentTime + 0.1; const hh = h % 12 || 12, q = Math.floor(m / 15), mm = m % 15;
    for (let i = 0; i < hh; i++) { bell(392, t, 1.6); t += 0.42; }
    t += 0.5;
    for (let i = 0; i < q; i++) { bell(784, t, 1.2); bell(392, t + 0.18, 1.2); t += 0.55; }
    t += 0.5;
    for (let i = 0; i < mm; i++) { bell(784, t, 1.2); t += 0.32; }
    return t - ctx.currentTime;
  }
  function strike(n) { if (!ensure()) return; let t = ctx.currentTime + 0.05; for (let i = 0; i < n; i++) { bell(330, t, 2.4, 0.3); t += 0.9; } }
  function chime() { if (!ensure()) return; const t = ctx.currentTime; [659, 523, 587, 392].forEach((f, i) => bell(f, t + i * 0.45, 1.8)); }
  function alarm() { if (!ensure()) return; const t = ctx.currentTime; for (let i = 0; i < 8; i++) tone(i % 2 ? 1320 : 1760, t + i * 0.12, 0.1, 'square', 0.08); }
  function lid() { if (!ensure()) return; const t = ctx.currentTime; tick(true, 1.5); tone(1200, t + 0.03, 0.08, 'triangle', 0.08); }
  function ratchet() { if (!ensure()) return; tick(false, 1.6); }
  function dtmf(key) {
    if (!ensure()) return;
    const rows = { '1': 0, '2': 0, '3': 0, '4': 1, '5': 1, '6': 1, '7': 2, '8': 2, '9': 2, '*': 3, '0': 3, '#': 3 };
    const cols = { '1': 0, '4': 0, '7': 0, '*': 0, '2': 1, '5': 1, '8': 1, '0': 1, '3': 2, '6': 2, '9': 2, '#': 2 };
    const t = ctx.currentTime;
    tone([697, 770, 852, 941][rows[key]], t, 0.18, 'sine', 0.12); tone([1209, 1336, 1477][cols[key]], t, 0.18, 'sine', 0.12);
  }
  function sad() { if (!ensure()) return; const t = ctx.currentTime; [392, 370, 349, 262].forEach((f, i) => tone(f, t + i * 0.32, i === 3 ? 0.9 : 0.3, 'triangle', 0.12)); }
  function fanfare() { if (!ensure()) return; const t = ctx.currentTime; [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.09, 0.25, 'triangle', 0.1)); }
  // Original hold-music loop: a lounge waltz the watch wrote itself. 3/4, Bb-ish, slightly out of tune on purpose.
  const MEL = [70, 0, 74, 77, 0, 74, 72, 0, 69, 70, 0, 0, 67, 0, 70, 74, 0, 72, 70, 0, 69, 67, 0, 0, 65, 0, 69, 72, 0, 70, 69, 0, 67, 65, 0, 62, 63, 0, 67, 70, 0, 69, 70, 0, 0, 0, 0, 0];
  const BASS = [46, 53, 53, 43, 50, 50, 39, 46, 46, 41, 48, 48, 46, 53, 53, 43, 50, 50, 39, 46, 46, 41, 48, 48, 39, 46, 46, 43, 50, 50, 41, 48, 48, 46, 53, 53, 39, 46, 46, 41, 48, 48, 46, 53, 53, 41, 45, 48];
  const midi = n => 440 * Math.pow(2, (n - 69) / 12) * 1.006; // a touch sharp, like all hold music
  function holdStart() {
    if (!ensure() || holdTimer) return;
    holdStep = 0; holdNext = ctx.currentTime + 0.1;
    holdTimer = setInterval(() => {
      while (holdNext < ctx.currentTime + 0.25) {
        const i = holdStep % MEL.length, beat = 0.24;
        if (MEL[i]) { tone(midi(MEL[i]), holdNext, beat * 1.6, 'triangle', 0.09); tone(midi(MEL[i] + 12), holdNext, beat, 'sine', 0.025); }
        tone(midi(BASS[i] - 12), holdNext, beat * 0.9, i % 3 === 0 ? 'sine' : 'triangle', i % 3 === 0 ? 0.12 : 0.04);
        holdNext += beat; holdStep++;
      }
    }, 90);
  }
  function holdStop() { clearInterval(holdTimer); holdTimer = 0; }
  const fft = new Uint8Array(32);
  function levels() { if (!analyser) return null; analyser.getByteFrequencyData(fft); return fft; }
  function setVolume(v) { volume = v; if (master) master.gain.value = v; }
  function now() { return ctx ? ctx.currentTime : 0; }
  return { ensure, tick, bell, tone, repeater, strike, chime, alarm, lid, ratchet, dtmf, sad, fanfare, holdStart, holdStop, levels, setVolume, now, get holding() { return !!holdTimer; } };
})();

/* British voice. Uses an en-GB voice where the device has one. */
const Voice = (() => {
  let voice = null;
  function pick() {
    if (!('speechSynthesis' in window)) return;
    const vs = speechSynthesis.getVoices();
    voice = vs.find(v => /en-GB/i.test(v.lang) && /Daniel|Arthur|Oliver|George|Male|UK English Male/i.test(v.name)) || vs.find(v => /en-GB/i.test(v.lang)) || null;
  }
  if ('speechSynthesis' in window) { pick(); speechSynthesis.onvoiceschanged = pick; }
  function say(text, opts) {
    if (!('speechSynthesis' in window)) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-GB'; if (voice) u.voice = voice;
      u.rate = (opts && opts.rate) || 0.98; u.pitch = (opts && opts.pitch) || 0.9; u.volume = 0.9;
      speechSynthesis.speak(u);
    } catch (e) { /* speech is optional */ }
  }
  return { say };
})();
