(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const num = (v, d = 0) => { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : d; };

  function fmt(sec, withHours) {
    if (!isFinite(sec)) return '∞';
    sec = Math.max(0, sec);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const ss = s.toFixed(2).padStart(5, '0');
    return (withHours || h ? String(h).padStart(2, '0') + ':' : '') + String(m).padStart(2, '0') + ':' + ss;
  }
  const mmss = (sec) => { sec = Math.max(0, Math.floor(sec)); return String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0'); };
  const sum = (n) => Number(n || 0).toLocaleString('ru-RU').replace(/,/g, ' ') + " so'm";

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2800);
  }

  // ---------- Turlar ----------
  const TYPES = {
    audio: { label: 'OVOZ', color: '#6EA8FF', pill: 'background:#1A2740;color:#A9C8FF' },
    fade: { label: "SO'NISH", color: '#C792FF', pill: 'background:#2A1F3D;color:#D9C2FF' },
    stop: { label: "TO'XTAT", color: '#FF8A8A', pill: 'background:#3D1E22;color:#FFB3B3' },
    group: { label: 'GURUH', color: '#8A93A3', pill: 'background:#23272F;color:#C3C8D2' },
    memo: { label: 'IZOH', color: '#5A616E', pill: 'background:#1F232B;color:#A8AEBA' }
  };
  const COLORS = ['', '#6EA8FF', '#C792FF', '#B8F25A', '#FFB547', '#FF8A8A', '#5AD8F2', '#F2E35A'];

  const PAD_ACTIONS = {
    level: { label: 'Balandlik (tanlangan ishora)', kind: 'BALANDLIK', arg: 'dB: masalan 3 yoki -3', def: '3' },
    loopOn: { label: 'Takrorni yoqish (tanlangan)', kind: 'TAKROR' },
    loopOff: { label: "Takrorni o'chirish (tanlangan)", kind: 'TAKROR' },
    fadeOut: { label: "So'ndirib to'xtatish (tanlangan)", kind: "SO'NISH", arg: 'soniya', def: '3' },
    stopSel: { label: "To'xtatish (tanlangan)", kind: "TO'XTATISH" },
    duck: { label: 'Umumiy pasaytirish (yoq/o\'chir)', kind: 'PASAYTIRISH', arg: 'dB', def: '-12' },
    playCue: { label: 'Ishorani ijro etish', kind: 'IJRO', arg: 'cue' },
    go: { label: 'BOSHLA', kind: 'BOSHLA' },
    pauseAll: { label: 'Pauza / davom', kind: 'PAUZA' },
    stopAll: { label: "Hammasini to'xtatish", kind: 'PANIC' },
    none: { label: "Bo'sh", kind: "BO'SH" }
  };
  const PAD_STYLE = {
    levelUp: ['#241B36', '#D9C2FF', '#3E2E5E'], levelDown: ['#18233A', '#A9C8FF', '#2B3F66'],
    loopOn: ['#1E2C14', '#CFF59A', '#3B5A22'], loopOff: ['#33240F', '#FFCB7A', '#5C4219'],
    fadeOut: ['#13302E', '#8EE8DE', '#24524D'], duck: ['#13302E', '#8EE8DE', '#24524D'],
    stopSel: ['#3A1C1F', '#FFA3A3', '#63303A'], stopAll: ['#3A1C1F', '#FFA3A3', '#63303A'],
    playCue: ['#1A2740', '#A9C8FF', '#2B3F66'], go: ['#1E2C14', '#CFF59A', '#3B5A22'],
    pauseAll: ['#33240F', '#FFCB7A', '#5C4219'], none: ['#101216', '#9AA1AE', '#2A2F39']
  };
  const PAD_KEYS = ['KeyQ', 'KeyW', 'KeyE', 'KeyA', 'KeyS', 'KeyD', 'KeyZ', 'KeyX', 'KeyC', 'Digit1', 'Digit2', 'Digit3'];
  const keyLabel = (c) => c.replace('Key', '').replace('Digit', '');

  function defaultPads() {
    const a = [
      ['level', '1'], ['level', '3'], ['level', '6'], ['level', '-1'], ['level', '-3'], ['level', '-6'],
      ['loopOn', ''], ['loopOff', ''], ['stopSel', ''], ['fadeOut', '3'], ['duck', '-12'], ['none', '']
    ].map(([action, arg]) => ({ action, arg, label: '' }));
    const empty = () => Array.from({ length: 12 }, () => ({ action: 'none', arg: '', label: '' }));
    return [...a, ...empty(), ...empty()];
  }

  // ---------- Holat ----------
  function newShow() {
    return { title: 'Yangi spektakl', cues: [], pads: defaultPads(), selectedId: null, standbyId: null, nextNum: 1, mode: 'edit', masterDb: 0 };
  }
  let show = AZStore.loadShow() || newShow();
  if (!show.pads || show.pads.length !== 36) show.pads = defaultPads();
  const save = () => AZStore.saveShow(show);

  let filter = 'all', search = '', tab = 'basic', page = 0;
  let clockStart = 0, paused = false, ducked = false, gen = 0;
  const runs = new Map();
  let runSeq = 0;
  const autoTimers = new Set();
  const missing = new Set();

  const byId = (id) => show.cues.find((c) => c.id === id);
  const tops = () => show.cues.filter((c) => !c.parentId);
  const kids = (g) => show.cues.filter((c) => c.parentId === g.id);
  const selected = () => byId(show.selectedId);

  function normalize() {
    const out = [];
    for (const t of tops()) { out.push(t); if (t.type === 'group') out.push(...kids(t)); }
    // ota-onasi yo'qolgan bolalar
    for (const c of show.cues) if (!out.includes(c)) { c.parentId = null; out.push(c); }
    show.cues = out;
  }

  function nextTop(cue) {
    const t = tops();
    const top = cue.parentId ? byId(cue.parentId) : cue;
    const i = t.indexOf(top);
    return i >= 0 ? t[i + 1] || null : null;
  }
  function prevTop(cue) {
    const t = tops();
    const top = cue.parentId ? byId(cue.parentId) : cue;
    const i = t.indexOf(top);
    return i > 0 ? t[i - 1] : null;
  }
  function setStandby(id) {
    const c = byId(id);
    show.standbyId = c ? (c.parentId || c.id) : null;
    save(); renderStandby(); renderList();
  }
  function select(id, scroll) {
    if (show.selectedId === id) return;
    show.selectedId = id;
    save(); renderList(); renderInspector();
    if (scroll) { const el = $(`.row[data-id="${id}"]`); if (el) el.scrollIntoView({ block: 'nearest' }); }
  }

  function cueDuration(c) {
    if (c.type === 'audio') {
      const buf = c.fileKey && AZEngine.buffer(c.fileKey);
      const full = buf ? buf.duration : c.duration || 0;
      if (!full) return null;
      const end = c.endTime > 0 ? Math.min(c.endTime, full) : full;
      const len = Math.max(0, end - (c.startTime || 0));
      if (c.loops === 0) return Infinity;
      return (len * Math.max(1, c.loops || 1)) / (c.rate || 1);
    }
    if (c.type === 'fade' || c.type === 'stop') return c.fadeTime || 0;
    return null;
  }

  function targetName(c) {
    if (c.type === 'audio') return c.fileName || '';
    if (c.type === 'fade' || c.type === 'stop') {
      const t = byId(c.target);
      if (t) return (t.num ? t.num + ' · ' : '') + t.name;
      return c.type === 'stop' ? 'Hammasi' : '— tanlanmagan';
    }
    if (c.type === 'group') return kids(c).length + ' ta ishora';
    return '';
  }

  // ---------- Ijro ----------
  function addRun(cue, kind, durMs) {
    const r = { id: ++runSeq, cueId: cue.id, kind, start: performance.now(), dur: durMs ?? Infinity, timers: [], inst: null, done: false };
    runs.set(r.id, r);
    renderList(); renderRunning();
    return r;
  }
  function endRun(r) {
    if (r.done) return;
    r.done = true;
    r.timers.forEach(clearTimeout);
    runs.delete(r.id);
    renderList(); renderRunning(); renderStatus();
  }

  function instancesFor(targetId) {
    const t = byId(targetId);
    if (!t) return [];
    return AZEngine.instances().filter((i) => i.cueId === t.id || (t.type === 'group' && byId(i.cueId) && byId(i.cueId).parentId === t.id));
  }

  function fire(cue, onDone = () => {}) {
    const g = gen;
    const pre = Math.max(0, num(cue.preWait)) * 1000;
    if (pre > 0) {
      const r = addRun(cue, 'wait', pre);
      r.timers.push(setTimeout(() => { endRun(r); if (g === gen) execute(cue, onDone); }, pre));
    } else execute(cue, onDone);
  }

  function execute(cue, onDone) {
    const g = gen;
    const done = () => { if (g === gen) onDone(); };
    switch (cue.type) {
      case 'memo': done(); break;
      case 'audio': {
        if (!cue.fileKey) { toast(`${cue.name}: audio fayl yo'q`); done(); break; }
        const r = addRun(cue, 'audio');
        AZEngine.play(cue, () => { endRun(r); done(); }).then((inst) => {
          r.inst = inst;
          if (r.done || g !== gen) AZEngine.stop(inst, 0);
          if (paused) AZEngine.pause(inst);
          missing.delete(cue.id);
        }).catch((e) => { missing.add(cue.id); toast(cue.name + ': ' + e.message); endRun(r); done(); });
        break;
      }
      case 'fade': {
        const ft = Math.max(0, num(cue.fadeTime, 3));
        const list = instancesFor(cue.target);
        list.forEach((i) => AZEngine.fadeTo(i, num(cue.fadeTo, -80), ft, !!cue.stopAfter));
        const r = addRun(cue, 'fade', ft * 1000);
        r.timers.push(setTimeout(() => { endRun(r); done(); }, ft * 1000));
        break;
      }
      case 'stop': {
        const ft = Math.max(0, num(cue.fadeTime, 0));
        const list = cue.target ? instancesFor(cue.target) : AZEngine.instances();
        list.forEach((i) => AZEngine.stop(i, ft));
        const r = addRun(cue, 'stop', ft * 1000);
        r.timers.push(setTimeout(() => { endRun(r); done(); }, ft * 1000 + 20));
        break;
      }
      case 'group': {
        const ch = kids(cue).filter((k) => k.type !== 'memo');
        if (!ch.length) { done(); break; }
        const r = addRun(cue, 'group');
        let left = ch.length;
        ch.forEach((k) => fire(k, () => { if (--left === 0) { endRun(r); done(); } }));
        break;
      }
    }
  }

  function fireTop(cue) {
    const g = gen;
    fire(cue, () => { if (cue.cont === 'follow' && g === gen) fireNextFrom(cue); });
    if (cue.cont === 'continue') {
      const t = setTimeout(() => { autoTimers.delete(t); if (g === gen) fireNextFrom(cue); }, (num(cue.preWait) + num(cue.postWait)) * 1000);
      autoTimers.add(t);
    }
  }
  function fireNextFrom(cue) {
    const n = nextTop(cue);
    if (!n) return;
    if (show.standbyId === n.id) setStandby(nextTop(n) ? nextTop(n).id : null);
    fireTop(n);
  }

  function go() {
    if (AZLicense.isLocked()) { openPaywall(); return; }
    const c = byId(show.standbyId);
    if (!c) { toast("Navbatda ishora yo'q"); return; }
    AZEngine.resumeCtx();
    if (paused) togglePause();
    if (!clockStart) clockStart = performance.now();
    const btn = $('#goBtn'); btn.classList.add('hit'); setTimeout(() => btn.classList.remove('hit'), 120);
    const n = nextTop(c);
    show.standbyId = n ? n.id : null;
    save();
    fireTop(c);
    renderStandby();
    if (n) { show.selectedId = n.id; renderInspector(); }
    renderList();
  }

  function stopAll(fade = 0) {
    gen++;
    autoTimers.forEach(clearTimeout); autoTimers.clear();
    AZEngine.instances().forEach((i) => AZEngine.stop(i, fade));
    [...runs.values()].forEach((r) => { if (r.kind !== 'audio' || !fade) endRun(r); });
    if (paused) { paused = false; $('#pauseBtn').classList.remove('on'); }
    renderList(); renderRunning();
  }

  function togglePause() {
    paused = !paused;
    AZEngine.instances().forEach((i) => (paused ? AZEngine.pause(i) : AZEngine.resume(i)));
    $('#pauseBtn').classList.toggle('on', paused);
    toast(paused ? 'Pauza' : 'Davom etmoqda');
  }

  function previewSelected() {
    const c = selected();
    if (!c) return;
    if (AZLicense.isLocked()) { openPaywall(); return; }
    AZEngine.resumeCtx();
    fire(c);
  }

  // ---------- Pult amallari ----------
  function applyLevelSel(delta) {
    const c = selected();
    if (!c || c.type !== 'audio') { toast('Avval ovoz ishorasini tanlang'); return; }
    c.volume = Math.max(-60, Math.min(12, num(c.volume) + delta));
    AZEngine.byCue(c.id).forEach((i) => AZEngine.setVolume(i, c.volume));
    save(); toast(`${c.name}: ${c.volume > 0 ? '+' : ''}${c.volume.toFixed(1)} dB`);
    if (tab === 'level') renderInspector();
  }
  function runPad(i) {
    const p = show.pads[i];
    if (!p) return;
    const el = $(`.pad[data-i="${i}"]`); if (el) { el.classList.add('hit'); setTimeout(() => el.classList.remove('hit'), 120); }
    const c = selected();
    switch (p.action) {
      case 'level': applyLevelSel(num(p.arg, 1)); break;
      case 'loopOn':
      case 'loopOff': {
        if (!c || c.type !== 'audio') { toast('Avval ovoz ishorasini tanlang'); break; }
        const on = p.action === 'loopOn';
        c.loops = on ? 0 : 1;
        AZEngine.byCue(c.id).forEach((x) => AZEngine.setLoop(x, on));
        save(); renderList(); if (tab === 'time') renderInspector();
        toast(`${c.name}: takror ${on ? 'yoqildi' : "o'chirildi"}`);
        break;
      }
      case 'fadeOut': {
        if (!c) { toast('Avval ishorani tanlang'); break; }
        const list = instancesFor(c.id);
        if (!list.length) { toast("Tanlangan ishora ijroda emas"); break; }
        list.forEach((x) => AZEngine.fadeTo(x, -80, num(p.arg, 3), true));
        break;
      }
      case 'stopSel': if (c) instancesFor(c.id).forEach((x) => AZEngine.stop(x, 0)); break;
      case 'duck':
        ducked = !ducked; AZEngine.setDuck(ducked, num(p.arg, -12)); renderPads();
        toast(ducked ? `Umumiy ${num(p.arg, -12)} dB pasaytirildi` : 'Pasaytirish olib tashlandi');
        break;
      case 'playCue': {
        const t = byId(p.arg);
        if (!t) { toast("Ishora topilmadi — tugmani qayta sozlang"); break; }
        if (AZLicense.isLocked()) { openPaywall(); break; }
        AZEngine.resumeCtx(); fire(t);
        break;
      }
      case 'go': go(); break;
      case 'pauseAll': togglePause(); break;
      case 'stopAll': stopAll(); break;
      case 'none':
        if (show.mode === 'edit') openPadEditor(i);
        break;
    }
  }

  // ---------- Chizish: ro'yxat ----------
  function renderList() {
    const rows = $('#cueRows');
    const q = search.trim().toLowerCase();
    const runningIds = new Set([...runs.values()].map((r) => r.cueId));
    const list = show.cues.filter((c) => (filter === 'all' || c.type === filter) && (!q || (c.name + ' ' + (c.num || '') + ' ' + (c.fileName || '')).toLowerCase().includes(q)));
    rows.innerHTML = list.map((c) => {
      const T = TYPES[c.type];
      const cls = ['row', c.type, c.parentId ? 'child' : '', c.id === show.selectedId ? 'sel' : '', runningIds.has(c.id) ? 'playing' : '', c.id === show.standbyId ? 'sbrow' : '', missing.has(c.id) ? 'missing' : ''].join(' ');
      const d = cueDuration(c);
      let stIcon = '';
      if (runningIds.has(c.id)) stIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="var(--accent)"><path d="M7 5l12 7-12 7z"/></svg>`;
      else if (c.id === show.standbyId) stIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>`;
      const chev = c.type === 'group' ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9AA1AE" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>` : '';
      const cont = !c.parentId && c.cont === 'continue' ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="Avtomatik davom"><path d="M5 12h14M13 6l6 6-6 6"/></svg>` : !c.parentId && c.cont === 'follow' ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="Tugagach keyingisi"><path d="M12 4v12"/><path d="m7 11 5 5 5-5"/><path d="M6 20h12"/></svg>` : '';
      const showWaits = c.type !== 'memo';
      return `<div class="${cls}" data-id="${c.id}">
        <span class="st" data-standby="${c.id}" title="Navbatga qo'yish">${stIcon}</span>
        <span class="num">${esc(c.num || '')}</span>
        <span class="nm">${chev}<span class="bar" style="background:${c.color || T.color}"></span><span class="t">${esc(c.name)}</span></span>
        <span><span class="pill-t" style="${T.pill}">${T.label}</span></span>
        <span class="tg" title="${esc(targetName(c))}">${esc(targetName(c))}</span>
        <span class="tm">${showWaits && !c.parentId || c.preWait ? fmt(num(c.preWait)) : ''}</span>
        <span class="act" data-act="${c.id}"><span class="v">${d == null ? '' : fmt(d)}</span><span class="prog" hidden><i></i></span></span>
        <span class="tm">${!c.parentId && c.cont === 'continue' ? fmt(num(c.postWait)) : ''}</span>
        <span style="color:var(--muted);display:flex">${cont}</span>
      </div>`;
    }).join('');
    $('#emptyState').hidden = show.cues.length > 0;
    $('#cueCount').textContent = show.cues.length + ' ishora';
    renderStatus();
  }

  function renderStandby() {
    const c = byId(show.standbyId);
    $('#sbNum').textContent = c ? c.num || '' : '';
    $('#sbName').textContent = c ? c.name : "— navbatda ishora yo'q";
    if (!c) { $('#sbInfo').innerHTML = ''; return; }
    const d = cueDuration(c);
    const parts = [`<span>Oldin kutish <b>${fmt(num(c.preWait))}</b></span>`];
    if (d != null) parts.push(`<span>Davomiyligi <b>${fmt(d)}</b></span>`);
    const n = nextTop(c);
    if (c.cont === 'continue' && n) parts.push(`<span>${fmt(num(c.postWait))} dan so'ng avtomatik → ${esc(n.name)}</span>`);
    if (c.cont === 'follow' && n) parts.push(`<span>Tugagach avtomatik → ${esc(n.name)}</span>`);
    if (c.notes) parts.push(`<span>${esc(c.notes)}</span>`);
    $('#sbInfo').innerHTML = parts.join('');
  }

  function renderStatus() {
    $('#stCount').textContent = `${show.cues.length} ishora`;
    const n = AZEngine.instances().length;
    $('#stRunning').textContent = n ? `${n} tasi ijroda` : 'Tinch';
  }

  // har kadrda: progress, metrlar, soat
  let lastRunRender = 0;
  const pk = [0, 0], pkT = [0, 0];
  function frame(t) {
    for (const r of runs.values()) {
      const el = $(`.act[data-act="${r.cueId}"]`);
      if (!el) continue;
      const v = el.querySelector('.v'), pg = el.querySelector('.prog'), bar = pg.querySelector('i');
      let text = '', p = null;
      if (r.kind === 'audio' && r.inst) {
        const e = AZEngine.elapsed(r.inst);
        if (isFinite(r.inst.total)) { text = '−' + fmt(r.inst.total - e); p = e / r.inst.total; }
        else { text = '∞ ' + fmt(AZEngine.position(r.inst) - r.inst.seg.start); p = ((AZEngine.position(r.inst) - r.inst.seg.start) / r.inst.seg.len); }
        if (r.inst.state === 'paused') text = '❚❚ ' + text;
      } else if (r.kind === 'wait') {
        const left = (r.dur - (t - r.start)) / 1000; text = 'kutish ' + fmt(left); p = (t - r.start) / r.dur;
      } else if (r.kind === 'fade' || r.kind === 'stop') {
        const left = (r.dur - (t - r.start)) / 1000; text = '−' + fmt(left); p = r.dur ? (t - r.start) / r.dur : 1;
      } else if (r.kind === 'group') {
        text = fmt((t - r.start) / 1000);
      }
      v.textContent = text;
      if (p != null) { pg.hidden = false; bar.style.width = Math.min(100, Math.max(0, p * 100)) + '%'; }
    }
    // metrlar
    const m = AZEngine.meters();
    for (let i = 0; i < 2; i++) {
      const db = AZEngine.gainToDb(m[i]);
      const h = Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
      if (h >= pk[i] || t - pkT[i] > 1200) { pk[i] = h; pkT[i] = t; }
      const side = i ? 'R' : 'L';
      $('#bm' + side).style.height = h + '%';
      $('#pk' + side).style.bottom = 'calc(' + pk[i] + '% - 2px)';
      $('#mm' + side).style.height = h + '%';
    }
    $('#clock').textContent = clockStart ? fmt((t - clockStart) / 1000, true).slice(0, -1) : '00:00:00.0';
    if (t - lastRunRender > 250) { lastRunRender = t; renderRunningTimes(t); }
    const c = selected();
    if (c && c.type === 'audio' && tab === 'time' && (AZEngine.byCue(c.id).length || waveDirty)) drawWave();
    requestAnimationFrame(frame);
  }

  function renderRunning() {
    const list = [...runs.values()];
    $('#runningList').innerHTML = list.length ? list.map((r) => {
      const c = byId(r.cueId);
      return `<div class="run-item" data-run="${r.id}"><div class="r1"><span>${esc(c ? (c.num ? c.num + ' · ' : '') + c.name : '?')}</span><span class="mono rt"></span></div></div>`;
    }).join('') : `<span class="muted small">Hozir hech narsa ijro etilmayapti</span>`;
    renderStatus();
  }
  function renderRunningTimes(t) {
    for (const r of runs.values()) {
      const el = $(`.run-item[data-run="${r.id}"] .rt`);
      if (!el) continue;
      if (r.kind === 'audio' && r.inst) el.textContent = isFinite(r.inst.total) ? '−' + fmt(r.inst.total - AZEngine.elapsed(r.inst)) : '∞';
      else if (isFinite(r.dur)) el.textContent = '−' + fmt((r.dur - (t - r.start)) / 1000);
      else el.textContent = fmt((t - r.start) / 1000);
    }
  }

  // ---------- Inspektor ----------
  const TABS = {
    audio: [['basic', 'Asosiy'], ['time', 'Vaqt va takror'], ['level', 'Balandlik']],
    fade: [['basic', 'Asosiy'], ['fade', "So'nish"]],
    stop: [['basic', 'Asosiy'], ['stop', "To'xtatish"]],
    group: [['basic', 'Asosiy']],
    memo: [['basic', 'Asosiy']]
  };

  function field(label, key, value, attrs = '') {
    return `<label class="f">${label}<input data-k="${key}" value="${esc(value)}" ${attrs}></label>`;
  }
  function targetOptions(c, allowAll) {
    const opts = show.cues.filter((x) => x.id !== c.id && (x.type === 'audio' || x.type === 'group'));
    return (allowAll ? `<option value="">Hammasi (barcha ijrodagi ovozlar)</option>` : `<option value="">— tanlang —</option>`) +
      opts.map((x) => `<option value="${x.id}" ${x.id === c.target ? 'selected' : ''}>${esc((x.num ? x.num + ' · ' : '') + x.name)}</option>`).join('');
  }

  function renderInspector() {
    const c = selected();
    const tabsEl = $('#tabs'), body = $('#inspBody');
    if (!c) {
      tabsEl.innerHTML = `<button class="on">Xususiyatlar</button>`;
      body.innerHTML = `<p class="hint">Ishorani tanlang — uning sozlamalari shu yerda chiqadi. <br>BOSHLA navbatdagi ishorani ijro etadi; navbatni ↑ ↓ yoki chap ustundagi belgini bosib o'zgartirasiz.</p>`;
      return;
    }
    const tabs = TABS[c.type];
    if (!tabs.some(([k]) => k === tab)) tab = 'basic';
    tabsEl.innerHTML = tabs.map(([k, l]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('') +
      `<span class="sel-info">Tanlangan: <b style="color:var(--text)">${esc(c.name)}</b>${c.type === 'audio' && c.fileName ? ' · ' + esc(c.fileName) : ''}</span>`;
    let h = '';
    if (tab === 'basic') {
      h += `<div class="col" style="flex:1 1 260px">
        <div class="frow">${field('№', 'num', c.num || '', 'style="max-width:90px"')}${field('Nomi', 'name', c.name)}</div>
        <label class="f">Rang<div class="colors">${COLORS.map((col) => `<button type="button" data-color="${col}" class="${(c.color || '') === col ? 'on' : ''}" style="background:${col || TYPES[c.type].color}" aria-label="Rang ${col || 'standart'}"></button>`).join('')}</div></label>
        <label class="f">Izoh (sahna ko'rsatmasi)<input data-k="notes" value="${esc(c.notes || '')}" placeholder="masalan: aktyor chiqqanda"></label>
      </div>`;
      if (c.type !== 'memo') {
        h += `<div class="col" style="flex:1 1 260px">
          <div class="frow">${field('Oldin kutish, s', 'preWait', num(c.preWait), 'type="number" min="0" step="0.1"')}${!c.parentId && c.cont === 'continue' ? field('Keyin kutish, s', 'postWait', num(c.postWait), 'type="number" min="0" step="0.1"') : ''}</div>
          ${!c.parentId ? `<label class="f">Keyingi ishoraga o'tish<select data-k="cont">
            <option value="none" ${!c.cont || c.cont === 'none' ? 'selected' : ''}>Qo'lda — BOSHLA bilan</option>
            <option value="continue" ${c.cont === 'continue' ? 'selected' : ''}>Avtomatik davom — keyin kutishdan so'ng</option>
            <option value="follow" ${c.cont === 'follow' ? 'selected' : ''}>Tugagach keyingisi avtomatik</option></select></label>` : `<p class="hint">Bu ishora guruh ichida: guruh boshlanganda hammasi birga ijro etiladi.</p>`}
          <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-do="preview">▶ Sinab eshitish</button><button class="btn" data-do="standby">Navbatga qo'yish</button><button class="btn ghost" data-do="stopThis">To'xtatish</button></div>
        </div>`;
      }
      if (c.type === 'group') h += `<p class="hint" style="flex:1 1 100%">Guruh tanlangan holda "+ Ovoz" yoki boshqa ishora qo'shsangiz, u shu guruh ichiga tushadi. Guruh boshlanganda ichidagilarning hammasi birga ijro etiladi.</p>`;
    }
    if (tab === 'time' && c.type === 'audio') {
      const buf = AZEngine.buffer(c.fileKey);
      const full = buf ? buf.duration : c.duration || 0;
      h += `<div class="col" style="flex:0 1 210px">
        ${field('Boshlanish, s', 'startTime', num(c.startTime).toFixed(3), 'type="number" min="0" step="0.01"')}
        ${field('Tugash, s (0 = oxirigacha)', 'endTime', num(c.endTime).toFixed(3), 'type="number" min="0" step="0.01"')}
        <div class="frow">${field('Takrorlar soni', 'loops', c.loops === 0 ? '' : c.loops || 1, `type="number" min="1" step="1" ${c.loops === 0 ? 'disabled placeholder="∞"' : ''}`)}${field('Tezlik', 'rate', num(c.rate, 1), 'type="number" min="0.25" max="4" step="0.05"')}</div>
        <button type="button" class="tgl ${c.loops === 0 ? 'on' : ''}" data-do="infinite">Cheksiz takror <span class="switch ${c.loops === 0 ? 'on' : ''}"></span></button>
      </div>
      <div class="wave-col">
        <div class="wave-ruler"><span>0:00</span><span>${fmt(full * 0.25)}</span><span>${fmt(full * 0.5)}</span><span>${fmt(full * 0.75)}</span><span>${fmt(full)}</span></div>
        <div class="wave"><canvas id="waveCanvas" aria-label="To'lqin shakli: boshlanish va tugash belgilarini sichqoncha bilan suring"></canvas></div>
        <div class="wave-tools">
          <button class="btn" data-do="preview">▶ Sinab eshitish</button>
          <button class="btn ghost" data-do="stopThis">■ To'xtatish</button>
          <button class="btn" data-do="setStartHere">Boshini ijro nuqtasiga</button>
          <button class="btn" data-do="setEndHere">Oxirini ijro nuqtasiga</button>
          <button class="btn ghost" data-do="resetTrim">Kesishni tozalash</button>
          <div class="grow"></div>
          <span class="mono muted">${fmt(full)}</span>
        </div>
        <p class="hint" style="margin:0">To'lqindagi yashil (boshlanish) va sariq (tugash) chiziqlarni sichqoncha bilan suring. Takror shu oraliqda bo'ladi.</p>
      </div>`;
    }
    if (tab === 'level' && c.type === 'audio') {
      h += `<div class="col" style="flex:1 1 320px">
        <label class="f">Balandlik: <b class="mono" id="volVal" style="color:var(--text)">${num(c.volume).toFixed(1)} dB</b><input data-k="volume" type="range" min="-60" max="12" step="0.5" value="${num(c.volume)}" style="height:auto;padding:0"></label>
        <div class="frow">${field("Kirishda ko'tarilish (fade in), s", 'fadeIn', num(c.fadeIn), 'type="number" min="0" step="0.1"')}${field("Oxirida so'nish (fade out), s", 'fadeOut', num(c.fadeOut), 'type="number" min="0" step="0.1"')}</div>
        <p class="hint" style="margin:0">Pultdagi BALANDLIK tugmalari ham shu qiymatni o'zgartiradi va ijro paytida darhol eshitiladi.</p>
      </div>`;
    }
    if (tab === 'fade' && c.type === 'fade') {
      h += `<div class="col" style="flex:1 1 320px">
        <label class="f">Nishon (qaysi ovoz so'nadi)<select data-k="target">${targetOptions(c, false)}</select></label>
        <div class="frow">${field("So'nish vaqti, s", 'fadeTime', num(c.fadeTime, 3), 'type="number" min="0" step="0.1"')}</div>
        <label class="f">Yakuniy balandlik: <b class="mono" id="ftVal" style="color:var(--text)">${num(c.fadeTo, -80) <= -80 ? 'Jim' : num(c.fadeTo).toFixed(1) + ' dB'}</b><input data-k="fadeTo" type="range" min="-80" max="12" step="1" value="${num(c.fadeTo, -80)}" style="height:auto;padding:0"></label>
        <button type="button" class="tgl ${c.stopAfter ? 'on' : ''}" data-do="stopAfter">So'ngach to'xtatish <span class="switch ${c.stopAfter ? 'on' : ''}"></span></button>
      </div>`;
    }
    if (tab === 'stop' && c.type === 'stop') {
      h += `<div class="col" style="flex:1 1 320px">
        <label class="f">Nishon<select data-k="target">${targetOptions(c, true)}</select></label>
        ${field("So'nib to'xtash vaqti, s (0 = darhol)", 'fadeTime', num(c.fadeTime), 'type="number" min="0" step="0.1"')}
      </div>`;
    }
    body.innerHTML = h;
    if (tab === 'time' && c.type === 'audio') {
      AZEngine.loadBuffer(c.fileKey).then(() => { waveDirty = true; drawWave(); }).catch(() => {});
      setupWaveDrag();
    }
  }

  // inspektor maydonlari
  $('#inspBody').addEventListener('input', (e) => {
    const k = e.target.dataset.k; if (!k) return;
    const c = selected(); if (!c) return;
    let v = e.target.value;
    if (['preWait', 'postWait', 'startTime', 'endTime', 'rate', 'volume', 'fadeIn', 'fadeOut', 'fadeTime', 'fadeTo'].includes(k)) v = num(v);
    if (k === 'loops') v = Math.max(1, Math.round(num(v, 1)));
    c[k] = v;
    if (k === 'volume') { AZEngine.byCue(c.id).forEach((i) => AZEngine.setVolume(i, v)); $('#volVal').textContent = v.toFixed(1) + ' dB'; }
    if (k === 'fadeTo') $('#ftVal').textContent = v <= -80 ? 'Jim' : v.toFixed(1) + ' dB';
    if (k === 'startTime' || k === 'endTime') waveDirty = true;
    save(); renderListSoon(); renderStandby();
  });
  $('#inspBody').addEventListener('change', (e) => {
    const k = e.target.dataset.k;
    if (k === 'cont' || k === 'target') { const c = selected(); c[k] = e.target.value || null; if (k === 'cont') c.cont = e.target.value; save(); renderList(); renderInspector(); renderStandby(); }
  });
  $('#inspBody').addEventListener('click', (e) => {
    const c = selected(); if (!c) return;
    const col = e.target.closest('[data-color]');
    if (col) { c.color = col.dataset.color; save(); renderList(); renderInspector(); return; }
    const d = e.target.closest('[data-do]'); if (!d) return;
    const pos = () => { const i = AZEngine.byCue(c.id)[0]; return i ? AZEngine.position(i) : null; };
    switch (d.dataset.do) {
      case 'preview': previewSelected(); break;
      case 'standby': setStandby(c.id); break;
      case 'stopThis': instancesFor(c.id).forEach((i) => AZEngine.stop(i, 0)); break;
      case 'infinite': c.loops = c.loops === 0 ? 1 : 0; AZEngine.byCue(c.id).forEach((i) => AZEngine.setLoop(i, c.loops === 0)); save(); renderList(); renderInspector(); break;
      case 'stopAfter': c.stopAfter = !c.stopAfter; save(); renderInspector(); break;
      case 'setStartHere': { const p = pos(); if (p == null) { toast('Avval ijro eting'); break; } c.startTime = +p.toFixed(3); save(); renderInspector(); renderList(); break; }
      case 'setEndHere': { const p = pos(); if (p == null) { toast('Avval ijro eting'); break; } c.endTime = +p.toFixed(3); save(); renderInspector(); renderList(); break; }
      case 'resetTrim': c.startTime = 0; c.endTime = 0; save(); renderInspector(); renderList(); break;
    }
  });
  $('#tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; renderInspector(); } });
  let listT = null;
  function renderListSoon() { clearTimeout(listT); listT = setTimeout(renderList, 120); }

  // ---------- To'lqin ----------
  let waveDirty = true;
  function drawWave() {
    const cv = $('#waveCanvas'); if (!cv) return;
    const c = selected(); if (!c || c.type !== 'audio') return;
    const buf = AZEngine.buffer(c.fileKey);
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    if (!buf) { g.fillStyle = '#9AA1AE'; g.font = '12px Inter'; g.fillText('Yuklanmoqda…', 12, 20); return; }
    waveDirty = false;
    const n = Math.max(50, Math.floor(w / 3));
    const pk = AZEngine.peaks(c.fileKey, n);
    const dur = buf.duration;
    const s = num(c.startTime), e = c.endTime > 0 ? Math.min(c.endTime, dur) : dur;
    const inst = AZEngine.byCue(c.id)[0];
    const play = inst ? AZEngine.position(inst) : -1;
    const mid = h / 2;
    for (let i = 0; i < n; i++) {
      const x = (i / n) * w, t = (i / n) * dur;
      const inSeg = t >= s && t <= e;
      g.fillStyle = !inSeg ? '#2A3140' : (play >= 0 && t <= play ? '#B8F25A' : '#4A6FA8');
      const bh = Math.max(1, pk[i] * (h - 16) / 2);
      g.fillRect(x, mid - bh, Math.max(1, w / n - 1), bh * 2);
    }
    if (c.loops !== 1) { g.fillStyle = 'rgba(184,242,90,0.08)'; g.fillRect((s / dur) * w, 0, ((e - s) / dur) * w, h); }
    const line = (t, col, label) => {
      const x = Math.round((t / dur) * w) + 0.5;
      g.fillStyle = col; g.fillRect(x - 1, 0, 2, h);
      g.fillRect(x - 6, 0, 12, 8);
      g.font = '600 10px Inter'; g.fillText(label, Math.min(w - 50, x + 4), h - 6);
    };
    line(s, '#B8F25A', 'BOSH');
    line(e, '#FFB547', 'OXIR');
    if (c.loops !== 1) { g.fillStyle = '#B8F25A'; g.font = '700 10px Inter'; g.fillText(c.loops === 0 ? 'TAKROR ∞' : 'TAKROR ×' + c.loops, (s / dur) * w + 6, 20); }
    if (play >= 0) { const x = (play / dur) * w; g.fillStyle = '#fff'; g.fillRect(x - 1, 0, 2, h); }
  }
  function setupWaveDrag() {
    const cv = $('#waveCanvas'); if (!cv) return;
    let drag = null;
    const tAt = (ev) => {
      const c = selected(); const buf = AZEngine.buffer(c.fileKey); if (!buf) return null;
      const r = cv.getBoundingClientRect();
      return Math.max(0, Math.min(buf.duration, ((ev.clientX - r.left) / r.width) * buf.duration));
    };
    cv.addEventListener('pointerdown', (ev) => {
      if (show.mode === 'show') return;
      const c = selected(); const buf = AZEngine.buffer(c.fileKey); if (!buf) return;
      const t = tAt(ev);
      const e = c.endTime > 0 ? c.endTime : buf.duration;
      drag = Math.abs(t - num(c.startTime)) <= Math.abs(t - e) ? 'startTime' : 'endTime';
      cv.setPointerCapture(ev.pointerId);
      move(ev);
    });
    const move = (ev) => {
      if (!drag) return;
      const c = selected(); const buf = AZEngine.buffer(c.fileKey);
      let t = +tAt(ev).toFixed(3);
      if (drag === 'startTime') t = Math.min(t, (c.endTime > 0 ? c.endTime : buf.duration) - 0.05);
      else { t = Math.max(t, num(c.startTime) + 0.05); if (t >= buf.duration - 0.01) t = 0; }
      c[drag] = t;
      const inp = $(`#inspBody input[data-k="${drag}"]`); if (inp) inp.value = t.toFixed(3);
      waveDirty = true; drawWave();
    };
    cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerup', () => { if (drag) { drag = null; save(); renderList(); renderStandby(); } });
  }
  window.addEventListener('resize', () => { waveDirty = true; drawWave(); });

  // ---------- Pult ----------
  function padView(p, i) {
    const a = PAD_ACTIONS[p.action] || PAD_ACTIONS.none;
    let label = p.label, sub = '', styleKey = p.action;
    switch (p.action) {
      case 'level': { const v = num(p.arg, 1); label = label || (v > 0 ? '+' : '−') + Math.abs(v) + ' dB'; sub = 'tanlangan ishora'; styleKey = v >= 0 ? 'levelUp' : 'levelDown'; break; }
      case 'loopOn': label = label || 'Yoqish'; sub = 'tanlangan ishora'; break;
      case 'loopOff': label = label || "O'chirish"; sub = 'tanlangan ishora'; break;
      case 'fadeOut': label = label || num(p.arg, 3) + " s so'ndirish"; sub = 'tanlangan ishora'; break;
      case 'stopSel': label = label || "To'xtatish"; sub = 'tanlangan ishora'; break;
      case 'duck': label = label || num(p.arg, -12) + ' dB'; sub = ducked ? 'YOQILGAN — bosib o\'chiring' : 'barcha ovoz'; break;
      case 'playCue': { const t = byId(p.arg); label = label || (t ? t.name : '?'); sub = t ? (t.num ? '№ ' + t.num : 'ishora') : 'ishora topilmadi'; break; }
      case 'go': label = label || 'BOSHLA'; sub = 'navbatdagi ishora'; break;
      case 'pauseAll': label = label || 'Pauza'; sub = 'hammasi'; break;
      case 'stopAll': label = label || "To'xtatish"; sub = 'hammasi'; break;
      case 'none': label = '+ Biriktirish'; sub = show.mode === 'edit' ? 'bosib sozlang' : "bo'sh"; break;
    }
    const [bg, fg, bd] = PAD_STYLE[styleKey] || PAD_STYLE.none;
    const active = (p.action === 'duck' && ducked) || (p.action === 'loopOn' && selected() && selected().loops === 0);
    const key = PAD_KEYS[i % 12];
    return `<button class="pad" data-i="${i}" style="background:${bg};color:${fg};border:1px solid ${bd}">
      <span class="k"><span>${a.kind}</span><kbd>${keyLabel(key)}</kbd></span>
      <span class="l">${esc(label)}</span><span class="s">${esc(sub)}</span>
      ${active ? '<span class="dot"></span>' : ''}
      <span class="edit" data-edit="${i}" role="button" aria-label="Sozlash" title="Sozlash">⚙</span>
    </button>`;
  }
  function renderPads() {
    $('#pads').innerHTML = show.pads.slice(page * 12, page * 12 + 12).map((p, j) => padView(p, page * 12 + j)).join('');
  }
  $('#pads').addEventListener('click', (e) => {
    const ed = e.target.closest('[data-edit]');
    if (ed) { e.stopPropagation(); openPadEditor(+ed.dataset.edit); return; }
    const b = e.target.closest('.pad'); if (b) runPad(+b.dataset.i);
  });
  $('#pages').addEventListener('click', (e) => {
    const b = e.target.closest('[data-p]'); if (!b) return;
    page = +b.dataset.p;
    $$('#pages button').forEach((x) => x.classList.toggle('on', x === b));
    renderPads();
  });

  let editingPad = null;
  function openPadEditor(i) {
    if (show.mode === 'show') return;
    editingPad = i;
    const p = show.pads[i];
    $('#padAction').innerHTML = Object.entries(PAD_ACTIONS).map(([k, a]) => `<option value="${k}" ${k === p.action ? 'selected' : ''}>${a.label}</option>`).join('');
    $('#padLabel').value = p.label || '';
    updatePadArg(p.arg);
    $('#padModal').hidden = false;
  }
  function updatePadArg(val) {
    const a = PAD_ACTIONS[$('#padAction').value];
    const wrap = $('#padArgWrap');
    if (!a.arg) { wrap.hidden = true; return; }
    wrap.hidden = false;
    if (a.arg === 'cue') {
      const opts = show.cues.filter((c) => c.type !== 'memo');
      wrap.innerHTML = `Ishora<select id="padArg">${opts.map((c) => `<option value="${c.id}" ${c.id === (val || show.selectedId) ? 'selected' : ''}>${esc((c.num ? c.num + ' · ' : '') + c.name)}</option>`).join('')}</select>`;
    } else {
      wrap.innerHTML = `${a.arg}<input id="padArg" value="${esc(val !== undefined && val !== '' ? val : a.def)}">`;
    }
  }
  $('#padAction').addEventListener('change', () => updatePadArg(''));
  $('#padCancel').addEventListener('click', () => { $('#padModal').hidden = true; });
  $('#padForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const action = $('#padAction').value;
    show.pads[editingPad] = { action, arg: PAD_ACTIONS[action].arg ? ($('#padArg') || {}).value || '' : '', label: $('#padLabel').value.trim() };
    save(); renderPads(); $('#padModal').hidden = true;
  });

  // ---------- Ishora qo'shish / o'chirish ----------
  function insertCue(cue) {
    const sel = selected();
    if (cue.type !== 'group' && sel && (sel.type === 'group' || sel.parentId)) {
      cue.parentId = sel.type === 'group' ? sel.id : sel.parentId;
      const anchor = sel.type === 'group' ? (kids(sel).pop() || sel) : sel;
      show.cues.splice(show.cues.indexOf(anchor) + 1, 0, cue);
    } else {
      cue.parentId = null;
      if (sel) {
        const top = sel.parentId ? byId(sel.parentId) : sel;
        const last = top.type === 'group' ? (kids(top).pop() || top) : top;
        show.cues.splice(show.cues.indexOf(last) + 1, 0, cue);
      } else show.cues.push(cue);
    }
    if (!cue.parentId && !cue.num) cue.num = String(show.nextNum++);
    normalize();
    show.selectedId = cue.id;
    if (!show.standbyId) show.standbyId = tops()[0] ? tops()[0].id : null;
    save(); renderList(); renderInspector(); renderStandby();
  }

  function baseCue(type, name) {
    return { id: uid(), type, name, num: '', parentId: null, color: '', notes: '', preWait: 0, postWait: 0, cont: 'none' };
  }

  async function addAudioFiles(files) {
    if (show.mode === 'show') { toast('Spektakl rejimida qo\'shib bo\'lmaydi'); return; }
    const list = [...files].filter((f) => f.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac|flac|aif|aiff|webm)$/i.test(f.name));
    if (!list.length) { toast('Audio fayl topilmadi'); return; }
    for (const f of list) {
      const key = uid();
      try {
        await AZStore.putAudio(key, f);
        const buf = await AZEngine.loadBuffer(key);
        const cue = { ...baseCue('audio', f.name.replace(/\.[^.]+$/, '')), fileKey: key, fileName: f.name, duration: buf.duration, volume: 0, startTime: 0, endTime: 0, loops: 1, rate: 1, fadeIn: 0, fadeOut: 0 };
        insertCue(cue);
      } catch (e) {
        AZStore.delAudio(key);
        toast(f.name + ': o\'qib bo\'lmadi (' + e.message + ')');
      }
    }
    toast(list.length + ' ta ovoz qo\'shildi');
  }

  function addCue(type) {
    if (show.mode === 'show') return;
    const sel = selected();
    let cue;
    if (type === 'fade') {
      const t = sel && (sel.type === 'audio' || sel.type === 'group') ? sel : null;
      cue = { ...baseCue('fade', t ? "so'nish: " + t.name : "So'nish"), target: t ? t.id : null, fadeTime: 3, fadeTo: -80, stopAfter: true };
    } else if (type === 'stop') {
      const t = sel && (sel.type === 'audio' || sel.type === 'group') ? sel : null;
      cue = { ...baseCue('stop', t ? "to'xtatish: " + t.name : "Hammasini to'xtatish"), target: t ? t.id : null, fadeTime: 0 };
    } else if (type === 'group') {
      cue = baseCue('group', 'Guruh');
      // guruhni tanlangan ishoradan keyin top-darajada qo'shamiz
      const s = show.selectedId; if (sel && sel.parentId) show.selectedId = sel.parentId;
      insertCue(cue); void s; return;
    } else cue = baseCue('memo', 'Izoh');
    insertCue(cue);
  }

  async function cleanupAudio() {
    const used = new Set(show.cues.map((c) => c.fileKey).filter(Boolean));
    try { for (const k of await AZStore.allAudioKeys()) if (!used.has(k)) await AZStore.delAudio(k); } catch (_) {}
  }

  function deleteSelected() {
    const c = selected(); if (!c || show.mode === 'show') return;
    const ids = new Set([c.id, ...(c.type === 'group' ? kids(c).map((k) => k.id) : [])]);
    if (c.type === 'group' && ids.size > 1 && !confirm(`"${c.name}" guruhi va ichidagi ${ids.size - 1} ta ishora o'chirilsinmi?`)) return;
    ids.forEach((id) => instancesFor(id).forEach((i) => AZEngine.stop(i, 0)));
    const flat = show.cues;
    const idx = flat.indexOf(c);
    show.cues = flat.filter((x) => !ids.has(x.id));
    show.cues.forEach((x) => { if (ids.has(x.target)) x.target = null; });
    show.pads.forEach((p) => { if (p.action === 'playCue' && ids.has(p.arg)) { p.action = 'none'; p.arg = ''; } });
    const next = show.cues[Math.min(idx, show.cues.length - 1)];
    show.selectedId = next ? next.id : null;
    if (ids.has(show.standbyId)) show.standbyId = next ? (next.parentId || next.id) : null;
    save(); renderList(); renderInspector(); renderStandby(); renderPads();
    cleanupAudio();
  }

  function duplicateSelected() {
    const c = selected(); if (!c || show.mode === 'show') return;
    const copy = { ...structuredClone(c), id: uid(), name: c.name + ' (nusxa)', num: c.parentId ? '' : String(show.nextNum++) };
    const ch = c.type === 'group' ? kids(c) : [];
    const last = ch.length ? ch[ch.length - 1] : c;
    show.cues.splice(show.cues.indexOf(last) + 1, 0, copy, ...ch.map((k) => ({ ...structuredClone(k), id: uid(), parentId: copy.id })));
    normalize(); show.selectedId = copy.id;
    save(); renderList(); renderInspector();
  }

  function move(dir) {
    const c = selected(); if (!c || show.mode === 'show') return;
    if (c.parentId) {
      const sib = kids(byId(c.parentId)); const i = sib.indexOf(c); const j = i + dir;
      if (j < 0 || j >= sib.length) return;
      const a = show.cues.indexOf(sib[i]), b = show.cues.indexOf(sib[j]);
      [show.cues[a], show.cues[b]] = [show.cues[b], show.cues[a]];
    } else {
      const t = tops(); const i = t.indexOf(c); const j = i + dir;
      if (j < 0 || j >= t.length) return;
      [t[i], t[j]] = [t[j], t[i]];
      const out = [];
      for (const x of t) { out.push(x); if (x.type === 'group') out.push(...kids(x)); }
      show.cues = out;
    }
    save(); renderList(); renderStandby();
  }

  // ---------- Fayl: saqlash / ochish ----------
  const blobToDataURL = (b) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
  async function exportShow() {
    toast('Fayl tayyorlanmoqda…');
    const audio = {};
    for (const c of show.cues) if (c.fileKey && !audio[c.fileKey]) { const b = await AZStore.getAudio(c.fileKey); if (b) audio[c.fileKey] = await blobToDataURL(b); }
    const data = JSON.stringify({ format: 'azshow', version: 1, show, audio });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    a.download = (show.title || 'spektakl').replace(/[^\wЀ-ӿ' -]+/g, '_') + '.azshow';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  async function importShow(file) {
    try {
      const j = JSON.parse(await file.text());
      if (j.format !== 'azshow' || !j.show) throw new Error('Bu .azshow fayli emas');
      if (show.cues.length && !confirm('Joriy spektakl almashtirilsinmi? (Avval saqlab oling)')) return;
      stopAll();
      for (const [k, url] of Object.entries(j.audio || {})) {
        const blob = await (await fetch(url)).blob();
        await AZStore.putAudio(k, blob);
      }
      show = { ...newShow(), ...j.show };
      if (!show.pads || show.pads.length !== 36) show.pads = defaultPads();
      save(); renderAll(); cleanupAudio();
      toast('Spektakl ochildi: ' + show.title);
    } catch (e) { toast('Ochib bo\'lmadi: ' + e.message); }
  }

  // ---------- Litsenziya va to'lov oynasi ----------
  let selPlan = 0, pwOpen = false;
  function updateLicenseUI() {
    const s = AZLicense.state;
    const b = $('#licBadge');
    if (s.license) {
      b.className = 'lic-badge pro';
      b.textContent = 'PRO · ' + s.license.plan + (s.license.expiresAt ? ' · ' + new Date(s.license.expiresAt).toLocaleDateString('ru-RU') + ' gacha' : '');
    } else if (s.remainingSec == null) {
      b.className = 'lic-badge'; b.textContent = 'Tekshirilmoqda…';
    } else {
      b.className = 'lic-badge ' + (s.remainingSec < 180 ? 'low' : 'trial');
      b.textContent = s.remainingSec > 0 ? 'Bepul sinov: ' + mmss(s.remainingSec) : 'Sinov tugadi — PRO';
    }
    $('#stServer').innerHTML = s.online ? '<span style="color:var(--accent)">●</span> Server ulangan' : '<span style="color:var(--red)">●</span> Server bilan aloqa yo\'q';
    const locked = AZLicense.isLocked();
    $('#goBtn').disabled = locked;
    if (locked) {
      if (AZEngine.instances().length) stopAll(1.5);
      if (!pwOpen) openPaywall();
    }
    if (pwOpen) renderPaywall();
  }

  function renderPaywall() {
    const s = AZLicense.state;
    const cfg = s.config || { tariffs: [], card: {}, trialMinutes: 20 };
    const locked = AZLicense.isLocked();
    const tariffs = cfg.tariffs || [];
    if (selPlan >= tariffs.length) selPlan = 0;
    $('#pwTitle').textContent = s.license ? 'PRO faol' : locked ? `${cfg.trialMinutes} daqiqalik bepul sinov tugadi` : 'PRO tarifga o\'tish';
    $('#pwSub').textContent = s.license
      ? `Tarif: ${s.license.plan}${s.license.expiresAt ? ', ' + new Date(s.license.expiresAt).toLocaleDateString('ru-RU') + ' gacha' : ', umrbod'}. Muddatni uzaytirish uchun yangi kod olib, pastga kiritishingiz mumkin.`
      : locked ? 'Spektaklni davom ettirish uchun PRO tarifni tanlang. Loyihangiz va ishoralaringiz saqlangan — faollashtirgach shu joydan davom etasiz.'
        : `Bepul sinovda ${mmss(s.remainingSec || 0)} qoldi. Hoziroq PRO olib, cheklovsiz ishlashingiz mumkin.`;
    $('#pwTimer').textContent = s.license ? 'PRO' : `Sinov vaqti: ${mmss(s.remainingSec || 0)} / ${mmss(s.trialSec || cfg.trialMinutes * 60)}`;
    $('#pwClose').hidden = locked;
    $('#plans').innerHTML = tariffs.length ? tariffs.map((t, i) => {
      const note = t.days === 0 ? "Bir marta to'lov, cheksiz muddat" : t.days >= 60 ? `${t.days} kun · oyiga ~${sum(Math.round(t.price / (t.days / 30) / 1000) * 1000)}` : `${t.days} kun`;
      return `<button class="plan ${i === selPlan ? 'on' : ''}" data-plan="${i}" aria-pressed="${i === selPlan}"><span class="pn">${esc(t.name.toUpperCase())}</span><span class="pp">${sum(t.price).replace(" so'm", '')} <small>so'm</small></span><span class="pd">${esc(note)}</span></button>`;
    }).join('') : `<p class="muted">Tariflar yuklanmadi. Internet aloqasini tekshiring.</p>`;
    const t = tariffs[selPlan];
    $$('.pw-amount').forEach((el) => { el.textContent = t ? sum(t.price) : '—'; });
    const card = cfg.card || {};
    $('#pcNum').textContent = card.number || 'Karta hali sozlanmagan';
    $('#pcHolder').textContent = card.holder || '—';
    $('#pcSys').textContent = card.system || '';
    $('#pcId').textContent = s.shortId || '—';
    const tg = $('#tgBtn');
    if (cfg.botUsername) { tg.href = `https://t.me/${cfg.botUsername}?start=${encodeURIComponent(s.shortId || '')}`; tg.classList.remove('off'); }
    else { tg.removeAttribute('href'); tg.classList.add('off'); }
  }

  function openPaywall() {
    pwOpen = true; $('#paywall').hidden = false;
    AZLicense.refreshConfig();
    renderPaywall();
    setTimeout(() => $('#codeInput').focus(), 50);
  }
  function closePaywall() {
    if (AZLicense.isLocked()) return;
    pwOpen = false; $('#paywall').hidden = true;
  }
  $('#plans').addEventListener('click', (e) => { const b = e.target.closest('[data-plan]'); if (b) { selPlan = +b.dataset.plan; renderPaywall(); } });
  $('#pwClose').addEventListener('click', closePaywall);
  $('#licBadge').addEventListener('click', openPaywall);
  $('#copyCard').addEventListener('click', async () => {
    const n = (AZLicense.state.config || {}).card?.number;
    if (!n) return;
    try { await navigator.clipboard.writeText(n.replace(/\s/g, '')); $('#copyCard').textContent = 'Nusxalandi'; setTimeout(() => ($('#copyCard').textContent = 'Nusxa'), 1500); } catch (_) {}
  });
  $('#codeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#codeMsg');
    const code = $('#codeInput').value.trim();
    if (!code) { msg.style.color = 'var(--red)'; msg.textContent = 'Kodni kiriting'; return; }
    msg.style.color = 'var(--muted)'; msg.textContent = 'Tekshirilmoqda…';
    try {
      const lic = await AZLicense.activate(code);
      msg.style.color = 'var(--accent)'; msg.textContent = `PRO faollashtirildi: ${lic.plan}. Rahmat!`;
      $('#codeInput').value = '';
      setTimeout(() => { closePaywall(); msg.textContent = ''; }, 1500);
    } catch (err) { msg.style.color = 'var(--red)'; msg.textContent = err.message; }
  });

  // ---------- Hodisalar ----------
  $('#goBtn').addEventListener('click', go);
  $('#panicBtn').addEventListener('click', () => stopAll());
  $('#pauseBtn').addEventListener('click', togglePause);
  $('#prevBtn').addEventListener('click', () => stepStandby(-1));
  $('#nextBtn').addEventListener('click', () => stepStandby(1));
  $('#clock').addEventListener('dblclick', () => { clockStart = 0; });
  function stepStandby(d) {
    const cur = byId(show.standbyId);
    const t = tops();
    let n;
    if (!cur) n = d > 0 ? t[0] : t[t.length - 1];
    else n = d > 0 ? nextTop(cur) : prevTop(cur);
    if (n) { setStandby(n.id); select(n.id, true); }
  }

  $('#cueRows').addEventListener('click', (e) => {
    const sb = e.target.closest('[data-standby]');
    if (sb) { setStandby(sb.dataset.standby); }
    const row = e.target.closest('.row[data-id]'); if (row) select(row.dataset.id);
  });
  $('#cueRows').addEventListener('dblclick', (e) => { const row = e.target.closest('.row[data-id]'); if (row) setStandby(row.dataset.id); });
  $('#filters').addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (!b) return; filter = b.dataset.f; $$('#filters button').forEach((x) => x.classList.toggle('on', x === b)); renderList(); });
  $('#search').addEventListener('input', (e) => { search = e.target.value; renderList(); });

  $('#addAudio').addEventListener('click', () => $('#fileInput').click());
  $('#fileInput').addEventListener('change', (e) => { addAudioFiles(e.target.files); e.target.value = ''; });
  $$('[data-add]').forEach((b) => b.addEventListener('click', () => addCue(b.dataset.add)));
  $('#delCue').addEventListener('click', deleteSelected);
  $('#dupCue').addEventListener('click', duplicateSelected);
  $('#moveUp').addEventListener('click', () => move(-1));
  $('#moveDown').addEventListener('click', () => move(1));

  $('#exportBtn').addEventListener('click', exportShow);
  $('#importBtn').addEventListener('click', () => $('#importInput').click());
  $('#importInput').addEventListener('change', (e) => { if (e.target.files[0]) importShow(e.target.files[0]); e.target.value = ''; });
  $('#newShowBtn').addEventListener('click', () => {
    if (show.cues.length && !confirm('Yangi spektakl boshlansinmi? Joriy ishoralar o\'chadi (avval saqlab oling).')) return;
    stopAll();
    const pads = show.pads;
    show = newShow(); show.pads = pads.map((p) => (p.action === 'playCue' ? { action: 'none', arg: '', label: '' } : p));
    save(); renderAll(); cleanupAudio();
  });
  $('#showTitle').addEventListener('input', (e) => { show.title = e.target.value; save(); document.title = show.title + ' — AZ Music Arena'; });

  $('#masterVol').addEventListener('input', (e) => { show.masterDb = num(e.target.value); AZEngine.setMaster(show.masterDb); $('#masterVal').textContent = show.masterDb.toFixed(1) + ' dB'; save(); });

  $('#modeSeg').addEventListener('click', (e) => { const b = e.target.closest('[data-m]'); if (!b) return; setMode(b.dataset.m); });
  function setMode(m) {
    show.mode = m; save();
    document.body.classList.toggle('show-mode', m === 'show');
    $$('#modeSeg button').forEach((x) => x.classList.toggle('on', x.dataset.m === m));
    $('#showTitle').readOnly = m === 'show';
    renderPads();
  }

  // sudrab tashlash
  let dragDepth = 0;
  window.addEventListener('dragenter', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { dragDepth++; $('#dropOverlay').hidden = false; } });
  window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('#dropOverlay').hidden = true; } });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault(); dragDepth = 0; $('#dropOverlay').hidden = true;
    const files = e.dataTransfer.files;
    if (files.length === 1 && /\.azshow$/i.test(files[0].name)) importShow(files[0]);
    else if (files.length) addAudioFiles(files);
  });

  // klaviatura
  document.addEventListener('keydown', (e) => {
    const t = e.target;
    const typing = (t.tagName === 'INPUT' && !['range', 'checkbox', 'button'].includes(t.type)) || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT';
    if (e.key === 'Escape') {
      if (!$('#padModal').hidden) { $('#padModal').hidden = true; return; }
      if (pwOpen && !AZLicense.isLocked()) { closePaywall(); return; }
      if (typing) { t.blur(); return; }
      e.preventDefault(); stopAll(); return;
    }
    if (typing || pwOpen || !$('#padModal').hidden || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) go(); return; }
    if (e.repeat) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); stepStandby(1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); stepStandby(-1); return; }
    if (e.code === 'KeyP') { togglePause(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && show.mode === 'edit') { e.preventDefault(); deleteSelected(); return; }
    const pi = PAD_KEYS.indexOf(e.code);
    if (pi >= 0) { e.preventDefault(); runPad(page * 12 + pi); }
  });

  // brauzer yopilayotganda ogohlantirish (ijro paytida)
  window.addEventListener('beforeunload', (e) => { if (AZEngine.instances().length) { e.preventDefault(); e.returnValue = ''; } });

  function renderAll() {
    $('#showTitle').value = show.title;
    document.title = show.title + ' — AZ Music Arena';
    $('#masterVol').value = show.masterDb || 0;
    $('#masterVal').textContent = num(show.masterDb).toFixed(1) + ' dB';
    setMode(show.mode || 'edit');
    renderList(); renderStandby(); renderInspector(); renderPads(); renderRunning();
  }

  // ---------- Ishga tushirish ----------
  renderAll();
  AZEngine.init();
  AZEngine.setMaster(num(show.masterDb));
  // birinchi bosishda audio kontekstni uyg'otamiz (brauzer talabi)
  document.addEventListener('pointerdown', () => AZEngine.resumeCtx(), { once: true });
  document.addEventListener('keydown', () => AZEngine.resumeCtx(), { once: true });
  // audio davomiyliklarini oldindan yuklab olamiz
  show.cues.filter((c) => c.fileKey).forEach((c) => AZEngine.loadBuffer(c.fileKey).then(() => renderListSoon()).catch(() => { missing.add(c.id); renderListSoon(); }));
  AZLicense.onChange(updateLicenseUI);
  AZLicense.start();
  requestAnimationFrame(frame);
})();
