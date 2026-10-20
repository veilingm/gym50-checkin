(function () {
  'use strict';

  const SVGNS = 'http://www.w3.org/2000/svg';
  const DAY_MS = 86400000;

  function el(tag, attrs, parent) {
    const n = document.createElementNS(SVGNS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function daysBetween(a, b) { return Math.round((startOfDay(b) - startOfDay(a)) / DAY_MS); }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function weekdayOf(d) { return (d.getDay() + 6) % 7; }
  function fmtDate(d) { return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日'; }

  // ---- cumulative progress line chart ----------------------------------------
  // cfg: {width(px), height(px), start:Date, end:Date, target, sessions:[{date:Date,minutes}], tooltip}
  function drawLineChart(svg, cfg) {
    svg.innerHTML = '';
    const W = cfg.width, H = cfg.height;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);

    const padL = 30, padR = 14, padT = 12, padB = 20;
    const iw = W - padL - padR, ih = H - padT - padB;
    const totalDays = Math.max(1, daysBetween(cfg.start, cfg.end) + 1);

    const byDay = new Array(totalDays).fill(0);
    for (const s of cfg.sessions) {
      const idx = daysBetween(cfg.start, s.date);
      if (idx >= 0 && idx < totalDays) byDay[idx] += 1;
    }
    const cum = [];
    let run = 0;
    for (let i = 0; i < totalDays; i++) { run += byDay[i]; cum.push(run); }

    const yMax = Math.max(cfg.target, cum[cum.length - 1] || 0, 1);
    const x = (i) => padL + (totalDays === 1 ? 0 : (i / (totalDays - 1)) * iw);
    const y = (v) => padT + ih - (v / yMax) * ih;

    const step = Math.max(1, Math.ceil(yMax / 4));
    for (let v = 0; v <= yMax; v += step) {
      const gy = y(v);
      el('line', { x1: padL, x2: W - padR, y1: gy, y2: gy, class: 'grid-line' }, svg);
      const t = el('text', { x: padL - 5, y: gy + 3.5, 'text-anchor': 'end', class: 'tick' }, svg);
      t.textContent = v;
    }

    const marks = [0, Math.floor((totalDays - 1) / 2), totalDays - 1];
    const seen = new Set();
    for (const m of marks) {
      if (seen.has(m)) continue;
      seen.add(m);
      const d = addDays(cfg.start, m);
      const t = el('text', {
        x: x(m), y: H - 6,
        'text-anchor': m === 0 ? 'start' : (m === totalDays - 1 ? 'end' : 'middle'),
        class: 'tick',
      }, svg);
      t.textContent = (d.getMonth() + 1) + '/' + d.getDate();
    }

    el('line', {
      x1: x(0), y1: y(0), x2: x(totalDays - 1), y2: y(cfg.target), class: 'pace-line',
    }, svg);

    let dStr = 'M' + x(0) + ' ' + y(cum[0]);
    for (let i = 1; i < totalDays; i++) dStr += 'L' + x(i) + ' ' + y(cum[i]);
    el('path', { d: dStr, class: 'actual-line' }, svg);

    const lastVal = cum[totalDays - 1];
    el('circle', { cx: x(totalDays - 1), cy: y(lastVal), r: 4, class: 'end-dot' }, svg);
    const lbl = el('text', { x: x(totalDays - 1) - 7, y: y(lastVal) - 9, 'text-anchor': 'end', class: 'end-label' }, svg);
    lbl.textContent = lastVal;

    const cross = el('line', { y1: padT, y2: padT + ih, class: 'cross-line hidden' }, svg);
    const focus = el('circle', { r: 4.5, class: 'focus-dot hidden' }, svg);
    const hit = el('rect', { x: 0, y: 0, width: W, height: H, fill: 'transparent' }, svg);

    function show(clientX, clientY, forceIdx) {
      let i;
      if (forceIdx != null) {
        i = forceIdx;
      } else {
        const rect = svg.getBoundingClientRect();
        const px = ((clientX - rect.left) / rect.width) * W;
        i = Math.max(0, Math.min(totalDays - 1, Math.round(((px - padL) / iw) * (totalDays - 1))));
      }
      cross.setAttribute('x1', x(i));
      cross.setAttribute('x2', x(i));
      cross.classList.remove('hidden');
      focus.setAttribute('cx', x(i));
      focus.setAttribute('cy', y(cum[i]));
      focus.setAttribute('data-i', i);
      focus.classList.remove('hidden');
      const d = addDays(cfg.start, i);
      const pace = Math.round((cfg.target * i) / (totalDays - 1));
      cfg.tooltip.show(
        forceIdx != null ? svg.getBoundingClientRect().left + (x(i) / W) * svg.getBoundingClientRect().width : clientX,
        forceIdx != null ? svg.getBoundingClientRect().top + (y(cum[i]) / H) * svg.getBoundingClientRect().height : clientY,
        fmtDate(d),
        [
          { name: '实际', val: cum[i] + ' 次' },
          { name: '节奏', val: pace + ' 次' },
        ]
      );
    }
    function hide() {
      cross.classList.add('hidden');
      focus.classList.add('hidden');
      cfg.tooltip.hide();
    }
    hit.addEventListener('pointermove', (e) => show(e.clientX, e.clientY));
    hit.addEventListener('pointerleave', hide);
    svg.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const cur = focus.classList.contains('hidden') ? totalDays - 1 : (+focus.getAttribute('data-i') || 0);
      const next = Math.max(0, Math.min(totalDays - 1, cur + (e.key === 'ArrowRight' ? 1 : -1)));
      show(null, null, next);
    });
    svg.addEventListener('blur', hide);
  }

  // ---- year heatmap ------------------------------------------------------------
  // cfg: {width(px), start:Date, end:Date, sessions, today:Date, tooltip}
  function drawHeatmap(svg, cfg) {
    svg.innerHTML = '';
    const totalDays = daysBetween(cfg.start, cfg.end) + 1;
    const lead = weekdayOf(cfg.start);
    const weeks = Math.ceil((totalDays + lead) / 7);
    const colW = Math.max(12.5, cfg.width / weeks);
    const cell = Math.min(11, colW - 3);
    const gap = 3;
    const rowH = cell + gap;
    const topPad = 14;
    const H = topPad + 7 * rowH - gap + 2;
    const totalW = Math.round(colW * weeks);
    svg.setAttribute('viewBox', '0 0 ' + totalW + ' ' + H);
    svg.setAttribute('width', totalW);
    svg.setAttribute('height', H);
    svg.style.width = totalW + 'px';
    svg.style.height = 'auto';

    const byDay = new Map();
    for (const s of cfg.sessions) {
      const k = startOfDay(s.date).getTime();
      byDay.set(k, (byDay.get(k) || 0) + 1);
    }

    let lastMonth = -1;
    for (let i = 0; i < totalDays; i++) {
      const d = addDays(cfg.start, i);
      if (d.getMonth() !== lastMonth) {
        lastMonth = d.getMonth();
        const wk = Math.floor((i + lead) / 7);
        const t = el('text', { x: wk * colW + 1, y: 10, class: 'tick' }, svg);
        t.textContent = (d.getMonth() + 1) + '月';
      }
    }

    const todayKey = startOfDay(cfg.today).getTime();
    for (let i = 0; i < totalDays; i++) {
      const d = addDays(cfg.start, i);
      const wd = weekdayOf(d);
      const wk = Math.floor((i + lead) / 7);
      const key = startOfDay(d).getTime();
      const n = byDay.get(key) || 0;
      const cls = n === 0 ? 'heat-c0' : (n === 1 ? 'heat-c1' : (n === 2 ? 'heat-c2' : 'heat-c3'));
      const r = el('rect', {
        x: (wk * colW).toFixed(2), y: topPad + wd * rowH,
        width: cell, height: cell, rx: 2.5, class: cls,
      }, svg);
      if (key > todayKey) r.classList.add('heat-future');
      if (key === todayKey) r.classList.add('heat-today');

      r.addEventListener('pointerenter', (e) => {
        const mins = cfg.sessions.filter((s) => startOfDay(s.date).getTime() === key).map((s) => s.minutes);
        cfg.tooltip.show(e.clientX, e.clientY, fmtDate(d), [
          { name: '训练', val: mins.length ? mins.join(' / ') + ' 分钟' : '无记录' },
        ]);
        r.style.opacity = 0.7;
      });
      r.addEventListener('pointerleave', () => { r.style.opacity = ''; cfg.tooltip.hide(); });
    }
  }

  window.Charts = { drawLineChart, drawHeatmap, startOfDay, daysBetween, addDays };
})();
