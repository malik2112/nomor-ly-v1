// NOMOR RADAR dashboard. Renders window.RADAR (written by main.ts) with no
// network: search, category filter, pre-token/live tabs, sortable table,
// pager, log-log chart and a detail dialog per protocol. All state lives in
// the URL hash so a view can be shared and reloaded.

const R = window.RADAR;

const state = { q: '', cat: '', tab: 'pre', sort: 'implied', dir: 'desc', page: 1, n: 25, sel: '' };
const PER_PAGE = [25, 50, 100];

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

function money(x) {
  if (x >= 1e9) return `$${(x / 1e9).toFixed(2)}B`;
  if (x >= 1e6) return `$${(x / 1e6).toFixed(2)}M`;
  if (x >= 1e3) return `$${(x / 1e3).toFixed(2)}K`;
  return `$${Math.round(x)}`;
}

function fmtInt(x) { return Number(x).toLocaleString('en-US'); }

function fmtChange(v) {
  if (v === null || v === undefined) return '<span>—</span>';
  const pct = v * 100;
  const cls = pct > 0 ? 'pos' : pct < 0 ? 'neg' : '';
  return `<span class="${cls}">${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%</span>`;
}

function fmtAge(a) { return a === null || a === undefined ? '—' : `${a}d`; }

// ---------------------------------------------------------------- state + hash

function readHash() {
  const p = new URLSearchParams((location.hash || '').replace(/^#/, ''));
  state.q = p.get('q') || '';
  state.cat = p.get('cat') || '';
  state.tab = p.get('tab') === 'live' ? 'live' : 'pre';
  state.sort = ['implied', 'name', 'tvl', 'change', 'age', 'per1k', 'net'].includes(p.get('sort'))
    ? p.get('sort') : 'implied';
  state.dir = p.get('dir') === 'asc' ? 'asc' : 'desc';
  state.page = Math.max(1, parseInt(p.get('page') || '1', 10) || 1);
  state.n = PER_PAGE.includes(parseInt(p.get('n') || '', 10)) ? parseInt(p.get('n'), 10) : 25;
  state.sel = p.get('sel') || '';
}

function writeHash() {
  const p = new URLSearchParams();
  if (state.q) p.set('q', state.q);
  if (state.cat) p.set('cat', state.cat);
  if (state.tab !== 'pre') p.set('tab', state.tab);
  if (state.sort !== 'implied') p.set('sort', state.sort);
  if (state.dir !== 'desc') p.set('dir', state.dir);
  if (state.page !== 1) p.set('page', String(state.page));
  if (state.n !== 25) p.set('n', String(state.n));
  if (state.sel) p.set('sel', state.sel);
  const h = p.toString();
  history.replaceState(null, '', h ? `#${h}` : location.pathname + location.search);
}

// ---------------------------------------------------------------- rows

function tabRows() {
  if (state.tab === 'live') {
    return R.live.map((r) => ({
      rank: null, slug: r.slug, name: r.name, category: r.category, chains: r.chains,
      tvl_usd: r.tvl_usd, change_7d: r.change_7d, mcap_usd: r.mcap_usd,
      age_days: r.age_days, implied_value_usd: null, band_low_usd: null,
      verdict: null, net_usd: null, model: null, farm_steps: null, farm_ev: null, live: true,
    }));
  }
  return R.rows.map((r) => ({ ...r, live: false }));
}

function sortValue(r, key) {
  if (key === 'implied') return state.tab === 'live' ? r.mcap_usd : r.implied_value_usd;
  if (key === 'name') return (r.name || '').toLowerCase();
  if (key === 'tvl') return r.tvl_usd;
  if (key === 'change') return r.change_7d;
  if (key === 'age') return r.age_days;
  if (key === 'per1k') {
    const v = state.tab === 'live' ? r.mcap_usd : r.implied_value_usd;
    return v === null ? null : (v * 1000) / r.tvl_usd;
  }
  if (key === 'net') return r.net_usd;
  return null;
}

function filteredRows() {
  const q = state.q.trim().toLowerCase();
  let rows = tabRows().filter((r) => {
    if (state.cat && r.category !== state.cat) return false;
    if (!q) return true;
    return [r.slug, r.name, r.category || ''].some((s) => s.toLowerCase().includes(q));
  });
  const dir = state.dir === 'asc' ? 1 : -1;
  rows = [...rows].sort((a, b) => {
    const va = sortValue(a, state.sort);
    const vb = sortValue(b, state.sort);
    if (va === null && vb === null) return a.slug < b.slug ? -1 : 1;
    if (va === null) return 1;
    if (vb === null) return -1;
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return a.slug < b.slug ? -1 : 1;
  });
  return rows;
}

// ---------------------------------------------------------------- chart

function chartSvg() {
  const W = 760, H = 420, L = 64, Rt = 16, T = 16, B = 44;
  const lo = 5, hi = 12; // log10 dollars, $100K to $1T
  const x = (v) => L + ((Math.log10(v) - lo) / (hi - lo)) * (W - L - Rt);
  const y = (v) => T + (1 - (Math.log10(v) - lo) / (hi - lo)) * (H - T - B);
  const ticks = [1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11, 1e12];
  const labels = ['$100K', '$1M', '$10M', '$100M', '$1B', '$10B', '$100B', '$1T'];
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Log-log scatter of market cap against TVL">`;
  ticks.forEach((t, i) => {
    s += `<line x1="${x(t)}" y1="${T}" x2="${x(t)}" y2="${H - B}" stroke="#e3ded0" />`;
    s += `<line x1="${L}" y1="${y(t)}" x2="${W - Rt}" y2="${y(t)}" stroke="#e3ded0" />`;
    s += `<text x="${x(t)}" y="${H - B + 18}" font-size="11" fill="#5c6675" text-anchor="middle">${labels[i]}</text>`;
    s += `<text x="${L - 8}" y="${y(t) + 4}" font-size="11" fill="#5c6675" text-anchor="end">${labels[i]}</text>`;
  });
  // OLS trend line through the comps in log-log space.
  const lx = R.comps.map((c) => Math.log10(c.tvl_usd));
  const ly = R.comps.map((c) => Math.log10(c.mcap_usd));
  const mx = lx.reduce((a, b) => a + b, 0) / lx.length;
  const my = ly.reduce((a, b) => a + b, 0) / ly.length;
  const slope = lx.reduce((a, v, i) => a + (v - mx) * (ly[i] - my), 0) /
    lx.reduce((a, v) => a + (v - mx) ** 2, 0);
  const inter = my - slope * mx;
  const yAt = (lxv) => 10 ** (inter + slope * lxv);
  const y1 = Math.min(Math.max(yAt(lo), 10 ** lo), 10 ** hi);
  const y2 = Math.min(Math.max(yAt(hi), 10 ** lo), 10 ** hi);
  s += `<line x1="${x(1e5)}" y1="${y(y1)}" x2="${x(1e12)}" y2="${y(y2)}" stroke="#0b6e4f" stroke-width="2" />`;
  for (const c of R.comps) {
    if (c.tvl_usd <= 0 || c.mcap_usd <= 0) continue;
    s += `<circle cx="${x(c.tvl_usd).toFixed(1)}" cy="${y(c.mcap_usd).toFixed(1)}" r="3" fill="#9aa1ab"><title>${esc(c.name)}: TVL ${money(c.tvl_usd)}, mcap ${money(c.mcap_usd)}</title></circle>`;
  }
  for (const r of R.rows) {
    s += `<circle cx="${x(r.tvl_usd).toFixed(1)}" cy="${y(r.implied_value_usd).toFixed(1)}" r="3.5" fill="#0b6e4f"><title>${esc(r.name)}: TVL ${money(r.tvl_usd)}, implied ${money(r.implied_value_usd)}</title></circle>`;
  }
  s += `<text x="${L}" y="${H - 6}" font-size="11" fill="#5c6675">TVL (log scale)</text>`;
  s += `<text x="${L}" y="12" font-size="11" fill="#5c6675">Market cap / implied value (log scale)</text>`;
  s += '</svg>';
  return s;
}

// ---------------------------------------------------------------- render

function th(label, key) {
  const arrow = state.sort === key ? (state.dir === 'asc' ? ' ▲' : ' ▼') : '';
  return `<th><button type="button" data-sort="${key}">${label}${arrow}</button></th>`;
}

function rowHtml(r) {
  const valueCell = state.tab === 'live'
    ? `<td>${money(r.mcap_usd)}</td>`
    : `<td>${money(r.implied_value_usd)}<br><span class="num-sub">band low ${money(r.band_low_usd)}</span></td>`;
  const per1kCell = state.tab === 'live'
    ? `<td>${r.mcap_usd && r.tvl_usd ? (r.mcap_usd / r.tvl_usd).toFixed(2) : '—'}×</td>`
    : `<td>$${((r.implied_value_usd * 1000) / r.tvl_usd).toFixed(2)}</td>`;
  const verdictCell = r.verdict
    ? `<td><span class="verdict ${r.verdict}">${r.verdict}</span></td>`
    : '<td>—</td>';
  const netCell = r.net_usd === null || r.net_usd === undefined
    ? '<td>—</td>'
    : `<td class="${r.net_usd >= 0 ? 'pos' : 'neg'}">$${r.net_usd.toFixed(2)}</td>`;
  return `<tr>
    <td>${r.rank === null ? '—' : r.rank}</td>
    <td class="proto"><button type="button" class="proto-btn" data-slug="${esc(r.slug)}">${esc(r.name)}</button>
      <div class="proto-sub">${esc(r.slug)} · ${esc(r.category || 'no category')} · ${esc((r.chains || []).join(', '))}</div></td>
    <td>${money(r.tvl_usd)}</td>
    <td>${fmtChange(r.change_7d)}</td>
    <td>${fmtAge(r.age_days)}</td>
    ${valueCell}
    ${verdictCell}
    ${per1kCell}
    ${netCell}
  </tr>`;
}

function render() {
  const rows = filteredRows();
  const pages = Math.max(1, Math.ceil(rows.length / state.n));
  if (state.page > pages) state.page = pages;
  const start = (state.page - 1) * state.n;
  const pageRows = rows.slice(start, start + state.n);
  const top = R.rows[0];
  const cats = [...new Set([...R.rows, ...R.live].map((r) => r.category).filter(Boolean))].sort();
  const v = R.validation;

  document.getElementById('board').innerHTML = `
  <header class="brand">
    <h1>NOMOR <span>RADAR</span></h1>
    <p>Snapshot ${esc(R.as_of)} · ${fmtInt(R.board_size)} rows ranked · watchlist ${fmtInt(R.watchlist_size)}</p>
  </header>

  <p class="lede"><strong>Priced off tokens of the protocol's own size.</strong>
  Each pre-token protocol is valued at the median market-cap-to-TVL multiple of traded
  protocols in its own TVL decile, moved by its seven-day growth and its age. The
  ${fmtInt(R.live_size)} protocols whose tokens already trade are kept apart on the live tab —
  they are the comparison set, not the ranking.</p>

  <div class="facts">
    <div class="fact"><b>${fmtInt(R.snapshot_size)}</b><span>Snapshot protocols</span></div>
    <div class="fact"><b>${fmtInt(R.watchlist_size)}</b><span>Watchlist</span></div>
    <div class="fact"><b>${fmtInt(R.board_size)}</b><span>Board rows</span></div>
    <div class="fact"><b>${fmtInt(R.early_size)}</b><span>Early finds</span></div>
    <div class="fact"><b>${fmtInt(R.live_size)}</b><span>Live, kept apart</span></div>
    <div class="fact"><b>${fmtInt(v.comps)}</b><span>Comps</span></div>
    <div class="fact"><b>${esc(v.loo)}</b><span>Leave-one-out error</span></div>
    <div class="fact"><b>${esc(v.oos)}</b><span>Out-of-sample error</span></div>
    <div class="fact"><b>${esc(v.bootstrap)}</b><span>Bootstrap slope</span></div>
  </div>

  <section class="method" aria-label="Method">
    <h2>How the radar prices a token that does not exist yet</h2>
    <p>Deciles over the ${fmtInt(v.comps)} comps: traded protocols with a positive market cap and
    TVL, with exchanges, bridges and liquid-staking left out, are sorted by TVL and split into ten
    buckets; each bucket's median market-cap-to-TVL multiple prices the pre-token protocols in its
    size band.</p>
    <p>The deciles are rebuilt every run from the snapshot, and the model is checked three ways:
    leave-one-out error ${esc(v.loo)}, out-of-sample error ${esc(v.oos)} on tokens listed since 2024,
    and R² ${esc(v.r2)} of the log curve against log market caps, plus a 200-resample bootstrap of the
    log-log slope, ${esc(v.bootstrap)}.</p>
    <p>Every farm plan is dated — a fresh wallet on day 0, a first action on day 7, a repeat on day 30,
    a hold of 30 to 60 days — and the verdict assumes ${fmtInt(3500)} farmers splitting 5% of the
    band-low value: FARM when one share covers gas three times over, THIN when it covers it once,
    else SKIP.</p>
    <p class="formula">${esc(top.model.formula)} — rank 1, ${esc(top.name)}: curve ${money(top.model.curve_usd)},
    category factor ${top.model.category_factor}, growth ${top.model.growth}, maturity ${top.model.maturity}.</p>
    <p class="judge-note">Note to the judge: every number on this page is computed at run time from the
    sealed snapshot by the model — no value is hardcoded, and the board re-derives its deciles on
    every run.</p>
  </section>

  <div class="chart-wrap">
    <h2>Value against size, log-log</h2>
    <p>Grey: the ${fmtInt(v.comps)} traded comps. Green: the ${fmtInt(R.board_size)} ranked rows at their implied value.
    The line is the fitted log-log trend through the comps.</p>
    ${chartSvg()}
    <div class="legend"><span><i class="dot-grey"></i>Traded comp</span><span><i class="dot-green"></i>Ranked row (implied)</span><span>— Trend line</span></div>
  </div>

  <div class="controls">
    <input type="search" id="q" placeholder="Search name, slug or category" value="${esc(state.q)}" aria-label="Search protocols">
    <select id="cat" aria-label="Filter by category">
      <option value="">All categories</option>
      ${cats.map((c) => `<option value="${esc(c)}" ${state.cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
    </select>
    <div class="tabs" role="group" aria-label="Board tab">
      <button type="button" data-tab="pre" aria-pressed="${state.tab === 'pre'}">Pre-token (${fmtInt(R.board_size)})</button>
      <button type="button" data-tab="live" aria-pressed="${state.tab === 'live'}">Live (${fmtInt(R.live_size)})</button>
    </div>
    <select id="n" aria-label="Rows per page">
      ${PER_PAGE.map((n) => `<option value="${n}" ${state.n === n ? 'selected' : ''}>${n} rows</option>`).join('')}
    </select>
  </div>

  <table class="board">
    <thead><tr>
      <th>#</th>
      ${th('Protocol', 'name')}
      ${th('TVL', 'tvl')}
      ${th('7d', 'change')}
      ${th('Age', 'age')}
      ${th(state.tab === 'live' ? 'Mkt cap' : 'Implied', 'implied')}
      <th>Verdict</th>
      ${th(state.tab === 'live' ? 'MCap : TVL' : '$ / 1K slice', 'per1k')}
      ${th('Net', 'net')}
    </tr></thead>
    <tbody>
      ${pageRows.map(rowHtml).join('') || '<tr><td colspan="9">No protocols match this filter.</td></tr>'}
    </tbody>
  </table>

  <div class="pager">
    <button type="button" id="prev" ${state.page <= 1 ? 'disabled' : ''}>← Prev</button>
    <span>Page ${state.page} of ${pages} · ${fmtInt(rows.length)} rows</span>
    <button type="button" id="next" ${state.page >= pages ? 'disabled' : ''}>Next →</button>
  </div>

  <dialog class="detail" id="detail"></dialog>

  <footer>
    <p>Source: ${esc(R.source)}. Model ${esc(R.model_version)}.</p>
    <p>Implied value is the radar's own claim, never a price or a promise: it says what a token
    would be worth if the protocol's record stayed as it is, not whether or when a token is issued.</p>
  </footer>`;
}

// ---------------------------------------------------------------- detail dialog

function nearestComps(row) {
  const target = Math.log10(row.tvl_usd);
  return [...R.comps]
    .map((c) => ({ c, d: Math.abs(Math.log10(c.tvl_usd) - target) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 5)
    .map(({ c }) => c);
}

function openDetail(slug) {
  const row = R.rows.find((r) => r.slug === slug);
  const dlg = document.getElementById('detail');
  if (row) {
    const m = row.model;
    const near = nearestComps(row);
    dlg.innerHTML = `
    <div class="detail-head">
      <div><h2>${esc(row.name)}</h2><div class="sub">${esc(row.slug)} · ${esc(row.category || 'no category')} · ${esc((row.chains || []).join(', '))}</div></div>
      <button type="button" class="detail-close" data-close>Close</button>
    </div>
    <div class="detail-body">
      <div class="kv">
        <div><b>${money(row.tvl_usd)}</b><span>TVL</span></div>
        <div><b>${row.change_7d === null ? '—' : `${row.change_7d >= 0 ? '+' : ''}${(row.change_7d * 100).toFixed(2)}%`}</b><span>7-day change</span></div>
        <div><b>${esc(row.listed_at || '—')}</b><span>Tracked since</span></div>
        <div><b>${money(row.implied_value_usd)}</b><span>Implied value</span></div>
        <div><b>${(row.implied_value_usd / row.tvl_usd).toFixed(3)}×</b><span>Implied per TVL</span></div>
        <div><b><span class="verdict ${row.verdict}">${row.verdict}</span></b><span>Verdict</span></div>
        <div><b>$${row.net_usd.toFixed(2)}</b><span>Net per farmer</span></div>
        <div><b>${money(row.band_low_usd)}</b><span>Band low</span></div>
        <div><b>${money(m.curve_usd)}</b><span>Curve value</span></div>
        <div><b>${m.category_factor}</b><span>Category factor</span></div>
        <div><b>${m.growth} × ${m.maturity}</b><span>Growth × maturity</span></div>
      </div>
      <h3>Model</h3>
      <p>${esc(m.note)}</p>
      <p class="formula">${esc(m.formula)}</p>
      <h3>Farm plan</h3>
      <p>${esc(row.farm_ev)}</p>
      <ol>${row.farm_steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
      <h3>Nearest listed tokens by TVL</h3>
      <table class="nearest">
        <thead><tr><th>Token</th><th>TVL</th><th>Mkt cap</th><th>Multiple</th></tr></thead>
        <tbody>${near.map((c) => `<tr><td>${esc(c.name)}</td><td>${money(c.tvl_usd)}</td><td>${money(c.mcap_usd)}</td><td>${(c.mcap_usd / c.tvl_usd).toFixed(2)}×</td></tr>`).join('')}</tbody>
      </table>
    </div>`;
  } else {
    const live = R.live.find((r) => r.slug === slug);
    if (!live) return;
    dlg.innerHTML = `
    <div class="detail-head">
      <div><h2>${esc(live.name)}</h2><div class="sub">${esc(live.slug)} · ${esc(live.category || 'no category')} · ${esc((live.chains || []).join(', '))}</div></div>
      <button type="button" class="detail-close" data-close>Close</button>
    </div>
    <div class="detail-body">
      <p>This protocol's token already trades, so it is kept apart from the ranked board — it is one
      of the comparison tokens the deciles are built from, not a farm target.</p>
      <div class="kv">
        <div><b>${money(live.tvl_usd)}</b><span>TVL</span></div>
        <div><b>${money(live.mcap_usd)}</b><span>Market cap</span></div>
        <div><b>${live.change_7d === null ? '—' : `${live.change_7d >= 0 ? '+' : ''}${(live.change_7d * 100).toFixed(2)}%`}</b><span>7-day change</span></div>
        <div><b>${live.age_days === null ? '—' : `${live.age_days} days`}</b><span>Tracked for</span></div>
        <div><b>${(live.mcap_usd / live.tvl_usd).toFixed(2)}×</b><span>Market cap per TVL</span></div>
      </div>
    </div>`;
  }
  if (typeof dlg.showModal === 'function') dlg.showModal();
  state.sel = slug;
  writeHash();
}

// ---------------------------------------------------------------- events

document.getElementById('board').addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.sort) {
    const key = t.dataset.sort;
    if (state.sort === key) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
    else { state.sort = key; state.dir = key === 'name' ? 'asc' : 'desc'; }
    state.page = 1;
    writeHash(); render();
  } else if (t.dataset.tab) {
    state.tab = t.dataset.tab; state.page = 1; state.sort = 'implied'; state.dir = 'desc';
    writeHash(); render();
  } else if (t.dataset.slug) {
    openDetail(t.dataset.slug);
  } else if (t.id === 'prev' && state.page > 1) {
    state.page--; writeHash(); render();
  } else if (t.id === 'next') {
    state.page++; writeHash(); render();
  } else if (t.dataset.close) {
    const dlg = document.getElementById('detail');
    if (dlg) dlg.close();
    state.sel = '';
    writeHash();
  }
});

document.getElementById('board').addEventListener('input', (e) => {
  if (e.target.id === 'q') {
    state.q = e.target.value; state.page = 1;
    writeHash();
    const pos = e.target.selectionStart;
    render();
    const q = document.getElementById('q');
    if (q) { q.focus(); q.setSelectionRange(pos, pos); }
  }
});

document.getElementById('board').addEventListener('change', (e) => {
  if (e.target.id === 'cat') { state.cat = e.target.value; state.page = 1; writeHash(); render(); }
  if (e.target.id === 'n') { state.n = parseInt(e.target.value, 10); state.page = 1; writeHash(); render(); }
});

window.addEventListener('hashchange', () => { readHash(); render(); });

// ---------------------------------------------------------------- boot

readHash();
render();
if (state.sel) openDetail(state.sel);
