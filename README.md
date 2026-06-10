# progit

A modern, web-based git visualization tool — a successor to [ungit](https://github.com/FredrikNoren/ungit), rebuilt from scratch around a **tree-as-hero** UI: the commit graph is the whole interface, full-bleed and centered, with no fixed side panels.

![tree-as-hero](design-ref/ungit/_vv.png)

## Features (Milestone 1)

- **The tree is the interface** — branches render as colored "rivers", commits ride their lane, forks and merges curve between them. The checked-out branch is always the leftmost spine; **checking out re-lanes the whole graph** around the new HEAD.
- **Live** — chokidar watches the git dir and working tree; every terminal-side change (commit, stage, branch, file edit) appears in ~0.5s over SSE. No refresh button.
- **Diff drawer** — click a commit dot and the full diff slides in as a dismissible overlay: inline/split modes, syntax highlighting, word-level intra-line highlights, hunk folding, per-file accordions. Esc returns to the tree.
- **Working tree** — the dashed orange row at the top. Stage/unstage per file or per group, write a message, commit — all without leaving the tree.
- **Branch & tag creation** — from the commit context menu ("create branch here"), branch pills, or the branches popover. Validated names, optional checkout-after-create.
- **Checkout from anywhere** — branch pills on the tree, the branches popover (with live filter), remote branches (auto-creates a tracking branch).
- **Worktree peek** — inspect any linked worktree's uncommitted changes + diffs without switching checkouts (top-right switcher).
- **Focus + collapse** — long ref-less runs fold into "⋯ N more commits" breaks; histories load 500 commits at a time with "load more".
- **Keyboard** — `j`/`k`/arrows step through commits, `Esc` dismisses everything.
- Handles detached HEAD, octopus merges, renames, binary files, empty repos, and 30k-commit repos (first paint < 200ms; per-commit stats stream in after).

Git mutations always shell out to your real `git` (no reimplementation), are serialized against `index.lock` races, and surface git's own stderr in a toast when something is refused (e.g. dirty-tree checkout).

## Usage

```sh
pnpm install
pnpm build

# run inside any git repository
node bin/progit.js            # starts the server, opens your browser
node bin/progit.js --port 8000 --no-open
node bin/progit.js --repo /path/to/repo
```

## Development

```sh
pnpm dev          # tsx server on :3411 + Vite client on :5173 (proxied /api)
pnpm test         # vitest: parsers, lane engine, word-diff
pnpm typecheck
scripts/make-fixture.sh [dir]   # fabricate a gnarly repo (octopus merge, renames,
                                # binary, worktree, divergent origin, stash)
```

Browser-driven verification (needs Chrome):

```sh
node scripts/verify-ui.mjs http://localhost:3499/ dirty   # drawer, staging, hover, error toasts
node scripts/verify-ui.mjs http://localhost:3498/ clean   # checkout re-lane, create refs, keyboard
node scripts/verify-live.mjs http://localhost:3499/ /path/to/repo   # SSE + worktree peek
```

## Architecture

Single package, two halves sharing `src/shared/types.ts`:

- **Server** (`src/server/`) — Hono on Node. Every endpoint shells out to `git` via `execFile` (arg arrays only, validated ref names, paths after `--`). Parsers for `log` (`%x1f`/`%x1e` format strings), `for-each-ref`, `status --porcelain=v2 -z`, `worktree list --porcelain`, and unified diff output live in `src/server/parse/`. A chokidar watcher debounces git-dir + working-tree events into one SSE stream (`/api/events`).
- **Client** (`src/client/`) — React 19 + Vite + TanStack Query. SSE events invalidate queries by scope. The lane engine (`src/client/graph/lanes.ts`) re-lanes the graph client-side on every checkout: the current branch's first-parent chain is column 0, other branches fan out ordered by fork depth; branch colors are a stable name hash so they survive re-lanes and restarts. Per-commit `+/-` stats load progressively (`/api/log/stats`) because `--numstat` costs 10–20× the log itself on large repos.

The UI is a faithful port of the **Ungit Redesign v3** prototype in `design-ref/` (see its README); the design CSS is used nearly verbatim (`src/client/styles/`).

## Roadmap (M2)

Push / fetch / pull, merge, rebase, cherry-pick, revert, branch delete, stash management, and drag-a-ref-onto-a-node interactions. The corresponding menu items are visible but disabled with an "M2" hint.
