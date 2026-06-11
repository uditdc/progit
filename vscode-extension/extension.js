const vscode = require('vscode');
const { spawn } = require('node:child_process');
const http = require('node:http');

/** @type {import('child_process').ChildProcess | undefined} */
let server;
/** @type {vscode.WebviewPanel | undefined} */
let panel;

function config() {
  const c = vscode.workspace.getConfiguration('progit');
  return {
    command: c.get('command', 'progit'),
    args: c.get('args', []),
    port: c.get('port', 8449),
    useNpxFallback: c.get('useNpxFallback', true),
  };
}

function ping(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/api/ping', timeout: 1500 }, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body).progit === true);
        } catch {
          resolve(false);
        }
      });
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForServer(port, attempts = 40) {
  for (let i = 0; i < attempts; i++) {
    if (await ping(port)) return true;
    await delay(500);
  }
  return false;
}

function launch(command, args, cwd) {
  const child = spawn(command, args, { cwd, stdio: 'ignore', detached: false });
  return child;
}

async function ensureServer(port, cwd, log) {
  if (await ping(port)) return;

  const { command, args, useNpxFallback } = config();
  const managed = [...args, '--no-open', '--port', String(port)];

  await new Promise((resolve, reject) => {
    let child = launch(command, managed, cwd);
    let usedFallback = false;

    const onError = (err) => {
      if (err && err.code === 'ENOENT' && useNpxFallback && !usedFallback) {
        usedFallback = true;
        log(`'${command}' not found — falling back to npx`);
        child = launch('npx', ['-y', '@udit_v/progit', ...managed], cwd);
        child.once('error', (e) => reject(e));
        child.once('spawn', () => {
          server = child;
          resolve();
        });
        return;
      }
      reject(err);
    };

    child.once('error', onError);
    child.once('spawn', () => {
      server = child;
      resolve();
    });
  });

  if (!(await waitForServer(port))) {
    throw new Error(`progit server did not become ready on port ${port}`);
  }
}

async function pickFolder() {
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 0) return undefined;
  if (folders.length === 1) return folders[0];
  const picked = await vscode.window.showQuickPick(
    folders.map((f) => ({ label: f.name, description: f.uri.fsPath, folder: f })),
    { placeHolder: 'Select a repository to open in progit' },
  );
  return picked?.folder;
}

function webviewHtml(srcUrl, frameOrigin) {
  const csp = [
    "default-src 'none'",
    `frame-src ${frameOrigin} http://127.0.0.1:* http://localhost:*`,
    "style-src 'unsafe-inline'",
  ].join('; ');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <style>
    html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; }
    iframe { border: 0; width: 100%; height: 100vh; display: block; }
  </style>
</head>
<body>
  <iframe src="${srcUrl}" allow="clipboard-read; clipboard-write"></iframe>
</body>
</html>`;
}

async function openRepoView() {
  const { port } = config();
  const out = vscode.window.createOutputChannel('progit');

  const folder = await pickFolder();
  if (!folder) {
    vscode.window.showErrorMessage('progit: open a folder/workspace first.');
    return;
  }

  try {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Starting progit…' },
      () => ensureServer(port, folder.uri.fsPath, (m) => out.appendLine(m)),
    );
  } catch (err) {
    out.appendLine(String(err && err.stack ? err.stack : err));
    vscode.window.showErrorMessage(`progit: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  const base = await vscode.env.asExternalUri(vscode.Uri.parse(`http://127.0.0.1:${port}`));
  const baseStr = base.toString().replace(/\/$/, '');
  const src = `${baseStr}/#/repository?path=${encodeURIComponent(folder.uri.fsPath)}`;
  const frameOrigin = `${base.scheme}://${base.authority}`;

  if (panel) {
    panel.reveal(vscode.ViewColumn.Active, false);
  } else {
    panel = vscode.window.createWebviewPanel('progit.view', 'progit', { viewColumn: vscode.ViewColumn.Active, preserveFocus: false }, {
      enableScripts: true,
      retainContextWhenHidden: true,
    });
    panel.iconPath = new vscode.ThemeIcon('git-branch');
    panel.onDidDispose(() => {
      panel = undefined;
    });
  }
  panel.title = `progit — ${folder.name}`;
  panel.webview.html = webviewHtml(src, frameOrigin);
}

function stopServer() {
  if (server && !server.killed) {
    server.kill();
    server = undefined;
    vscode.window.showInformationMessage('progit: server stopped.');
  } else {
    vscode.window.showInformationMessage('progit: no server started by this extension.');
  }
}

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('progit.open', openRepoView),
    vscode.commands.registerCommand('progit.stopServer', stopServer),
  );
}

function deactivate() {
  if (server && !server.killed) server.kill();
}

module.exports = { activate, deactivate };
