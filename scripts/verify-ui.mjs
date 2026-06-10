/* Interaction verification for progit.
   Usage: node scripts/verify-ui.mjs <url> <dirty|clean> */
import { chromium } from 'playwright-core';

const URL = process.argv[2] ?? 'http://localhost:3499/';
const MODE = process.argv[3] ?? 'dirty';
const SHOT = (n) => `/tmp/v-${MODE}-${n}.png`;

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto(URL);
await page.waitForSelector('.trow', { timeout: 10000 });
await page.waitForTimeout(800);

if (MODE === 'dirty') {
  // 1. commit dot -> drawer with diff; overlay must not shift the tree
  await page.locator('.tnode-hit').nth(3).click();
  await page.waitForSelector('.drawer', { timeout: 5000 });
  await page.waitForTimeout(800);
  console.log('drawer commit:', await page.locator('.drawer .dh-msg').textContent());
  console.log('diff files:', await page.locator('.drawer .diff-file').count());
  await page.screenshot({ path: SHOT('drawer') });
  const treeBox1 = await page.locator('.tree-wrap').boundingBox();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const treeBox2 = await page.locator('.tree-wrap').boundingBox();
  console.log('overlay check:', treeBox1.x === treeBox2.x ? 'OK (no shift)' : 'SHIFTED!');

  // 2. working tree groups + stage/unstage round-trip
  await page.locator('.trow.wd').click();
  await page.waitForSelector('.drawer .files-group-label', { timeout: 5000 });
  await page.waitForTimeout(500);
  console.log('wd groups:', (await page.locator('.files-group-label').allTextContents()).map((g) => g.trim()).join(' | '));
  await page.screenshot({ path: SHOT('wd') });
  // stage the unstaged file, then unstage it back
  const changesStageBtn = page.locator('.diff-file-head .stage-btn', { hasText: 'Stage' }).first();
  await changesStageBtn.click({ force: true });
  await page.waitForTimeout(1200);
  console.log('groups after stage:', (await page.locator('.files-group-label').allTextContents()).map((g) => g.trim()).join(' | '));

  // 3. hover lineage dim in branches popover
  await page.keyboard.press('Escape');
  await page.locator('.v3-top .tb-btn').first().click();
  await page.waitForSelector('.pop-row', { timeout: 5000 });
  await page.locator('.pop-row', { hasText: 'feature/search' }).first().hover();
  await page.waitForTimeout(400);
  console.log('dimmed rows on hover:', await page.locator('.trow.dim').count());
  await page.screenshot({ path: SHOT('hover') });

  // 4. dirty checkout must surface git's error as a toast
  await page.locator('.pop-row', { hasText: 'feature/search' }).first().click();
  await page.waitForTimeout(1500);
  const toast = await page.locator('.fade-in').last().textContent().catch(() => '');
  console.log('dirty-checkout toast:', toast.includes('overwritten') ? 'OK (git error surfaced)' : 'MISSING: ' + toast);
  await page.screenshot({ path: SHOT('toast') });
} else {
  // clean repo: checkout re-lanes, pill menu, create branch, keyboard nav
  console.log('initial topbar:', (await page.locator('.v3-top .tb-btn').first().textContent()).trim());

  // checkout feature/search from popover
  await page.locator('.v3-top .tb-btn').first().click();
  await page.waitForSelector('.pop-row', { timeout: 5000 });
  await page.locator('.pop-row', { hasText: 'feature/search' }).first().click();
  await page.waitForTimeout(1800);
  console.log('topbar after checkout:', (await page.locator('.v3-top .tb-btn').first().textContent()).trim());
  await page.screenshot({ path: SHOT('checkout') });

  const headPillRow = page.locator('.trow', { has: page.locator('.tipcap.head') });
  console.log('head pill present:', (await headPillRow.count()) > 0 ? 'yes' : 'NO');

  // pill menu on main -> checkout back
  const mainPill = page.locator('.tipcap', { hasText: 'main' }).first();
  await mainPill.click();
  await page.waitForSelector('.ctx-menu', { timeout: 5000 });
  console.log('branch menu:', (await page.locator('.ctx-menu .mi').allTextContents()).join(' | '));
  await page.screenshot({ path: SHOT('branchmenu') });
  await page.locator('.ctx-menu .mi', { hasText: "Checkout 'main'" }).click();
  await page.waitForTimeout(1800);
  console.log('topbar after pill checkout:', (await page.locator('.v3-top .tb-btn').first().textContent()).trim());

  // create branch via commit context menu
  await page.locator('.tnode-hit').nth(5).click({ button: 'right' });
  await page.waitForSelector('.ctx-menu');
  await page.locator('.ctx-menu .mi', { hasText: 'Create branch here' }).click();
  await page.waitForSelector('.modal');
  await page.locator('.modal .tin').fill('feat/verified-ui');
  await page.screenshot({ path: SHOT('dialog') });
  await page.locator('.modal .tb-btn.primary').click();
  await page.waitForTimeout(1800);
  console.log('new pill rendered:', (await page.locator('.tipcap', { hasText: 'feat/verified-ui' }).count()) > 0 ? 'yes' : 'NO');
  console.log('topbar after create+checkout:', (await page.locator('.v3-top .tb-btn').first().textContent()).trim());
  await page.screenshot({ path: SHOT('created') });

  // keyboard nav
  await page.keyboard.press('Escape');
  await page.keyboard.press('j');
  await page.keyboard.press('j');
  await page.waitForTimeout(600);
  console.log('selected after jj:', (await page.locator('.trow.sel .msg').first().textContent()).trim());

  // create tag via dialog from branches popover footer
  await page.keyboard.press('Escape');
  await page.locator('.v3-top .tb-btn').first().click();
  await page.locator('.pop-fbtn', { hasText: 'New tag…' }).click();
  await page.waitForSelector('.modal');
  await page.locator('.modal .tin').fill('v9.9.9-ui');
  await page.locator('.modal .tb-btn.primary').click();
  await page.waitForTimeout(1500);
  console.log('tag pill rendered:', (await page.locator('.refmini', { hasText: 'v9.9.9-ui' }).count()) > 0 ? 'yes' : 'NO');
}

console.log('JS errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
