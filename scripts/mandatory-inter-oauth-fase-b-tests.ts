/**
 * Testes Fase B — OAuth + mTLS Banco Inter (isolado do Asaas).
 * npm run test:inter-fase-b
 */
import fs from 'fs';
import path from 'path';
import https from 'node:https';
import {
  requestInterAccessToken,
  toPublicInterConnectionTest,
  humanizeInterOAuthFailure,
  type InterOAuthFetchFn,
} from '../lib/banking/inter/interOAuthClient';
import {
  INTER_OAUTH_SCOPES,
  getInterOAuthTokenUrl,
} from '../lib/banking/inter/interEndpoints';
import {
  clearAllInterTokenCacheForTests,
  getCachedInterToken,
} from '../lib/banking/inter/interTokenCache';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FALHOU — ${msg}`);
  console.log(`PASSOU — ${msg}`);
}

const baseCreds = {
  companyId: 'co-inter-1',
  environment: 'SANDBOX' as const,
  clientId: 'client-id',
  clientSecret: 'client-secret',
  certificatePem: '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----',
  privateKeyPem: '-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----',
};

async function main() {
  clearAllInterTokenCacheForTests();

  // configuração / campos ausentes
  {
    const r = await requestInterAccessToken({ ...baseCreds, clientId: '' });
    assert(!r.ok && r.code === 'MISSING_CLIENT_ID', 'Client ID ausente');
  }
  {
    const r = await requestInterAccessToken({ ...baseCreds, clientSecret: '' });
    assert(!r.ok && r.code === 'MISSING_CLIENT_SECRET', 'Client Secret ausente');
  }
  {
    const r = await requestInterAccessToken({ ...baseCreds, certificatePem: '' });
    assert(!r.ok && r.code === 'MISSING_CERTIFICATE', 'certificado ausente');
  }
  {
    const r = await requestInterAccessToken({ ...baseCreds, privateKeyPem: '' });
    assert(!r.ok && r.code === 'MISSING_PRIVATE_KEY', 'chave ausente');
  }

  // erro mTLS (fetch lança erro TLS)
  {
    const fetchFn: InterOAuthFetchFn = async () => {
      const err = new Error('unable to verify the first certificate');
      (err as Error & { code?: string }).code = 'UNABLE_TO_VERIFY_LEAF_SIGNATURE';
      throw err;
    };
    const r = await requestInterAccessToken(baseCreds, { fetchFn, bypassCache: true });
    assert(!r.ok && r.code === 'MTLS_ERROR', 'erro mTLS');
    assert(r.message.toLowerCase().includes('mtls'), 'mensagem mTLS útil');
  }

  // OAuth rejeitado
  {
    const fetchFn: InterOAuthFetchFn = async () => ({
      status: 401,
      bodyText: JSON.stringify({ error: 'invalid_client' }),
    });
    const r = await requestInterAccessToken(baseCreds, { fetchFn, bypassCache: true });
    assert(!r.ok && r.code === 'OAUTH_REJECTED', 'OAuth rejeitado');
  }

  // scope não autorizado
  {
    const fetchFn: InterOAuthFetchFn = async () => ({
      status: 400,
      bodyText: JSON.stringify({ error: 'invalid_scope' }),
    });
    const r = await requestInterAccessToken(baseCreds, { fetchFn, bypassCache: true });
    assert(!r.ok && r.code === 'SCOPE_UNAUTHORIZED', 'scope não autorizado');
  }

  // integração não liberada
  {
    const fetchFn: InterOAuthFetchFn = async () => ({
      status: 403,
      bodyText: JSON.stringify({ error: 'aplicação em status Novo' }),
    });
    const r = await requestInterAccessToken(baseCreds, { fetchFn, bypassCache: true });
    assert(!r.ok && r.code === 'INTEGRATION_NOT_READY', 'integração ainda não liberada');
    const pub = toPublicInterConnectionTest(r);
    assert(pub.authStatus === 'DRAFT', 'mantém DRAFT quando não liberada');
    assert(!pub.connectionVerified, 'não marca verificada');
  }

  // sucesso OAuth mockado + cache
  {
    clearAllInterTokenCacheForTests();
    let calls = 0;
    const fetchFn: InterOAuthFetchFn = async (url, init) => {
      calls += 1;
      assert(url === getInterOAuthTokenUrl('SANDBOX'), 'endpoint OAuth sandbox');
      assert(init.headers['Content-Type'].includes('x-www-form-urlencoded'), 'urlencoded');
      assert(init.agent instanceof https.Agent, 'agent mTLS');
      const params = new URLSearchParams(init.body);
      assert(params.get('grant_type') === 'client_credentials', 'grant_type');
      assert(params.get('scope') === INTER_OAUTH_SCOPES, 'scopes cobranca');
      assert(params.get('client_id') === 'client-id', 'client_id no body');
      assert(params.get('client_secret') === 'client-secret', 'client_secret no body');
      return {
        status: 200,
        bodyText: JSON.stringify({
          access_token: 'secret-token-value-do-not-leak',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: INTER_OAUTH_SCOPES,
        }),
      };
    };

    const r = await requestInterAccessToken(baseCreds, { fetchFn, bypassCache: true });
    assert(r.ok, 'sucesso OAuth mockado');
    if (r.ok) {
      assert(r.accessToken === 'secret-token-value-do-not-leak', 'token interno ok');
      assert(r.fromCache === false, 'primeira chamada sem cache');
    }

    const pub = toPublicInterConnectionTest(r);
    assert(pub.ok && pub.connectionVerified && pub.authStatus === 'VERIFIED', 'público VERIFIED');
    assert(pub.message.includes('sucesso'), 'mensagem sucesso');
    const pubJson = JSON.stringify(pub);
    assert(!pubJson.includes('secret-token-value'), 'API pública sem access token');
    assert(!pubJson.includes('access_token'), 'API pública sem chave access_token');
    assert(!pubJson.includes('client-secret'), 'API pública sem client secret');

    const cached = getCachedInterToken('co-inter-1', 'SANDBOX');
    assert(Boolean(cached), 'token em cache temporário');

    const r2 = await requestInterAccessToken(baseCreds, { fetchFn, bypassCache: false });
    assert(r2.ok && r2.fromCache === true, 'reusa cache');
    assert(calls === 1, 'segunda chamada não refaz OAuth');
  }

  // humanize
  {
    assert(
      humanizeInterOAuthFailure('MISSING_CLIENT_ID').includes('Client ID'),
      'humanize client id',
    );
  }

  // endpoints
  {
    assert(
      getInterOAuthTokenUrl('PRODUCTION') ===
        'https://cdpj.partners.bancointer.com.br/oauth/v2/token',
      'endpoint produção',
    );
    assert(
      getInterOAuthTokenUrl('SANDBOX') ===
        'https://cdpj-sandbox.partners.uatinter.co/oauth/v2/token',
      'endpoint sandbox',
    );
    assert(INTER_OAUTH_SCOPES === 'boleto-cobranca.read boleto-cobranca.write', 'scopes exatos');
  }

  // regressão Asaas + isolation
  {
    const root = process.cwd();
    const asaasFiles = [
      'lib/finance/asaasCompanyChargeService.ts',
      'lib/finance/companyAsaasWebhookHandler.ts',
      'app/api/finance/asaas/company-webhook/route.ts',
      'app/api/finance/asaas/sale-charges/generate-missing/route.ts',
      'components/finance/AsaasIntegrationPanel.tsx',
    ];
    for (const f of asaasFiles) {
      assert(fs.existsSync(path.join(root, f)), `Asaas intacto: ${f}`);
    }
    const oauth = fs.readFileSync(
      path.join(root, 'lib/banking/inter/interOAuthClient.ts'),
      'utf8',
    );
    assert(!oauth.toLowerCase().includes('company_asaas'), 'OAuth Inter sem Asaas');
    assert(oauth.includes('Nunca logar'), 'OAuth documenta não logar secrets');

    const route = fs.readFileSync(
      path.join(root, 'app/api/banking/inter/config/route.ts'),
      'utf8',
    );
    assert(route.includes('runCompanyInterConnectionTest'), 'rota usa teste real');
    assert(!route.includes('company_asaas'), 'rota Inter sem Asaas');
  }

  console.log('\nOK mandatory-inter-oauth-fase-b-tests');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
