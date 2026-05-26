import { NextRequest, NextResponse } from 'next/server';
import {
  isCnpjDocument,
  isCpfDocument,
  mapBrasilApiCnpjToForm,
  masterCnpjLog,
  onlyDigits,
} from '@/lib/companyCnpjLookup';

const BRASIL_API_CNPJ = 'https://brasilapi.com.br/api/cnpj/v1';

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('cnpj') || '';
  const digits = onlyDigits(raw);

  if (isCpfDocument(raw)) {
    return NextResponse.json(
      { error: 'Consulta automática disponível apenas para CNPJ.' },
      { status: 400 }
    );
  }

  if (!isCnpjDocument(raw)) {
    return NextResponse.json(
      { error: 'Informe um CNPJ válido com 14 dígitos.' },
      { status: 400 }
    );
  }

  masterCnpjLog('consultando CNPJ', { cnpj: digits });

  try {
    const response = await fetch(`${BRASIL_API_CNPJ}/${digits}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });

    if (response.status === 404) {
      masterCnpjLog('erro consulta CNPJ', { motivo: 'nao_encontrado' });
      return NextResponse.json(
        { error: 'CNPJ não encontrado. Preencha manualmente.' },
        { status: 404 }
      );
    }

    if (!response.ok) {
      masterCnpjLog('erro consulta CNPJ', { status: response.status });
      return NextResponse.json(
        { error: 'Não foi possível consultar o CNPJ. Tente novamente.' },
        { status: 502 }
      );
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const company = mapBrasilApiCnpjToForm(payload);

    masterCnpjLog('empresa encontrada', {
      cnpj: digits,
      razao_social: company.name,
    });

    return NextResponse.json({ company });
  } catch (err) {
    masterCnpjLog('erro consulta CNPJ', {
      message: err instanceof Error ? err.message : 'unknown',
    });
    return NextResponse.json(
      { error: 'Falha na consulta do CNPJ. Preencha manualmente.' },
      { status: 500 }
    );
  }
}
