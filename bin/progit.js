#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const entry = join(here, '..', 'dist', 'server', 'cli.js');

if (!existsSync(entry)) {
  console.error('progit: build output missing (dist/server/cli.js).');
  console.error('  If running from source, run `pnpm build` first.');
  process.exit(1);
}

await import(entry);
