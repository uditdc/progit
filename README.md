# progit

A modern, web-based git visualization tool — a successor to [ungit](https://github.com/FredrikNoren/ungit).

## Features

- 🌳 **The tree is the interface** — branches render as colored "rivers", commits ride their lane, forks and merges curve between them. The checked-out branch is always the leftmost spine; checking out re-lanes the whole graph around the new HEAD.
- ⚡ **Live** — every terminal-side change (commit, stage, branch, file edit) appears in ~0.5s over SSE, watched via chokidar. No refresh button.
- 🔍 **Diff drawer** — click a commit dot and the full diff slides in as a dismissible overlay: inline/split modes, syntax highlighting, word-level intra-line highlights, hunk folding, per-file accordions.
- 📝 **Working tree** — stage/unstage per file or per group, write a message, commit, all from the dashed row at the top of the tree.
- 🌿 **Branch & tag creation** — from the commit context menu, branch pills, or the branches popover, with validated names and optional checkout-after-create.
- ↪️ **Checkout from anywhere** — branch pills, the branches popover (with live filter), or remote branches (auto-creates a tracking branch).
- 🗂️ **Worktree peek** — inspect any linked worktree's uncommitted changes and diffs without switching checkouts.
- 🔄 **Push / fetch / pull** — live top-bar buttons and per-branch/per-remote actions from the pill menus. Git's askpass prompt becomes a browser modal for credentials — masked, answered once per operation, never stored.
- 📐 **Focus + collapse** — long ref-less runs fold into "⋯ N more commits" breaks; histories load 500 commits at a time.
- ⌨️ **Keyboard-driven** — `j`/`k`/arrows step through commits, `Esc` dismisses everything.
- 💪 **Built for scale** — handles detached HEAD, octopus merges, renames, binary files, empty repos, and 30k-commit repos (first paint < 200ms; per-commit stats stream in after).

Git mutations always shell out to your real `git` (no reimplementation), are serialized against `index.lock` races, and surface git's own stderr in a toast when something is refused (e.g. dirty-tree checkout).

## Usage

Install globally and run the `progit` binary from any repository:

```sh
npm i -g @udit_v/progit

progit                        # in a repo: opens the browser straight on it
progit --port 8000 --no-open
progit --repo /path/to/repo
progit --help
```

From source:

```sh
pnpm install
pnpm build
node bin/progit.js            # same flags as above
```

Navigation is URL-based, like ungit: one server handles **any repository on the machine**. `#/repository?path=/abs/path` is the canonical, shareable address of a repo view; the bare URL is a home screen with a path input and your recent repositories. Running the CLI inside a repo just deep-links you there.

The server listens on **8449** by default. If a progit instance already owns the port, a second `progit` invocation doesn't start another server — it opens a browser tab on the running one, pointed at the repo you invoked it from. If the port is held by some other program, it exits with an error (use `--port`).

### Auto-update

On start, a global install checks npm at most once a day for a newer release and, if one exists, runs `npm i -g @udit_v/progit@latest` in place (you'll be told to restart progit to pick it up). The check runs in the background and never blocks startup. Source checkouts are skipped. Opt out with `--no-update` or the `PROGIT_NO_UPDATE` environment variable.

## VS Code extension

`vscode-extension/` is a companion extension that runs progit inside an editor tab. The **progit: Open Repository View** command (Command Palette, or the branch icon in the Source Control title bar) reuses or spawns a progit server for the workspace folder and renders the UI in a Webview deep-linked to that repo. It expects `progit` on `PATH` (falls back to `npx -y @udit_v/progit`); see `vscode-extension/README.md` for settings and packaging.

## License

MIT © Udit
