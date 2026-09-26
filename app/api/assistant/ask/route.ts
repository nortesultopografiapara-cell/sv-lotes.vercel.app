import { NextResponse } from 'next/server';
import { ASSISTANT_ASK_ROUTE, type AssistantAskApiRequest } from '@/lib/assistant/apiContract';
import {
  ASSISTANT_RATE_LIMIT_MAX,
  ASSISTANT_RATE_LIMIT_WINDOW_MS,
} from '@/lib/assistant/constants';
import { createAssistantEntityLoaders } from '@/lib/assistant/entityLoaders';
import { hydrateAssistantUiContext } from '@/lib/assistant/hydrateUiContext';
import { logAssistantAsk } from '@/lib/assistant/log';
import { resolveAssistantModelProvider } from '@/lib/assistant/model/resolveProvider';
import { runAssistantPipeline } from '@/lib/assistant/pipeline';
import { consumeAssistantRateLimit } from '@/lib/assistant/rateLimit';
import { authorizeAssistantAsk, buildAssistantServerContext } from '@/lib/assistant/serverAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

export async function POST(request: Request) {
  const started = Date.now();
  const auth = await authorizeAssistantAsk(request);
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }

  const rate = consumeAssistantRateLimit({
    key: `${auth.tenantId || 'none'}:${auth.userId}`,
    windowMs: ASSISTANT_RATE_LIMIT_WINDOW_MS,
    max: ASSISTANT_RATE_LIMIT_MAX,
  });
  if (!rate.ok) {
    logAssistantAsk({
      userId: auth.userId,
      tenantId: auth.tenantId,
      role: auth.role,
      pathname: '/',
      kbIds: [],
      provider: 'none',
      latencyMs: Date.now() - started,
      outcome: 'rate_limit',
    });
    return NextResponse.json(
      { error: 'Limite de perguntas do Assistente SV atingido. Tente novamente em alguns minutos.' },
      { status: 429 },
    );
  }

  let body: AssistantAskApiRequest;
  try {
    body = (await request.json()) as AssistantAskApiRequest;
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  const pathname = String(body.pathname || '/');
  const { ui, rejectedForeignTenant } = await hydrateAssistantUiContext({
    tenantId: auth.tenantId,
    hints: body.ui,
    pathname,
    loaders: createAssistantEntityLoaders(auth.admin),
  });

  const context = buildAssistantServerContext({
    role: auth.role,
    tenantName: auth.tenantName,
    pathname,
    projectName: ui.projectName || (rejectedForeignTenant ? null : body.projectName),
    contractModel: ui.contractModel || (rejectedForeignTenant ? null : body.contractModel),
    impersonatingTenant: Boolean(body.impersonatingTenant),
    flags: body.flags,
    ui,
  });

  const providers = resolveAssistantModelProvider();
  const result = await runAssistantPipeline(
    {
      question: String(body.question || ''),
      context,
      procedureId: body.procedureId,
      history: body.history,
    },
    providers,
  );

  logAssistantAsk({
    userId: auth.userId,
    tenantId: auth.tenantId,
    role: auth.role,
    pathname: context.pathname,
    kbIds: result.procedureIds,
    capIds: result.capabilityIds || [],
    packedChars: result.packedChars || 0,
    provider: result.source || 'local',
    latencyMs: Date.now() - started,
    outcome:
      result.kind === 'answer'
        ? result.source === 'local-fallback'
          ? 'fallback'
          : 'success'
        : result.kind,
  });

  return NextResponse.json({
    kind: result.kind,
    text: result.text,
    procedureIds: result.procedureIds,
    capabilityIds: result.capabilityIds || [],
    packedChars: result.packedChars || 0,
    source: result.source || 'local',
    notice: result.notice || null,
  });
}

export const ASSISTANT_ASK_PATH = ASSISTANT_ASK_ROUTE;
