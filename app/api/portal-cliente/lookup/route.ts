import { NextRequest, NextResponse } from 'next/server';
import {
  lookupClientPortalByDocument,
  sanitizeClientPortalLookupResponse,
} from '@/lib/clientPortalLookup';
import { isClientPortalEnabled } from '@/lib/portal-cliente/config';

export const dynamic = 'force-dynamic';

type LookupBody = {
  cpf_cnpj?: string;
};

export async function POST(request: NextRequest) {
  if (!isClientPortalEnabled()) {
    return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  }

  let body: LookupBody;
  try {
    body = (await request.json()) as LookupBody;
  } catch {
    return NextResponse.json({ found: false } satisfies { found: false }, { status: 400 });
  }

  const cpfCnpj = String(body.cpf_cnpj ?? '').trim();
  if (!cpfCnpj) {
    return NextResponse.json({ found: false } satisfies { found: false }, { status: 400 });
  }

  const result = sanitizeClientPortalLookupResponse(
    await lookupClientPortalByDocument(cpfCnpj),
  );

  return NextResponse.json(result);
}
