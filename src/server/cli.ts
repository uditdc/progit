import { serve } from '@hono/node-server';
import { execFile } from 'node:child_process';
import { createApp } from './app.js';
import { createGit } from './git.js';
import { createWatcher } from './watcher.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(name);
}

function openBrowser(url: string): void {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  execFile(cmd, [url], () => {});
}

async function main() {
  if (flag('--version')) {
    const { default: pkg } = await import('../../package.json', { with: { type: 'json' } });
    console.log(pkg.version);
    return;
  }

  const cwd = arg('--repo') ?? process.cwd();
  let root: string;
  try {
    root = await new Promise<string>((resolve, reject) => {
      execFile('git', ['rev-parse', '--show-toplevel'], { cwd }, (err, stdout, stderr) => {
        if (err) reject(new Error(stderr.trim() || err.message));
        else resolve(stdout.trim());
      });
    });
  } catch {
    console.error(`progit: not a git repository: ${cwd}`);
    process.exit(1);
  }

  const git = createGit(root);
  const bus = await createWatcher(git);
  const app = createApp({ git, bus });

  const requested = Number(arg('--port')) || 8448;
  const server = serve({ fetch: app.fetch, port: requested, hostname: '127.0.0.1' }, (info) => {
    const url = `http://localhost:${info.port}`;
    console.log(`progit serving ${root}`);
    console.log(`  ${url}`);
    if (!flag('--no-open')) openBrowser(url);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`progit: port ${requested} in use — pass --port <n> to choose another`);
      process.exit(1);
    }
    throw err;
  });

  const shutdown = async () => {
    await bus.close();
    server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
