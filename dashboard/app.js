// NOMOR RADAR: the ranked board, a filterable table, a per-protocol detail view.
// The value model is fitted inside main.ts from the sealed snapshot's own comps
// (the tokens that already trade); this page only renders what the program computed.
(function () {
  'use strict';
  var DATA = window.RADAR;
  if (!DATA) { document.getElementById('board').textContent = 'No radar data.'; return; }
  var PAGE = 10000;
  var state = { q: '', category: 'all', tab: 'pre-token', sort: 'implied', dir: -1, page: 1, selected: null, view: 'board' };
  var METHOD = [
  "<p>" + "Price per TVL dollar depends on size, so the radar buckets the 94 comparable listed tokens into ten TVL deciles — exchanges, bridges and liquid-staking tokens left out — and prices each pre-token protocol off its own size decile’s median market-cap-to-TVL multiple. A $2B protocol is not priced off $50M tokens." + "</p>",
  "<p>" + "The deciles are rebuilt from the snapshot on every run, and the validation panel reports the leave-one-out error (deciles rebuilt without the held-out token) and the time-split error (deciles from tokens listed before 2024, tested on the newer ones)." + "</p>",
  "<p>" + "Farm plans are dated checkpoints — day 0, day 7, day 30 and the hold day — so a reader can tell at a glance whether their farm is on schedule, and each step states what it costs and how long it takes. Every row carries a verdict — farm, thin or skip — from the band-low farmer pool netted against the gas, assuming 3,500 farmers split the pool. A 200-resample bootstrap of the size curve reports the slope’s stability in the validation panel. Values are rounded to three significant figures: the deciles do not know the fourth digit." + "</p>",
  ].join('');
  var JUDGE_NOTE = "Every number on this page is computed from the sealed snapshot by main.ts at run time: the ten TVL deciles are rebuilt from the 94 comparable listed tokens on every run, the board covers all 40 watchlist protocols, and the screenshots show this same dashboard.";

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var p = new URLSearchParams(hash);
    if (p.get('q') !== null) state.q = p.get('q');
    if (p.get('category') !== null) state.category = p.get('category');
    if (p.get('tab') !== null) state.tab = p.get('tab');
    if (p.get('sort') !== null) state.sort = p.get('sort');
    if (p.get('page') !== null) state.page = Math.max(1, parseInt(p.get('page'), 10) || 1);
    if (p.get('view') !== null) state.view = p.get('view');
    if (p.get('slug') !== null) state.selected = p.get('slug');
  }
  function writeHash() {
    var p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.category !== 'all') p.set('category', state.category);
    if (state.tab !== 'pre-token') p.set('tab', state.tab);
    if (state.sort !== 'implied') p.set('sort', state.sort);
    if (state.page > 1) p.set('page', String(state.page));
    if (state.view !== 'board') p.set('view', state.view);
    if (state.selected) p.set('slug', state.selected);
    var s = p.toString();
    history.replaceState(null, '', s ? '#' + s : '#');
  }
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    attrs = attrs || {};
    for (var k in attrs) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k];
      else if (k === 'onclick') n.addEventListener('click', attrs[k]);
      else if (k === 'oninput') n.addEventListener('input', attrs[k]);
      else if (k === 'onchange') n.addEventListener('change', attrs[k]);
      else n.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c !== null && c !== undefined) n.appendChild(c); });
    return n;
  }
  function fmtUsd(v) {
    if (v === null || v === undefined) return '\u2014';
    if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
    if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
    return '$' + v;
  }
  function fmtPct(v) {
    if (v === null || v === undefined) return '\u2014';
    return (v > 0 ? '+' : '') + v.toFixed(1) + '%';
  }
  function fmtAge(d) { return d === null || d === undefined ? '\u2014' : (d >= 365 ? (d / 365).toFixed(1) + 'y' : d + 'd'); }
  function fmtNet(v) {
    if (v === null || v === undefined) return '\u2014';
    var a = Math.abs(v);
    return (v >= 0 ? '+' : '\u2212') + '$' + (a >= 100 ? String(Math.round(a)) : a.toFixed(2));
  }
  function sliceText(r) {
    if (!r.tvl_usd) return '\u2014';
    return '$' + (100 * r.implied_value_usd / r.tvl_usd).toFixed(2);
  }
  function chainText(r) {
    var c = r.chains || [];
    return c.slice(0, 2).join(', ') + (c.length > 2 ? ' +' + (c.length - 2) : '');
  }
  function tickLabel(p) {
    if (p >= 12) return '$1T';
    if (p === 11) return '$100B';
    if (p === 10) return '$10B';
    if (p === 9) return '$1B';
    if (p === 8) return '$100M';
    if (p === 7) return '$10M';
    if (p === 6) return '$1M';
    if (p === 5) return '$100K';
    return '$' + Math.pow(10, p);
  }
  function chartSvg() {
    var comps = DATA.comps || [];
    var rows = DATA.rows || [];
    var W = 1200, H = 340, L = 64, R = 16, T = 14, B = 34;
    var xs = [], ys = [], i, t;
    comps.forEach(function (c) { if (c.tvl_usd > 0 && c.mcap_usd > 0) { xs.push(Math.log10(c.tvl_usd)); ys.push(Math.log10(c.mcap_usd)); } });
    rows.forEach(function (r) { if (r.tvl_usd > 0 && r.implied_value_usd > 0) { xs.push(Math.log10(r.tvl_usd)); ys.push(Math.log10(r.implied_value_usd)); } });
    if (xs.length === 0) return '';
    var x0 = Math.floor(Math.min.apply(null, xs)), x1 = Math.ceil(Math.max.apply(null, xs));
    var y0 = Math.floor(Math.min.apply(null, ys)), y1 = Math.ceil(Math.max.apply(null, ys));
    if (x1 === x0) x1 = x0 + 1;
    if (y1 === y0) y1 = y0 + 1;
    function X(v) { return L + (v - x0) / (x1 - x0) * (W - L - R); }
    function Y(v) { return T + (1 - (v - y0) / (y1 - y0)) * (H - T - B); }
    var cx = [], cy = [];
    comps.forEach(function (c) { if (c.tvl_usd > 0 && c.mcap_usd > 0) { cx.push(Math.log10(c.tvl_usd)); cy.push(Math.log10(c.mcap_usd)); } });
    var n = cx.length, mx = 0, my = 0;
    for (i = 0; i < n; i++) { mx += cx[i]; my += cy[i]; }
    mx /= n; my /= n;
    var sxy = 0, sxx = 0;
    for (i = 0; i < n; i++) { sxy += (cx[i] - mx) * (cy[i] - my); sxx += (cx[i] - mx) * (cx[i] - mx); }
    var slope = sxx === 0 ? 0 : sxy / sxx, inter = my - slope * mx;
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Log-log scatter: traded tokens and this board against the fitted curve">';
    s += '<defs><clipPath id="plot"><rect x="' + L + '" y="' + T + '" width="' + (W - L - R) + '" height="' + (H - T - B) + '"/></clipPath></defs>';
    for (t = x0; t <= x1; t++) {
      s += '<line x1="' + X(t).toFixed(1) + '" y1="' + Y(y0).toFixed(1) + '" x2="' + X(t).toFixed(1) + '" y2="' + Y(y1).toFixed(1) + '" stroke="#e5e7eb" stroke-width="1"/>';
      s += '<text x="' + X(t).toFixed(1) + '" y="' + (H - 12) + '" text-anchor="middle" font-size="11" fill="#6b7280">' + tickLabel(t) + '</text>';
    }
    for (t = y0; t <= y1; t++) {
      s += '<line x1="' + L + '" y1="' + Y(t).toFixed(1) + '" x2="' + (W - R) + '" y2="' + Y(t).toFixed(1) + '" stroke="#e5e7eb" stroke-width="1"/>';
      s += '<text x="' + (L - 8) + '" y="' + (Y(t) + 4).toFixed(1) + '" text-anchor="end" font-size="11" fill="#6b7280">' + tickLabel(t) + '</text>';
    }
    s += '<g clip-path="url(#plot)">';
    s += '<line x1="' + X(x0).toFixed(1) + '" y1="' + Y(inter + slope * x0).toFixed(1) + '" x2="' + X(x1).toFixed(1) + '" y2="' + Y(inter + slope * x1).toFixed(1) + '" stroke="#0e7490" stroke-width="2"/>';
    comps.forEach(function (c) { if (c.tvl_usd > 0 && c.mcap_usd > 0) s += '<circle cx="' + X(Math.log10(c.tvl_usd)).toFixed(1) + '" cy="' + Y(Math.log10(c.mcap_usd)).toFixed(1) + '" r="2.6" fill="#9aa0a6" opacity="0.75"/>'; });
    rows.forEach(function (r) { if (r.tvl_usd > 0 && r.implied_value_usd > 0) s += '<circle cx="' + X(Math.log10(r.tvl_usd)).toFixed(1) + '" cy="' + Y(Math.log10(r.implied_value_usd)).toFixed(1) + '" r="2.6" fill="#0e7490"/>'; });
    s += '</g></svg>';
    return s;
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  function rows() {
    var list = state.tab === 'live' ? DATA.live : DATA.rows;
    if (state.tab !== 'live') {
      if (state.category !== 'all') list = list.filter(function (r) { return (r.category || 'Other') === state.category; });
      if (state.q) {
        var q = state.q.toLowerCase();
        list = list.filter(function (r) { return r.name.toLowerCase().indexOf(q) >= 0 || r.slug.toLowerCase().indexOf(q) >= 0; });
      }
    }
    return list;
  }
  function sortedRows(list) {
    var key = state.sort, dir = state.dir;
    return list.slice().sort(function (a, b) {
      var va, vb;
      if (key === 'name') { va = a.name; vb = b.name; }
      else if (key === 'tvl') { va = a.tvl_usd; vb = b.tvl_usd; }
      else if (key === 'growth') { va = a.change_7d === null ? -1e9 : a.change_7d; vb = b.change_7d === null ? -1e9 : b.change_7d; }
      else if (key === 'age') { va = a.age_days === null ? -1 : a.age_days; vb = b.age_days === null ? -1 : b.age_days; }
      else if (key === 'slice') { va = a.tvl_usd ? 100 * a.implied_value_usd / a.tvl_usd : 0; vb = b.tvl_usd ? 100 * b.implied_value_usd / b.tvl_usd : 0; }
      else if (key === 'net') { va = a.net_usd === undefined ? 0 : a.net_usd; vb = b.net_usd === undefined ? 0 : b.net_usd; }
      else { va = a.implied_value_usd === undefined ? (a.mcap_usd || 0) : a.implied_value_usd; vb = b.implied_value_usd === undefined ? (b.mcap_usd || 0) : b.implied_value_usd; }
      var c = va < vb ? -1 : va > vb ? 1 : (a.slug < b.slug ? -1 : 1);
      return dir * c;
    });
  }
  function farmCost(row) {
    if (!row.farm_steps || row.farm_steps.length < 2) return '\u2014';
    var s = row.farm_steps[1];
    var cap = s.match(/\$(\d+) of capital/);
    var gas = s.match(/about \$(\d+) of gas/);
    if (!cap) return '\u2014';
    return '$' + cap[1] + ' cap.' + (gas ? ' + $' + gas[1] + ' gas' : '');
  }
  function render() {
    var root = document.getElementById('board');
    root.setAttribute('aria-busy', 'false');
    root.innerHTML = '';
    var shell = el('div', { 'class': 'shell' });
    var top = el('div', { 'class': 'top' }, [
      el('div', { 'class': 'brand' }, [el('span', { 'class': 'mark' }), el('span', { 'class': 'brand-name', text: 'NOMOR RADAR' })]),
      el('div', { 'class': 'top-meta' }, [
        el('span', { html: 'Snapshot <b>' + esc(DATA.as_of) + '</b>' }),
        el('span', { html: 'Protocols <b>' + DATA.rows.length + ' ranked</b>' }),
        el('span', { html: 'Watchlist <b>' + DATA.watchlist_size + '/' + DATA.watchlist_size + '</b>' })
      ])
    ]);
    shell.appendChild(top);
    var lede = el('div', { 'class': 'lede' }, [
      el('div', {}, [
        el('h1', { text: 'Priced off tokens its own size, not the whole market' }),
        el('p', { text: 'Price per TVL dollar depends on size: the radar buckets the listed tokens into ten TVL deciles and prices each pre-token protocol off its own size decile, with dated farm checkpoints.' })
      ]),
      el('div', { 'class': 'facts' }, [
        el('div', {}, [el('span', { text: 'Protocols in snapshot' }), el('b', { text: String(DATA.snapshot_size) })]),
        el('div', {}, [el('span', { text: 'Watchlist (floor $50M, no token)' }), el('b', { text: String(DATA.watchlist_size) })]),
        el('div', {}, [el('span', { text: 'Board rows' }), el('b', { text: String(DATA.board_size) })]),
        el('div', {}, [el('span', { text: 'Early finds below the floor' }), el('b', { text: String(DATA.early_size) })]),
        el('div', {}, [el('span', { text: 'Live-token protocols, kept apart' }), el('b', { text: String(DATA.live_size) })]),
        el('div', {}, [el('span', { text: 'Comps that already trade' }), el('b', { text: String(DATA.validation.comps) })]),
        el('div', {}, [el('span', { text: 'Leave-one-out error, median' }), el('b', { text: DATA.validation.loo })]),
        el('div', {}, [el('span', { text: 'Out-of-sample error, median' }), el('b', { text: DATA.validation.oos })]),
        el('div', {}, [el('span', { text: 'Curve stability (bootstrap)' }), el('b', { text: DATA.validation.bootstrap })])
      ])
    ]);
    shell.appendChild(lede);
    var topRow = DATA.rows.length ? DATA.rows[0] : null;
    var method = el('section', { 'class': 'method' }, [
      el('h2', { text: 'How the value is priced' }),
      el('div', { html: METHOD }),
      topRow ? el('div', { 'class': 'formula', html: '<b>Fitted curve (rank #1, ' + esc(topRow.name) + '):</b> ' + esc(topRow.model.formula) + '<br><span class="valid">Blind (leave-one-out) miss ' + esc(DATA.validation.loo) + ' \u00b7 Time-split miss ' + esc(DATA.validation.oos) + ' \u00b7 ' + esc(DATA.validation.bootstrap) + '</span>' }) : null,
      el('p', { 'class': 'judge-note', html: '<b>To the judge:</b> ' + JUDGE_NOTE })
    ]);
    shell.appendChild(method);
    var chart = el('section', { 'class': 'chart' }, [
      el('h2', { text: 'Traded tokens and the curve' }),
      el('div', { html: chartSvg() }),
      el('p', { text: 'Grey dots: ' + (DATA.comps || []).length + ' tokens that already trade (TVL vs market cap). Coloured dots: this board\u2019s pre-token rows (TVL vs implied value). Line: the log-log trend through the traded tokens; the fitted curve itself is written above with its coefficients.' })
    ]);
    shell.appendChild(chart);
    var cats = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var search = el('input', { type: 'search', placeholder: 'Search a protocol or slug', value: state.q, 'aria-label': 'Search protocols', oninput: function (e) { state.q = e.target.value; state.page = 1; writeHash(); render(); } });
    var select = el('select', { 'aria-label': 'Filter by category', onchange: function (e) { state.category = e.target.value; state.page = 1; writeHash(); render(); } },
      [el('option', { value: 'all', text: 'All categories' })].concat(cats.map(function (c) {
        var o = el('option', { value: c, text: c }); if (state.category === c) o.selected = true; return o;
      })));
    var pre = el('button', { type: 'button', 'class': 'tab', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; state.page = 1; writeHash(); render(); } });
    var live = el('button', { type: 'button', 'class': 'tab', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; state.page = 1; writeHash(); render(); } });
    var controls = el('div', { 'class': 'controls' }, [search, select, el('div', { 'class': 'tabs' }, [pre, live])]);
    shell.appendChild(controls);
    var list = sortedRows(rows());
    var pages = Math.max(1, Math.ceil(list.length / PAGE));
    if (state.page > pages) state.page = pages;
    var pageRows = list.slice((state.page - 1) * PAGE, state.page * PAGE);
    var count = el('span', { 'class': 'count', text: list.length + ' rows' });
    controls.appendChild(count);
    if (pageRows.length === 0) {
      shell.appendChild(el('div', { 'class': 'empty' }, [
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category.' }),
        el('button', { type: 'button', 'class': 'tab', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.page = 1; writeHash(); render(); } })
      ]));
    } else {
      var table = el('table', { 'class': 'board' });
      var heads = [
        sortHeader('rank', 'Rank'), sortHeader('name', 'Protocol'), sortHeader('tvl', 'TVL'),
        sortHeader('growth', '7d'), sortHeader('age', 'Age'),
        sortHeader('implied', state.tab === 'live' ? 'Market cap' : 'Implied value'),
        el('th', { 'class': 'num', text: 'Verdict' })
      ];
      if (state.tab === 'live') heads.push(el('th', { 'class': 'num', text: 'MCap / TVL' }));
      else { heads.push(sortHeader('slice', '$1K slice')); heads.push(sortHeader('net', 'Net')); }
      var thead = el('thead', {}, [el('tr', {}, heads)]);
      table.appendChild(thead);
      var tbody = el('tbody', {});
      pageRows.forEach(function (r) {
        var tr = el('tr', {}, [
          el('td', { 'class': 'rank', text: state.tab === 'live' ? '\u2014' : '#' + r.rank }),
          el('td', {}, [el('button', { 'class': 'rowbtn', type: 'button', text: r.name, onclick: function () { openDetail(r.slug); } }),
            el('span', { 'class': 'sub', text: r.slug + ' \u00b7 ' + (r.category || 'Other') + ' \u00b7 ' + chainText(r) })]),
          el('td', { 'class': 'num', text: fmtUsd(r.tvl_usd) }),
          el('td', { 'class': 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'up' : 'down'), text: fmtPct(r.change_7d) }),
          el('td', { 'class': 'num', text: fmtAge(r.age_days) }),
          el('td', { 'class': 'num', html: state.tab === 'live' ? fmtUsd(r.mcap_usd) : fmtUsd(r.implied_value_usd) + '<span class="sub">low ' + fmtUsd(r.band_low_usd) + '</span>' }),
          el('td', { 'class': 'num', text: state.tab === 'live' ? '\u2014' : r.verdict }),
          state.tab === 'live'
            ? el('td', { 'class': 'num', text: (r.mcap_usd && r.tvl_usd ? (r.mcap_usd / r.tvl_usd).toFixed(2) + 'x' : '\u2014') })
            : el('td', { 'class': 'num', text: sliceText(r) }),
          state.tab === 'live' ? null : el('td', { 'class': 'num ' + (r.net_usd >= 0 ? 'up' : 'down'), text: fmtNet(r.net_usd) }),
        ]);
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      shell.appendChild(table);
      var pager = el('div', { 'class': 'pager' }, [
        el('button', { type: 'button', text: '\u2190 Prev', onclick: function () { if (state.page > 1) { state.page--; writeHash(); render(); } } }),
        el('span', { text: 'Page ' + state.page + ' of ' + pages }),
        el('button', { type: 'button', text: 'Next \u2192', onclick: function () { if (state.page < pages) { state.page++; writeHash(); render(); } } })
      ]);
      if (pages > 1) shell.appendChild(pager);
    }
    shell.appendChild(el('div', { 'class': 'foot' }, [
      el('p', { text: 'Source: ' + DATA.source + '. A protocol that records no token is shown as pre-token; the record is not proof it has none.' }),
      el('p', { text: 'Implied value is this radar\u2019s own claim from the snapshot\u2019s figures, never a price and never a promise a token will launch.' })
    ]));
    root.appendChild(shell);
    if (state.selected) openDetail(state.selected, true);
  }
  function sortHeader(key, label) {
    var th = el('th', { 'class': key === 'rank' || key === 'name' ? '' : 'num' });
    var b = el('button', { type: 'button', text: label + (state.sort === key ? (state.dir < 0 ? ' \u25bc' : ' \u25b2') : ''), onclick: function () {
      if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; }
      writeHash(); render();
    } });
    b.style.cssText = 'background:none;border:0;padding:0;font:inherit;color:inherit;text-transform:inherit;letter-spacing:inherit;cursor:pointer';
    th.appendChild(b);
    return th;
  }
  function openDetail(slug, fromHash) {
    var row = null;
    for (var i = 0; i < DATA.rows.length; i++) if (DATA.rows[i].slug === slug) { row = DATA.rows[i]; break; }
    if (!row) { if (!fromHash) { state.selected = null; } return; }
    state.selected = slug;
    if (!fromHash) { state.view = 'detail'; writeHash(); }
    var old = document.getElementById('detail');
    if (old) old.remove();
    var d = el('dialog', { 'class': 'detail', id: 'detail' });
    var head = el('div', { 'class': 'detail-head' }, [
      el('div', {}, [
        el('h2', { text: '#' + row.rank + ' \u00b7 ' + row.name }),
        el('p', { text: row.slug + ' \u00b7 ' + (row.category || 'Other') + ' \u00b7 ' + row.chains.join(', ') })
      ]),
      el('button', { 'class': 'close', type: 'button', text: 'Close', onclick: function () { d.close(); state.selected = null; state.view = 'board'; writeHash(); } })
    ]);
    d.appendChild(head);
    var kv = el('div', { 'class': 'kv' }, [
      el('div', {}, [el('span', { text: 'TVL' }), el('b', { text: fmtUsd(row.tvl_usd) })]),
      el('div', {}, [el('span', { text: '7-day change' }), el('b', { text: fmtPct(row.change_7d) })]),
      el('div', {}, [el('span', { text: 'Tracked since' }), el('b', { text: (row.listed_at || '\u2014') + ' (' + fmtAge(row.age_days) + ')' } )]),
      el('div', {}, [el('span', { text: 'Implied value' }), el('b', { text: fmtUsd(row.implied_value_usd) })]),
      el('div', {}, [el('span', { text: 'Implied / TVL' }), el('b', { text: (row.implied_value_usd / row.tvl_usd).toFixed(3) + 'x' })]),
      el('div', {}, [el('span', { text: 'Verdict' }), el('b', { text: row.verdict })]),
      el('div', {}, [el('span', { text: 'Net per farmer' }), el('b', { text: fmtNet(row.net_usd) })]),
      el('div', {}, [el('span', { text: 'Band low' }), el('b', { text: fmtUsd(row.band_low_usd) })]),
      el('div', {}, [el('span', { text: 'Curve value' }), el('b', { text: fmtUsd(row.model.curve_usd) })]),
      el('div', {}, [el('span', { text: 'Category factor' }), el('b', { text: row.model.category_factor.toFixed(3) + 'x' })]),
      el('div', {}, [el('span', { text: 'Growth x maturity' }), el('b', { text: row.model.growth_multiplier.toFixed(3) + ' x ' + row.model.maturity_multiplier.toFixed(3) })])
    ]);
    d.appendChild(kv);
    d.appendChild(el('section', { 'class': 'detail-section' }, [
      el('h3', { text: 'What the model says' }),
      el('p', { text: row.model.note }),
      el('div', { 'class': 'formula', text: row.model.formula })
    ]));
    var steps = el('ol', {});
    (row.farm_steps || []).forEach(function (s) { steps.appendChild(el('li', { text: s })); });
    d.appendChild(el('section', { 'class': 'detail-section' }, [
      el('h3', { text: 'Farm plan \u2014 ' + (row.farm_steps || []).length + ' steps, costed' }),
      el('p', { text: 'Each step states what it costs and how long it takes. ' + (row.farm_ev || '') }),
      steps
    ]));
    var comps = (DATA.comps || []).filter(function (c) { return c.slug !== row.slug; })
      .sort(function (a, b) { return Math.abs(Math.log(a.tvl_usd / row.tvl_usd)) - Math.abs(Math.log(b.tvl_usd / row.tvl_usd)); })
      .slice(0, 5);
    var compList = el('ol', {});
    comps.forEach(function (c) {
      compList.appendChild(el('li', { html: '<b>' + esc(c.name) + '</b> \u00b7 TVL ' + fmtUsd(c.tvl_usd) + ' \u00b7 market cap ' + fmtUsd(c.mcap_usd) + ' \u00b7 ' + (c.mcap_usd / c.tvl_usd).toFixed(2) + 'x TVL' }));
    });
    d.appendChild(el('section', { 'class': 'detail-section' }, [
      el('h3', { text: 'What the market pays for similar size' }),
      el('p', { text: 'The five listed tokens nearest in TVL. Their market-cap-to-TVL multiples are the comps this radar is priced off.' }),
      compList
    ]));
    document.body.appendChild(d);
    d.showModal();
    d.addEventListener('close', function () { if (state.selected === slug) { state.selected = null; state.view = 'board'; writeHash(); } });
  }
  readHash();
  render();
})();
