import { execFile } from 'node:child_process';
import { createGit, type GitRunner } from './git.js';
import { createWatcher, type ChangeBus } from './watcher.js';

export interface RepoHandle {
  root: string;
  git: GitRunner;
  bus: ChangeBus;
}

export class RepoOpenError extends Error {}

function resolveToplevel(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', ['rev-parse', '--show-toplevel'], { cwd: path }, (err, stdout, stderr) => {
      if (err) reject(new RepoOpenError(stderr.trim() || `not a git repository: ${path}`));
      else resolve(stdout.trim());
    });
  });
}

export interface RepoRegistry {
  /** Resolves a user-supplied path to its repo root and returns a cached handle. */
  open(path: string): Promise<RepoHandle>;
  closeAll(): Promise<void>;
}

export function createRegistry(): RepoRegistry {
  const handles = new Map<string, Promise<RepoHandle>>();

  return {
    async open(path: string) {
      if (!path || !path.startsWith('/')) throw new RepoOpenError('path must be an absolute repository path');
      const root = await resolveToplevel(path);
      let h = handles.get(root);
      if (!h) {
        h = (async () => {
          const git = createGit(root);
          const bus = await createWatcher(git);
          return { root, git, bus };
        })();
        handles.set(root, h);
        h.catch(() => handles.delete(root));
      }
      return h;
    },
    async closeAll() {
      await Promise.all(
        [...handles.values()].map((p) => p.then((h) => h.bus.close()).catch(() => {})),
      );
      handles.clear();
    },
  };
}
