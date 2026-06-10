import { execFile } from 'node:child_process';
import { REF_NAME_RE } from '../shared/types.js';

const MAX_BUFFER = 64 * 1024 * 1024;

export class GitError extends Error {
  constructor(
    message: string,
    public exitCode: number,
    public stderr: string,
  ) {
    super(message);
    this.name = 'GitError';
  }
}

export interface GitExecOpts {
  cwd?: string;
  okCodes?: number[];
  stdin?: string;
  /** Extra environment (e.g. GIT_ASKPASS bridge for remote operations). */
  env?: Record<string, string>;
}

export interface GitRunner {
  /** Read-only command; runs concurrently. */
  read(args: string[], opts?: GitExecOpts): Promise<string>;
  /** Mutating command; serialized through a queue to avoid index.lock races. */
  write(args: string[], opts?: Omit<GitExecOpts, 'okCodes'>): Promise<string>;
  readonly root: string;
}

function run(args: string[], cwd: string, okCodes: number[], stdin?: string, env?: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      'git',
      args,
      {
        cwd,
        maxBuffer: MAX_BUFFER,
        env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C', ...env },
      },
      (err, stdout, stderr) => {
        if (err) {
          const code = typeof (err as NodeJS.ErrnoException & { code?: unknown }).code === 'number'
            ? ((err as unknown as { code: number }).code)
            : 1;
          if (okCodes.includes(code)) return resolve(stdout);
          return reject(new GitError(`git ${args[0]} failed`, code, stderr || err.message));
        }
        resolve(stdout);
      },
    );
    if (stdin !== undefined && child.stdin) {
      child.stdin.write(stdin);
      child.stdin.end();
    }
  });
}

export function createGit(root: string): GitRunner {
  let writeChain: Promise<unknown> = Promise.resolve();
  return {
    root,
    read(args, opts = {}) {
      return run(args, opts.cwd ?? root, opts.okCodes ?? [0], opts.stdin, opts.env);
    },
    write(args, opts = {}) {
      const next = writeChain.then(
        () => run(args, opts.cwd ?? root, [0], opts.stdin, opts.env),
        () => run(args, opts.cwd ?? root, [0], opts.stdin, opts.env),
      );
      writeChain = next.catch(() => {});
      return next;
    },
  };
}

export function validateRefName(name: string): boolean {
  return REF_NAME_RE.test(name) && !name.includes('..') && !name.endsWith('.lock') && !name.endsWith('/');
}

/** Reject anything that could be parsed as a git option. */
export function validateRevision(rev: string): boolean {
  return rev.length > 0 && !rev.startsWith('-') && !/[\s\0]/.test(rev);
}

export function validatePath(p: string): boolean {
  return p.length > 0 && !p.includes('\0') && !p.split('/').includes('..');
}
