/**
 * Teste de navegador — rolagem real do <main> (estratégia do Painel Executivo).
 * Harness HTML local prova scrollTop no scrollport (sem depender de login/dev server).
 *
 * npx tsx scripts/mandatory-master-executive-scroll-browser-tests.ts
 */
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const root = path.join(__dirname, '..');
const harness = path.join(root, 'scripts/fixtures/master-scroll-harness.html');

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function findChrome(): string | null {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

async function runHarnessScrollProof() {
  const chrome = findChrome();
  assert(chrome, 'Chrome necessário (PUPPETEER_EXECUTABLE_PATH)');
  assert(fs.existsSync(harness), 'fixture harness');

  const puppeteer = await import('puppeteer-core');
  const browser = await puppeteer.default.launch({
    executablePath: chrome!,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1366,768'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.goto(pathToFileURL(harness).href, { waitUntil: 'domcontentloaded' });

    const metrics = await page.evaluate(async () => {
      const main = document.querySelector(
        '#master-executive-scroll-container',
      ) as HTMLElement;
      const before = main.scrollTop;
      main.scrollBy(0, 1400);
      await new Promise((r) => setTimeout(r, 150));
      const after = main.scrollTop;
      return {
        before,
        after,
        mainScrollHeight: main.scrollHeight,
        mainClientHeight: main.clientHeight,
        htmlScroll: document.documentElement.scrollHeight,
        htmlClient: document.documentElement.clientHeight,
        htmlOverflowY: getComputedStyle(document.documentElement).overflowY,
        bodyOverflowY: getComputedStyle(document.body).overflowY,
        mainOverflowY: getComputedStyle(main).overflowY,
      };
    });

    console.log('HARNESS_METRICS', JSON.stringify(metrics));
    assert(
      metrics.mainOverflowY === 'auto' || metrics.mainOverflowY === 'scroll',
      'main overflow-y',
    );
    assert(metrics.mainScrollHeight > metrics.mainClientHeight + 80, 'main precisa scroll');
    assert(metrics.after > metrics.before, `scrollTop ${metrics.before} → ${metrics.after}`);
    assert(
      metrics.htmlOverflowY === 'hidden' ||
        metrics.bodyOverflowY === 'hidden' ||
        metrics.htmlScroll <= metrics.htmlClient + 2,
      'documento não é o scrollport',
    );
    return metrics;
  } finally {
    await browser.close();
  }
}

function testStaticContract() {
  const css = fs.readFileSync(
    path.join(root, 'components/master/layout/masterExecutiveLayout.module.css'),
    'utf8',
  );
  const layout = fs.readFileSync(
    path.join(root, 'components/master/layout/MasterExecutiveLayout.tsx'),
    'utf8',
  );
  assert(/\.content\s*\{[^}]*overflow-y:\s*(scroll|auto)/s.test(css), 'content overflow-y');
  assert(/\.shell\s*\{[^}]*height:\s*100dvh/s.test(css), 'shell 100dvh');
  assert(/\.shell\s*\{[^}]*overflow:\s*hidden/s.test(css), 'shell overflow hidden');
  assert(layout.includes('data-master-scroll-strategy="main"'), 'strategy main');
  assert(layout.includes('master-executive-scroll-container'), 'scroll container id');
  assert(layout.includes('MASTER_EXECUTIVE_BUILD_MARKER'), 'build marker');
  assert(layout.includes('master-executive-root'), 'html class');
}

async function main() {
  console.log('=== Master executive browser scroll tests ===');
  testStaticContract();
  console.log('OK static');
  const metrics = await runHarnessScrollProof();
  console.log(
    `OK harness scrollTop ${metrics.before} → ${metrics.after} (sh=${metrics.mainScrollHeight} ch=${metrics.mainClientHeight})`,
  );
  console.log('ALL PASS');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
