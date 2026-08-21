import { NextResponse } from 'next/server';
import {
  generatePromissoryNote,
  getPromissoryNoteStatus,
  openOrDownloadPromissoryNote,
  PromissoryNoteError,
} from '@/lib/araguaiaPromissoryNoteService';
import { SaleDocumentError } from '@/lib/saleDocumentService';
import {
  createAdminSupabase,
  getRequestAuthUser,
} from '@/lib/supabase/server';

export const runtime = 'nodejs';

function errorResponse(error: unknown) {
  if (error instanceof PromissoryNoteError) {
    return NextResponse.json(
      { success: false, error: error.message, code: error.code },
      { status: error.status },
    );
  }
  if (error instanceof SaleDocumentError) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.status },
    );
  }
  const message =
    error instanceof Error ? error.message : 'Erro na Nota Promissória.';
  console.error('[contracts/promissory-note]', error);
  return NextResponse.json(
    { success: false, error: message },
    { status: 500 },
  );
}

async function requestContext(request: Request) {
  const { user, configError } = await getRequestAuthUser(request);
  if (configError || !user) {
    return {
      response: NextResponse.json(
        { success: false, error: configError || 'Não autenticado' },
        { status: 401 },
      ),
    };
  }
  const { client: admin, configError: adminError } = createAdminSupabase();
  if (!admin || adminError) {
    return {
      response: NextResponse.json(
        { success: false, error: adminError || 'Supabase não configurado' },
        { status: 503 },
      ),
    };
  }
  return { admin, user };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requestContext(request);
    if ('response' in auth) return auth.response;
    const { id } = await params;
    const url = new URL(request.url);
    const download = url.searchParams.get('download') === '1';
    const open = url.searchParams.get('open') === '1';

    if (download || open) {
      const result = await openOrDownloadPromissoryNote(
        auth.admin,
        id,
        auth.user.id,
        {
          download,
          documentId: url.searchParams.get('documentId'),
        },
      );
      return NextResponse.json({ success: true, ...result });
    }

    const status = await getPromissoryNoteStatus(
      auth.admin,
      id,
      auth.user.id,
    );
    return NextResponse.json({ success: true, ...status });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requestContext(request);
    if ('response' in auth) return auth.response;
    const { id } = await params;
    let body: { regenerate?: true } = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const result = await generatePromissoryNote(
      auth.admin,
      id,
      auth.user.id,
      { forceRegenerate: body.regenerate === true },
    );
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return errorResponse(error);
  }
}
