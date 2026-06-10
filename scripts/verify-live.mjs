/* Live-update + worktree-peek verification.
   Usage: node scripts/verify-live.mjs <url> <repoPath> */
import { chromium } from 'playwright-core';
import { execSync } from 'node:child_process';
import { appendFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const URL = process.argv[2] ?? 'http://localhost:3499/';
const REPO = process.argv[3] ?? '/tmp/progit-fixture';

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto(URL);
await page.waitForSelector('.trow', { timeout: 10000 });
await page.waitForTimeout(800);

// 1. live update: create a file in the terminal -> wd count bumps without reload
const wdText = () => page.locator('.trow.wd .msg').textContent().catch(() => 'none');
const before = await wdText();
writeFileSync(join(REPO, 'live-test.txt'), 'live\n');
const t0 = Date.now();
let after = before;
while (Date.now() - t0 < 6000) {
  await page.waitForTimeout(250);
  after = await wdText();
  if (after !== before) break;
}
console.log(`live update: "${before}" -> "${after}" in ${Date.now() - t0}ms ${after !== before ? 'OK' : 'FAILED'}`);
rmSync(join(REPO, 'live-test.txt'));

// 2. live update on commit from terminal -> new row appears
const rowCount = await page.locator('.trow').count();
execSync('git commit -q --allow-empty -m "live: empty commit from terminal"', { cwd: REPO });
const t1 = Date.now();
let rows = rowCount;
while (Date.now() - t1 < 6000) {
  await page.waitForTimeout(250);
  rows = await page.locator('.trow').count();
  if (rows !== rowCount) break;
}
const topMsg = await page.locator('.trow .msg').nth(1).textContent();
console.log(`commit live: rows ${rowCount} -> ${rows}, top commit: "${topMsg}" ${topMsg?.includes('live:') ? 'OK' : 'FAILED'}`);
execSync('git reset -q --hard HEAD~1', { cwd: REPO });

// 3. worktree peek
await page.locator('.wt-trigger').click();
await page.waitForSelector('.pop-row', { timeout: 5000 });
const wtRows = await page.locator('.pop-row').allTextContents();
console.log('worktrees:', wtRows.map((r) => r.trim().slice(0, 40)).join(' | '));
await page.locator('.pop-row').last().click();
await page.waitForSelector('.detail-head.peek', { timeout: 5000 });
await page.waitForTimeout(800);
console.log('peek header:', (await page.locator('.detail-head.peek .dh-msg').textContent()).trim());
console.log('peek tag:', (await page.locator('.peek-tag').textContent()).trim());
console.log('peek files:', await page.locator('.drawer .diff-file').count());
console.log('peek staging buttons (must be 0):', await page.locator('.drawer .stage-btn').count());
await page.screenshot({ path: '/tmp/v-peek.png' });

console.log('JS errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
