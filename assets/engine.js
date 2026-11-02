// Audio dvigatel: Web Audio API. Ijro, takror, so'nish, pauza, balandlik, umumiy pasaytirish, metrlar.
window.AZEngine = (() => {
  let ctx = null, master, duck, analL, analR;
  const buffers = new Map();
  const peaksCache = new Map();
  const loading = new Map();
  const insts = new Map();
  let seq = 0;

  const dbToGain = (db) => (db <= -80 ? 0 : Math.pow(10, db / 20));
  const gainToDb = (g) => (g <= 0.0001 ? -80 : 20 * Math.log10(g));

  function init() {
    if (ctx) return ctx;
    ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    master = ctx.createGain();
    duck = ctx.createGain();
    master.connect(duck);
    duck.connect(ctx.destination);
    const split = ctx.createChannelSplitter(2);
    duck.connect(split);
    analL = ctx.createAnalyser(); analR = ctx.createAnalyser();
    analL.fftSize = analR.fftSize = 1024;
    split.connect(analL, 0); split.connect(analR, 1);
    return ctx;
  }

  async function resume() {
    init();
    if (ctx.state === 'suspended') await ctx.resume();
  }

  async function loadBuffer(fileKey) {
    init();
    if (buffers.has(fileKey)) return buffers.get(fileKey);
    if (loading.has(fileKey)) return loading.get(fileKey);
    const p = (async () => {
      const blob = await AZStore.getAudio(fileKey);
      if (!blob) throw new Error('Audio fayl topilmadi. Uni qayta qo\'shing.');
      const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
      buffers.set(fileKey, buf);
      loading.delete(fileKey);
      return buf;
    })();
    loading.set(fileKey, p);
    p.catch(() => loading.delete(fileKey));
    return p;
  }

  function peaks(fileKey, n = 800) {
    const k = fileKey + ':' + n;
    if (peaksCache.has(k)) return peaksCache.get(k);
    const buf = buffers.get(fileKey);
    if (!buf) return null;
    const ch = [];
    for (let c = 0; c < Math.min(2, buf.numberOfChannels); c++) ch.push(buf.getChannelData(c));
    const step = Math.max(1, Math.floor(buf.length / n));
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let m = 0;
      const s = i * step, e = Math.min(buf.length, s + step);
      for (let j = s; j < e; j += 4) for (const d of ch) { const v = Math.abs(d[j]); if (v > m) m = v; }
      out[i] = m;
    }
    peaksCache.set(k, out);
    return out;
  }

  function segment(cue, buf) {
    const start = Math.max(0, Math.min(cue.startTime || 0, buf.duration - 0.01));
    const end = cue.endTime > 0 ? Math.min(cue.endTime, buf.duration) : buf.duration;
    return { start, end: Math.max(start + 0.01, end), len: Math.max(0.01, end - start) };
  }

  function elapsed(inst) {
    if (inst.state === 'paused') return inst.pausedAt;
    return inst.base + (ctx.currentTime - inst.startedAt);
  }

  function position(inst) {
    // fayl ichidagi joriy nuqta (soniya)
    const e = elapsed(inst) * inst.rate;
    const p = inst.loopsActive ? e % inst.seg.len : Math.min(e, inst.seg.len);
    return inst.seg.start + p;
  }

  function startSource(inst, offsetReal) {
    const { cue, buf, seg } = inst;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = inst.rate;
    if (inst.loopsActive) { src.loop = true; src.loopStart = seg.start; src.loopEnd = seg.end; }
    src.connect(inst.gain);
    const now = ctx.currentTime + 0.005;
    const posInSeg = inst.loopsActive ? (offsetReal * inst.rate) % seg.len : Math.min(offsetReal * inst.rate, seg.len - 0.001);
    src.start(now, seg.start + posInSeg);
    inst.startedAt = now;
    inst.base = offsetReal;
    if (isFinite(inst.total)) {
      const remain = Math.max(0.01, inst.total - offsetReal);
      src.stop(now + remain);
      // yakuniy so'nish
      if (cue.fadeOut > 0 && !inst.fading) {
        const fo = Math.min(cue.fadeOut, remain);
        const g = inst.fade.gain;
        g.setValueAtTime(g.value, now + remain - fo);
        g.linearRampToValueAtTime(0, now + remain);
      }
    }
    src.onended = () => {
      if (inst.src !== src || inst.state === 'paused') return;
      finish(inst);
    };
    inst.src = src;
  }

  async function play(cue, onEnd) {
    await resume();
    const buf = await loadBuffer(cue.fileKey);
    const seg = segment(cue, buf);
    const rate = Math.max(0.25, Math.min(4, cue.rate || 1));
    const loops = cue.loops === 0 ? 0 : Math.max(1, cue.loops || 1);
    const inst = {
      id: ++seq, cueId: cue.id, cue, buf, seg, rate, loops,
      loopsActive: loops !== 1,
      total: loops === 0 ? Infinity : (seg.len * loops) / rate,
      state: 'playing', onEnd,
      gain: ctx.createGain(), fade: ctx.createGain(),
      startedAt: 0, base: 0, pausedAt: 0, fading: false
    };
    inst.gain.gain.value = dbToGain(cue.volume || 0);
    inst.gain.connect(inst.fade);
    inst.fade.connect(master);
    const now = ctx.currentTime;
    if (cue.fadeIn > 0) { inst.fade.gain.setValueAtTime(0, now); inst.fade.gain.linearRampToValueAtTime(1, now + cue.fadeIn); }
    startSource(inst, 0);
    insts.set(inst.id, inst);
    return inst;
  }

  function finish(inst) {
    if (!insts.has(inst.id)) return;
    insts.delete(inst.id);
    try { inst.fade.disconnect(); } catch (_) {}
    inst.state = 'done';
    if (inst.onEnd) inst.onEnd(inst);
  }

  function stop(inst, fadeTime = 0) {
    if (!insts.has(inst.id)) return;
    if (fadeTime > 0.02 && inst.state === 'playing') {
      fadeTo(inst, -80, fadeTime, true);
      return;
    }
    const src = inst.src;
    inst.src = null;
    try { src && src.stop(); } catch (_) {}
    finish(inst);
  }

  function fadeTo(inst, db, time, stopAfter) {
    if (!insts.has(inst.id)) return;
    const g = inst.fade.gain;
    const now = ctx.currentTime;
    const from = gainToDb(g.value);
    g.cancelScheduledValues(now);
    const n = 64, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const d = from + (db - from) * t;
      curve[i] = i === n - 1 && db <= -60 ? 0 : dbToGain(d);
    }
    const dur = Math.max(0.02, time);
    try { g.setValueCurveAtTime(curve, now, dur); } catch (_) { g.setValueAtTime(curve[n - 1], now); }
    inst.fading = true;
    if (stopAfter) {
      clearTimeout(inst.stopTimer);
      inst.stopTimer = setTimeout(() => stop(inst, 0), dur * 1000 + 30);
    }
  }

  function pause(inst) {
    if (inst.state !== 'playing') return;
    inst.pausedAt = elapsed(inst);
    inst.state = 'paused';
    const src = inst.src; inst.src = null;
    try { src.stop(); } catch (_) {}
  }

  function resumeInst(inst) {
    if (inst.state !== 'paused') return;
    inst.state = 'playing';
    startSource(inst, inst.pausedAt);
  }

  function setVolume(inst, db) {
    inst.gain.gain.setTargetAtTime(dbToGain(db), ctx.currentTime, 0.03);
  }

  function setLoop(inst, on) {
    if (inst.state === 'done') return;
    const e = elapsed(inst);
    if (on) {
      inst.loopsActive = true;
      inst.total = Infinity;
      if (inst.src) { inst.src.loop = true; inst.src.loopStart = inst.seg.start; inst.src.loopEnd = inst.seg.end; inst.src.stop(ctx.currentTime + 1e7); }
    } else {
      const pos = (e * inst.rate) % inst.seg.len;
      const remainReal = (inst.seg.len - pos) / inst.rate;
      inst.loopsActive = false;
      inst.total = e + remainReal;
      if (inst.src) {
        inst.src.loop = false;
        inst.src.stop(ctx.currentTime + remainReal);
      }
    }
  }

  function setDuck(on, db = -12) {
    init();
    duck.gain.setTargetAtTime(on ? dbToGain(db) : 1, ctx.currentTime, 0.15);
  }

  function setMaster(db) { init(); master.gain.setTargetAtTime(dbToGain(db), ctx.currentTime, 0.03); }

  const tmp = new Float32Array(1024);
  function level(an) {
    an.getFloatTimeDomainData(tmp);
    let p = 0;
    for (let i = 0; i < tmp.length; i++) { const v = Math.abs(tmp[i]); if (v > p) p = v; }
    return p;
  }
  function meters() {
    if (!ctx) return [0, 0];
    return [level(analL), level(analR)];
  }

  return {
    init, resume, loadBuffer, peaks, play, stop, fadeTo, pause, resume: resumeInst, resumeCtx: resume,
    setVolume, setLoop, setDuck, setMaster, meters, elapsed, position, dbToGain, gainToDb,
    instances: () => [...insts.values()],
    byCue: (cueId) => [...insts.values()].filter((i) => i.cueId === cueId),
    buffer: (k) => buffers.get(k),
    get ctx() { return ctx; }
  };
})();
