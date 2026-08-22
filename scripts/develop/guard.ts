/**
 * Guards permanentes de ambiente DEVELOP.
 * Nunca imprime secrets.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEVELOP_PROJECT_REF,
  PRODUCTION_PROJECT_REF,
  RETIRED_DEVELOP_PROJECT_REF,
  resolveSupabaseProjectRef,
} from '../../lib/homolog/env';

export const DEVELOP_SUPABASE_URL = `https://${DEVELOP_PROJECT_REF}.supabase.co`;
export const FORBIDDEN_MIGRATION = '20261008120000_sale_contract_operations.sql';

export function currentGitBranch(): string {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: path.join(__dirname, '..', '..'),
      encoding: 'utf8',
    }).trim();
  } catch {
    return '';
  }
}

export function loadEnvFile(rel: string): Record<string, string> {
  const abs = path.isAbsolute(rel) ? rel : path.join(__dirname, '..', '..', rel);
  const out: Record<string, string> = {};
  if (!fs.existsSync(abs)) return out;
  for (const line of fs.readFileSync(abs, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
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

export function loadDevelopEnv(): {
  url: string;
  anon: string;
  service: string;
  ref: string | null;
  source: string;
} {
  const files = ['.env.develop.apply', '.env.local', '.env.vercel.preview.live'];
  let merged: Record<string, string> = {};
  let source = 'process.env';
  for (const file of files) {
    const env = loadEnvFile(file);
    if (env.NEXT_PUBLIC_SUPABASE_URL && !/SENSITIVE/i.test(env.NEXT_PUBLIC_SUPABASE_URL)) {
      merged = { ...merged, ...env };
      source = file;
      break;
    }
  }
  const url = String(
    merged.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  ).trim();
  const anon = String(
    merged.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  ).trim();
  const service = String(
    merged.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  ).trim();
  return { url, anon, service, ref: resolveSupabaseProjectRef(url), source };
}

export function assertDevelopWriteAllowed(opts?: { allowMain?: boolean }): {
  branch: string;
  ref: string;
  url: string;
  source: string;
} {
  const branch = currentGitBranch();
  if (branch === 'main' && !opts?.allowMain) {
    throw new Error('ABORT: branch main — escrita no banco proibida.');
  }

  const env = loadDevelopEnv();
  if (env.ref === PRODUCTION_PROJECT_REF) {
    throw new Error('ABORT: host alvo é Production (aezktedncttwpqeunjej).');
  }
  if (env.ref === RETIRED_DEVELOP_PROJECT_REF) {
    throw new Error(
      `ABORT: host alvo é o clone DEVELOP anterior (${RETIRED_DEVELOP_PROJECT_REF}). Use ${DEVELOP_PROJECT_REF}.`,
    );
  }
  if (env.ref !== DEVELOP_PROJECT_REF) {
    throw new Error(
      `ABORT: Project Ref alvo não é DEVELOP. esperado=${DEVELOP_PROJECT_REF} obtido=${env.ref || 'null'} fonte=${env.source}`,
    );
  }
  return { branch, ref: env.ref, url: env.url, source: env.source };
}

export function assertNotContractOperationsMigration(fileName: string) {
  if (fileName.includes(FORBIDDEN_MIGRATION.replace('.sql', ''))) {
    throw new Error(
      `ABORT: ${FORBIDDEN_MIGRATION} não pode ser aplicada nesta etapa.`,
    );
  }
}
