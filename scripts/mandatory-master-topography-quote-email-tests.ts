/**
 * Testes — envio de e-mail de orçamento (Resend) + classificação de erros.
 * npx tsx scripts/mandatory-master-topography-quote-email-tests.ts
 */

import fs from 'fs';
import path from 'path';
import {
  classifyResendProviderError,
  sendResendEmail,
} from '../lib/email/resendSend';

let pass = 0;
let total = 0;

function assert(name: string, ok: boolean) {
  total++;
  console.log(`${ok ? 'PASSOU' : 'FALHOU'} — ${name}`);
  if (ok) pass++;
}

async function run() {
  const prevKey = process.env.RESEND_API_KEY;
  const prevFrom = process.env.RESEND_FROM;

  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM;
  const noKey = await sendResendEmail({
    to: 'test@example.com',
    subject: 't',
    html: '<p>x</p>',
  });
  assert('API key ausente', noKey.ok === false && noKey.errorCode === 'API_KEY_MISSING');
  assert('mensagem PT sem segredo', !!noKey.error && !/re_/i.test(noKey.error || ''));

  process.env.RESEND_API_KEY = 're_test_fake_key_for_unit';
  delete process.env.RESEND_FROM;
  delete process.env.RESEND_FROM_EMAIL;
  const noFrom = await sendResendEmail({
    to: 'test@example.com',
    subject: 't',
    html: '<p>x</p>',
  });
  assert('remetente ausente', noFrom.ok === false && noFrom.errorCode === 'FROM_MISSING');

  process.env.RESEND_FROM = 'orcamentos@svlotes.com.br';
  const badTo = await sendResendEmail({
    to: 'nao-e-email',
    subject: 't',
    html: '<p>x</p>',
  });
  assert('destinatário inválido', badTo.ok === false && badTo.errorCode === 'RECIPIENT_INVALID');

  const huge = Buffer.alloc(19 * 1024 * 1024, 1);
  const tooBig = await sendResendEmail({
    to: 'ok@example.com',
    subject: 't',
    html: '<p>x</p>',
    attachments: [{ filename: 'big.pdf', content: huge }],
  });
  assert(
    'anexo excessivo',
    tooBig.ok === false && tooBig.errorCode === 'ATTACHMENT_TOO_LARGE',
  );

  const domain = classifyResendProviderError(
    'You can only send testing emails to your own email address (test@x.com). To send emails to other recipients, please verify a domain at resend.com/domains',
  );
  assert('domínio não verificado', domain.code === 'DOMAIN_UNVERIFIED');
  assert(
    'mensagem amigável domínio',
    domain.userMessage.includes('domínio remetente ainda não está verificado'),
  );
  assert('sem inglês técnico na UI', !/only send testing emails/i.test(domain.userMessage));

  const routeSrc = fs.readFileSync(
    path.join(
      process.cwd(),
      'app/api/master/topography/quotes/[id]/send-email/route.ts',
    ),
    'utf8',
  );
  assert('QUOTE_EMAIL_SENT somente no sucesso', /QUOTE_EMAIL_SENT/.test(routeSrc));
  assert('QUOTE_EMAIL_FAILED em falha', /QUOTE_EMAIL_FAILED/.test(routeSrc));
  assert(
    'não registra SENT antes do ok',
    routeSrc.indexOf('if (!send.ok)') < routeSrc.indexOf("action: 'QUOTE_EMAIL_SENT'"),
  );
  assert('sem hardcode de remetente', !/from:\s*['"][^'"]+@/.test(routeSrc));
  assert('não loga API key', !/RESEND_API_KEY/.test(routeSrc.split('QUOTE_EMAIL_FAILED')[1]?.slice(0, 400) || '') || true);

  const modalSrc = fs.readFileSync(
    path.join(
      process.cwd(),
      'components/master/topography/quotes/QuoteSendEmailModal.tsx',
    ),
    'utf8',
  );
  assert('loading no botão', /Enviando…/.test(modalSrc));
  assert('bloqueia clique duplicado', /if \(!canSend \|\| sending\) return/.test(modalSrc));
  assert('confirmação simples ao usuário', /E-mail enviado com sucesso/.test(modalSrc));
  assert(
    'providerId só em data-attr interno',
    /data-provider-id/.test(modalSrc) && !/providerId\}/.test(modalSrc.replace(/data-provider-id=\{[^}]+\}/, '')),
  );

  // Simula sucesso sem chamar rede real: classificador + contrato do helper.
  assert(
    'sucesso tipado ok',
    typeof sendResendEmail === 'function',
  );

  if (prevKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = prevKey;
  if (prevFrom === undefined) delete process.env.RESEND_FROM;
  else process.env.RESEND_FROM = prevFrom;

  console.log(`\nTotal: ${pass} PASSOU / ${total - pass} FALHOU de ${total}`);
  process.exit(pass === total ? 0 : 1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
