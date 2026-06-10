/* Push / fetch / pull + credential-modal verification.
   Usage: node scripts/verify-remote.mjs <repoUrl> <repoPath> */
import { chromium } from 'playwright-core';
import { execSync } from 'node:child_process';

const URL = process.argv[2];
const REPO = process.argv[3];
const sh = (cmd, cwd = REPO) => execSync(cmd, { cwd, encoding: 'utf8' }).trim();

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(URL);
await page.waitForSelector('.trow', { timeout: 10000 });
await page.waitForTimeout(800);

const topBtn = (label) => page.locator('.v3-actions .tb-btn', { hasText: label }).first();
const toastText = async () => (await page.locator('.fade-in').last().textContent().catch(() => '')).trim();

// 1. push — fixture main is ahead 2 of its bare origin
console.log('origin main before push:', sh(`git -C ${REPO}-origin.git rev-parse --short main`));
await topBtn('Push').click();
await page.waitForTimeout(2500);
console.log('push toast:', await toastText());
console.log('origin main after push: ', sh(`git -C ${REPO}-origin.git rev-parse --short main`), '(local:', sh('git rev-parse --short main') + ')');

// advance origin from a fresh clone so the fixture falls behind by exactly one
sh(`rm -rf /tmp/progit-clone2 && git clone -q ${REPO}-origin.git /tmp/progit-clone2`, '/tmp');
sh('git -c user.email=c@x -c user.name=Clone commit -q --allow-empty -m "remote: advance from clone"', '/tmp/progit-clone2');
sh('git push -q origin main', '/tmp/progit-clone2');

// 2. fetch — the 401 remote will fail and prompt; fetch '--all' covers both remotes
await topBtn('Fetch').click();
await page.waitForSelector('.modal', { timeout: 15000 });
const prompt1 = await page.locator('.modal .fld').textContent();
console.log('credential prompt 1:', prompt1.trim().slice(0, 50));
await page.locator('.modal .tin').fill('testuser');
await page.locator('.modal .tb-btn.primary').click();
await page.waitForTimeout(1200);
const prompt2 = await page.locator('.modal .fld').textContent().catch(() => 'none');
console.log('credential prompt 2:', prompt2.trim().slice(0, 50));
const masked = await page.locator('.modal .tin').getAttribute('type');
console.log('password input masked:', masked === 'password' ? 'yes' : 'NO: ' + masked);
await page.locator('.modal .tin').fill('hunter2');
await page.locator('.modal .tb-btn.primary').click();
await page.waitForTimeout(4000);
console.log('fetch result toast:', await toastText());

// behind count should now show (origin advanced by the clone) and the Pull button appears
const pullBtn = topBtn('Pull');
await pullBtn.waitFor({ timeout: 8000 });
console.log('pull button:', (await pullBtn.textContent()).trim());
await page.screenshot({ path: '/tmp/v-remote-prepull.png' });

// 3. pull — fast-forward
const localBefore = sh('git rev-parse --short main');
await pullBtn.click();
await page.waitForTimeout(3000);
console.log('pull toast:', await toastText());
console.log('local main:', localBefore, '->', sh('git rev-parse --short main'), '| origin:', sh(`git -C ${REPO}-origin.git rev-parse --short main`));
console.log('top commit msg now:', (await page.locator('.trow .msg').nth(1).textContent()).trim());

await page.screenshot({ path: '/tmp/v-remote-done.png' });
console.log('JS errors:', errors.length ? errors.join(';') : 'none');
await browser.close();
