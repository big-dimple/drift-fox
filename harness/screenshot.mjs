/** Minimal deterministic screenshots and desktop/mobile smoke checks (M0). */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.SHOT_PORT || 5199);
const base = `http://localhost:${port}/?harness=1`;
const chromePath = process.env.CHROME_PATH ||
  (existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined);

function parseArgs(argv) {
  const options = {
    mobile: false,
    verifySmoke: false,
    pose: '',
    out: process.env.SHOT_OUT || path.join(root, 'shots'),
    settleMs: Number(process.env.SHOT_SETTLE_MS || 160),
  };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--mobile') options.mobile = true;
    else if (arg === '--verify-smoke') options.verifySmoke = true;
    else if (arg === '--pose') options.pose = argv[++index] ?? '';
    else if (arg === '--out') options.out = path.resolve(root, argv[++index] ?? '');
    else if (arg === '--settle') options.settleMs = Number(argv[++index]);
    else throw new Error(`unknown option: ${arg}`);
  }
  if (!Number.isFinite(options.settleMs) || options.settleMs < 0 || options.settleMs > 5000) {
    throw new Error('--settle must be between 0 and 5000 milliseconds');
  }
  return options;
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`dev server did not start at ${url}`);
}

async function openHarness(browser, mobile) {
  const context = await browser.newContext({
    viewport: mobile ? { width: 844, height: 390 } : { width: 1440, height: 900 },
    deviceScaleFactor: mobile ? 3 : 2,
    reducedMotion: 'no-preference',
    ...(mobile ? { hasTouch: true, isMobile: true } : {}),
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => console.error(`[pageerror] ${error.message}`));
  await page.goto(`${base}${mobile ? '&mobile=1' : ''}`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.__harness?.ready, null, { timeout: 60000 });
  return { context, page };
}

async function renderEvidence(page) {
  return page.evaluate(() => {
    window.__harness.render();
    const source = document.querySelector('#app > canvas');
    if (!(source instanceof HTMLCanvasElement)) return null;
    const sample = document.createElement('canvas');
    sample.width = 64;
    sample.height = 36;
    const context = sample.getContext('2d', { willReadFrequently: true });
    context.drawImage(source, 0, 0, sample.width, sample.height);
    const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
    let min = 255;
    let max = 0;
    let opaque = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const luma = (pixels[index] * 3 + pixels[index + 1] * 6 + pixels[index + 2]) / 10;
      min = Math.min(min, luma);
      max = Math.max(max, luma);
      if (pixels[index + 3] > 240) opaque++;
    }
    return { width: source.clientWidth, height: source.clientHeight, lumaRange: max - min, opaque };
  });
}

async function proveRendered(page, label) {
  let render = null;
  let stats = null;
  // Cold dev-server transforms make the first paint slow; be patient.
  for (let attempt = 0; attempt < 8; attempt++) {
    render = await renderEvidence(page);
    stats = await page.evaluate(() => window.__harness.stats());
    if (render && render.lumaRange > 8 && Number(stats.calls) > 0) break;
    await page.waitForTimeout(250);
  }
  assert.ok(render && render.lumaRange > 8 && Number(stats?.calls) > 0,
    `${label}: renderer remained blank after retries: ${JSON.stringify({ render, stats })}`);
  return { render, stats };
}

async function verifyMode(browser, mobile, out) {
  const label = mobile ? 'mobile-844x390' : 'desktop-1440x900';
  const { context, page } = await openHarness(browser, mobile);
  try {
    const { render, stats } = await proveRendered(page, label);

    // The fox must actually run: 2 s of sim puts it near cruise speed and
    // well down the field.
    const fox0 = await page.evaluate(() => window.__harness.fox());
    await page.evaluate(() => window.__harness.advance(2));
    const fox1 = await page.evaluate(() => window.__harness.fox());
    assert.ok(fox1.speed > 10, `${label}: fox did not reach running speed: ${JSON.stringify(fox1)}`);
    assert.ok(Math.abs(fox1.z - fox0.z) > 20, `${label}: fox did not advance: ${JSON.stringify({ fox0, fox1 })}`);

    // Grip drift charges frost; releasing pays out the burst.
    await page.evaluate(() => window.__harness.drive(1, true, 3));
    await page.evaluate(() => window.__harness.advance(1.5));
    const fox2 = await page.evaluate(() => window.__harness.fox());
    assert.ok(fox2.drifting, `${label}: drift hold did not engage: ${JSON.stringify(fox2)}`);
    assert.ok(fox2.frost > 0.03, `${label}: drift did not charge frost: ${JSON.stringify(fox2)}`);
    const fx2 = await page.evaluate(() => window.__harness.stats());
    assert.ok(Number(fx2.clawMarks) > 0, `${label}: drift carved no claw marks`);
    assert.ok(Number(fx2.coldAir) > 0, `${label}: drift emitted no cold air`);
    await page.evaluate(() => window.__harness.drive(0, false, 2));
    await page.evaluate(() => window.__harness.advance(0.3));
    const fox3 = await page.evaluate(() => window.__harness.fox());
    assert.ok(fox3.speed > fox2.speed + 2,
      `${label}: release burst did not fire: ${JSON.stringify({ fox2, fox3 })}`);
    console.log(`${label}: run/drift/burst contract OK ` +
      `(speed ${fox1.speed.toFixed(1)} -> drift frost ${fox2.frost.toFixed(2)} -> burst ${fox3.speed.toFixed(1)})`);

    // M2 leap/fall contract: full frost at a gate = leap across the chasm;
    // short on frost = the chasm takes the run and the director respawns.
    // Drive the full five-gate run via warps: every gate must leap.
    for (let g = 0; g < 5; g++) {
      await page.evaluate((i) => window.__harness.warpToGate(i, 1, 22), g);
      await page.evaluate(() => window.__harness.advance(2.5));
      const r = await page.evaluate(() => window.__harness.course());
      assert.equal(r.gatesPassed, g + 1,
        `${label}: gate ${g} did not leap with full frost: ${JSON.stringify(r)}`);
    }
    let run = await page.evaluate(() => window.__harness.course());
    assert.equal(run.finished, true, `${label}: run did not finish after gate 5`);

    // Fall path: no frost at a gate = the chasm takes it.
    await page.evaluate(() => window.__harness.resetRun());
    await page.evaluate(() => window.__harness.warpToGate(0, 0, 22));
    await page.evaluate(() => window.__harness.advance(2.5));
    run = await page.evaluate(() => window.__harness.course());
    assert.ok(run.falls >= 1, `${label}: no-frost crossing did not fall: ${JSON.stringify(run)}`);
    const foxAfterFall = await page.evaluate(() => window.__harness.fox());
    assert.equal(foxAfterFall.falling, false, `${label}: respawn did not restore ground`);
    console.log(`${label}: leap/fall/finish contract OK ` +
      `(gates ${run.gatesPassed}, falls ${run.falls}, time ${run.raceTime.toFixed(1)}s)`);

    // Settle back to a clean run for the beauty shot.
    await page.evaluate(() => window.__harness.resetRun());
    await page.evaluate(() => window.__harness.drive(0.35, false, 1.2));
    await page.evaluate(() => window.__harness.advance(1.2));
    const output = path.join(out, mobile ? 'smoke-mobile.png' : 'smoke-desktop.png');
    await page.screenshot({ path: output });
    console.log(`${label}: calls=${stats.calls} triangles=${stats.triangles} ` +
      `pixels=${stats.drawingPixels} frameMs=${Number(stats.frameMs).toFixed(1)} ` +
      `lumaRange=${render.lumaRange.toFixed(1)} -> ${output}`);
  } finally {
    await context.close();
  }
}

async function capture(browser, options) {
  mkdirSync(options.out, { recursive: true });
  const { context, page } = await openHarness(browser, options.mobile);
  try {
    if (options.pose === 'drift') {
      // Carve hard for a couple of seconds so the claw trail and cold air
      // read, then keep holding the drift for the shot.
      await page.evaluate(() => window.__harness.drive(0.9, true, 3));
      await page.evaluate(() => window.__harness.advance(2.4));
    } else if (options.pose === 'leap') {
      // Warp onto gate 2's approach at speed with full frost, then step in
      // small increments until the leap is airborne over the chasm.
      await page.evaluate(() => window.__harness.warpToGate(2, 1, 26));
      await page.evaluate(() => {
        for (let i = 0; i < 200 && !window.__harness.fox().leaping; i++) {
          window.__harness.advance(0.1);
        }
        window.__harness.advance(0.55);
      });
    } else if (options.pose === 'closeup') {
      // Art review: fox running at cruise, camera parked at its front-left.
      await page.evaluate(() => window.__harness.advance(2.0));
      await page.evaluate(() => window.__harness.view('closeup'));
      await page.evaluate(() => window.__harness.advance(0.5));
    } else if (options.pose === 'closeup-drift') {
      await page.evaluate(() => window.__harness.drive(0.9, true, 3));
      await page.evaluate(() => window.__harness.advance(2.0));
      await page.evaluate(() => window.__harness.view('closeup'));
      await page.evaluate(() => window.__harness.advance(0.5));
    } else if (options.pose === 'turn') {
      // Hard non-drift turn: the vista dome must show no edge at any heading.
      await page.evaluate(() => window.__harness.drive(1, false, 4));
      await page.evaluate(() => window.__harness.advance(3.0));
    }
    await page.waitForTimeout(options.settleMs);
    const label = options.mobile ? 'mobile' : 'desktop';
    const { stats } = await proveRendered(page, label);
    const name = options.pose ? `scene-${options.pose}` : 'scene';
    const output = path.join(options.out, `${name}${options.mobile ? '-mobile' : ''}.png`);
    await page.screenshot({ path: output });
    console.log(`${output}: calls=${stats.calls} triangles=${stats.triangles} pixels=${stats.drawingPixels}`);
  } finally {
    await context.close();
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const server = spawn(process.execPath,
    [path.join(root, 'node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort'],
    { cwd: root, stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, CHOKIDAR_USEPOLLING: '1' } });
  server.stderr.on('data', (data) => process.stderr.write(`[vite] ${data}`));
  let browser;
  try {
    await waitForServer(base);
    browser = await chromium.launch({
      headless: true,
      ...(chromePath ? { executablePath: chromePath } : {}),
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
        '--ignore-gpu-blocklist', '--disable-gpu-sandbox'],
    });
    if (options.verifySmoke) {
      mkdirSync(options.out, { recursive: true });
      await verifyMode(browser, false, options.out);
      await verifyMode(browser, true, options.out);
      console.log('smoke contract: OK');
    } else {
      await capture(browser, options);
    }
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
