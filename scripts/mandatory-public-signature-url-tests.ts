/**
 * Testes obrigatórios — URLs públicas de assinatura.
 * Preview usa VERCEL_URL; Production usa domínio público; hosts antigos são reescritos.
 * npx tsx scripts/mandatory-public-signature-url-tests.ts
 */

import {
  buildSignatureVerifyUrl,
  isNonProductionPublicUrl,
  resolvePublicBaseUrl,
} from '../lib/signatureVerifyUrls';
import {
  buildSaleSignUrl,
  extractSaleSignTokenFromUrl,
  resolvePartySignatureUrl,
  resolveSaleSignUrl,
  resolveSaleValidationPublicUrl,
} from '../lib/saleContractUrls';
import { buildSignUrl } from '../lib/saasContractUrls';
import { toPublicPartyViews } from '../lib/saleContractSignatureParties';
import type { ContractSignaturePartyRow } from '../lib/saleContractSignaturePartyTypes';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function withEnv(
  key: string,
  value: string | undefined,
  fn: () => void,
) {
  const prev = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  try {
    fn();
  } finally {
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  }
}

function withEnvs(map: Record<string, string | undefined>, fn: () => void) {
  const keys = Object.keys(map);
  const prev: Record<string, string | undefined> = {};
  for (const key of keys) {
    prev[key] = process.env[key];
    if (map[key] === undefined) delete process.env[key];
    else process.env[key] = map[key];
  }
  try {
    fn();
  } finally {
    for (const key of keys) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  }
}

function testDefaultProductionBase() {
  withEnvs(
    {
      NEXT_PUBLIC_PUBLIC_APP_URL: undefined,
      NEXT_PUBLIC_APP_URL: undefined,
      NEXT_PUBLIC_SITE_URL: undefined,
      VERCEL_ENV: undefined,
      VERCEL_URL: 'sv-lotes-vercel-fwmwr6u49.vercel.app',
    },
    () => {
      const base = resolvePublicBaseUrl();
      assert(base === 'https://www.svlotes.com.br', 'default ignora VERCEL_URL fora de preview');
      const token = 'tok123';
      const sale = buildSaleSignUrl(token);
      assert(
        sale === 'https://www.svlotes.com.br/sign/sale/tok123',
        'buildSaleSignUrl produção',
      );
      assert(!sale.includes('vercel.app'), 'sem vercel.app');
      const saas = buildSignUrl(token);
      assert(saas === 'https://www.svlotes.com.br/sign/tok123', 'buildSignUrl SaaS produção');
      const verify = buildSignatureVerifyUrl(token);
      assert(
        verify === 'https://www.svlotes.com.br/verify/tok123',
        'buildSignatureVerifyUrl produção',
      );
    },
  );
  console.log('OK testDefaultProductionBase');
}

function testExplicitPublicAppUrl() {
  withEnv('NEXT_PUBLIC_PUBLIC_APP_URL', 'https://www.svlotes.com.br', () => {
    withEnv('VERCEL_ENV', undefined, () => {
      assert(resolvePublicBaseUrl() === 'https://www.svlotes.com.br', 'NEXT_PUBLIC_PUBLIC_APP_URL');
    });
  });
  console.log('OK testExplicitPublicAppUrl');
}

function testPreviewUsesVercelUrl() {
  withEnvs(
    {
      VERCEL_ENV: 'preview',
      VERCEL_URL: 'sv-lotes-vercel-d0ouowyjq.vercel.app',
      NEXT_PUBLIC_PUBLIC_APP_URL: 'https://sv-lotes-vercel-lz3cb1kev.vercel.app',
    },
    () => {
      const base = resolvePublicBaseUrl();
      assert(
        base === 'https://sv-lotes-vercel-d0ouowyjq.vercel.app',
        'Preview prioriza VERCEL_URL do deploy atual',
      );
      const url = buildSaleSignUrl('token-abc');
      assert(url.includes('d0ouowyjq'), 'link no Preview atual');
      assert(!url.includes('lz3cb1kev'), 'sem domínio Preview antigo');
    },
  );
  console.log('OK testPreviewUsesVercelUrl');
}

function testResolveStoredPreviewUrls() {
  withEnvs(
    {
      VERCEL_ENV: undefined,
      NEXT_PUBLIC_PUBLIC_APP_URL: undefined,
      NEXT_PUBLIC_APP_URL: undefined,
      NEXT_PUBLIC_SITE_URL: undefined,
    },
    () => {
      const token = '8ad13eefa53640499db84190c7341035ed09082c15e45ea45ab350bc22026190';
      const bad =
        'https://sv-lotes-vercel-lz3cb1kev.vercel.app/sign/sale/8ad13eefa53640499db84190c7341035ed09082c15e45ea45ab350bc22026190';
      const fixed = resolveSaleSignUrl(token, bad);
      assert(
        fixed ===
          'https://www.svlotes.com.br/sign/sale/8ad13eefa53640499db84190c7341035ed09082c15e45ea45ab350bc22026190',
        'corrige URL preview gravada em produção',
      );
      assert(isNonProductionPublicUrl(bad), 'detecta preview');
      assert(
        !isNonProductionPublicUrl('https://www.svlotes.com.br/sign/sale/x'),
        'produção ok',
      );
      const badVerify =
        'https://sv-lotes-vercel-lz3cb1kev.vercel.app/verify/8ad13eefa53640499db84190c7341035ed09082c15e45ea45ab350bc22026190';
      const fixedVerify = resolveSaleValidationPublicUrl(token, badVerify);
      assert(fixedVerify.includes('www.svlotes.com.br/verify/'), 'corrige verify preview');
    },
  );
  console.log('OK testResolveStoredPreviewUrls');
}

function testPartyUrlRewriteOnPreview() {
  withEnvs(
    {
      VERCEL_ENV: 'preview',
      VERCEL_URL: 'sv-lotes-vercel-d0ouowyjq.vercel.app',
    },
    () => {
      const old =
        'https://sv-lotes-vercel-lz3cb1kev.vercel.app/sign/sale/buyer-token-111';
      const rewritten = resolvePartySignatureUrl(old);
      assert(rewritten === 'https://sv-lotes-vercel-d0ouowyjq.vercel.app/sign/sale/buyer-token-111', 'rewrite party');
      assert(extractSaleSignTokenFromUrl(old) === 'buyer-token-111', 'extract token');

      const parties = toPublicPartyViews(
        [
          {
            id: '1',
            company_id: 'c',
            contract_signature_id: 's',
            contract_id: 'ct',
            sale_id: null,
            role: 'BUYER',
            signer_name: 'Comprador',
            signer_cpf: null,
            signer_phone: '11999990000',
            signer_email: 'buyer@test.com',
            signature_token_hash: 'h1',
            signature_url: old,
            status: 'PENDING',
            sent_at: null,
            viewed_at: null,
            signed_at: null,
            cancelled_at: null,
            expires_at: null,
            signature_data: {},
            ip_address: null,
            user_agent: null,
            signature_hash: null,
            created_at: '',
            updated_at: '',
          },
          {
            id: '2',
            company_id: 'c',
            contract_signature_id: 's',
            contract_id: 'ct',
            sale_id: null,
            role: 'SPOUSE',
            signer_name: 'Cônjuge',
            signer_cpf: null,
            signer_phone: '11988880000',
            signer_email: 'spouse@test.com',
            signature_token_hash: 'h2',
            signature_url:
              'https://sv-lotes-vercel-lz3cb1kev.vercel.app/sign/sale/spouse-token-222',
            status: 'PENDING',
            sent_at: null,
            viewed_at: null,
            signed_at: null,
            cancelled_at: null,
            expires_at: null,
            signature_data: {},
            ip_address: null,
            user_agent: null,
            signature_hash: null,
            created_at: '',
            updated_at: '',
          },
          {
            id: '3',
            company_id: 'c',
            contract_signature_id: 's',
            contract_id: 'ct',
            sale_id: null,
            role: 'VENDOR',
            signer_name: 'Vendedora',
            signer_cpf: null,
            signer_phone: null,
            signer_email: null,
            signature_token_hash: null,
            signature_url: null,
            status: 'PENDING',
            sent_at: null,
            viewed_at: null,
            signed_at: null,
            cancelled_at: null,
            expires_at: null,
            signature_data: {},
            ip_address: null,
            user_agent: null,
            signature_hash: null,
            created_at: '',
            updated_at: '',
          },
        ] as ContractSignaturePartyRow[],
        { includeUrls: true },
      );

      assert(parties.length === 3, '3 parties');
      assert(parties[0].signatureUrl?.includes('buyer-token-111'), 'buyer url');
      assert(parties[1].signatureUrl?.includes('spouse-token-222'), 'spouse url');
      assert(parties[0].signatureUrl !== parties[1].signatureUrl, 'links distintos');
      assert(!parties[0].signatureUrl?.includes('lz3cb1kev'), 'buyer sem host antigo');
      assert(!parties[1].signatureUrl?.includes('lz3cb1kev'), 'spouse sem host antigo');
      assert(parties[2].signatureUrl === null, 'vendor sem link');
      assert(parties[0].phone === '11999990000', 'phone buyer');
      assert(parties[1].email === 'spouse@test.com', 'email spouse');
    },
  );
  console.log('OK testPartyUrlRewriteOnPreview');
}

function main() {
  testDefaultProductionBase();
  testExplicitPublicAppUrl();
  testPreviewUsesVercelUrl();
  testResolveStoredPreviewUrls();
  testPartyUrlRewriteOnPreview();
  console.log('\nTodos os testes de URL pública passaram.');
}

main();
