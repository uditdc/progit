import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

interface Pkg {
  name: string;
  version: string;
}

interface UpdateState {
  lastCheck: number;
  latest?: string;
}

function statePath(name: string): string {
  const base = process.env.XDG_CACHE_HOME || join(homedir() || tmpdir(), '.cache');
  const slug = name.replace(/[@/]/g, '-').replace(/^-+/, '');
  return join(base, 'progit', `${slug}-update.json`);
}

async function readState(file: string): Promise<UpdateState> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as UpdateState;
  } catch {
    return { lastCheck: 0 };
  }
}

async function writeState(file: string, state: UpdateState): Promise<void> {
  try {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(state));
  } catch {
    // a missing cache is harmless — we just check again next run
  }
}

/** Compare two semver strings. Returns >0 if a is newer than b, <0 if older, 0 if equal. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [core = '', pre] = v.replace(/^v/, '').split('-', 2);
    return { nums: core.split('.').map((n) => Number(n) || 0), pre };
  };
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    const diff = (pa.nums[i] ?? 0) - (pb.nums[i] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  if (pa.pre && !pb.pre) return -1;
  if (!pa.pre && pb.pre) return 1;
  if (pa.pre && pb.pre) return pa.pre.localeCompare(pb.pre);
  return 0;
}

async function fetchLatest(name: string): Promise<string | null> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${name}`, {
      headers: { accept: 'application/vnd.npm.install-v1+json' },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { 'dist-tags'?: { latest?: string } };
    return body['dist-tags']?.latest ?? null;
  } catch {
    return null;
  }
}

function runInstall(name: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('npm', ['install', '--global', `${name}@latest`], { timeout: 120_000 }, (err) => {
      resolve(!err);
    });
  });
}

async function loadPkg(): Promise<Pkg | null> {
  try {
    return JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8')) as Pkg;
  } catch {
    return null;
  }
}

/**
 * When progit is run from a global install, check npm for a newer release and
 * install it in place. Throttled to once a day; opt out with --no-update or
 * PROGIT_NO_UPDATE. Skipped for source checkouts (the published package has no
 * src/ directory). Returns true if an update was installed.
 */
export async function maybeAutoUpdate(disabled: boolean): Promise<boolean> {
  if (disabled || process.env.PROGIT_NO_UPDATE) return false;
  if (existsSync(join(packageRoot, 'src'))) return false;

  const pkg = await loadPkg();
  if (!pkg?.name || !pkg.version) return false;

  const file = statePath(pkg.name);
  const state = await readState(file);
  const now = Date.now();
  if (now - state.lastCheck < CHECK_INTERVAL_MS) return false;

  const latest = await fetchLatest(pkg.name);
  await writeState(file, { lastCheck: now, latest: latest ?? state.latest });
  if (!latest || compareVersions(latest, pkg.version) <= 0) return false;

  console.log(`progit: updating ${pkg.version} → ${latest}…`);
  if (await runInstall(pkg.name)) {
    console.log(`progit: updated to ${latest}. Restart progit to use the new version.`);
    return true;
  }
  console.log(`progit: update to ${latest} failed — run \`npm i -g ${pkg.name}@latest\` manually.`);
  return false;
}
