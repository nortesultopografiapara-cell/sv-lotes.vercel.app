/**
 * Testes obrigatórios — URLs públicas de assinatura (sempre produção, nunca preview Vercel).
 * npx tsx scripts/mandatory-public-signature-url-tests.ts
 */

import {
  buildSignatureVerifyUrl,
  isNonProductionPublicUrl,
  resolvePublicBaseUrl,
} from '../lib/signatureVerifyUrls';
import {
  buildSaleSignUrl,
  resolveSaleSignUrl,
  resolveSaleValidationPublicUrl,
} from '../lib/saleContractUrls';
import { buildSignUrl } from '../lib/saasContractUrls';

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

function testDefaultProductionBase() {
  withEnv('NEXT_PUBLIC_PUBLIC_APP_URL', undefined, () => {
    withEnv('NEXT_PUBLIC_APP_URL', undefined, () => {
      withEnv('NEXT_PUBLIC_SITE_URL', undefined, () => {
        withEnv('VERCEL_URL', 'sv-lotes-vercel-fwmwr6u49.vercel.app', () => {
          const base = resolvePublicBaseUrl();
          assert(base === 'https://www.svlotes.com.br', 'default ignora VERCEL_URL');
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
        });
      });
    });
  });
  console.log('OK testDefaultProductionBase');
}

function testExplicitPublicAppUrl() {
  withEnv('NEXT_PUBLIC_PUBLIC_APP_URL', 'https://www.svlotes.com.br', () => {
    assert(resolvePublicBaseUrl() === 'https://www.svlotes.com.br', 'NEXT_PUBLIC_PUBLIC_APP_URL');
  });
  console.log('OK testExplicitPublicAppUrl');
}

function testResolveStoredPreviewUrls() {
  const token = '8ad13eefa53640499db84190c7341035ed09082c15e45ea45ab350bc22026190';
  const bad =
    'https://sv-lotes-vercel-fwmwr6u49.vercel.app/sign/sale/8ad13eefa53640499db84190c7341035ed09082c15e45ea45ab350bc22026190';
  const fixed = resolveSaleSignUrl(token, bad);
  assert(
    fixed ===
      'https://www.svlotes.com.br/sign/sale/8ad13eefa53640499db84190c7341035ed09082c15e45ea45ab350bc22026190',
    'corrige URL preview gravada',
  );
  assert(isNonProductionPublicUrl(bad), 'detecta preview');
  assert(
    !isNonProductionPublicUrl('https://www.svlotes.com.br/sign/sale/x'),
    'produção ok',
  );
  const badVerify =
    'https://sv-lotes-vercel-fwmwr6u49.vercel.app/verify/8ad13eefa53640499db84190c7341035ed09082c15e45ea45ab350bc22026190';
  const fixedVerify = resolveSaleValidationPublicUrl(token, badVerify);
  assert(fixedVerify.includes('www.svlotes.com.br/verify/'), 'corrige verify preview');
  console.log('OK testResolveStoredPreviewUrls');
}

function main() {
  testDefaultProductionBase();
  testExplicitPublicAppUrl();
  testResolveStoredPreviewUrls();
  console.log('\nTodos os testes de URL pública passaram.');
}

main();
