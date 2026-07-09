/**
 * Captura screenshots das seções atualizadas da landing.
 * npx tsx scripts/capture-landing-v2-screenshots.ts
 */

import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer-core';

const PORT = 3456;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT_DIR = path.join(process.cwd(), 'tmp', 'landing-v2-screenshots');

const SECTIONS = [
  { id: 'home', name: 'hero' },
  { id: 'recursos', name: 'recursos-portal-card' },
  { id: 'funcionalidades', name: 'funcionalidades-passo-5' },
  { id: 'beneficios', name: 'beneficios' },
  { id: 'portal-cliente', name: 'portal-cliente-secao' },
  { id: 'planos', name: 'planos' },
  { id: 'sobre', name: 'sobre-novidades' },
  { id: 'contato', name: 'contato' },
] as const;

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean) as string[];

function resolveChrome(): string | null {
  for (const candidate of CHROME_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

async function waitForServer(timeoutMs = 60000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(BASE);
      if (res.ok) return true;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const chrome = resolveChrome();
  if (!chrome) {
    console.log('SKIP — Chrome/Edge não encontrado para screenshots');
    return;
  }

  const ready = await waitForServer();
  if (!ready) {
    console.log('SKIP — servidor local não respondeu em', BASE);
    return;
  }

  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
    defaultViewport: { width: 1440, height: 900 },
  });

  try {
    const page = await browser.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 120000 });

    for (const section of SECTIONS) {
      const el = await page.$(`#${section.id}`);
      if (!el) {
        console.log(`WARN — seção #${section.id} não encontrada`);
        continue;
      }
      await page.evaluate((id) => {
        document.getElementById(id)?.scrollIntoView({ block: 'start' });
      }, section.id);
      await new Promise((r) => setTimeout(r, 600));
      const file = path.join(OUT_DIR, `${section.name}.png`);
      await el.screenshot({ path: file });
      console.log('OK', file);
    }

    await page.setViewport({ width: 390, height: 844 });
    await page.goto(`${BASE}#portal-cliente`, { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 800));
    const mobile = path.join(OUT_DIR, 'portal-cliente-mobile.png');
    await page.screenshot({ path: mobile, fullPage: false });
    console.log('OK', mobile);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('screenshot error:', err.message);
  process.exit(0);
});
