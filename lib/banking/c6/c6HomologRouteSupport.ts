import { NextResponse } from 'next/server';

export function c6HomologHasClientLiveOverride(body: Record<string, unknown>): boolean {
  return Boolean(
    body.allowSandboxLive ||
      body.allowSimulatedHttp ||
      body.accessToken ||
      body.fetchFn ||
      body.credentials,
  );
}

export function c6HomologBlockedIfSensitive(payload: unknown): NextResponse | null {
  const json = JSON.stringify(payload);
  if (
    json.includes('access_token') ||
    json.includes('BEGIN CERTIFICATE') ||
    json.includes('BEGIN PRIVATE KEY') ||
    json.includes('client_secret') ||
    json.includes('clientSecret')
  ) {
    return NextResponse.json({ error: 'Resposta bloqueada por segurança.' }, { status: 500 });
  }
  return null;
}

export function c6HomologRejectProductionRuntime(label: string): NextResponse | null {
  const vercelEnv = String(process.env.VERCEL_ENV || '').toLowerCase();
  if (vercelEnv === 'production') {
    return NextResponse.json(
      {
        error: `${label} de homologação usa somente Preview/Develop. Production está bloqueada.`,
        executed: false,
      },
      { status: 403 },
    );
  }
  return null;
}
