/**
 * node .\node_modules\tsx\dist\cli.mjs .\scripts\mandatory-supabase-project-guard-tests.ts
 */
import { spawnSync } from 'node:child_process';
import {
  DEVELOP_PROJECT_REF,
  HOMOLOG_OUTBOUND_BLOCKED_MESSAGE,
  PRODUCTION_PROJECT_REF,
  RETIRED_DEVELOP_PROJECT_REF,
} from '../lib/homolog/env';
import { isExecutionEnvironmentBlockingRealOutbound } from '../lib/homolog/executionEnvironment';
import { isC6RemoteOperationBlocked } from '../lib/banking/c6/c6EmitGuard';
import {
  assessSupabaseProject,
  resetSupabaseProjectGuardForTests,
  serviceClientGate,
  validateSupabaseProject,
  warmSupabaseProjectGuard,
} from '../lib/security/supabaseProjectGuard';

const SENTINEL = 'sentinel-do-not-print-7f3a';
let pass = 0;
let total = 0;

function assert(name: string, ok: boolean): void {
  total += 1;
  console.log(`${ok ? 'PASSOU' : 'FALHOU'} — ${name}`);
  if (ok) pass += 1;
}

function jwt(role: string, ref: string, marker = 'sig'): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ role, ref, marker: SENTINEL })).toString('base64url');
  return `${header}.${body}.${marker}`;
}

function host(ref: string): string {
  return `https://${ref}.supabase.co`;
}

function configured(
  environment: 'production' | 'preview' | 'development',
  ref: string,
  overrides: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  const anonRole = overrides.NEXT_PUBLIC_SUPABASE_ANON_KEY ? undefined : 'anon';
  const serviceRole = overrides.SUPABASE_SERVICE_ROLE_KEY ? undefined : 'service_role';
  return {
    VERCEL_ENV: environment,
    NEXT_PUBLIC_SUPABASE_URL: host(ref),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anonRole ? jwt('anon', ref) : overrides.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: serviceRole ? jwt('service_role', ref) : overrides.SUPABASE_SERVICE_ROLE_KEY,
    ...overrides,
    VERCEL_ENV: overrides.VERCEL_ENV ?? environment,
    NEXT_PUBLIC_SUPABASE_URL: overrides.NEXT_PUBLIC_SUPABASE_URL ?? host(ref),
  };
}

async function main(): Promise<void> {
  assert('ref develop', DEVELOP_PROJECT_REF === 'hoynysmynxncdlptuzub');
  assert('ref production', PRODUCTION_PROJECT_REF === 'aezktedncttwpqeunjej');
  assert('ref aposentado', RETIRED_DEVELOP_PROJECT_REF === 'zumwvcxgrpxggyxomzic');

  resetSupabaseProjectGuardForTests();
  const develop = await validateSupabaseProject(configured('development', DEVELOP_PROJECT_REF), async () => 'accepted');
  assert('develop configurado', develop.ok && develop.probe === 'accepted' && develop.publicRef === DEVELOP_PROJECT_REF);

  resetSupabaseProjectGuardForTests();
  const production = await validateSupabaseProject(configured('production', PRODUCTION_PROJECT_REF), async () => 'accepted');
  assert('production configurada', production.ok && production.publicRef === PRODUCTION_PROJECT_REF);

  resetSupabaseProjectGuardForTests();
  let probes = 0;
  const crossedPreview = await validateSupabaseProject(
    configured('preview', PRODUCTION_PROJECT_REF),
    async () => {
      probes += 1;
      return 'accepted';
    },
  );
  assert('preview na production falha', !crossedPreview.ok && crossedPreview.publicRef === PRODUCTION_PROJECT_REF);
  assert('preview incorreto não consulta a rede', probes === 0);

  resetSupabaseProjectGuardForTests();
  probes = 0;
  const mixedKeys = await validateSupabaseProject(
    configured('development', DEVELOP_PROJECT_REF, {
      SUPABASE_SERVICE_ROLE_KEY: jwt('service_role', PRODUCTION_PROJECT_REF),
    }),
    async () => {
      probes += 1;
      return 'accepted';
    },
  );
  assert('url e service role de projetos diferentes', !mixedKeys.ok && probes === 0);

  resetSupabaseProjectGuardForTests();
  probes = 0;
  const retired = await validateSupabaseProject(configured('development', RETIRED_DEVELOP_PROJECT_REF), async () => {
    probes += 1;
    return 'accepted';
  });
  assert('projeto aposentado bloqueado', !retired.ok && retired.message.includes('aposentado') && probes === 0);

  const missing = serviceClientGate({ VERCEL_ENV: 'development', NEXT_PUBLIC_SUPABASE_URL: host(DEVELOP_PROJECT_REF) });
  assert('service role ausente', !missing.ok && missing.error === 'Service role não configurada.');

  const sensitive = assessSupabaseProject(
    configured('development', DEVELOP_PROJECT_REF, {
      SUPABASE_SERVICE_ROLE_KEY: '[SENSITIVE]',
    }),
  );
  assert('marcador sensitive recusado', !sensitive.ok && sensitive.serviceRole?.reason === 'marcador-sensitive');

  const wrongRole = assessSupabaseProject(
    configured('development', DEVELOP_PROJECT_REF, {
      SUPABASE_SERVICE_ROLE_KEY: jwt('anon', DEVELOP_PROJECT_REF),
    }),
  );
  assert('papel incorreto', !wrongRole.ok && wrongRole.serviceRole?.reason === 'papel-incorreto');

  const invalidJwt = assessSupabaseProject(
    configured('development', DEVELOP_PROJECT_REF, {
      SUPABASE_SERVICE_ROLE_KEY: `ainda-nao-e-jwt-${SENTINEL}`,
    }),
  );
  assert('jwt inválido', !invalidJwt.ok && invalidJwt.serviceRole?.reason === 'formato-invalido');

  const unknown = assessSupabaseProject(
    configured('development', DEVELOP_PROJECT_REF, { VERCEL_ENV: 'staging', NODE_ENV: '' }),
  );
  assert('ambiente desconhecido falha', !unknown.ok && unknown.executionEnvironment === 'unknown');

  const privateMismatch = assessSupabaseProject(
    configured('development', DEVELOP_PROJECT_REF, {
      SUPABASE_URL: host(PRODUCTION_PROJECT_REF),
    }),
  );
  assert('url privada divergente', !privateMismatch.ok && privateMismatch.privateRef === PRODUCTION_PROJECT_REF);

  resetSupabaseProjectGuardForTests();
  let newKeyProbes = 0;
  const modern = await validateSupabaseProject(
    configured('preview', DEVELOP_PROJECT_REF, {
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_develop_public',
      SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_develop_server',
    }),
    async () => {
      newKeyProbes += 1;
      return 'accepted';
    },
  );
  assert('chave nova aceita depois da leitura', modern.ok && modern.anon?.format === 'publishable' && newKeyProbes === 2);
  const again = await validateSupabaseProject(
    configured('preview', DEVELOP_PROJECT_REF, {
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_develop_public',
      SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_develop_server',
    }),
    async () => {
      newKeyProbes += 1;
      return 'accepted';
    },
  );
  assert('leitura não se repete no processo', again.ok && newKeyProbes === 2);

  resetSupabaseProjectGuardForTests();
  const modernRejected = await validateSupabaseProject(
    configured('development', DEVELOP_PROJECT_REF, {
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_develop_public',
      SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_develop_server',
    }),
    async () => 'rejected',
  );
  assert('chave nova recusada pelo projeto', !modernRejected.ok && modernRejected.probe === 'rejected');

  const logs: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    logs.push(args.map((item) => String(item)).join(' '));
  };
  resetSupabaseProjectGuardForTests();
  let deploymentBlocked = false;
  try {
    await warmSupabaseProjectGuard(
      configured('preview', PRODUCTION_PROJECT_REF, {
        SUPABASE_SERVICE_ROLE_KEY: jwt('service_role', PRODUCTION_PROJECT_REF, SENTINEL),
      }),
    );
  } catch (error) {
    deploymentBlocked = error instanceof Error && error.message.includes('aceita somente o projeto');
  }
  console.error = original;
  const logged = logs.join('\n');
  assert('preview incorreto não sobe', deploymentBlocked);
  assert('log sem credencial', logged.length > 0 && !logged.includes(SENTINEL) && !logged.includes('eyJ'));

  const child = spawnSync(
    process.execPath,
    ['node_modules/tsx/dist/cli.mjs', 'scripts/env/validate-supabase-project.ts'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        PATHEXT: process.env.PATHEXT,
        VERCEL_ENV: 'development',
        NEXT_PUBLIC_SUPABASE_URL: host(RETIRED_DEVELOP_PROJECT_REF),
        NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt('anon', RETIRED_DEVELOP_PROJECT_REF, SENTINEL),
        SUPABASE_SERVICE_ROLE_KEY: jwt('service_role', RETIRED_DEVELOP_PROJECT_REF, SENTINEL),
      },
    },
  );
  const childText = `${child.stdout || ''}\n${child.stderr || ''}`;
  assert('script recusa aposentado sem imprimir chave', child.status === 1 && !childText.includes(SENTINEL) && !childText.includes('eyJ'));

  const saved = {
    vercel: process.env.VERCEL_ENV,
    node: process.env.NODE_ENV,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    zapiId: process.env.ZAPI_INSTANCE_ID,
    zapiToken: process.env.ZAPI_INSTANCE_TOKEN,
    asaas: process.env.ASAAS_ENV,
  };
  const restore = () => {
    const assign = (key: string, value: string | undefined) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    };
    assign('VERCEL_ENV', saved.vercel);
    assign('NODE_ENV', saved.node);
    assign('NEXT_PUBLIC_SUPABASE_URL', saved.url);
    assign('ZAPI_INSTANCE_ID', saved.zapiId);
    assign('ZAPI_INSTANCE_TOKEN', saved.zapiToken);
    assign('ASAAS_ENV', saved.asaas);
  };

  try {
    const { sendText } = await import('../lib/whatsapp/zapiProvider');
    const { asaasCompanyFetch } = await import('../lib/finance/asaasCompanyClient');
    let called = false;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      called = true;
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    process.env.VERCEL_ENV = 'preview';
    delete process.env.NODE_ENV;
    process.env.NEXT_PUBLIC_SUPABASE_URL = host(PRODUCTION_PROJECT_REF);
    process.env.ZAPI_INSTANCE_ID = 'inst-test';
    process.env.ZAPI_INSTANCE_TOKEN = 'token-test';
    called = false;
    const previewSend = await sendText({ phone: '5599999999999', message: 'teste ficticio' });
    assert(
      'preview não envia WhatsApp mesmo com URL de production',
      previewSend.ok === false && previewSend.error === HOMOLOG_OUTBOUND_BLOCKED_MESSAGE && called === false,
    );

    process.env.VERCEL_ENV = 'production';
    called = false;
    const productionSend = await sendText({ phone: '5599999999999', message: 'teste ficticio' });
    assert('production da Vercel mantém o caminho do WhatsApp', productionSend.ok === true && called === true);

    delete process.env.VERCEL_ENV;
    delete process.env.NODE_ENV;
    called = false;
    const localScriptSend = await sendText({ phone: '5599999999999', message: 'teste ficticio' });
    assert(
      'processo sem ambiente não ganha bloqueio novo',
      isExecutionEnvironmentBlockingRealOutbound() === false && localScriptSend.ok === true && called === true,
    );

    process.env.VERCEL_ENV = 'preview';
    process.env.NEXT_PUBLIC_SUPABASE_URL = host(PRODUCTION_PROJECT_REF);
    called = false;
    await asaasCompanyFetch('fake-sandbox-key', 'SANDBOX', '/myAccount');
    assert('sandbox Asaas continua disponível', called === true);

    called = false;
    let liveBlocked = false;
    try {
      await asaasCompanyFetch('fake-live-key', 'PRODUCTION', '/payments', { method: 'POST', body: '{}' });
    } catch (error) {
      liveBlocked = error instanceof Error && error.message === HOMOLOG_OUTBOUND_BLOCKED_MESSAGE;
    }
    assert('Asaas live não dispara no preview', liveBlocked && called === false);

    process.env.VERCEL_ENV = 'production';
    called = false;
    await asaasCompanyFetch('fake-live-key', 'PRODUCTION', '/myAccount');
    assert('Asaas live na production da Vercel segue o fluxo existente', called === true);

    process.env.VERCEL_ENV = 'preview';
    const sandboxC6 = isC6RemoteOperationBlocked('SANDBOX', host(DEVELOP_PROJECT_REF));
    const liveC6 = isC6RemoteOperationBlocked('PRODUCTION', host(PRODUCTION_PROJECT_REF), 'empresa-teste');
    process.env.VERCEL_ENV = 'production';
    const liveC6OnProductionRuntime = isC6RemoteOperationBlocked('SANDBOX', host(DEVELOP_PROJECT_REF));
    assert('C6 sandbox no develop permanece aberto', sandboxC6 === false && liveC6OnProductionRuntime === false);
    assert('C6 live não abre no preview', liveC6 === true);

    globalThis.fetch = originalFetch;
  } finally {
    restore();
  }

  console.log(`${pass}/${total} passed`);
  if (pass !== total) process.exit(1);
}

void main();
