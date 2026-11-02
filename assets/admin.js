(() => {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sum = (n) => Number(n || 0).toLocaleString('ru-RU').replace(/[,  ]/g, ' ') + " so'm";
  const dt = (t) => t ? new Date(t).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
  const fmtCard = (v) => String(v || '').replace(/\D/g, '').slice(0, 19).replace(/(.{4})/g, '$1 ').trim();

  // AZ-Playlist bilan bir xil: {owner, repo, token} shu brauzerda saqlanadi
  const LS = 'az_arena_gh';
  let CFG = { owner: 'alifrecords', repo: 'AZ-Arena', token: '' };
  try { Object.assign(CFG, JSON.parse(localStorage.getItem(LS) || 'null') || {}); } catch (_) {}
  const saveCfg = () => { try { localStorage.setItem(LS, JSON.stringify(CFG)); } catch (_) {} };

  let data = null, tariffs = [], botFlags = {};

  function toast(msg, ms = 2800) {
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), ms);
  }

  async function api(path, opts = {}) {
    let r;
    try {
      r = await fetch(path, {
        method: opts.method || 'GET',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + CFG.token },
        body: opts.body ? JSON.stringify(opts.body) : undefined
      });
    } catch (_) { throw new Error("Saytga ulanib bo'lmadi: internet yoki VPN'ni tekshiring."); }
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { const e = new Error(j.msg || 'Token noto\'g\'ri'); e.auth = true; throw e; }
    if (!r.ok) throw new Error(j.msg || j.error || 'Xato: ' + r.status);
    return j;
  }

  // ---------- Kirish ----------
  function showLogin(msg) {
    $('#app').hidden = true; $('#login').hidden = false;
    $('#ghOwner').value = CFG.owner || ''; $('#ghRepo').value = CFG.repo || ''; $('#ghToken').value = CFG.token || '';
    if (msg) { $('#loginMsg').style.color = 'var(--red)'; $('#loginMsg').textContent = msg; }
  }
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    CFG.owner = $('#ghOwner').value.trim(); CFG.repo = $('#ghRepo').value.trim(); CFG.token = $('#ghToken').value.trim();
    const m = $('#loginMsg');
    if (!CFG.token) { m.style.color = 'var(--red)'; m.textContent = 'Tokenni kiriting'; return; }
    m.style.color = 'var(--muted)'; m.textContent = 'GitHub orqali tekshirilmoqda…';
    try {
      await load(true);
      saveCfg();
      m.textContent = '';
      $('#login').hidden = true; $('#app').hidden = false;
    } catch (err) {
      m.style.color = 'var(--red)';
      m.textContent = err.auth
        ? err.message + ". GitHub → Settings → Personal access tokens → shu token → Edit: Repository access'da «" + (data && data.adminRepo || CFG.repo) + "» tanlangan va Contents: «Read and write» bo'lsin."
        : err.message;
    }
  });
  $('#logout').addEventListener('click', (e) => { e.preventDefault(); CFG.token = ''; saveCfg(); showLogin(); });
  $('#reloadBtn').addEventListener('click', () => load(true).then(() => toast('Yangilandi')).catch((e) => toast(e.message)));

  async function load(full) {
    data = await api('/api/admin/overview');
    renderStats(); renderPayments(); renderCodes(); renderDevices(); renderBot();
    $('#connInfo').textContent = data.adminRepo;
    if (full) fillForms();
  }

  function renderStats() {
    const s = data.stats;
    const items = [
      ["Kutilayotgan to'lovlar", s.pending, 'Telegram botdan', 'color:var(--amber)'],
      ['Faol PRO', s.pro, 'faollashtirilgan kodlar', ''],
      ['Sinovdagilar', s.trial, `${data.settings.trialMinutes} daqiqalik sinov`, ''],
      ['Hozir onlayn', s.online, "so'nggi 90 soniya", ''],
      ['Shu oy tushum', sum(s.monthRevenue), "tasdiqlangan to'lovlar", 'color:var(--accent)']
    ];
    $('#stats').innerHTML = items.map(([l, v, sub, st]) => `<div class="panel stat"><span class="muted small">${l}</span><b style="${st}">${esc(v)}</b><span class="muted" style="font-size:11px">${sub}</span></div>`).join('');
    const np = $('#navPending'); np.hidden = !s.pending; np.textContent = s.pending;
  }

  function renderPayments() {
    const f = $('#payFilter').value;
    const list = data.payments.filter((p) => f === 'all' || p.status === 'pending');
    if (!list.length) { $('#payRows').innerHTML = `<tr><td colspan="8" class="muted" style="padding:20px">To'lov yo'q</td></tr>`; return; }
    $('#payRows').innerHTML = list.map((p) => {
      let act;
      if (p.status === 'pending') act = `<button class="btn primary" data-ok="${esc(p.id)}">Tasdiqlash va kod yuborish</button> <button class="btn danger" data-no="${esc(p.id)}">Rad etish</button>`;
      else if (p.status === 'approved') act = `<span style="color:var(--accent);font-weight:600">Tasdiqlandi</span> <span class="mono muted">${esc(p.code)}</span>`;
      else if (p.status === 'approving') act = `<span class="muted">Tasdiqlanmoqda…</span>`;
      else act = `<span style="color:var(--red)">Rad etilgan</span>`;
      const photo = p.hasPhoto ? `<button class="thumb-btn" data-photo="${esc(p.id)}">Chek</button>` : '—';
      return `<tr><td class="mono">${esc(p.id)}</td><td><b>${esc(p.tg_name)}</b><div class="muted" style="font-size:11px">${esc(p.tg_username)}</div></td><td class="mono">${esc(p.short || '—')}</td><td>${esc(p.plan_name)}</td><td><b>${sum(p.amount)}</b></td><td>${photo}</td><td class="muted">${dt(p.created)}</td><td style="white-space:nowrap">${act}</td></tr>`;
    }).join('');
  }

  const codeStyle = { active: ['Faol', 'background:#1E2C14;color:#CFF59A'], unused: ['Ishlatilmagan', 'background:#33260F;color:#FFCB7A'], expired: ['Muddati tugagan', 'background:#23272F;color:#A8AEBA'], revoked: ['Bekor qilingan', 'background:#2A1316;color:#FF9A9A'] };
  function renderCodes() {
    if (!data.codes.length) { $('#codeRows').innerHTML = `<tr><td colspan="5" class="muted" style="padding:20px">Kod hali yo'q</td></tr>`; return; }
    $('#codeRows').innerHTML = data.codes.map((c) => {
      const [label, st] = codeStyle[c.status] || ['?', ''];
      const who = [c.tgUsername, c.shortId].filter(Boolean).join(' · ') || c.createdBy;
      const exp = c.status === 'active' ? `<div class="muted" style="font-size:11px">${c.expiresAt ? new Date(c.expiresAt).toLocaleDateString('ru-RU') + ' gacha' : 'umrbod'}</div>` : '';
      return `<tr><td class="mono" style="font-weight:600;white-space:nowrap">${esc(c.code)} <button class="btn ghost" style="height:26px;padding:0 6px" data-copy="${esc(c.code)}" aria-label="Nusxalash">⧉</button></td><td>${esc(c.planName)}</td><td class="muted">${esc(who)}</td><td><span class="pill" style="${st}">${label}</span>${exp}</td><td>${c.status === 'active' || c.status === 'unused' ? `<button class="btn ghost" style="height:28px" data-revoke="${esc(c.code)}">Bekor qilish</button>` : ''}</td></tr>`;
    }).join('');
  }

  function renderDevices() {
    const trial = data.settings.trialMinutes * 60;
    if (!data.devices.length) { $('#devRows').innerHTML = `<tr><td colspan="6" class="muted" style="padding:20px">Hali hech kim kirmagan</td></tr>`; return; }
    $('#devRows').innerHTML = data.devices.map((d) => {
      const state = d.pro ? `<span class="pill" style="background:#1E2C14;color:#CFF59A">PRO</span>` : d.usedSec >= trial ? `<span class="pill" style="background:#2A1316;color:#FF9A9A">Sinov tugagan</span>` : `<span class="pill" style="background:#18233A;color:#A9C8FF">Sinovda</span>`;
      return `<tr><td class="mono">${esc(d.shortId)}</td><td>${state}</td><td class="mono">${Math.floor(d.usedSec / 60)}:${String(d.usedSec % 60).padStart(2, '0')}</td><td class="muted">${dt(d.firstSeen)}</td><td class="muted">${dt(d.lastSeen)}</td><td>${!d.pro ? `<button class="btn ghost" style="height:28px" data-reset="${esc(d.shortId)}">Sinovni yangilash</button>` : ''}</td></tr>`;
    }).join('');
  }

  function renderBot() {
    const b = data.bot;
    $('#botBadge').innerHTML = `<span class="dot" style="background:${b.connected ? 'var(--accent)' : 'var(--red)'}"></span>${b.connected ? 'Bot: @' + esc(b.username) : 'Bot ulanmagan'}`;
    $('#botState').innerHTML = b.connected ? `<span style="color:var(--accent)">Ulangan: <b>@${esc(b.username)}</b></span> · <a href="https://t.me/${esc(b.username)}" target="_blank" rel="noopener">botni ochish</a>` : '<span class="muted">Hali ulanmagan</span>';
    $('#chatState').innerHTML = b.adminChat ? `<span style="color:var(--accent)">Bog'langan: ${esc(b.adminChatName)}</span>` : '<span class="muted">Bog\'lanmagan</span>';
    $('#linkChat').disabled = !b.connected; $('#testChat').disabled = !b.adminChat;
  }

  function fillForms() {
    const s = data.settings;
    $('#cardNum').value = s.card.number; $('#cardHolder').value = s.card.holder; $('#cardSys').value = s.card.system;
    updateCardView();
    $('#trialMin').value = s.trialMinutes;
    tariffs = s.tariffs.map((t) => ({ ...t }));
    renderTariffs();
    botFlags = { ...s.bot };
    renderBotFlags();
    $('#genPlan').innerHTML = s.tariffs.map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');
  }

  // ---------- Karta ----------
  function updateCardView() {
    $('#cvNum').textContent = fmtCard($('#cardNum').value) || '0000 0000 0000 0000';
    $('#cvHolder').textContent = $('#cardHolder').value || 'Karta egasi';
    $('#cvSys').textContent = $('#cardSys').value;
  }
  $('#cardNum').addEventListener('input', (e) => {
    e.target.value = fmtCard(e.target.value);
    const d = e.target.value.replace(/\D/g, '');
    if (d.startsWith('9860')) $('#cardSys').value = 'HUMO';
    else if (d.startsWith('8600') || d.startsWith('5614')) $('#cardSys').value = 'UZCARD';
    else if (d.startsWith('4')) $('#cardSys').value = 'VISA';
    else if (d.startsWith('5')) $('#cardSys').value = 'MASTERCARD';
    updateCardView();
  });
  $('#cardHolder').addEventListener('input', updateCardView);
  $('#cardSys').addEventListener('change', updateCardView);
  $('#saveCard').addEventListener('click', async () => {
    try { await api('/api/admin/settings', { method: 'PUT', body: { card: { number: $('#cardNum').value, holder: $('#cardHolder').value, system: $('#cardSys').value } } }); toast('Karta saqlandi'); load(); }
    catch (e) { toast(e.message); }
  });

  // ---------- Tariflar ----------
  function renderTariffs() {
    $('#tariffRows').innerHTML = tariffs.map((t, i) => `<tr>
      <td><input data-t="${i}" data-f="id" value="${esc(t.id)}" class="mono" style="width:64px" maxlength="4" aria-label="Tarif kodi"></td>
      <td><input data-t="${i}" data-f="name" value="${esc(t.name)}" style="width:100%;min-width:90px" aria-label="Nomi"></td>
      <td><input data-t="${i}" data-f="days" type="number" min="0" value="${t.days}" class="mono" style="width:80px" aria-label="Kun"></td>
      <td><input data-t="${i}" data-f="price" type="number" min="0" step="1000" value="${t.price}" class="mono" style="width:110px" aria-label="Narx"></td>
      <td><button class="btn ghost ${t.active ? 'on' : ''}" data-tact="${i}" aria-pressed="${t.active}" aria-label="Faol" style="padding:0 6px"><span class="switch"></span></button></td>
      <td><button class="btn ghost" data-tdel="${i}" aria-label="O'chirish">✕</button></td></tr>`).join('');
  }
  $('#tariffRows').addEventListener('input', (e) => {
    const i = e.target.dataset.t; if (i === undefined) return;
    const f = e.target.dataset.f;
    tariffs[i][f] = f === 'days' || f === 'price' ? Number(e.target.value) : e.target.value;
  });
  $('#tariffRows').addEventListener('click', (e) => {
    const a = e.target.closest('[data-tact]'), d = e.target.closest('[data-tdel]');
    if (a) { tariffs[a.dataset.tact].active = !tariffs[a.dataset.tact].active; renderTariffs(); }
    if (d) { tariffs.splice(d.dataset.tdel, 1); renderTariffs(); }
  });
  $('#addTariff').addEventListener('click', () => { tariffs.push({ id: '3M', name: '3 oy', days: 90, price: 0, active: true }); renderTariffs(); });
  $('#saveTariffs').addEventListener('click', async () => {
    try { await api('/api/admin/settings', { method: 'PUT', body: { tariffs, trialMinutes: Number($('#trialMin').value) } }); toast('Tariflar saqlandi'); await load(true); }
    catch (e) { toast(e.message); }
  });

  // ---------- Bot ----------
  function renderBotFlags() {
    document.querySelectorAll('.toggle[data-k]').forEach((b) => { b.classList.toggle('on', !!botFlags[b.dataset.k]); b.setAttribute('aria-pressed', !!botFlags[b.dataset.k]); });
  }
  document.querySelectorAll('.toggle[data-k]').forEach((b) => b.addEventListener('click', async () => {
    botFlags[b.dataset.k] = !botFlags[b.dataset.k]; renderBotFlags();
    try { await api('/api/admin/settings', { method: 'PUT', body: { bot: { [b.dataset.k]: botFlags[b.dataset.k] } } }); toast('Saqlandi'); }
    catch (e) { toast(e.message); }
  }));
  $('#botConnect').addEventListener('click', async () => {
    const btn = $('#botConnect'); btn.disabled = true;
    try {
      const r = await api('/api/admin/bot', { method: 'POST', body: { action: 'connect', token: $('#botToken').value.trim() } });
      $('#botToken').value = '';
      toast('Bot ulandi: @' + r.username); await load();
    } catch (e) { toast(e.message, 5000); } finally { btn.disabled = false; }
  });
  $('#linkChat').addEventListener('click', async () => {
    try {
      const r = await api('/api/admin/bot', { method: 'POST', body: { action: 'linkcode' } });
      const url = `https://t.me/${r.username}?start=admin_${r.code}`;
      $('#linkBox').hidden = false;
      $('#linkBox').innerHTML = `Telefoningizda shu havolani oching va <b>START</b> ni bosing:<br><a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a><br><span class="muted small">Yoki botga yozing: <code>/admin ${esc(r.code)}</code> · Kod 15 daqiqa amal qiladi.</span>`;
      const t0 = Date.now();
      const poll = setInterval(async () => {
        if (Date.now() - t0 > 15 * 60000) return clearInterval(poll);
        try { await load(); if (data.bot.adminChat) { clearInterval(poll); $('#linkBox').hidden = true; toast("Admin chati bog'landi"); } } catch (_) {}
      }, 4000);
    } catch (e) { toast(e.message); }
  });
  $('#testChat').addEventListener('click', async () => {
    try { await api('/api/admin/bot', { method: 'POST', body: { action: 'test' } }); toast('Telegram\'ga sinov xabari yuborildi'); } catch (e) { toast(e.message); }
  });

  $('#genCode').addEventListener('click', async () => {
    try {
      const r = await api('/api/admin/codes', { method: 'POST', body: { action: 'create', planId: $('#genPlan').value } });
      try { await navigator.clipboard.writeText(r.code.code); } catch (_) {}
      toast('Yangi kod: ' + r.code.code + ' (nusxalandi)', 4000); load();
    } catch (e) { toast(e.message); }
  });
  $('#payFilter').addEventListener('change', renderPayments);

  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-ok],[data-no],[data-revoke],[data-reset],[data-copy],[data-photo]');
    if (!t) return;
    try {
      if (t.dataset.ok) {
        t.disabled = true;
        const r = await api('/api/admin/pay', { method: 'POST', body: { action: 'approve', id: t.dataset.ok } });
        toast('Tasdiqlandi. Kod: ' + r.code.code + (r.warn && r.warn.length ? ' · ' + r.warn.join(' ') : ''), 5000);
      } else if (t.dataset.no) {
        if (!confirm("To'lovni rad etasizmi?")) return;
        await api('/api/admin/pay', { method: 'POST', body: { action: 'reject', id: t.dataset.no } }); toast('Rad etildi');
      } else if (t.dataset.revoke) {
        if (!confirm(t.dataset.revoke + " kodini bekor qilasizmi? Foydalanuvchida PRO o'chadi.")) return;
        await api('/api/admin/codes', { method: 'POST', body: { action: 'revoke', code: t.dataset.revoke } }); toast('Bekor qilindi');
      } else if (t.dataset.reset) {
        await api('/api/admin/device', { method: 'POST', body: { action: 'reset', shortId: t.dataset.reset } }); toast('Sinov vaqti yangilandi');
      } else if (t.dataset.copy) { await navigator.clipboard.writeText(t.dataset.copy); toast('Nusxalandi'); return; }
      else if (t.dataset.photo) {
        t.textContent = '…';
        const r = await fetch('/api/admin/photo?id=' + encodeURIComponent(t.dataset.photo), { headers: { authorization: 'Bearer ' + CFG.token } });
        t.textContent = 'Chek';
        if (!r.ok) throw new Error("Chek rasmini olib bo'lmadi");
        const url = URL.createObjectURL(await r.blob());
        const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = `<img alt="Chek" src="${url}">`;
        m.onclick = () => { m.remove(); URL.revokeObjectURL(url); };
        document.body.appendChild(m);
        return;
      }
      load();
    } catch (err) { toast(err.message, 4000); t.disabled = false; if (err.auth) showLogin(err.message); }
  });

  // ---------- Boshlash ----------
  if (location.protocol === 'file:') {
    showLogin("Bu sahifa sayt orqali ochilishi kerak: https://az-arena.pages.dev/admin");
  } else if (CFG.token) {
    load(true).then(() => { $('#app').hidden = false; }).catch((e) => showLogin(e.message));
  } else showLogin();
  setInterval(() => { if (!$('#app').hidden && !document.hidden) load().catch(() => {}); }, 15000);
})();
