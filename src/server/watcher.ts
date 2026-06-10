import { watch, type FSWatcher } from 'chokidar';
import { readFileSync, existsSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import ignore from 'ignore';
import type { ChangeEvent, ChangeScope } from '../shared/types.js';
import type { GitRunner } from './git.js';

export interface ChangeBus {
  subscribe(fn: (e: ChangeEvent) => void): () => void;
  emit(scope: ChangeScope): void;
  close(): Promise<void>;
}

const DEBOUNCE_MS = 300;

export async function createWatcher(git: GitRunner): Promise<ChangeBus> {
  const subscribers = new Set<(e: ChangeEvent) => void>();
  let pending: Set<ChangeScope> = new Set();
  let timer: NodeJS.Timeout | null = null;

  const flush = () => {
    timer = null;
    if (pending.size === 0) return;
    const scope: ChangeScope = pending.size > 1 ? 'all' : [...pending][0]!;
    pending = new Set();
    const event: ChangeEvent = { type: 'change', scope };
    for (const fn of subscribers) fn(event);
  };

  const emit = (scope: ChangeScope) => {
    pending.add(scope);
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, DEBOUNCE_MS);
  };

  const gitDir = resolve(git.root, (await git.read(['rev-parse', '--git-dir'])).trim());
  const commonDir = resolve(git.root, (await git.read(['rev-parse', '--git-common-dir'])).trim());

  const gitTargets = [
    join(gitDir, 'HEAD'),
    join(gitDir, 'index'),
    join(gitDir, 'MERGE_HEAD'),
    join(commonDir, 'HEAD'),
    join(commonDir, 'packed-refs'),
    join(commonDir, 'refs'),
    join(commonDir, 'FETCH_HEAD'),
  ].filter((p, i, arr) => arr.indexOf(p) === i);

  const gitWatcher: FSWatcher = watch(gitTargets, {
    ignoreInitial: true,
    ignored: (p: string) => p.endsWith('.lock'),
  });
  gitWatcher.on('all', (_ev, path) => {
    emit(path.endsWith(sep + 'index') || path.endsWith('/index') ? 'index' : 'refs');
  });

  // working tree — respect .gitignore, always skip the git dir
  const ig = ignore();
  const gitignorePath = join(git.root, '.gitignore');
  if (existsSync(gitignorePath)) {
    try {
      ig.add(readFileSync(gitignorePath, 'utf8'));
    } catch {
      /* unreadable gitignore — watch everything */
    }
  }
  const wtWatcher: FSWatcher = watch(git.root, {
    ignoreInitial: true,
    ignored: (p: string) => {
      const rel = relative(git.root, p);
      if (!rel) return false;
      if (rel === '.git' || rel.startsWith('.git' + sep)) return true;
      if (rel.split(sep).includes('node_modules')) return true;
      try {
        return ig.ignores(rel.split(sep).join('/'));
      } catch {
        return false;
      }
    },
  });
  wtWatcher.on('all', (_ev, path) => {
    const rel = relative(git.root, path);
    if (rel === '.gitignore') return emit('all');
    emit('worktree');
  });

  return {
    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
    emit,
    async close() {
      if (timer) clearTimeout(timer);
      await Promise.all([gitWatcher.close(), wtWatcher.close()]);
    },
  };
}
