# progit for VS Code

Opens the [progit](https://github.com/uditdc/progit) git visualization for your
current workspace, rendered in an editor tab inside VS Code.

## How it works

The command **progit: Open Repository View** (Command Palette, or the branch
icon in the Source Control title bar):

1. Reuses a progit server already listening on the configured port, or spawns one
   (`progit --no-open --port <port>`) rooted at the chosen workspace folder.
2. Opens a Webview tab with the progit UI deep-linked to that repository.

Multi-root workspaces prompt for which folder to open.

## Requirements

`progit` must be launchable. Either:

- Install it globally: `npm i -g @udit_v/progit`, or
- Set `progit.command` to an absolute path, or
- Leave `progit.useNpxFallback` on (default) to fall back to `npx -y @udit_v/progit`.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `progit.command` | `progit` | Command used to launch the server. |
| `progit.args` | `[]` | Extra args passed before the managed `--no-open`/`--port` flags. |
| `progit.port` | `8449` | Port to use; a running instance on it is reused. |
| `progit.useNpxFallback` | `true` | Fall back to `npx -y @udit_v/progit` if the command isn't found. |

## Build / package

```sh
cd vscode-extension
npm install
npm run package      # produces progit-vscode-<version>.vsix
npm run publish      # publishes to the VS Code Marketplace (needs a PAT)
```
