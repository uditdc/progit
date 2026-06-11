#!/usr/bin/env node
// Release driver. Bumps the version, commits, tags, and pushes — which triggers
// the publish workflow (.github/workflows/publish.yml). Pass --local to also run
// `npm publish` from this machine instead of relying on CI.
//
//   node scripts/release.mjs <patch|minor|major|x.y.z> [--local]

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const local = args.includes('--local');
const bump = args.find((a) => !a.startsWith('--'));

const VALID = ['patch', 'minor', 'major'];
if (!bump || (!VALID.includes(bump) && !/^\d+\.\d+\.\d+/.test(bump))) {
  console.error('usage: node scripts/release.mjs <patch|minor|major|x.y.z> [--local]');
  process.exit(1);
}

function run(cmd, cmdArgs, opts = {}) {
  return execFileSync(cmd, cmdArgs, { stdio: 'inherit', ...opts });
}
function capture(cmd, cmdArgs) {
  return execFileSync(cmd, cmdArgs, { encoding: 'utf8' }).trim();
}

const branch = capture('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
if (branch !== 'main') {
  console.error(`refusing to release from '${branch}' — switch to main first`);
  process.exit(1);
}

const dirty = capture('git', ['status', '--porcelain']);
if (dirty) {
  console.error('working tree is not clean — commit or stash first');
  process.exit(1);
}

console.log('› preflight: typecheck, test, build');
run('pnpm', ['run', 'typecheck']);
run('pnpm', ['test']);
run('pnpm', ['build']);

console.log(`› bumping version (${bump})`);
run('npm', ['version', bump, '-m', 'release: v%s']);

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
console.log(`› pushing v${version}`);
run('git', ['push', '--follow-tags']);

if (local) {
  console.log('› publishing from this machine');
  run('npm', ['publish']);
  console.log(`✓ published progit@${version}`);
} else {
  console.log(`✓ tagged and pushed v${version} — CI will publish on the tag`);
}
