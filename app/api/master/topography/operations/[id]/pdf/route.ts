import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import { getTopographyClientById } from '@/lib/master/topography/clientsService';
import { listOperationDocuments } from '@/lib/master/topography/operationDocumentsService';
import { listOperationEquipment } from '@/lib/master/topography/operationEquipmentService';
import { listOperationExpenses } from '@/lib/master/topography/operationExpenseService';
import { listOperationOccurrences } from '@/lib/master/topography/operationOccurrenceService';
import { buildOperationPdfBytes } from '@/lib/master/topography/operationPdf';
import {
  getTopographyOperationById,
  logTopographyOperationAudit,
} from '@/lib/master/topography/operationService';
import { listOperationTasks } from '@/lib/master/topography/operationTaskService';
import { listOperationTeam } from '@/lib/master/topography/operationTeamService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Ctx) {
  const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const auth = await assertSuperAdmin(supabaseAdmin, userId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  const disposition =
    searchParams.get('disposition') === 'inline' ? 'inline' : 'attachment';

  const { id } = await context.params;
  try {
    const operation = await getTopographyOperationById(supabaseAdmin, id);
    if (!operation) {
      return NextResponse.json({ error: 'Operação não encontrada.' }, { status: 404 });
    }

    let client = null;
    if (operation.client_id) {
      client = await getTopographyClientById(supabaseAdmin, operation.client_id);
    }

    let projectLabel: string | null = null;
    let quoteLabel: string | null = null;
    if (operation.project_id) {
      const { data: p } = await supabaseAdmin
        .from('master_topography_projects')
        .select('code, title')
        .eq('id', operation.project_id)
        .maybeSingle();
      if (p) projectLabel = `${p.code || ''} — ${p.title || ''}`.trim();
    }
    if (operation.quote_id) {
      const { data: q } = await supabaseAdmin
        .from('master_topography_quotes')
        .select('code, title, client_name')
        .eq('id', operation.quote_id)
        .maybeSingle();
      if (q) {
        quoteLabel = `${q.code || ''} — ${q.title || q.client_name || ''}`.trim();
      }
    }

    const [team, equipment, tasks, occurrences, expenses, documents] =
      await Promise.all([
        listOperationTeam(supabaseAdmin, id),
        listOperationEquipment(supabaseAdmin, id),
        listOperationTasks(supabaseAdmin, id),
        listOperationOccurrences(supabaseAdmin, id),
        listOperationExpenses(supabaseAdmin, id),
        listOperationDocuments(supabaseAdmin, id),
      ]);

    const { bytes, filename } = await buildOperationPdfBytes({
      operation,
      client,
      projectLabel,
      quoteLabel,
      team,
      equipment,
      tasks,
      occurrences,
      expenses,
      documents,
    });

    await logTopographyOperationAudit(supabaseAdmin, {
      userId: userId ? String(userId) : null,
      action: 'TOPOGRAPHY_OPERATION_PDF_GENERATED',
      entityId: id,
      description: `PDF gerado (${disposition}): ${filename}`,
      newData: { filename, disposition },
    });

    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${disposition}; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao gerar PDF.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
