import { NextRequest, NextResponse } from 'next/server';
import {
  companyLookupLog,
  isCpfDocument,
  mapBrasilApiCnpjToResult,
  mapReceitaWsCnpjToResult,
  type CompanyLookupResult,
} from '@/lib/companyCnpjLookup';

export const dynamic = 'force-dynamic';

const BRASIL_API_CNPJ = 'https://brasilapi.com.br/api/cnpj/v1';
const RECEITA_WS_CNPJ = 'https://www.receitaws.com.br/v1/cnpj';
const FETCH_TIMEOUT_MS = 15000;

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: 'no-store',
    });
  } finally {
    clearTimeout(timer);
  }
}

async function consultBrasilApi(cleanCnpj: string): Promise<CompanyLookupResult | null> {
  const url = `${BRASIL_API_CNPJ}/${cleanCnpj}`;
  try {
    const response = await fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'SV-Lotes-CompanyLookup/1.0',
      },
    });

    companyLookupLog('status API', { provider: 'brasilapi', status: response.status });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      companyLookupLog('erro', {
        provider: 'brasilapi',
        status: response.status,
        body: body.slice(0, 200),
      });
      return null;
    }

    const payload = (await response.json()) as Record<string, unknown>;
    return mapBrasilApiCnpjToResult(payload);
  } catch (err) {
    companyLookupLog('erro', {
      provider: 'brasilapi',
      message: err instanceof Error ? err.message : 'unknown',
    });
    return null;
  }
}

async function consultReceitaWs(cleanCnpj: string): Promise<CompanyLookupResult | null> {
  const url = `${RECEITA_WS_CNPJ}/${cleanCnpj}`;
  try {
    const response = await fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'SV-Lotes-CompanyLookup/1.0',
      },
    });

    companyLookupLog('status API', { provider: 'receitaws', status: response.status });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      companyLookupLog('erro', {
        provider: 'receitaws',
        status: response.status,
        body: body.slice(0, 200),
      });
      return null;
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const status = String(payload.status || '').toUpperCase();
    if (status === 'ERROR' || payload.erro) {
      companyLookupLog('erro', {
        provider: 'receitaws',
        message: String(payload.message || payload.erro || 'ERROR'),
      });
      return null;
    }

    return mapReceitaWsCnpjToResult(payload);
  } catch (err) {
    companyLookupLog('erro', {
      provider: 'receitaws',
      message: err instanceof Error ? err.message : 'unknown',
    });
    return null;
  }
}

export async function GET(request: NextRequest) {
  const cnpj = request.nextUrl.searchParams.get('cnpj') || '';
  const cleanCnpj = cnpj.replace(/\D/g, '');

  if (isCpfDocument(cnpj) || cleanCnpj.length === 11) {
    return NextResponse.json(
      { error: 'Consulta automática disponível apenas para CNPJ.' },
      { status: 400 },
    );
  }

  if (cleanCnpj.length !== 14) {
    return NextResponse.json(
      { error: 'Informe um CNPJ válido com 14 dígitos.' },
      { status: 400 },
    );
  }

  companyLookupLog('consultando CNPJ', { cnpj: cleanCnpj });

  let result = await consultBrasilApi(cleanCnpj);

  if (!result) {
    companyLookupLog('consultando CNPJ', { cnpj: cleanCnpj, fallback: 'receitaws' });
    result = await consultReceitaWs(cleanCnpj);
  }

  if (!result || !result.name) {
    companyLookupLog('erro', { cnpj: cleanCnpj, motivo: 'nao_encontrado' });
    return NextResponse.json(
      { error: 'CNPJ não encontrado. Preencha manualmente.' },
      { status: 404 },
    );
  }

  companyLookupLog('dados recebidos', {
    cnpj: cleanCnpj,
    name: result.name,
    fantasy_name: result.fantasy_name,
    city: result.city,
    state: result.state,
  });

  return NextResponse.json({
    ...result,
    company: {
      name: result.name,
      cnpj: result.cnpj,
      email: result.email,
      phone: result.phone,
      address: result.address,
      city: result.city,
      state: result.state,
      cep: result.zip_code,
    },
  });
}
