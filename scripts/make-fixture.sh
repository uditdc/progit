#!/usr/bin/env bash
# Fabricates a gnarly git repo for testing progit.
# Usage: scripts/make-fixture.sh [target-dir]   (default: mktemp -d)
set -euo pipefail

DIR="${1:-$(mktemp -d /tmp/progit-fixture-XXXX)}"
mkdir -p "$DIR"
cd "$DIR"

export GIT_AUTHOR_NAME="Ada Lovelace" GIT_AUTHOR_EMAIL="ada@example.com"
export GIT_COMMITTER_NAME="Ada Lovelace" GIT_COMMITTER_EMAIL="ada@example.com"

git init -q -b main

commit() { # commit <file> <content> <message> [author]
  local file="$1" content="$2" msg="$3" author="${4:-}"
  mkdir -p "$(dirname "$file")"
  printf '%s\n' "$content" >> "$file"
  git add "$file"
  if [ -n "$author" ]; then
    git -c user.name="$author" -c user.email="$(echo "$author" | tr ' A-Z' '.a-z')@example.com" \
      commit -q -m "$msg" --author="$author <$(echo "$author" | tr ' A-Z' '.a-z')@example.com>"
  else
    git commit -q -m "$msg"
  fi
}

# --- trunk: initial history -------------------------------------------------
commit README.md "# fixture" "chore: initial scaffold"
commit src/app.ts "export const app = () => 'hello';" "feat: app entry"
commit src/util.ts "export const id = <T>(x: T) => x;" "feat: util helpers"
for i in $(seq 1 12); do
  commit src/app.ts "// trunk work $i" "chore: trunk work $i"
done
git tag v0.1.0
git tag -a v0.2.0 -m "release v0.2.0"

# --- feature/auth: merged via normal merge ----------------------------------
git checkout -q -b feature/auth
commit src/auth/login.ts "export const login = () => {};" "feat: login flow" "Grace Hopper"
commit src/auth/token.ts "export const token = () => 'jwt';" "feat: token issuing" "Grace Hopper"
commit src/auth/login.ts "// refresh support" "feat: token refresh" "Grace Hopper"
git checkout -q main
commit src/app.ts "// trunk while auth in flight" "chore: trunk drift"
git merge -q --no-ff feature/auth -m "Merge branch 'feature/auth'"

# --- feature/search: long-running, NOT merged (exercises collapse) ----------
git checkout -q -b feature/search main~4
for i in $(seq 1 9); do
  commit src/search/index.ts "// search iteration $i" "feat: search step $i" "Alan Turing"
done

# --- fix/crash + feature/perf: octopus merge --------------------------------
git checkout -q main
git checkout -q -b fix/crash
commit src/app.ts "// crash guard" "fix: null crash"
git checkout -q main
git checkout -q -b feature/perf
commit src/util.ts "// memoize" "perf: memoize id"
git checkout -q main
git merge -q --no-ff fix/crash feature/perf -m "Merge crash fix and perf work (octopus)"

# --- rename + binary on trunk ------------------------------------------------
git mv src/util.ts src/helpers.ts
git commit -q -m "refactor: rename util to helpers"
printf '\x89PNG\r\n\x1a\n\x00\x00fixture' > logo.png
git add logo.png
git commit -q -m "chore: add binary logo"

# --- bare origin with divergence ---------------------------------------------
git clone -q --bare . "$DIR-origin.git"
git remote add origin "$DIR-origin.git"
git fetch -q origin
git branch -q --set-upstream-to=origin/main main
git push -q origin feature/search
git branch -q --set-upstream-to=origin/feature/search feature/search
# make main ahead 2 of origin
commit src/app.ts "// ahead one" "feat: unpushed one"
commit src/app.ts "// ahead two" "feat: unpushed two"

# --- linked worktree with its own dirty state --------------------------------
git worktree add -q "$DIR-wt" feature/search
echo "// dirty in worktree" >> "$DIR-wt/src/search/index.ts"
echo "scratch" > "$DIR-wt/notes.txt"

# --- working tree state: staged, unstaged, untracked, renamed ----------------
echo "// staged change" >> src/app.ts
git add src/app.ts
git mv src/auth/token.ts src/auth/jwt.ts
echo "// unstaged change" >> src/helpers.ts
echo "draft" > TODO.txt
mkdir -p docs
echo "# notes" > docs/notes.md

# --- a stash ------------------------------------------------------------------
echo "// stashed" >> src/auth/login.ts
git stash push -q -m "wip: login spike" -- src/auth/login.ts

echo "$DIR"
