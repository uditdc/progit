import { serve } from '@hono/node-server';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createApp, type AppRuntime } from './app.js';
import { createRegistry } from './repos.js';
import { maybeAutoUpdate } from './update.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
function flag(...names: string[]): boolean {
  return names.some((n) => process.argv.includes(n));
}

const HELP = `progit — web-based git visualization, an ungit successor

Usage:
  progit [options]

Options:
  --repo <path>   Open this repository instead of the current directory
  --port <n>      Port to listen on (default: 8449)
  --no-open       Don't open a browser window on start
  --no-update     Don't check npm for a newer version on start
  -v, --version   Print the version and exit
  -h, --help      Show this help and exit

Run inside a git repository to open straight on it. One server handles any
repository on the machine; a second invocation reuses a running instance.`;

function openBrowser(url: string): void {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  execFile(cmd, [url], () => {});
}

function tryToplevel(cwd: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('git', ['rev-parse', '--show-toplevel'], { cwd }, (err, stdout) => {
      resolve(err ? null : stdout.trim());
    });
  });
}

async function isProgit(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://localhost:${port}/api/ping`, { signal: AbortSignal.timeout(1500) });
    const body = (await res.json()) as { progit?: boolean };
    return body.progit === true;
  } catch {
    return false;
  }
}

async function main() {
  if (flag('-h', '--help')) {
    console.log(HELP);
    return;
  }
  if (flag('-v', '--version')) {
    const { default: pkg } = await import('../../package.json', { with: { type: 'json' } });
    console.log(pkg.version);
    return;
  }

  const cwd = arg('--repo') ?? process.cwd();
  const cwdRepo = await tryToplevel(cwd);

  const registry = createRegistry();
  const runtime: AppRuntime = { port: 0, token: randomUUID() };
  const app = createApp(registry, runtime);

  const requested = Number(arg('--port')) || 8449;
  const urlFor = (port: number) => {
    const base = `http://localhost:${port}`;
    return cwdRepo ? `${base}/#/repository?path=${encodeURIComponent(cwdRepo)}` : base;
  };

  const server = serve({ fetch: app.fetch, port: requested, hostname: '127.0.0.1' }, (info) => {
    runtime.port = info.port;
    console.log(cwdRepo ? `progit serving ${cwdRepo}` : 'progit (no repository in cwd — open one from the home page)');
    console.log(`  ${urlFor(info.port)}`);
    if (!flag('--no-open')) openBrowser(urlFor(info.port));
    void maybeAutoUpdate(flag('--no-update'));
  });

  server.on('error', async (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      // a progit instance already owns the port — just open this repo there
      if (await isProgit(requested)) {
        const url = urlFor(requested);
        console.log(`progit already running on port ${requested} — opening there`);
        console.log(`  ${url}`);
        if (!flag('--no-open')) openBrowser(url);
        await registry.closeAll();
        process.exit(0);
      }
      console.error(`progit: port ${requested} is taken by another program — pass --port <n> to choose another`);
      process.exit(1);
    }
    throw err;
  });

  const shutdown = async () => {
    await registry.closeAll();
    server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
