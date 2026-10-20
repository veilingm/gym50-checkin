(function () {
  'use strict';

  const LS_SETTINGS = 'gym50.settings';
  const LS_SESSIONS = 'gym50.sessions';
  const LS_THEME = 'gym50.theme';
  const LS_TIMER = 'gym50.timer';

  const $ = (id) => document.getElementById(id);
  const WD = ['一', '二', '三', '四', '五', '六', '日'];

  const pad2 = (n) => (n < 10 ? '0' + n : '' + n);
  const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const toStr = (d) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  const today = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const daysBetween = (a, b) => Math.round((b - a) / 86400000);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // ---- state -------------------------------------------------------------------
  let settings = { start: toStr(today()), target: 50, goalMin: 60 };
  let sessions = [];
  let timer = { state: 'idle', startedAt: null, acc: 0, notified: false };
  let tickHandle = null;
  let wakeLock = null;
  let editId = null;

  const end = () => addDays(parseDate(settings.start), 364);
  const inWindow = (d) => daysBetween(parseDate(settings.start), d) >= 0 && daysBetween(d, end()) >= 0;
  const qualifies = (s) => s.minutes >= settings.goalMin;
  const counted = () => sessions.filter((s) => qualifies(s) && inWindow(parseDate(s.date)));

  function load() {
    try {
      const st = JSON.parse(localStorage.getItem(LS_SETTINGS));
      if (st && st.start && st.target > 0 && st.goalMin > 0) settings = st;
    } catch (e) { /* fresh start */ }
    try {
      const ss = JSON.parse(localStorage.getItem(LS_SESSIONS));
      if (Array.isArray(ss)) sessions = ss.filter((s) => s && s.date && s.minutes > 0);
    } catch (e) { /* fresh start */ }
    try {
      const t = JSON.parse(localStorage.getItem(LS_TIMER));
      if (t && (t.state === 'running' || t.state === 'paused')) {
        timer = { state: t.state, startedAt: t.startedAt, acc: t.acc || 0, notified: t.notified || false };
      }
    } catch (e) { /* fresh start */ }
  }

  function saveSettings() { localStorage.setItem(LS_SETTINGS, JSON.stringify(settings)); }
  function saveSessions() { localStorage.setItem(LS_SESSIONS, JSON.stringify(sessions)); }
  function saveTimer() { localStorage.setItem(LS_TIMER, JSON.stringify(timer)); }

  // ---- tooltip -------------------------------------------------------------------
  const tooltip = {
    el: $('tooltip'),
    show(x, y, title, rows) {
      const el = this.el;
      el.textContent = '';
      const h = document.createElement('div');
      h.className = 'tt-title';
      h.textContent = title;
      el.appendChild(h);
      for (const r of rows) {
        const row = document.createElement('div');
        row.className = 'tt-row';
        const n = document.createElement('span');
        n.textContent = r.name;
        const v = document.createElement('b');
        v.textContent = r.val;
        row.appendChild(n);
        row.appendChild(v);
        el.appendChild(row);
      }
      el.classList.remove('hidden');
      const w = el.offsetWidth, hgt = el.offsetHeight;
      let left = clamp(x - w / 2, 8, window.innerWidth - w - 8);
      let top = y - hgt - 14;
      if (top < 8) top = y + 18;
      el.style.left = left + 'px';
      el.style.top = top + 'px';
    },
    hide() { this.el.classList.add('hidden'); },
  };

  // ---- toast -------------------------------------------------------------------
  let toastHandle = null;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toastHandle);
    toastHandle = setTimeout(() => t.classList.add('hidden'), 2600);
  }

  // ---- pace math ------------------------------------------------------------------
  function paceInfo() {
    const start = parseDate(settings.start);
    const totalDays = daysBetween(start, end()) + 1;
    const elapsed = clamp(daysBetween(start, today()) + 1, 0, totalDays);
    const expected = (settings.target * elapsed) / totalDays;
    return { totalDays, elapsed, expected, actual: counted().length };
  }

  // ---- render -------------------------------------------------------------------
  function renderHeader() {
    const s = parseDate(settings.start), e = end();
    $('yearRange').textContent = s.getFullYear() + '.' + pad2(s.getMonth() + 1) + '.' + pad2(s.getDate())
      + ' – ' + e.getFullYear() + '.' + pad2(e.getMonth() + 1) + '.' + pad2(e.getDate());
    $('titleTarget').textContent = settings.target;
    $('targetCount').textContent = settings.target;
  }

  function renderTally() {
    const { expected, actual } = paceInfo();
    const done = actual;
    $('doneCount').textContent = done;

    const chip = $('paceChip');
    const diff = actual - expected;
    chip.textContent = '';
    chip.className = 'chip';
    if (done >= settings.target) {
      chip.classList.add('chip-good');
      chip.textContent = '挑战完成';
    } else if (diff >= 0.5) {
      chip.classList.add('chip-good');
      chip.textContent = '领先 ' + Math.round(diff) + ' 次';
    } else if (diff <= -0.5) {
      chip.classList.add('chip-bad');
      chip.textContent = '落后 ' + Math.round(-diff) + ' 次';
    } else {
      chip.classList.add('chip-flat');
      chip.textContent = '节奏持平';
    }

    const dots = $('dots');
    dots.textContent = '';
    const paceFloor = Math.floor(expected);
    for (let i = 0; i < settings.target; i++) {
      const d = document.createElement('span');
      d.className = 'dot ' + (i < done ? 'dot-done' : (i < paceFloor ? 'dot-pace' : 'dot-empty'));
      dots.appendChild(d);
    }
    dots.setAttribute('aria-label', '已完成 ' + done + ' 次，共 ' + settings.target + ' 次目标');

    $('tallyFoot').textContent = done >= settings.target
      ? '目标达成，明年年卡到手'
      : '还差 ' + (settings.target - done) + ' 次达标训练';
  }

  function renderStats() {
    const t = today();
    const cnt = counted();
    $('stMonth').textContent = cnt.filter((s) => {
      const d = parseDate(s.date);
      return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth();
    }).length;

    const start = parseDate(settings.start);
    const totalDays = daysBetween(start, end()) + 1;
    const perWeek = Math.max(1, Math.ceil((settings.target * 7) / totalDays));
    const qualByWeek = new Map();
    for (const s of cnt) {
      const d = parseDate(s.date);
      const wk = Math.floor((daysBetween(start, d) + ((start.getDay() + 6) % 7)) / 7);
      qualByWeek.set(wk, (qualByWeek.get(wk) || 0) + 1);
    }
    let curWk = Math.floor((daysBetween(start, t) + ((start.getDay() + 6) % 7)) / 7);
    let streak = 0;
    let w = (qualByWeek.get(curWk) || 0) >= perWeek ? curWk : curWk - 1;
    while (w >= 0 && (qualByWeek.get(w) || 0) >= perWeek) { streak++; w--; }
    $('stStreak').textContent = streak;

    const inWin = sessions.filter((s) => inWindow(parseDate(s.date)));
    $('stAvg').textContent = inWin.length ? Math.round(inWin.reduce((a, s) => a + s.minutes, 0) / inWin.length) : '–';

    $('stDays').textContent = Math.max(0, daysBetween(t, end()) + 1);
  }

  function renderCharts() {
    const line = $('lineChart');
    const lineW = Math.max(260, line.parentElement.clientWidth - 2);
    Charts.drawLineChart(line, {
      width: lineW, height: 190,
      start: parseDate(settings.start), end: end(),
      target: settings.target,
      sessions: sessions
        .filter((s) => qualifies(s) && inWindow(parseDate(s.date)))
        .map((s) => ({ date: parseDate(s.date), minutes: s.minutes })),
      tooltip,
    });

    const heat = $('heatmap');
    const heatW = Math.max(280, heat.parentElement.clientWidth - 2);
    Charts.drawHeatmap(heat, {
      width: heatW,
      start: parseDate(settings.start), end: end(),
      sessions: sessions.map((s) => ({ date: parseDate(s.date), minutes: s.minutes })),
      today: today(),
      tooltip,
    });
  }

  function renderLog() {
    const list = sessions
      .filter((s) => inWindow(parseDate(s.date)))
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    const ul = $('log');
    ul.textContent = '';
    $('logEmpty').classList.toggle('hidden', list.length > 0);
    for (const s of list) {
      const d = parseDate(s.date);
      const li = document.createElement('li');
      li.className = 'log-row';

      const date = document.createElement('span');
      date.className = 'log-date';
      const main = document.createElement('span');
      main.textContent = (d.getMonth() + 1) + '月' + d.getDate() + '日';
      const wd = document.createElement('span');
      wd.className = 'wd';
      wd.textContent = '周' + WD[d.getDay()];
      date.appendChild(main);
      date.appendChild(wd);

      const min = document.createElement('span');
      min.className = 'log-min num';
      const mv = document.createElement('span');
      mv.textContent = s.minutes;
      const mu = document.createElement('span');
      mu.className = 'unit';
      mu.textContent = ' 分钟';
      min.appendChild(mv);
      min.appendChild(mu);

      const st = document.createElement('span');
      st.className = 'log-status ' + (qualifies(s) ? 'ok' : 'warn');
      const dot = document.createElement('i');
      const stTxt = document.createElement('span');
      stTxt.textContent = qualifies(s) ? '达标' : '未达标';
      st.appendChild(dot);
      st.appendChild(stTxt);

      const btn = document.createElement('button');
      btn.className = 'row-btn';
      btn.setAttribute('aria-label', '编辑记录');
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>';
      btn.addEventListener('click', () => openSessionDlg(s.id));

      li.appendChild(date);
      li.appendChild(min);
      li.appendChild(st);
      li.appendChild(btn);
      ul.appendChild(li);
    }
  }

  function renderTimer() {
    const C = 2 * Math.PI * 96;
    const ring = $('ringFill');
    ring.style.strokeDasharray = C;
    const elapsedMin = elapsedMs() / 60000;
    const frac = clamp(elapsedMin / settings.goalMin, 0, 1);
    ring.style.strokeDashoffset = C * (1 - frac);

    const ms = elapsedMs();
    const hh = Math.floor(ms / 3600000);
    const mm = Math.floor((ms % 3600000) / 60000);
    const ss = Math.floor((ms % 60000) / 1000);
    $('ringTime').textContent = hh > 0
      ? hh + ':' + pad2(mm) + ':' + pad2(ss)
      : pad2(mm) + ':' + pad2(ss);
    $('ringGoal').textContent = '目标 ' + settings.goalMin + ' 分钟';

    const badge = $('ringBadge');
    if (elapsedMin >= settings.goalMin && timer.state !== 'idle') {
      badge.textContent = '已达标';
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
    if (timer.state === 'idle') { $('ringTime').textContent = '00:00'; }
  }

  function renderTimerButtons() {
    const running = timer.state !== 'idle';
    $('btnTimer').textContent = timer.state === 'running' ? '暂停' : (timer.state === 'paused' ? '继续' : '开始训练');
    $('btnFinish').classList.toggle('hidden', !running);
    $('btnDiscard').classList.toggle('hidden', !running);
    $('btnDiscard').textContent = '放弃本次';
    $('btnDiscard').dataset.confirm = '';
  }

  function renderAll() {
    renderHeader();
    renderTally();
    renderStats();
    renderCharts();
    renderLog();
    renderTimer();
    renderTimerButtons();
  }

  // ---- timer -------------------------------------------------------------------
  function elapsedMs() {
    if (timer.state === 'running') return timer.acc + (Date.now() - timer.startedAt);
    if (timer.state === 'paused') return timer.acc;
    return 0;
  }

  function tick() {
    renderTimer();
    if (!timer.notified && elapsedMs() / 60000 >= settings.goalMin) {
      timer.notified = true;
      saveTimer();
      if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
      toast('已满 ' + settings.goalMin + ' 分钟，本次达标');
    }
  }

  async function acquireWakeLock() {
    try {
      if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
    } catch (e) { /* unsupported or denied */ }
  }
  function releaseWakeLock() {
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && timer.state === 'running') acquireWakeLock();
  });

  function startTimer() {
    timer.state = 'running';
    timer.startedAt = Date.now();
    timer.notified = false;
    saveTimer();
    acquireWakeLock();
    if (!tickHandle) tickHandle = setInterval(tick, 500);
    renderTimerButtons();
  }
  function pauseTimer() {
    timer.acc = elapsedMs();
    timer.state = 'paused';
    saveTimer();
    releaseWakeLock();
    renderTimerButtons();
  }
  function finishTimer() {
    const minutes = Math.round(elapsedMs() / 60000);
    resetTimer();
    if (minutes < 1) { toast('不足 1 分钟，未记录'); return; }
    sessions.push({ id: Date.now() + '-' + Math.random().toString(36).slice(2, 7), date: toStr(today()), minutes });
    sessions.sort((a, b) => (a.date < b.date ? -1 : 1));
    saveSessions();
    renderAll();
    if (minutes >= settings.goalMin) toast('已打卡，本次 ' + minutes + ' 分钟');
    else toast('已记录 ' + minutes + ' 分钟，未满 ' + settings.goalMin + ' 分钟不计入次数');
  }
  function discardTimer() {
    resetTimer();
    toast('已放弃本次训练');
  }
  function resetTimer() {
    timer = { state: 'idle', startedAt: null, acc: 0, notified: false };
    saveTimer();
    clearInterval(tickHandle);
    tickHandle = null;
    releaseWakeLock();
    renderTimer();
    renderTimerButtons();
  }

  // ---- dialogs -------------------------------------------------------------------
  function openSessionDlg(id) {
    editId = id || null;
    const dlg = $('dlgSession');
    $('dlgSessionTitle').textContent = id ? '编辑记录' : '补记训练';
    $('btnDeleteSession').classList.toggle('hidden', !id);
    if (id) {
      const s = sessions.find((x) => x.id === id);
      $('fDate').value = s.date;
      $('fMin').value = s.minutes;
    } else {
      $('fDate').value = toStr(today());
      $('fMin').value = settings.goalMin;
    }
    $('sessionErr').classList.add('hidden');
    dlg.showModal();
  }

  function submitSession(e) {
    e.preventDefault();
    const dateStr = $('fDate').value;
    const min = parseInt($('fMin').value, 10);
    const err = $('sessionErr');
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) { err.textContent = '请选择日期'; err.classList.remove('hidden'); return; }
    if (!Number.isFinite(min) || min < 1 || min > 600) { err.textContent = '时长需在 1–600 分钟之间'; err.classList.remove('hidden'); return; }
    const d = parseDate(dateStr);
    if (!inWindow(d)) { err.textContent = '日期需在挑战周期内'; err.classList.remove('hidden'); return; }
    if (editId) {
      const s = sessions.find((x) => x.id === editId);
      if (s) { s.date = dateStr; s.minutes = min; }
      toast('记录已更新');
    } else {
      sessions.push({ id: Date.now() + '-' + Math.random().toString(36).slice(2, 7), date: dateStr, minutes: min });
      toast(min >= settings.goalMin ? '已补记，' + min + ' 分钟达标' : '已补记 ' + min + ' 分钟');
    }
    sessions.sort((a, b) => (a.date < b.date ? -1 : 1));
    saveSessions();
    $('dlgSession').close();
    renderAll();
  }

  function deleteSession() {
    if (!editId) return;
    if (!window.confirm('删除这条记录？')) return;
    sessions = sessions.filter((x) => x.id !== editId);
    saveSessions();
    $('dlgSession').close();
    renderAll();
    toast('记录已删除');
  }

  function openSettingsDlg() {
    $('fStart').value = settings.start;
    $('fTarget').value = settings.target;
    $('fGoalMin').value = settings.goalMin;
    $('settingsErr').classList.add('hidden');
    $('dlgSettings').showModal();
  }

  function submitSettings(e) {
    e.preventDefault();
    const start = $('fStart').value;
    const target = parseInt($('fTarget').value, 10);
    const goalMin = parseInt($('fGoalMin').value, 10);
    const err = $('settingsErr');
    if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) { err.textContent = '请选择开始日期'; err.classList.remove('hidden'); return; }
    if (!Number.isFinite(target) || target < 1 || target > 365) { err.textContent = '目标次数需在 1–365 之间'; err.classList.remove('hidden'); return; }
    if (!Number.isFinite(goalMin) || goalMin < 1 || goalMin > 300) { err.textContent = '达标时长需在 1–300 分钟之间'; err.classList.remove('hidden'); return; }
    settings = { start, target, goalMin };
    saveSettings();
    $('dlgSettings').close();
    renderAll();
    toast('设置已保存');
  }

  function resetAll() {
    if (!window.confirm('清空全部打卡记录并恢复默认设置？')) return;
    localStorage.removeItem(LS_SESSIONS);
    localStorage.removeItem(LS_SETTINGS);
    localStorage.removeItem(LS_TIMER);
    settings = { start: toStr(today()), target: 50, goalMin: 60 };
    sessions = [];
    resetTimer();
    $('dlgSettings').close();
    renderAll();
    toast('已清空');
  }

  // ---- theme -------------------------------------------------------------------
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem(LS_THEME, t);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'dark' ? '#161615' : '#F4F4F1');
  }
  function toggleTheme() {
    applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  }

  // ---- wire up -------------------------------------------------------------------
  $('btnTimer').addEventListener('click', () => {
    if (timer.state === 'running') pauseTimer();
    else startTimer();
  });
  $('btnFinish').addEventListener('click', finishTimer);
  $('btnDiscard').addEventListener('click', () => {
    if ($('btnDiscard').dataset.confirm !== '1') {
      $('btnDiscard').dataset.confirm = '1';
      $('btnDiscard').textContent = '确认放弃？';
      setTimeout(() => { $('btnDiscard').dataset.confirm = ''; $('btnDiscard').textContent = '放弃本次'; }, 2600);
      return;
    }
    discardTimer();
  });
  $('btnAdd').addEventListener('click', () => openSessionDlg(null));
  $('btnSettings').addEventListener('click', openSettingsDlg);
  $('btnTheme').addEventListener('click', toggleTheme);
  $('formSession').addEventListener('submit', submitSession);
  $('btnSessionCancel').addEventListener('click', () => $('dlgSession').close());
  $('btnDeleteSession').addEventListener('click', deleteSession);
  $('formSettings').addEventListener('submit', submitSettings);
  $('btnSettingsCancel').addEventListener('click', () => $('dlgSettings').close());
  $('btnReset').addEventListener('click', resetAll);

  let resizeHandle = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeHandle);
    resizeHandle = setTimeout(renderCharts, 150);
  });

  // ---- boot -------------------------------------------------------------------
  load();
  if (timer.state === 'running') {
    acquireWakeLock();
    tickHandle = setInterval(tick, 500);
  }
  renderAll();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
