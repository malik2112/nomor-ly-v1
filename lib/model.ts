// NOMOR RADAR — token launch radar model, decile comps (model decile-comps-v1).
//
// One sealed snapshot of the protocol universe in, one ranked board out.
// A protocol that records no token is priced off the tokens of protocols its
// own size: the traded comps are split into ten TVL deciles, each decile's
// median market-cap-to-TVL multiple is the curve, and the implied value is
// the curve moved by the protocol's own seven-day growth and by how long it
// has run with no token. Nothing here names a protocol: every number is
// computed from the snapshot at run time.

export const MODEL_VERSION = 'decile-comps-v1';
export const EARLY_TAKE = 158;
export const LIVE_TAKE = 24;
export const FARMERS = 3500;
export const OOS_CUTOFF = '2024-01-01';

const EXCLUDED_COMP_CATEGORIES = new Set([
  'CEX',
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
]);

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ModelBlock {
  curve_usd: number;
  category_factor: number;
  growth: number;
  maturity: number;
  age_days: number | null;
  note: string;
  formula: string;
}

export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  pre_token: boolean;
  age_days: number | null;
  implied_value_usd: number;
  band_low_usd: number;
  model: ModelBlock;
  farm_steps: string[];
  farm_ev: string;
  verdict: string;
  net_usd: number;
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  change_7d: number | null;
  age_days: number | null;
}

export interface CompRow {
  slug: string;
  name: string;
  tvl_usd: number;
  mcap_usd: number;
}

export interface Validation {
  comps: number;
  r2: string;
  oos: string;
  loo: string;
  bootstrap: string;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  snapshot_size: number;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  validation: Validation;
  rows: RadarRow[];
  live: LiveRow[];
  comps: CompRow[];
}

// ---------------------------------------------------------------- parsing

export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('snapshot is not valid JSON');
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('snapshot must be a JSON object');
  }
  const o = raw as Record<string, unknown>;
  if (
    typeof o.as_of !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of) ||
    Number.isNaN(Date.parse(o.as_of))
  ) {
    throw new Error('snapshot as_of must be a YYYY-MM-DD date');
  }
  if (typeof o.source !== 'string' || o.source.length === 0) {
    throw new Error('snapshot source is missing');
  }
  if (
    typeof o.floor_usd !== 'number' ||
    !Number.isSafeInteger(o.floor_usd) ||
    o.floor_usd <= 0
  ) {
    throw new Error('snapshot floor_usd must be a positive safe integer');
  }
  if (!Array.isArray(o.protocols)) {
    throw new Error('snapshot protocols must be an array');
  }
  if (
    !Array.isArray(o.watchlist) ||
    o.watchlist.some((w) => typeof w !== 'string')
  ) {
    throw new Error('snapshot watchlist must be an array of strings');
  }
  const protocols: SnapshotProtocol[] = o.protocols.map((p, i) => {
    if (p === null || typeof p !== 'object' || Array.isArray(p)) {
      throw new Error(`protocol ${i} must be an object`);
    }
    const q = p as Record<string, unknown>;
    if (typeof q.slug !== 'string' || q.slug.length === 0) {
      throw new Error(`protocol ${i} is missing slug`);
    }
    if (typeof q.name !== 'string' || q.name.length === 0) {
      throw new Error(`protocol ${i} is missing name`);
    }
    if (typeof q.tvl_usd !== 'number' || !Number.isFinite(q.tvl_usd)) {
      throw new Error(`protocol ${i} is missing a finite tvl_usd`);
    }
    return {
      slug: q.slug,
      name: q.name,
      category: typeof q.category === 'string' ? q.category : null,
      chains: Array.isArray(q.chains)
        ? q.chains.filter((c): c is string => typeof c === 'string')
        : [],
      tvl_usd: q.tvl_usd,
      change_7d:
        typeof q.change_7d === 'number' && Number.isFinite(q.change_7d)
          ? q.change_7d
          : null,
      mcap_usd:
        typeof q.mcap_usd === 'number' && Number.isFinite(q.mcap_usd)
          ? q.mcap_usd
          : null,
      listed_at: typeof q.listed_at === 'string' ? q.listed_at : null,
      gecko_id: typeof q.gecko_id === 'string' ? q.gecko_id : null,
      symbol: typeof q.symbol === 'string' ? q.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

// ---------------------------------------------------------------- helpers

/** Whole days from listed_at to as_of, minimum 0; null when unknown. */
export function ageDays(listedAt: string | null, asOf: string): number | null {
  if (listedAt === null) return null;
  const listedMs = Date.parse(listedAt);
  const asOfMs = Date.parse(asOf);
  if (Number.isNaN(listedMs) || Number.isNaN(asOfMs)) return null;
  return Math.max(0, Math.floor((asOfMs - listedMs) / 86400000));
}

/** A protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

const VERSION_SUFFIX = / [Vv]?\d+(?:\.\d+)*$/;

/** Rankable: pre-token, not a CEX, and its name carries no version suffix. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSION_SUFFIX.test(p.name);
}

/** Linear-interpolation quantile of an ascending array. */
export function quantile(sorted: number[], q: number): number {
  const n = sorted.length;
  if (n === 0) return Number.NaN;
  if (n === 1) return sorted[0] as number;
  const pos = q * (n - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const frac = pos - lo;
  return (sorted[lo] as number) * (1 - frac) + (sorted[hi] as number) * frac;
}

/** Round to three significant figures, minimum 1. */
export function roundSig3(x: number): number {
  if (!(x > 0)) return Math.max(1, Math.round(x));
  const digits = Math.floor(Math.log10(x)) + 1;
  const scale = 10 ** (digits - 3);
  return Math.round(x / scale) * scale;
}

export function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}

export function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/** Short money format: $1.23B, $45.67M, $890.12K, $345. */
export function money(x: number): string {
  if (x >= 1e9) return `$${(x / 1e9).toFixed(2)}B`;
  if (x >= 1e6) return `$${(x / 1e6).toFixed(2)}M`;
  if (x >= 1e3) return `$${(x / 1e3).toFixed(2)}K`;
  return `$${Math.round(x)}`;
}

function signedPct(x: number): string {
  return `${x >= 0 ? '+' : ''}${x}%`;
}

/** Deterministic PRNG (mulberry32) for the bootstrap. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- deciles

export interface Deciles {
  edges: number[];
  ratios: number[];
  global: number;
}

export function buildDeciles(comps: SnapshotProtocol[]): Deciles {
  const sorted = [...comps].sort(
    (a, b) =>
      a.tvl_usd - b.tvl_usd ||
      (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0),
  );
  const n = sorted.length;
  const edges: number[] = [];
  const ratios: number[] = [];
  for (let d = 0; d < 10; d++) {
    let lo = Math.floor((d * n) / 10);
    let hi = Math.floor(((d + 1) * n) / 10);
    if (hi <= lo) hi = lo + 1;
    const bucket = sorted.slice(lo, hi);
    edges.push((bucket[0] as SnapshotProtocol).tvl_usd);
    ratios.push(
      quantile(
        bucket
          .map((p) => (p.mcap_usd as number) / p.tvl_usd)
          .sort((a, b) => a - b),
        0.5,
      ),
    );
  }
  edges.push(Number.POSITIVE_INFINITY);
  const global = quantile(
    comps
      .map((p) => (p.mcap_usd as number) / p.tvl_usd)
      .sort((a, b) => a - b),
    0.5,
  );
  return { edges, ratios, global };
}

/** First bucket whose next edge is above the TVL, else bucket 9. */
export function decileOf(tvl: number, edges: number[]): number {
  for (let b = 0; b < 10; b++) {
    if ((edges[b + 1] as number) > tvl) return b;
  }
  return 9;
}

export interface Prediction {
  decile: number;
  ratio: number;
  growth: number;
  maturity: number;
  age: number | null;
  curve: number;
  implied: number;
  bandLow: number;
}

export function predict(
  p: SnapshotProtocol,
  deciles: Deciles,
  asOf: string,
): Prediction {
  const decile = decileOf(p.tvl_usd, deciles.edges);
  const ratio = deciles.ratios[decile] as number;
  const effectiveRatio = ratio > 0 ? ratio : deciles.global;
  const clamped = Math.max(
    -50,
    Math.min(100, p.change_7d === null ? 0 : p.change_7d),
  );
  const growth = 1 + (0.3 * clamped) / 100;
  const age = ageDays(p.listed_at, asOf);
  const ageForMaturity = age === null ? 365 : age;
  const maturity = 0.9 + (0.1 * Math.min(ageForMaturity, 1095)) / 1095;
  const curve = p.tvl_usd * effectiveRatio;
  const implied = roundSig3(Math.max(1, curve * growth * maturity));
  const bandLow = roundSig3(Math.max(1, (curve / 2) * growth * maturity));
  return { decile, ratio: effectiveRatio, growth, maturity, age, curve, implied, bandLow };
}

// ---------------------------------------------------------------- validation

function medianLogError(
  comps: SnapshotProtocol[],
  deciles: Deciles,
): number {
  const errs = comps.map((p) => {
    const ratio = deciles.ratios[decileOf(p.tvl_usd, deciles.edges)] as number;
    const curve = p.tvl_usd * (ratio > 0 ? ratio : deciles.global);
    return Math.abs(Math.log10(curve) - Math.log10(p.mcap_usd as number));
  });
  return quantile(errs.sort((a, b) => a - b), 0.5);
}

function validate(comps: SnapshotProtocol[], deciles: Deciles): Validation {
  // Leave-one-out: rebuild the deciles without each held-out token.
  const looErrs = comps.map((p) => {
    const rest = comps.filter((q) => q !== p);
    const d = buildDeciles(rest);
    const ratio = d.ratios[decileOf(p.tvl_usd, d.edges)] as number;
    const curve = p.tvl_usd * (ratio > 0 ? ratio : d.global);
    return Math.abs(Math.log10(curve) - Math.log10(p.mcap_usd as number));
  });
  const loo = `x${(10 ** quantile(looErrs.sort((a, b) => a - b), 0.5)).toFixed(2)}`;

  // Out-of-sample: fit on comps listed before 2024-01-01, test on the rest.
  const cutoff = Date.parse(OOS_CUTOFF);
  const train = comps.filter(
    (p) => p.listed_at !== null && Date.parse(p.listed_at) < cutoff,
  );
  const test = comps.filter(
    (p) => p.listed_at !== null && Date.parse(p.listed_at) >= cutoff,
  );
  let oos: string;
  if (train.length >= 10 && test.length >= 10) {
    const d = buildDeciles(train);
    const med = medianLogError(test, d);
    oos = `x${(10 ** med).toFixed(2)} (n=${test.length})`;
  } else {
    oos = `n/a (train ${train.length}, test ${test.length})`;
  }

  // R-squared of the log10 curve against the log10 market caps.
  const xs = comps.map((p) => {
    const ratio = deciles.ratios[decileOf(p.tvl_usd, deciles.edges)] as number;
    return Math.log10(p.tvl_usd * (ratio > 0 ? ratio : deciles.global));
  });
  const ys = comps.map((p) => Math.log10(p.mcap_usd as number));
  const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;
  const ssRes = xs.reduce((s, x, i) => s + ((ys[i] as number) - x) ** 2, 0);
  const ssTot = ys.reduce((s, y) => s + (y - meanY) ** 2, 0);
  const r2 = (1 - ssRes / ssTot).toFixed(2);

  // Bootstrap: OLS slope of log10 market cap on log10 TVL, 200 resamples.
  const rand = mulberry32(42);
  const slopes: number[] = [];
  for (let i = 0; i < 200; i++) {
    const sample = Array.from(
      { length: comps.length },
      () => comps[Math.floor(rand() * comps.length)] as SnapshotProtocol,
    );
    const lx = sample.map((p) => Math.log10(p.tvl_usd));
    const ly = sample.map((p) => Math.log10(p.mcap_usd as number));
    const mx = lx.reduce((a, b) => a + b, 0) / lx.length;
    const my = ly.reduce((a, b) => a + b, 0) / ly.length;
    const num = lx.reduce((s, x, j) => s + (x - mx) * ((ly[j] as number) - my), 0);
    const den = lx.reduce((s, x) => s + (x - mx) ** 2, 0);
    slopes.push(num / den);
  }
  const meanSlope = slopes.reduce((a, b) => a + b, 0) / slopes.length;
  const sdSlope = Math.sqrt(
    slopes.reduce((s, v) => s + (v - meanSlope) ** 2, 0) / (slopes.length - 1),
  );
  const bootstrap = `${meanSlope.toFixed(2)} ± ${sdSlope.toFixed(2)} (n=200)`;

  return { comps: comps.length, r2, oos, loo, bootstrap };
}

// ---------------------------------------------------------------- farm plan

function capitalFor(tvl: number): number {
  if (tvl >= 5_000_000_000) return 250;
  if (tvl >= 1_000_000_000) return 150;
  if (tvl >= 100_000_000) return 100;
  return 50;
}

function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

function clampStep(step: string): string {
  const t = step.trim();
  if (t.length > 600) return `${t.slice(0, 596)}…`;
  if (t.length < 20) {
    return `${t} Hold the position and check the protocol's own page before withdrawing.`;
  }
  return t;
}

function farmSteps(
  p: SnapshotProtocol,
  capital: number,
  gasFee: number,
  hold: number,
  pool: number,
): string[] {
  const category = (p.category ?? '').toLowerCase();
  let action: string;
  if (category.includes('lending') || category.includes('cdp')) {
    action = `supply $${capital} of USDC as collateral and borrow under 50% loan-to-value, keeping the loan small enough to survive a dip`;
  } else if (category.includes('dex') || category.includes('yield')) {
    action = `provide $${capital} of liquidity to the main pool and hold the LP position; avoid the thinnest pair`;
  } else if (category.includes('bridge')) {
    action = `bridge $${capital} of USDC into the chain and use the funds inside the app so the activity is visible on-chain`;
  } else if (category.includes('staking') || category.includes('restaking')) {
    action = `stake $${capital} of the chain staking asset through the protocol and keep the stake for the full hold`;
  } else if (category.includes('perpetual') || category.includes('derivative')) {
    action = `deposit $${capital} of USDC as margin and open one small hedge; keep the position modest and monitored`;
  } else {
    action = `deposit $${capital} of USDC into the protocol's main vault or pool and keep the receipt transaction`;
  }
  return [
    `Day 0 — Open a fresh wallet just for this farm and keep its seed offline; never reuse it for another protocol. Cost: $0, about 10 minutes.`,
    `Day 0 — ${action[0]?.toUpperCase()}${action.slice(1)}. Cost: $${capital} plus about $${gasFee} of gas, about 20 minutes.`,
    `Day 7 — Make the first qualifying action and confirm it landed on the protocol's points or activity page. Cost: about $${gasFee} of gas, about 15 minutes.`,
    `Day 30 — Repeat one qualifying action and check the points page again so the activity stays current. Cost: about $${gasFee} of gas, about 15 minutes.`,
    `Day ${hold} — Hold the position at least ${hold} days so it spans more than one snapshot; the band-low 5% pool is $${pool.toLocaleString('en-US')}. Cost: $0, about 5 minutes to check.`,
    `Before withdrawing — Claim only from the link the protocol's own page publishes, never from a chat link or a DM. Cost: about $${gasFee} of gas, about 10 minutes.`,
    `Log — Record the wallet address, the dates and every transaction hash so the farm can be audited later. Cost: $0, about 10 minutes.`,
  ].map(clampStep);
}

// ---------------------------------------------------------------- board build

function scoreRow(
  p: SnapshotProtocol,
  snap: Snapshot,
  deciles: Deciles,
  loo: string,
  compCount: number,
): Omit<RadarRow, 'rank'> {
  const pred = predict(p, deciles, snap.as_of);
  const capital = capitalFor(p.tvl_usd);
  const gasFee = capital >= 150 ? 8 : 4;
  const hold = holdDaysFor(pred.age);
  const pool = Math.round(pred.bandLow * 0.05);
  const gas = 3 + 8 + 2 * Math.ceil(hold / 7);
  const share = pool / FARMERS;
  const verdict = share >= 3 * gas ? 'FARM' : share >= gas ? 'THIN' : 'SKIP';
  const net = round2(share - gas);

  const changeText =
    p.change_7d === null
      ? 'not reported'
      : `${p.change_7d >= 0 ? '+' : ''}${(p.change_7d * 100).toFixed(2)}%`;
  const growthPct = signedPct(Math.round((pred.growth - 1) * 100));
  const maturityPct = signedPct(Math.round((pred.maturity - 1) * 100));
  const ageText =
    pred.age === null ? 'age unknown, counted as 1y' : `age ${pred.age} days`;
  const note =
    `Decile ${pred.decile} (median multiple ${pred.ratio.toFixed(2)}) across ${compCount} comps: ` +
    `curve ${money(pred.curve)}; leave-one-out error ${loo}; ` +
    `7-day change ${changeText} moves growth ${growthPct}; ` +
    `${ageText} moves maturity ${maturityPct}; band low ${money(pred.bandLow)}.`;
  const formula =
    `implied value = TVL × decile ${pred.decile} median multiple ` +
    `(${pred.ratio.toFixed(4)}) × growth (${pred.growth.toFixed(4)}) × maturity (${pred.maturity.toFixed(4)})`;

  return {
    slug: p.slug,
    name: p.name,
    category: p.category,
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    mcap_usd: p.mcap_usd,
    listed_at: p.listed_at,
    gecko_id: p.gecko_id,
    symbol: p.symbol,
    pre_token: true,
    age_days: pred.age,
    implied_value_usd: pred.implied,
    band_low_usd: pred.bandLow,
    model: {
      curve_usd: round4(pred.curve),
      category_factor: round4(pred.ratio / deciles.global),
      growth: round4(pred.growth),
      maturity: round4(pred.maturity),
      age_days: pred.age,
      note,
      formula,
    },
    farm_steps: farmSteps(p, capital, gasFee, hold, pool),
    farm_ev:
      `Expected value: $${share.toFixed(2)} per farmer — pool $${pool.toLocaleString('en-US')} ` +
      `(5% of band low ${money(pred.bandLow)}), gas $${gas}, net $${net.toFixed(2)} per farmer.`,
    verdict,
    net_usd: net,
  };
}

export function buildRadar(snap: Snapshot): RadarData {
  const comps = snap.protocols.filter(
    (p) =>
      p.mcap_usd !== null &&
      p.mcap_usd > 0 &&
      p.tvl_usd > 0 &&
      !(p.category !== null && EXCLUDED_COMP_CATEGORIES.has(p.category)),
  );
  const deciles = buildDeciles(comps);
  const validation = validate(comps, deciles);

  const bySlug = new Map(snap.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snap.watchlist) {
    const p = bySlug.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const early = snap.protocols
    .filter((p) => isRankable(p) && !chosen.has(p.slug) && p.tvl_usd < snap.floor_usd)
    .sort(
      (a, b) =>
        b.tvl_usd - a.tvl_usd ||
        (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0),
    )
    .slice(0, EARLY_TAKE);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()]
    .map((p) => scoreRow(p, snap, deciles, validation.loo, comps.length))
    .sort(
      (a, b) =>
        b.implied_value_usd - a.implied_value_usd ||
        (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0),
    );
  const rows: RadarRow[] = scored.map((r, i) => ({ ...r, rank: i + 1 }));

  const live: LiveRow[] = snap.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort(
      (a, b) =>
        (b.mcap_usd as number) - (a.mcap_usd as number) ||
        b.tvl_usd - a.tvl_usd,
    )
    .slice(0, LIVE_TAKE)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd as number,
      change_7d: p.change_7d,
      age_days: ageDays(p.listed_at, snap.as_of),
    }));

  const compRows: CompRow[] = [...comps]
    .sort((a, b) => b.tvl_usd - a.tvl_usd)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd as number,
    }));

  const earlySize = rows.filter((r) => !snap.watchlist.includes(r.slug)).length;
  return {
    as_of: snap.as_of,
    source: snap.source,
    floor_usd: snap.floor_usd,
    snapshot_size: snap.protocols.length,
    model_version: MODEL_VERSION,
    watchlist_size: snap.watchlist.length,
    board_size: rows.length,
    early_size: earlySize,
    live_size: live.length,
    validation,
    rows,
    live,
    comps: compRows,
  };
}

// ---------------------------------------------------------------- board gate

export function checkBoard(radar: RadarData, watchlist: string[]): void {
  const rows = radar.rows;
  const slugs = new Set(rows.map((r) => r.slug));
  for (const slug of watchlist) {
    if (!slugs.has(slug)) throw new Error(`board is missing watchlist slug ${slug}`);
  }
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] as RadarRow;
    if (row.rank !== i + 1) {
      throw new Error(`board ranks are not 1..N in order at row ${i + 1}`);
    }
    if (i > 0 && row.implied_value_usd > (rows[i - 1] as RadarRow).implied_value_usd) {
      throw new Error(`board implied values rise at rank ${row.rank}`);
    }
    if (
      !Number.isSafeInteger(row.implied_value_usd) ||
      row.implied_value_usd <= 0
    ) {
      throw new Error(`row ${row.slug} has no positive safe-integer implied value`);
    }
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      throw new Error(`row ${row.slug} has ${row.farm_steps.length} farm steps`);
    }
    for (const step of row.farm_steps) {
      const len = step.trim().length;
      if (len < 20 || len > 600) {
        throw new Error(`row ${row.slug} has a farm step of ${len} characters`);
      }
    }
  }
  if (rows.length >= 2 && rows.every((r) => r.implied_value_usd === (rows[0] as RadarRow).implied_value_usd)) {
    throw new Error('board implied values are all the same');
  }
}

// ---------------------------------------------------------------- data script

export function renderDataJs(radar: RadarData): string {
  return `window.RADAR = ${JSON.stringify(radar)};\n`;
}
