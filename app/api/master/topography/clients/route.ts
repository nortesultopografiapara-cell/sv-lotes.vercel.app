import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import {
  createTopographyClient,
  listTopographyClients,
  TopographyClientDuplicateError,
} from '@/lib/master/topography/clientsService';
import { validateTopographyClientInput } from '@/lib/master/topography/clientValidation';

export async function GET(request: Request) {
  const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const auth = await assertSuperAdmin(supabaseAdmin, searchParams.get('userId'));
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  try {
    const result = await listTopographyClients(supabaseAdmin, {
      q: searchParams.get('q') || undefined,
      includeArchived: searchParams.get('includeArchived') === '1',
      limit: Number(searchParams.get('limit') || 20),
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao listar clientes.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  try {
    const body = await request.json();
    const auth = await assertSuperAdmin(supabaseAdmin, body.userId);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
    }

    const input = validateTopographyClientInput(body);
    const client = await createTopographyClient(
      supabaseAdmin,
      input,
      body.userId ? String(body.userId) : null,
    );
    return NextResponse.json({ client }, { status: 201 });
  } catch (err) {
    if (err instanceof TopographyClientDuplicateError) {
      return NextResponse.json(
        { error: err.message, existingClient: err.existing, code: 'DUPLICATE_CLIENT' },
        { status: 409 },
      );
    }
    const message = err instanceof Error ? err.message : 'Falha ao cadastrar cliente.';
    const status =
      message.includes('obrigatório') ||
      message.includes('inválid') ||
      message.includes('CPF') ||
      message.includes('E-mail')
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
