/**
 * Validador do projeto Supabase por ambiente.
 * A decodificação de JWT legado lê somente ref e role. Não prova assinatura.
 * A aceitação da chave é uma leitura autenticada em /rest/v1/, sem tabela e sem corpo registrado.
 * O resultado fica em memória do processo. Não há endpoint de diagnóstico.
 */

import {
  DEVELOP_PROJECT_REF,
  PRODUCTION_PROJECT_REF,
  RETIRED_DEVELOP_PROJECT_REF,
  resolveSupabaseProjectRef,
} from '@/lib/homolog/env';
import { resolveExecutionEnvironment, type ExecutionEnvironment } from '@/lib/homolog/executionEnvironment';

export type SupabaseKeyRole = 'anon' | 'service_role';
export type ProbeStatus = 'accepted' | 'rejected' | 'unreachable';

export type SupabaseKeyInspection = {
  format: 'legacy-jwt' | 'publishable' | 'secret' | 'invalid';
  ref: string | null;
  role: SupabaseKeyRole | null;
  reason: string | null;
};

export type SupabaseProjectAssessment = {
  ok: boolean;
  message: string;
  executionEnvironment: ExecutionEnvironment;
  expectedRef: string | null;
  publicRef: string | null;
  privateRef: string | null;
  anon: SupabaseKeyInspection | null;
  serviceRole: SupabaseKeyInspection | null;
  probe: 'not-run' | ProbeStatus;
};

type Probe = (url: string, key: string) => Promise<ProbeStatus>;

type CacheEntry = {
  fingerprint: string;
  status: ProbeStatus;
};

let probeCache: CacheEntry | null = null;

const SENSITIVE_MARKER = /SENSITIVE|REDACTED/i;
const OFFICIAL_REFS = [DEVELOP_PROJECT_REF, PRODUCTION_PROJECT_REF, RETIRED_DEVELOP_PROJECT_REF];

export function resetSupabaseProjectGuardForTests(): void {
  probeCache = null;
}

export function inspectSupabaseKey(raw: string, expectedRole: SupabaseKeyRole): SupabaseKeyInspection {
  const value = String(raw || '').trim().replace(/^["']|["']$/g, '');
  if (!value) return { format: 'invalid', ref: null, role: null, reason: 'ausente' };
  if (SENSITIVE_MARKER.test(value)) {
    return { format: 'invalid', ref: null, role: null, reason: 'marcador-sensitive' };
  }
  if (value.startsWith('sb_publishable_') || value.startsWith('sb_secret_')) {
    const format = value.startsWith('sb_publishable_') ? 'publishable' : 'secret';
    const role: SupabaseKeyRole = format === 'publishable' ? 'anon' : 'service_role';
    const embedded = OFFICIAL_REFS.find((ref) => value.includes(ref)) || null;
    if (role !== expectedRole) {
      return { format, ref: embedded, role, reason: 'papel-incorreto' };
    }
    return { format, ref: embedded, role, reason: null };
  }
  const parts = value.split('.');
  if (parts.length !== 3 || !parts[0].startsWith('eyJ')) {
    return { format: 'invalid', ref: null, role: null, reason: 'formato-invalido' };
  }
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
      ref?: unknown;
      role?: unknown;
    };
    const ref = typeof payload.ref === 'string' ? payload.ref : null;
    const role = payload.role === 'anon' || payload.role === 'service_role' ? payload.role : null;
    if (!ref || !role) {
      return { format: 'legacy-jwt', ref, role, reason: 'jwt-sem-claims' };
    }
    if (role !== expectedRole) {
      return { format: 'legacy-jwt', ref, role, reason: 'papel-incorreto' };
    }
    return { format: 'legacy-jwt', ref, role, reason: null };
  } catch {
    return { format: 'invalid', ref: null, role: null, reason: 'jwt-invalido' };
  }
}

function expectedRefFor(environment: ExecutionEnvironment): string | null {
  if (environment === 'production') return PRODUCTION_PROJECT_REF;
  if (environment === 'preview' || environment === 'development') return DEVELOP_PROJECT_REF;
  return null;
}

function sameProject(left: string | null, right: string | null): boolean {
  return Boolean(left && right && left === right);
}

export function assessSupabaseProject(
  env: NodeJS.ProcessEnv = process.env,
  options?: { requireAnon?: boolean; requireServiceRole?: boolean },
): SupabaseProjectAssessment {
  const requireAnon = options?.requireAnon !== false;
  const requireServiceRole = options?.requireServiceRole !== false;
  const executionEnvironment = resolveExecutionEnvironment(env);
  const expectedRef = expectedRefFor(executionEnvironment);
  const publicRef = resolveSupabaseProjectRef(env.NEXT_PUBLIC_SUPABASE_URL || '');
  const privateRaw = String(env.SUPABASE_URL || '').trim();
  const privateRef = privateRaw ? resolveSupabaseProjectRef(privateRaw) : null;
  const anonRaw = String(env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  const serviceRaw = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const anon = anonRaw || requireAnon ? inspectSupabaseKey(anonRaw, 'anon') : null;
  const serviceRole = serviceRaw || requireServiceRole ? inspectSupabaseKey(serviceRaw, 'service_role') : null;
  const base = {
    executionEnvironment,
    expectedRef,
    publicRef,
    privateRef,
    anon,
    serviceRole,
    probe: 'not-run' as const,
  };

  const fail = (message: string): SupabaseProjectAssessment => ({ ...base, ok: false, message });

  if (!expectedRef) {
    return fail('Ambiente de execução desconhecido. A validação foi interrompida.');
  }
  if (!publicRef) {
    return fail('URL pública do Supabase ausente ou sem projeto identificável.');
  }
  if (
    publicRef === RETIRED_DEVELOP_PROJECT_REF ||
    privateRef === RETIRED_DEVELOP_PROJECT_REF ||
    anon?.ref === RETIRED_DEVELOP_PROJECT_REF ||
    serviceRole?.ref === RETIRED_DEVELOP_PROJECT_REF
  ) {
    return fail('Projeto Supabase aposentado bloqueado.');
  }
  if (publicRef !== expectedRef) {
    return fail(`Ambiente ${executionEnvironment} aceita somente o projeto ${expectedRef}.`);
  }
  if (privateRaw && privateRef !== expectedRef) {
    return fail('URL privada do Supabase não corresponde ao projeto do ambiente.');
  }
  if ((anon && anon.reason) || (serviceRole && serviceRole.reason)) {
    return fail('Chave do Supabase incompatível com o papel esperado.');
  }
  if (anon?.ref && anon.ref !== expectedRef) {
    return fail('Anon key pertence a outro projeto Supabase.');
  }
  if (serviceRole?.ref && serviceRole.ref !== expectedRef) {
    return fail('Service role pertence a outro projeto Supabase.');
  }
  if (anon?.ref && serviceRole?.ref && !sameProject(anon.ref, serviceRole.ref)) {
    return fail('URL e chaves apontam para projetos diferentes.');
  }
  return {
    ...base,
    ok: true,
    message: `Projeto ${expectedRef} compatível com o ambiente ${executionEnvironment}.`,
  };
}

export async function probeSupabaseKeyAcceptance(url: string, key: string): Promise<ProbeStatus> {
  const ref = resolveSupabaseProjectRef(url);
  if (!ref || ref === RETIRED_DEVELOP_PROJECT_REF) return 'rejected';
  let endpoint: URL;
  try {
    endpoint = new URL('/rest/v1/', url);
  } catch {
    return 'rejected';
  }
  if (endpoint.hostname !== `${ref}.supabase.co`) return 'rejected';
  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: 'application/openapi+json',
      },
    });
    await response.body?.cancel().catch(() => undefined);
    if (response.status >= 200 && response.status < 300) return 'accepted';
    if (response.status === 401 || response.status === 403) return 'rejected';
    return 'unreachable';
  } catch {
    return 'unreachable';
  }
}

function fingerprint(env: NodeJS.ProcessEnv): string {
  const source = [
    resolveExecutionEnvironment(env),
    env.NEXT_PUBLIC_SUPABASE_URL || '',
    env.SUPABASE_URL || '',
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    env.SUPABASE_SERVICE_ROLE_KEY || '',
  ].join('\n');
  const seeds = [2166136261, 16777619, 374761393, 668265263];
  const parts = seeds.map((seed) => {
    let hash = seed;
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  });
  return parts.join('');
}

export async function validateSupabaseProject(
  env: NodeJS.ProcessEnv = process.env,
  probe: Probe = probeSupabaseKeyAcceptance,
): Promise<SupabaseProjectAssessment> {
  const structural = assessSupabaseProject(env);
  if (!structural.ok || !structural.publicRef) return structural;
  const id = fingerprint(env);
  if (probeCache?.fingerprint === id) {
    const cached = probeCache.status;
    return {
      ...structural,
      ok: cached === 'accepted',
      probe: cached,
      message:
        cached === 'accepted'
          ? structural.message
          : 'A chave não foi aceita pelo projeto esperado.',
    };
  }
  const url = `https://${structural.publicRef}.supabase.co`;
  const anonStatus = await probe(url, String(env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''));
  if (anonStatus !== 'accepted') {
    probeCache = { fingerprint: id, status: anonStatus };
    return {
      ...structural,
      ok: false,
      probe: anonStatus,
      message: 'A chave não foi aceita pelo projeto esperado.',
    };
  }
  const serviceStatus = await probe(url, String(env.SUPABASE_SERVICE_ROLE_KEY || ''));
  probeCache = { fingerprint: id, status: serviceStatus };
  return {
    ...structural,
    ok: serviceStatus === 'accepted',
    probe: serviceStatus,
    message:
      serviceStatus === 'accepted'
        ? structural.message
        : 'A chave não foi aceita pelo projeto esperado.',
  };
}

export function serviceClientGate(env: NodeJS.ProcessEnv = process.env): { ok: true } | { ok: false; error: string } {
  const url = String(env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const serviceKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !serviceKey) return { ok: false, error: 'Service role não configurada.' };
  const assessment = assessSupabaseProject(env, { requireAnon: false });
  if (!assessment.ok) return { ok: false, error: assessment.message };
  if (assessment.serviceRole?.format !== 'legacy-jwt' && !assessment.serviceRole?.ref) {
    if (probeCache?.status !== 'accepted' || probeCache.fingerprint !== fingerprint(env)) {
      return { ok: false, error: 'Service role nova ainda sem confirmação do projeto.' };
    }
  }
  if (probeCache?.fingerprint === fingerprint(env) && probeCache.status !== 'accepted') {
    return { ok: false, error: 'A chave não foi aceita pelo projeto esperado.' };
  }
  return { ok: true };
}

export function publicClientGate(env: NodeJS.ProcessEnv = process.env): { ok: true } | { ok: false; error: string } {
  const url = String(env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const anonKey = String(env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  if (!url || !anonKey) return { ok: false, error: 'Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.' };
  const assessment = assessSupabaseProject(env, { requireServiceRole: false });
  if (!assessment.ok) return { ok: false, error: assessment.message };
  if (assessment.anon?.format !== 'legacy-jwt' && !assessment.anon?.ref) {
    if (probeCache?.status !== 'accepted' || probeCache.fingerprint !== fingerprint(env)) {
      return { ok: false, error: 'Anon key nova ainda sem confirmação do projeto.' };
    }
  }
  if (probeCache?.fingerprint === fingerprint(env) && probeCache.status !== 'accepted') {
    return { ok: false, error: 'A chave não foi aceita pelo projeto esperado.' };
  }
  return { ok: true };
}

export async function warmSupabaseProjectGuard(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const url = String(env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const serviceKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !serviceKey) return;
  const result = await validateSupabaseProject(env);
  if (!result.ok) {
    console.error(`[supabase-project] ${result.message}`);
  }
}
