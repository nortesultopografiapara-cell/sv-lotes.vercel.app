/** Helper HTTP para respostas de exportação corporativa. */

import { NextResponse } from 'next/server';
import { CorporateExportEmptyError } from './exportTypes';
import type { CorporateExportFileResult } from './exportService';

export function corporateExportHttpResponse(
  result: CorporateExportFileResult,
): NextResponse {
  const body =
    typeof result.body === 'string' ? result.body : new Uint8Array(result.body);
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': result.mime,
      'Content-Disposition': `attachment; filename="${result.filename}"`,
      'Cache-Control': 'no-store',
      'X-Export-Row-Count': String(result.meta.rowCount),
      'X-Export-Filename': result.filename,
    },
  });
}

export function corporateExportErrorResponse(err: unknown): NextResponse {
  if (err instanceof CorporateExportEmptyError) {
    return NextResponse.json({ error: err.message, code: 'EXPORT_EMPTY' }, { status: 404 });
  }
  const message = err instanceof Error ? err.message : 'Falha na exportação.';
  const status =
    message.includes('Formato inválido') || message.includes('obrigatório') ? 400 : 500;
  return NextResponse.json({ error: message }, { status });
}
