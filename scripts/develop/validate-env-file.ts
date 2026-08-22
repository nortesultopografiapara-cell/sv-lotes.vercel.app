/**
 * Valida .env.develop.apply sem imprimir valores.
 * npx tsx scripts/develop/validate-env-file.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadEnvFile, currentGitBranch } from './guard';
import {
  DEVELOP_PROJECT_REF,
  PRODUCTION_PROJECT_REF,
  resolveSupabaseProjectRef,
} from '../../lib/homolog/env';

const FILE = '.env.develop.apply';
const abs = path.join(process.cwd(), FILE);
const exists = fs.existsSync(abs);
const env = exists ? loadEnvFile(FILE) : {};
const keys = Object.keys(env).sort();

function present(key: string) {
  const v = String(env[key] || '').trim();
  if (!v) return { present: false, placeholder: false, len: 0 };
  const placeholder = /SENSITIVE|REDACTED|SEU_PROJETO|CHANGE_ME/i.test(v);
  return { present: true, placeholder, len: v.length };
}

function looksPostgres(key: string) {
  const v = String(env[key] || '').trim();
  return /^postgres(ql)?:\/\//i.test(v);
}

function postgresHostRef(key: string): string | null {
  const v = String(env[key] || '').trim();
  if (!looksPostgres(key)) return null;
  try {
    const u = new URL(v.replace(/^postgresql:/i, 'postgres:'));
    const host = u.hostname.toLowerCase();
    const m = host.match(/^db\.([a-z0-9]+)\.supabase\.co$/i);
    if (m) return m[1];
    const pool = host.match(/^([a-z0-9]+)\.pooler\.supabase\.com$/i);
    if (pool) return null;
    const pooler = host.match(/pooler\.supabase\.com$/i);
    if (pooler) {
      const user = decodeURIComponent(u.username || '');
      const mm = user.match(/\.([a-z0-9]+)$/i) || user.match(/^postgres\.([a-z0-9]+)/i);
      return mm ? mm[1] : 'pooler-host';
    }
    return host.includes('supabase') ? 'supabase-other-host' : 'non-supabase-host';
  } catch {
    return 'unparseable';
  }
}

const urlMeta = present('NEXT_PUBLIC_SUPABASE_URL');
const ref = resolveSupabaseProjectRef(env.NEXT_PUBLIC_SUPABASE_URL || '');
const service = present('SUPABASE_SERVICE_ROLE_KEY');
const anon = present('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const dbKeys = keys.filter((k) => /DATABASE|POSTGRES|DIRECT_URL|DB_URL/i.test(k));

const report = {
  branch: currentGitBranch(),
  file: FILE,
  exists,
  keyNames: keys,
  url: {
    present: urlMeta.present,
    placeholder: urlMeta.placeholder,
    validHttp: /^https?:\/\//i.test(String(env.NEXT_PUBLIC_SUPABASE_URL || '')),
    projectRef: ref,
    expected: DEVELOP_PROJECT_REF,
    isDevelop: ref === DEVELOP_PROJECT_REF,
    isProduction: ref === PRODUCTION_PROJECT_REF,
  },
  serviceRole: {
    present: service.present && !service.placeholder && service.len > 20,
    placeholder: service.placeholder,
  },
  anon: {
    present: anon.present && !anon.placeholder && anon.len > 20,
    placeholder: anon.placeholder,
  },
  databaseUrlKeys: dbKeys.map((k) => ({
    key: k,
    present: present(k).present && !present(k).placeholder,
    looksPostgres: looksPostgres(k),
    inferredRef: postgresHostRef(k),
  })),
};

console.log(JSON.stringify(report, null, 2));

if (!exists) process.exit(2);
if (ref === PRODUCTION_PROJECT_REF) {
  console.log(JSON.stringify({ abort: 'FILE_POINTS_TO_PRODUCTION' }));
  process.exit(3);
}
if (ref !== DEVELOP_PROJECT_REF) {
  console.log(JSON.stringify({ abort: 'REF_MISMATCH', got: ref }));
  process.exit(3);
}
if (!service.present || service.placeholder || service.len < 20) {
  console.log(JSON.stringify({ abort: 'MISSING_SERVICE_ROLE' }));
  process.exit(3);
}
