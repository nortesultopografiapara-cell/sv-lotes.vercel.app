import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import {
  getTopographyQuoteById,
  logTopographyQuoteAudit,
  updateTopographyQuote,
  deleteTopographyQuotePermanently,
  canPermanentlyDeleteTopographyQuote,
} from '@/lib/master/topography/quotesService';
import {
  getTopographyQuoteStructure,
  saveTopographyQuoteStructure,
} from '@/lib/master/topography/quoteStructureService';
import {
  validateQuoteStructurePayload,
  validateTopographyQuoteInput,
} from '@/lib/master/topography/quoteValidation';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Ctx) {
  const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }
  const { searchParams } = new URL(request.url);
  const auth = await assertSuperAdmin(supabaseAdmin, searchParams.get('userId'));
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 });

  const { id } = await context.params;
  try {
    if (searchParams.get('include') === 'structure') {
      const structure = await getTopographyQuoteStructure(supabaseAdmin, id);
      if (!structure) {
        return NextResponse.json({ error: 'Orçamento não encontrado.' }, { status: 404 });
      }
      return NextResponse.json(structure);
    }

    const quote = await getTopographyQuoteById(supabaseAdmin, id);
    if (!quote) return NextResponse.json({ error: 'Orçamento não encontrado.' }, { status: 404 });
    return NextResponse.json({
      quote,
      canDelete: canPermanentlyDeleteTopographyQuote(quote).ok,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao carregar orçamento.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: Ctx) {
  const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }
  const { id } = await context.params;

  try {
    const body = await request.json();
    const auth = await assertSuperAdmin(supabaseAdmin, body.userId);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 });

    const existing = await getTopographyQuoteById(supabaseAdmin, id);
    if (!existing) {
      return NextResponse.json({ error: 'Orçamento não encontrado.' }, { status: 404 });
    }

    const input = validateTopographyQuoteInput(body);
    const quote = await updateTopographyQuote(
      supabaseAdmin,
      id,
      input,
      body.userId ? String(body.userId) : null,
    );

    await logTopographyQuoteAudit(supabaseAdmin, {
      userId: body.userId ? String(body.userId) : null,
      action:
        existing.status !== quote.status
          ? 'TOPOGRAPHY_QUOTE_STATUS_CHANGED'
          : 'TOPOGRAPHY_QUOTE_UPDATED',
      entityId: id,
      description: `Orçamento ${quote.code} atualizado`,
      oldData: { status: existing.status },
      newData: { status: quote.status },
    });

    return NextResponse.json({ quote });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao atualizar orçamento.';
    const status = /obrigatório|inválid|não pode|convertido/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(request: Request, context: Ctx) {
  const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }
  const { id } = await context.params;

  try {
    const body = await request.json();
    const auth = await assertSuperAdmin(supabaseAdmin, body.userId);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 });

    const { quote: quoteInput, stages } = validateQuoteStructurePayload(body);
    const structure = await saveTopographyQuoteStructure(
      supabaseAdmin,
      id,
      quoteInput,
      stages,
      body.userId ? String(body.userId) : null,
    );

    await logTopographyQuoteAudit(supabaseAdmin, {
      userId: body.userId ? String(body.userId) : null,
      action: 'TOPOGRAPHY_QUOTE_STRUCTURE_SAVED',
      entityId: id,
      description: `Estrutura do orçamento ${structure.quote.code} salva`,
      newData: {
        stages: structure.stages.length,
        items: structure.stages.reduce((n, s) => n + s.itemCount, 0),
        totalGeral: structure.financials.totalGeral,
      },
    });

    return NextResponse.json(structure);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao salvar estrutura.';
    const status = /obrigatório|inválid|não pode|convertido/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: Request, context: Ctx) {
  const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }
  const { id } = await context.params;

  try {
    const body = await request.json().catch(() => ({}));
    const auth = await assertSuperAdmin(supabaseAdmin, body.userId ?? null);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 });

    const existing = await getTopographyQuoteById(supabaseAdmin, id);
    if (!existing) {
      return NextResponse.json({ error: 'Orçamento não encontrado.' }, { status: 404 });
    }

    const gate = canPermanentlyDeleteTopographyQuote(existing);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.reason }, { status: 400 });
    }

    await logTopographyQuoteAudit(supabaseAdmin, {
      userId: body.userId ? String(body.userId) : null,
      action: 'TOPOGRAPHY_QUOTE_DELETED',
      entityId: id,
      description: `Orçamento ${existing.code} excluído definitivamente`,
      oldData: {
        code: existing.code,
        status: existing.status,
        client_name: existing.client_name,
      },
    });

    const result = await deleteTopographyQuotePermanently(
      supabaseAdmin,
      id,
      String(body.confirmationCode || body.code || ''),
    );

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao excluir orçamento.';
    const status = /não confere|não pode|Somente|aprovado|convertido|encontrado/i.test(message)
      ? 400
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
