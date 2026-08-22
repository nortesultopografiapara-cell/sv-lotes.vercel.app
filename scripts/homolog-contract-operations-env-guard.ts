/**
 * Guard de ambiente — homologação de operações contratuais.
 * Imprime SOMENTE hostname/project-ref. Nunca imprime keys/tokens.
 *
 * npx tsx scripts/homolog-contract-operations-env-guard.ts
 */
import fs from 'node:fs';
import path from 'node:path';

function loadEnvFile(filePath: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fs.existsSync(filePath)) return out;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function hostMeta(url: string): { host: string | null; ref: string | null; kind: string } {
  const raw = String(url || '').trim();
  if (!raw) return { host: null, ref: null, kind: 'missing' };
  if (/SENSITIVE|REDACTED|SEU_PROJETO/i.test(raw)) {
    return { host: null, ref: null, kind: 'placeholder' };
  }
  if (!/^https?:\/\//i.test(raw)) return { host: null, ref: null, kind: 'non-http' };
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    const mm = host.match(/^([a-z0-9]+)\.supabase\.co$/i);
    return { host, ref: mm ? mm[1] : null, kind: 'https' };
  } catch {
    return { host: null, ref: null, kind: 'bad-url' };
  }
}

function summarize(label: string, file: string) {
  const env = loadEnvFile(file);
  const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || '';
  const meta = hostMeta(url);
  return {
    label,
    file,
    exists: fs.existsSync(file),
    kind: meta.kind,
    host: meta.host,
    projectRef: meta.ref,
    hasServiceRole: Boolean(env.SUPABASE_SERVICE_ROLE_KEY && env.SUPABASE_SERVICE_ROLE_KEY !== '[SENSITIVE]'),
    hasAnon: Boolean(
      (env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY) &&
        env.NEXT_PUBLIC_SUPABASE_ANON_KEY !== '[SENSITIVE]',
    ),
  };
}

const root = process.cwd();
const rows = [
  summarize('local', path.join(root, '.env.local')),
  summarize('preview.local', path.join(root, '.env.preview.local')),
  summarize('production.local', path.join(root, '.env.production.local')),
  summarize('vercel.preview.live', path.join(root, '.env.vercel.preview.live')),
  summarize('vercel.production.live', path.join(root, '.env.vercel.production.live')),
  summarize('runtime.production', path.join(root, '.env.runtime.production')),
];

const preview = rows.find((r) => r.label === 'vercel.preview.live') || rows.find((r) => r.label === 'preview.local');
const production =
  rows.find((r) => r.label === 'vercel.production.live') ||
  rows.find((r) => r.label === 'runtime.production') ||
  rows.find((r) => r.label === 'production.local');

const previewHost = preview?.host || null;
const prodHost = production?.host || null;
const same =
  previewHost && prodHost ? previewHost === prodHost : null;

const knownProdRefFromRepoHistory = 'aezktedncttwpqeunjej';
const knownDevelopRef = 'hoynysmynxncdlptuzub';
const anyHost = rows.map((r) => r.host).filter(Boolean);
const uniqueHosts = [...new Set(anyHost)];
const touchesKnownProd = uniqueHosts.includes(`${knownProdRefFromRepoHistory}.supabase.co`);

const previewIsDevelop = Boolean(previewHost && String(previewHost).includes(knownDevelopRef));
const previewIsProd = Boolean(previewHost && String(previewHost).includes(knownProdRefFromRepoHistory));

const verdict =
  same === true || previewIsProd || (uniqueHosts.length === 1 && touchesKnownProd)
    ? 'STOP_SHARED_OR_PRODUCTION'
    : previewIsDevelop && !previewIsProd
      ? 'OK_PREVIEW_DISTINCT'
      : 'STOP_UNCONFIRMED';

const report = {
  gitNote: 'branch is reported by caller; this script only inspects env hosts',
  rows,
  previewHost,
  productionHost: prodHost,
  sameDatabase: same,
  uniqueHosts,
  touchesKnownProductionRef: touchesKnownProd,
  knownProductionRef: knownProdRefFromRepoHistory,
  knownDevelopRef,
  verdict,
  applyMigrationAllowed: verdict === 'OK_PREVIEW_DISTINCT',
};

console.log(JSON.stringify(report, null, 2));
if (verdict !== 'OK_PREVIEW_DISTINCT') process.exit(3);
