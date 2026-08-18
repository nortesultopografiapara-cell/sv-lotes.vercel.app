/**
 * Testes obrigatórios — click-to-chat WhatsApp (normalização + URL desktop/mobile).
 * npx tsx scripts/mandatory-whatsapp-click-to-chat-tests.ts
 *
 * Não cobre Z-API.
 */

import { buildSalePartySignatureShareMessage } from '../lib/saleContractSignatureShare';
import {
  buildSignatureShareWhatsAppUrl,
  buildWhatsAppUrl,
  detectWhatsAppOpenTarget,
  isWhatsAppClickToChatUrl,
  normalizeWhatsAppPhone,
  parseWhatsAppClickToChatUrl,
} from '../lib/whatsapp/clickToChat';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testNormalizeRequiredFormats() {
  const expected = '5594992391277';
  assert(normalizeWhatsAppPhone('(94) 99239-1277') === expected, '(94) máscara');
  assert(normalizeWhatsAppPhone('94 99239-1277') === expected, 'espaço');
  assert(normalizeWhatsAppPhone('94992391277') === expected, 'só dígitos');
  assert(normalizeWhatsAppPhone('+55 94 99239-1277') === expected, '+55');
  assert(normalizeWhatsAppPhone('5594992391277') === expected, 'já internacional');
  console.log('OK testNormalizeRequiredFormats');
}

function testNormalizeLegacyAndInvalid() {
  assert(normalizeWhatsAppPhone('094992391277') === '5594992391277', 'zero à esquerda');
  assert(normalizeWhatsAppPhone('05594992391277') === '5594992391277', '055');
  assert(normalizeWhatsAppPhone('555594992391277') === '5594992391277', 'DDI 55 duplicado');
  assert(normalizeWhatsAppPhone('abc') === null, 'caracteres inválidos');
  assert(normalizeWhatsAppPhone('') === null, 'vazio');
  assert(normalizeWhatsAppPhone('   ') === null, 'só espaços');
  assert(normalizeWhatsAppPhone('992391277') === null, 'incompleto sem DDD');
  assert(normalizeWhatsAppPhone(null) === null, 'null');
  assert(normalizeWhatsAppPhone('12') === null, 'curto demais');
  console.log('OK testNormalizeLegacyAndInvalid');
}

function testNeverBuildsInvalidUrl() {
  assert(buildWhatsAppUrl('', 'oi') === null, 'sem telefone');
  assert(buildWhatsAppUrl('abc', 'oi') === null, 'inválido');
  assert(buildWhatsAppUrl('992391277', 'oi') === null, 'incompleto');
  assert(buildWhatsAppUrl('094992391277', 'oi', 'mobile')?.includes('/(94)') !== true, 'sem pontuação no path');
  console.log('OK testNeverBuildsInvalidUrl');
}

function testDesktopAndMobileUrls() {
  const msg = 'Olá, Antônio.\n\nhttps://www.svlotes.com.br/sign/sale/tokEXAMPLE';
  const desktop = buildWhatsAppUrl('(94) 99239-1277', msg, 'desktop');
  const mobile = buildWhatsAppUrl('(94) 99239-1277', msg, 'mobile');

  assert(
    desktop ===
      `https://web.whatsapp.com/send?phone=5594992391277&text=${encodeURIComponent(msg)}`,
    'desktop web.whatsapp.com/send?phone=',
  );
  assert(
    mobile === `https://wa.me/5594992391277?text=${encodeURIComponent(msg)}`,
    'mobile wa.me',
  );
  assert(Boolean(desktop && desktop.includes('%0A')), 'quebra %0A');
  assert(Boolean(desktop && !desktop.includes('%250A')), 'sem dupla %250A');
  assert(Boolean(mobile && !mobile.includes('%250A')), 'mobile sem dupla');
  assert(Boolean(desktop && desktop.includes('Ol%C3%A1')), 'acento');
  assert(
    decodeURIComponent(desktop!.split('text=')[1]).includes(
      'https://www.svlotes.com.br/sign/sale/tokEXAMPLE',
    ),
    'URL interna preservada',
  );
  assert(!desktop!.includes('+55'), 'sem + na query');
  assert(!desktop!.includes(' '), 'sem espaço na URL');
  assert(!/wa\.me\/[^0-9]/.test(mobile || ''), 'path só dígitos');
  console.log('OK testDesktopAndMobileUrls');
}

function testSignatureShareAliasAndMessage() {
  const share = buildSalePartySignatureShareMessage({
    signerName: 'ANTONIO WILSON ALVES',
    role: 'BUYER',
    projectName: 'CHACREAMENTO RECANTO PRIMAVERA',
    quadra: '03',
    lote: '34',
    contractNumber: '000000044/2026',
    signatureUrl: 'https://www.svlotes.com.br/sign/sale/tokEXAMPLE',
  });
  const desktop = buildSignatureShareWhatsAppUrl('(94) 99239-1277', share, 'desktop');
  const mobile = buildSignatureShareWhatsAppUrl('(94) 99239-1277', share, 'mobile');
  assert(Boolean(desktop?.startsWith('https://web.whatsapp.com/send?phone=5594992391277&text=')), 'alias desktop');
  assert(Boolean(mobile?.startsWith('https://wa.me/5594992391277?text=')), 'alias mobile');
  const decoded = decodeURIComponent(desktop!.split('text=')[1]);
  assert(decoded.includes('SV LOTES'), 'identificação');
  assert(decoded.includes('ANTONIO WILSON ALVES'), 'signatário');
  assert(decoded.includes('CHACREAMENTO RECANTO PRIMAVERA'), 'empreendimento');
  assert(decoded.includes('Quadra: 03'), 'quadra');
  assert(decoded.includes('Lote: 34'), 'lote');
  assert(decoded.includes('000000044/2026'), 'contrato');
  assert(decoded.includes('https://www.svlotes.com.br/sign/sale/tokEXAMPLE'), 'link individual');
  assert(!decoded.includes('%0A'), 'mensagem decodificada sem %0A literal');
  console.log('OK testSignatureShareAliasAndMessage');
}

function testDetectAndParse() {
  assert(detectWhatsAppOpenTarget('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)') === 'mobile', 'iphone');
  assert(detectWhatsAppOpenTarget('Mozilla/5.0 (Windows NT 10.0; Win64; x64)') === 'desktop', 'windows');
  assert(detectWhatsAppOpenTarget('') === 'desktop', 'ua vazio = desktop');

  const parsed = parseWhatsAppClickToChatUrl(
    'https://wa.me/5594992391277?text=Ol%C3%A1%0Ahttps%3A%2F%2Fwww.svlotes.com.br%2Fsign%2Fsale%2Ftok',
  );
  assert(parsed?.phone === '5594992391277', 'parse wa.me phone');
  assert(parsed?.message.includes('https://www.svlotes.com.br/sign/sale/tok') === true, 'parse text');
  assert(
    isWhatsAppClickToChatUrl(
      'https://web.whatsapp.com/send?phone=5594992391277&text=oi',
    ),
    'aceita web.whatsapp',
  );
  assert(
    !isWhatsAppClickToChatUrl(
      'https://api.whatsapp.com/resolve/?deeplink=x&not_found=1',
    ),
    'rejeita /resolve',
  );
  console.log('OK testDetectAndParse');
}

function main() {
  testNormalizeRequiredFormats();
  testNormalizeLegacyAndInvalid();
  testNeverBuildsInvalidUrl();
  testDesktopAndMobileUrls();
  testSignatureShareAliasAndMessage();
  testDetectAndParse();
  console.log('mandatory-whatsapp-click-to-chat-tests: all passed');
}

main();
