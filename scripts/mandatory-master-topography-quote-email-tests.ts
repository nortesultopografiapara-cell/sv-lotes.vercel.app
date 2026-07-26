/**
 * Testes — remetente Resend orçamentos (RESEND_FROM / RESEND_REPLY_TO).
 * npx tsx scripts/mandatory-master-topography-quote-email-tests.ts
 */

import fs from 'fs';
import path from 'path';
import {
  buildResendEmailApiPayload,
  classifyResendProviderError,
  extractEmailAddressFromFromHeader,
  resolveResendFromAddress,
  resolveResendReplyToAddress,
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
  const prev = {
    key: process.env.RESEND_API_KEY,
    from: process.env.RESEND_FROM,
    fromEmail: process.env.RESEND_FROM_EMAIL,
    reply: process.env.RESEND_REPLY_TO,
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
  };

  const expectedFrom = 'SV Topografia & Projetos <gerencia@nortesultopografia.com.br>';

  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM;
  delete process.env.RESEND_FROM_EMAIL;
  delete process.env.RESEND_REPLY_TO;

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
  process.env.NODE_ENV = 'production';
  process.env.VERCEL_ENV = 'production';
  const noFromProd = await sendResendEmail({
    to: 'test@example.com',
    subject: 't',
    html: '<p>x</p>',
  });
  assert(
    'ausência RESEND_FROM em produção bloqueia',
    noFromProd.ok === false && noFromProd.errorCode === 'SENDER_NOT_CONFIGURED',
  );
  assert('sem fallback onboarding em produção', resolveResendFromAddress() === null);

  process.env.RESEND_FROM = 'onboarding@resend.dev';
  assert(
    'onboarding@resend.dev rejeitado em produção',
    resolveResendFromAddress() === null,
  );
  const onboardBlocked = await sendResendEmail({
    to: 'ok@example.com',
    subject: 't',
    html: '<p>x</p>',
  });
  assert(
    'envio bloqueado com onboarding@ em produção',
    onboardBlocked.ok === false && onboardBlocked.errorCode === 'SENDER_NOT_CONFIGURED',
  );

  process.env.RESEND_FROM = expectedFrom;
  delete process.env.RESEND_REPLY_TO;
  assert('RESEND_FROM resolvido com nome e e-mail', resolveResendFromAddress() === expectedFrom);
  assert(
    'extrai e-mail do From',
    extractEmailAddressFromFromHeader(expectedFrom) === 'gerencia@nortesultopografia.com.br',
  );
  assert(
    'Reply-To fallback do From',
    resolveResendReplyToAddress() === 'gerencia@nortesultopografia.com.br',
  );

  process.env.RESEND_REPLY_TO = 'gerencia@nortesultopografia.com.br';
  assert(
    'Reply-To explícito',
    resolveResendReplyToAddress() === 'gerencia@nortesultopografia.com.br',
  );

  const payload = buildResendEmailApiPayload(
    { to: 'cliente@exemplo.com', subject: 'Orçamento', html: '<p>ok</p>' },
    expectedFrom,
    'gerencia@nortesultopografia.com.br',
  );
  assert('payload repassa From completo', payload.from === expectedFrom);
  assert('payload preserva nome visível', payload.from.includes('SV Topografia & Projetos'));
  assert(
    'payload preserva e-mail',
    payload.from.includes('gerencia@nortesultopografia.com.br'),
  );
  assert('payload Reply-To correto', payload.reply_to === 'gerencia@nortesultopografia.com.br');
  assert('payload sem onboarding', !String(payload.from).includes('resend.dev'));

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
    domain.userMessage ===
      'O domínio do remetente ainda não está verificado no serviço de e-mail. Verifique o domínio no Resend e tente novamente.',
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
  assert('SENDER_NOT_CONFIGURED na rota', /SENDER_NOT_CONFIGURED/.test(routeSrc));
  assert(
    'não registra SENT antes do ok',
    routeSrc.indexOf('if (!send.ok)') < routeSrc.indexOf("action: 'QUOTE_EMAIL_SENT'"),
  );
  assert('sem hardcode de remetente Topografia', !/gerencia@nortesultopografia\.com\.br/.test(routeSrc));
  assert('sem hardcode onboarding', !/onboarding@resend\.dev/.test(routeSrc));
  assert('usa resolveResendFromAddress', /resolveResendFromAddress/.test(routeSrc));

  const helperSrc = fs.readFileSync(
    path.join(process.cwd(), 'lib/email/resendSend.ts'),
    'utf8',
  );
  assert('helper sem fallback onboarding', !/onboarding@resend\.dev['"`]/.test(helperSrc) || /FORBIDDEN_FROM_FALLBACKS/.test(helperSrc));
  assert('helper usa reply_to', /reply_to/.test(helperSrc));
  assert('helper não hardcodar gerencia@', !/gerencia@nortesultopografia\.com\.br/.test(helperSrc));

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

  const saasSrc = fs.readFileSync(
    path.join(process.cwd(), 'lib/saasBillingReminderEmail.ts'),
    'utf8',
  );
  assert(
    'SaaS permanece com helper próprio (sem regressão forçada)',
    /resolveResendFromAddress/.test(saasSrc) && /sendSaasBillingReminderEmail/.test(saasSrc),
  );

  // restore
  if (prev.key === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = prev.key;
  if (prev.from === undefined) delete process.env.RESEND_FROM;
  else process.env.RESEND_FROM = prev.from;
  if (prev.fromEmail === undefined) delete process.env.RESEND_FROM_EMAIL;
  else process.env.RESEND_FROM_EMAIL = prev.fromEmail;
  if (prev.reply === undefined) delete process.env.RESEND_REPLY_TO;
  else process.env.RESEND_REPLY_TO = prev.reply;
  if (prev.nodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = prev.nodeEnv;
  if (prev.vercelEnv === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = prev.vercelEnv;

  console.log(`\nTotal: ${pass} PASSOU / ${total - pass} FALHOU de ${total}`);
  process.exit(pass === total ? 0 : 1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
