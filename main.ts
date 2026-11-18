// NOMOR RADAR — entrypoint. Reads the sealed snapshot, builds the ranked
// board, and writes board.json, data.js, the dashboard, the screenshots and
// dossier.json. Node 22, standard library only.
//
//   node main.ts [--input <snapshot.json or directory>] [--output <dir>]
//   Defaults: input /input (snapshot.json inside it), output
//   $MAKEFUN_OUTPUT_DIR or /output. A missing snapshot exits 2; a failed
//   board gate or dossier exits 1.

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-board.ts';
import {
  buildRadar,
  checkBoard,
  parseSnapshot,
  renderDataJs,
} from './lib/model.ts';

const REPO_ROOT = dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

function argValue(name: string): string | undefined {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === name) return argv[i + 1];
    if ((argv[i] as string).startsWith(`${name}=`)) {
      return (argv[i] as string).slice(name.length + 1);
    }
  }
  return undefined;
}

function fail(message: string, code: number): never {
  console.error(`error: ${message}`);
  process.exit(code);
}

/** Copy a tree's files only, skipping dotfiles and dot-directories. */
function copyTree(src: string, dst: string): number {
  let count = 0;
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const from = join(src, entry.name);
    const to = join(dst, entry.name);
    if (entry.isDirectory()) {
      count += copyTree(from, to);
    } else if (entry.isFile()) {
      copyFileSync(from, to);
      count++;
    }
  }
  return count;
}

function main(): void {
  const inputArg = argValue('--input') ?? '/input';
  const snapshotPath = inputArg.endsWith('.json')
    ? inputArg
    : join(inputArg, 'snapshot.json');
  if (!existsSync(snapshotPath)) {
    fail(`snapshot not found: ${snapshotPath}`, 2);
  }
  const outputDir = resolve(
    argValue('--output') ?? process.env.MAKEFUN_OUTPUT_DIR ?? '/output',
  );
  mkdirSync(outputDir, { recursive: true });

  const snapshot = parseSnapshot(readFileSync(snapshotPath, 'utf8'));
  const radar = buildRadar(snapshot);
  try {
    checkBoard(radar, snapshot.watchlist);
  } catch (err) {
    fail(`board gate failed: ${(err as Error).message}`, 1);
  }

  writeFileSync(
    join(outputDir, 'board.json'),
    `${JSON.stringify({ rows: radar.rows }, null, 2)}\n`,
  );
  writeFileSync(join(outputDir, 'data.js'), renderDataJs(radar));

  const dashCount = copyTree(
    join(REPO_ROOT, 'dashboard'),
    join(outputDir, 'dashboard'),
  );

  const shotsDir = join(REPO_ROOT, 'screenshots');
  const shots = readdirSync(shotsDir, { withFileTypes: true })
    .filter((e) => e.isFile() && !e.name.startsWith('.'))
    .map((e) => e.name);
  if (shots.length < 3) {
    fail(`screenshots: need at least 3, found ${shots.length}`, 1);
  }
  for (const name of shots) {
    if (!SCREENSHOT_NAME.test(name)) {
      fail(`screenshots: bad name ${name}`, 1);
    }
  }
  const shotCount = copyTree(shotsDir, join(outputDir, 'screenshots'));

  let dossier: Uint8Array;
  try {
    dossier = buildDossier(outputDir, {
      text_max_bytes: 65536,
      screenshots: { max: 4, max_bytes: 524288 },
      dashboard: { max_files: 400, max_bytes: 4194304 },
    });
  } catch (err) {
    fail(`dossier failed: ${(err as Error).message}`, 1);
  }
  writeFileSync(join(outputDir, 'dossier.json'), dossier);

  console.log(
    `snapshot: ${snapshot.protocols.length} protocols, watchlist ${snapshot.watchlist.length}, ` +
      `board ${radar.rows.length} rows (${radar.early_size} early, ${radar.live_size} live)`,
  );
  console.log(
    `wrote: board.json, data.js, dossier.json, dashboard/ (${dashCount} files), ` +
      `screenshots/ (${shotCount} files) -> ${outputDir}`,
  );
}

main();
