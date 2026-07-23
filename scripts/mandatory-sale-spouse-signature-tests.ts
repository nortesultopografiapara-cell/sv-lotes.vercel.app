/**
 * Testes — assinatura eletrônica com cônjuge (parties).
 * npx tsx scripts/mandatory-sale-spouse-signature-tests.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  computeAggregateSaleSignatureStatus,
  canVendorSignFromParties,
  countSignedParties,
} from '../lib/saleContractSignaturePartyStatus';
import {
  shouldCreateSpouseSignatureParty,
  supportsSpouseElectronicSignature,
  validateSpouseForElectronicSignature,
  SPOUSE_SIGNATURE_INCOMPLETE_MESSAGE,
} from '../lib/saleContractSignaturePartyRules';
import {
  createSaleSignaturePartyToken,
  hashSaleSignaturePartyToken,
  maskSignatureTokenForLog,
  safeCompareTokenHash,
} from '../lib/saleContractSignaturePartyTokens';
import {
  applyElectronicSignatureStampsToContractHtml,
  buildRecantoElectronicStamps,
} from '../lib/saleContractSignaturePartySlots';
import { buildSalePartySignatureShareMessage } from '../lib/saleContractSignatureShare';
import { buildSaleContractSignatureCertificateHtml } from '../lib/saleContractSignatureCertificateHtml';
import { saleSignatureStatusLabel } from '../lib/saleContractSignatureStatus';
import { canVendorSignSaleContract } from '../lib/saleContractBilateralSignature';
import {
  enrichBuyerPartyPhone,
  pickCustomerPhoneForSignature,
  resolveSalePublicSignPanel,
} from '../lib/saleContractPublicSignUi';
import { canShareViaWhatsApp } from '../lib/saasContractSignatureShare';
import {
  getSaleContractBucket,
  buildSignedSaleContractStoragePath,
  SALE_CONTRACT_STORAGE_BUCKET_DEFAULT,
} from '../lib/saleContractStorage';
import {
  isVendorWaitingForBuyers,
  saleAwaitingVendorPanelMessage,
} from '../lib/saleContractSignaturePartyTypes';

const ROOT = process.cwd();

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function testModelGating() {
  assert(supportsSpouseElectronicSignature('RECANTO_PRIMAVERA'), 'recanto ok');
  assert(!supportsSpouseElectronicSignature('MENESES'), 'meneses off');
  assert(!supportsSpouseElectronicSignature('SV_LOTES_2'), 'sv2 off');
  assert(!supportsSpouseElectronicSignature('PADRAO'), 'padrao off');

  assert(
    !shouldCreateSpouseSignatureParty({
      contractModel: 'RECANTO_PRIMAVERA',
      sale: {},
    }),
    'sem cônjuge',
  );

  assert(
    shouldCreateSpouseSignatureParty({
      contractModel: 'RECANTO_PRIMAVERA',
      sale: {
        sale_spouse_name: 'Maria Silva',
        sale_spouse_cpf: '12345678901',
      },
      contractHtml: '<div>CÔNJUGE ANUENTE</div>',
    }),
    'recanto com cônjuge e slot',
  );

  // Regra unificada: venda com cônjuge NÃO depende do texto no HTML persistido
  // (PDF regenerado pode ter o slot mesmo quando a coluna HTML está truncada).
  assert(
    shouldCreateSpouseSignatureParty({
      contractModel: 'RECANTO_PRIMAVERA',
      sale: {
        sale_spouse_name: 'Maria Silva',
        sale_spouse_cpf: '12345678901',
      },
      contractHtml: '<div>sem slot</div>',
    }),
    'sale_spouse_* obriga SPOUSE mesmo sem slot no HTML salvo',
  );

  assert(
    shouldCreateSpouseSignatureParty({
      contractModel: 'RECANTO_PRIMAVERA',
      sale: {},
      contractHtml: '<div>CÔNJUGE ANUENTE</div>',
    }),
    'slot no HTML também exige SPOUSE',
  );

  assert(
    shouldCreateSpouseSignatureParty({
      contractModel: 'PADRAO',
      sale: {
        sale_spouse_name: 'Maria Silva',
        sale_spouse_cpf: '12345678901',
      },
      contractHtml:
        '<div class="sv-contract-recanto-primavera">CÔNJUGE ANUENTE</div>',
    }),
    'HTML Recanto + sale_spouse_* obriga SPOUSE mesmo se company.model=PADRAO',
  );

  assert(
    !shouldCreateSpouseSignatureParty({
      contractModel: 'MENESES',
      sale: {
        sale_spouse_name: 'Maria Silva',
        sale_spouse_cpf: '12345678901',
      },
    }),
    'meneses sem party eletrônico',
  );

  console.log('OK testModelGating');
}

function testSpouseValidation() {
  const incomplete = validateSpouseForElectronicSignature({
    sale_spouse_name: 'Maria',
    sale_spouse_cpf: '123',
  });
  assert(!incomplete.ok, 'cpf inválido');
  if (!incomplete.ok) {
    assert(
      incomplete.message === SPOUSE_SIGNATURE_INCOMPLETE_MESSAGE,
      'mensagem padrão',
    );
  }

  const noContact = validateSpouseForElectronicSignature({
    sale_spouse_name: 'Maria Silva',
    sale_spouse_cpf: '12345678901',
  });
  assert(!noContact.ok, 'sem contato');

  const phoneOnly = validateSpouseForElectronicSignature({
    sale_spouse_name: 'Maria Silva',
    sale_spouse_cpf: '12345678901',
    sale_spouse_phone: '94999998888',
  });
  assert(phoneOnly.ok, 'só telefone');

  const emailOnly = validateSpouseForElectronicSignature({
    sale_spouse_name: 'Maria Silva',
    sale_spouse_cpf: '12345678901',
    sale_spouse_email: 'maria@test.com',
  });
  assert(emailOnly.ok, 'só e-mail');

  console.log('OK testSpouseValidation');
}

function testTokensDistinct() {
  const a = createSaleSignaturePartyToken();
  const b = createSaleSignaturePartyToken();
  assert(a.token !== b.token, 'tokens diferentes');
  assert(a.tokenHash !== b.tokenHash, 'hashes diferentes');
  assert(
    hashSaleSignaturePartyToken(a.token) === a.tokenHash,
    'hash estável',
  );
  assert(safeCompareTokenHash(a.tokenHash, a.tokenHash), 'compare ok');
  assert(!safeCompareTokenHash(a.tokenHash, b.tokenHash), 'compare fail');

  const masked = maskSignatureTokenForLog(a.token);
  assert(Boolean(masked && !masked.includes(a.token)), 'token não no log');
  assert(!String(masked).includes(a.token.slice(10)), 'sem token completo');

  console.log('OK testTokensDistinct');
}

function testAggregateStatusWithoutSpouse() {
  const pending = computeAggregateSaleSignatureStatus([
    { role: 'BUYER', status: 'PENDING' },
    { role: 'VENDOR', status: 'PENDING' },
  ]);
  assert(pending === 'PENDING', 'pending');

  const client = computeAggregateSaleSignatureStatus([
    { role: 'BUYER', status: 'SIGNED' },
    { role: 'VENDOR', status: 'PENDING' },
  ]);
  assert(client === 'CLIENT_SIGNED', 'client signed sem cônjuge');

  const signed = computeAggregateSaleSignatureStatus([
    { role: 'BUYER', status: 'SIGNED' },
    { role: 'VENDOR', status: 'SIGNED' },
  ]);
  assert(signed === 'SIGNED', 'fully signed');

  console.log('OK testAggregateStatusWithoutSpouse');
}

function testAggregateStatusWithSpouse() {
  const partialBuyer = computeAggregateSaleSignatureStatus([
    { role: 'BUYER', status: 'SIGNED' },
    { role: 'SPOUSE', status: 'PENDING' },
    { role: 'VENDOR', status: 'PENDING' },
  ]);
  assert(partialBuyer === 'PARTIALLY_SIGNED', 'só comprador');

  const partialSpouse = computeAggregateSaleSignatureStatus([
    { role: 'BUYER', status: 'PENDING' },
    { role: 'SPOUSE', status: 'SIGNED' },
    { role: 'VENDOR', status: 'PENDING' },
  ]);
  assert(partialSpouse === 'PARTIALLY_SIGNED', 'só cônjuge');

  const client = computeAggregateSaleSignatureStatus([
    { role: 'BUYER', status: 'SIGNED' },
    { role: 'SPOUSE', status: 'SIGNED' },
    { role: 'VENDOR', status: 'PENDING' },
  ]);
  assert(client === 'CLIENT_SIGNED', 'ambos externos');

  const done = computeAggregateSaleSignatureStatus([
    { role: 'BUYER', status: 'SIGNED' },
    { role: 'SPOUSE', status: 'SIGNED' },
    { role: 'VENDOR', status: 'SIGNED' },
  ]);
  assert(done === 'SIGNED', 'três assinaturas');

  const vendorGatePartial = canVendorSignFromParties([
    { role: 'BUYER', status: 'SIGNED' },
    { role: 'SPOUSE', status: 'PENDING' },
    { role: 'VENDOR', status: 'PENDING' },
  ]);
  assert(!vendorGatePartial.ok, 'vendor bloqueado');
  assert(
    String(vendorGatePartial.reason).includes('cônjuge'),
    'mensagem cônjuge',
  );

  const vendorGateOk = canVendorSignFromParties([
    { role: 'BUYER', status: 'SIGNED' },
    { role: 'SPOUSE', status: 'SIGNED' },
    { role: 'VENDOR', status: 'PENDING' },
  ]);
  assert(vendorGateOk.ok, 'vendor liberado');

  assert(
    !canVendorSignSaleContract('PARTIALLY_SIGNED'),
    'bilateral legado bloqueia parcial',
  );
  assert(canVendorSignSaleContract('CLIENT_SIGNED'), 'bilateral ok');

  const progress = countSignedParties([
    { role: 'BUYER', status: 'SIGNED' },
    { role: 'SPOUSE', status: 'PENDING' },
    { role: 'VENDOR', status: 'PENDING' },
  ]);
  assert(progress.signed === 1 && progress.total === 3, 'progresso 1/3');

  assert(
    saleSignatureStatusLabel('PARTIALLY_SIGNED') === 'Parcialmente assinado',
    'label parcial',
  );
  assert(
    saleSignatureStatusLabel('CLIENT_SIGNED') ===
      'Aguardando assinatura da vendedora',
    'label client_signed',
  );

  console.log('OK testAggregateStatusWithSpouse');
}

function testShareMessagesDistinct() {
  const buyerMsg = buildSalePartySignatureShareMessage({
    signerName: 'João da Silva',
    role: 'BUYER',
    projectName: 'Recanto',
    quadra: '01',
    lote: '02',
    contractNumber: '000000001/2026',
    signatureUrl: 'https://example.com/sign/sale/token-buyer',
  });
  const spouseMsg = buildSalePartySignatureShareMessage({
    signerName: 'Maria da Silva',
    role: 'SPOUSE',
    projectName: 'Recanto',
    quadra: '01',
    lote: '02',
    contractNumber: '000000001/2026',
    signatureUrl: 'https://example.com/sign/sale/token-spouse',
  });

  assert(buyerMsg.includes('token-buyer'), 'link comprador');
  assert(spouseMsg.includes('token-spouse'), 'link cônjuge');
  assert(!buyerMsg.includes('token-spouse'), 'sem cruzamento');
  assert(!spouseMsg.includes('token-buyer'), 'sem cruzamento 2');
  assert(buyerMsg.includes('compra e venda'), 'texto comprador');
  assert(spouseMsg.includes('cônjuge anuente'), 'texto anuente');
  assert(buyerMsg.includes('somente por você'), 'pessoal comprador');
  assert(spouseMsg.includes('somente por você'), 'pessoal cônjuge');

  console.log('OK testShareMessagesDistinct');
}

function testSlotsAndCertificate() {
  const html = `
    <div class="contract-signatures contract-signatures--recanto">
      <div class="signature-slot"><div style="border-top: 1px solid #111"></div><p>VENDEDOR(A)</p></div>
      <div class="signature-slot"><div style="border-top: 1px solid #111"></div><p>COMPRADOR(A)</p><p>João</p></div>
      <div class="signature-slot"><div style="border-top: 1px solid #111"></div><p>CÔNJUGE ANUENTE</p><p>Maria</p></div>
    </div>`;

  const stamped = applyElectronicSignatureStampsToContractHtml(
    html,
    buildRecantoElectronicStamps({
      buyerName: 'João',
      buyerSignedAt: '2026-07-23T15:10:00.000Z',
      buyerSigned: true,
      spouseName: 'Maria',
      spouseSignedAt: '2026-07-23T15:20:00.000Z',
      spouseSigned: true,
      vendorName: 'Ivanilde',
      vendorSignedAt: '2026-07-23T16:00:00.000Z',
      vendorSigned: true,
    }),
  );

  assert(stamped.includes('Assinado eletronicamente'), 'stamp presente');
  assert(
    (stamped.match(/Assinado eletronicamente/g) || []).length === 3,
    'três carimbos',
  );
  assert(stamped.includes('João'), 'nome comprador');
  assert(stamped.includes('Maria'), 'nome cônjuge');

  const cert = buildSaleContractSignatureCertificateHtml({
    contractNumber: '000000001/2026',
    projectName: 'Recanto',
    quadra: '01',
    lote: '02',
    buyerName: 'João da Silva',
    buyerDocument: '12345678901',
    spouseName: 'Maria da Silva',
    spouseDocument: '98765432100',
    spouseSignedAt: '2026-07-23T15:20:00.000Z',
    signatureStatus: 'SIGNED',
    signedAt: '2026-07-23T15:10:00.000Z',
    vendorSignedAt: '2026-07-23T16:00:00.000Z',
    representativeName: 'Ivanilde',
    companyName: 'Imobiliária',
  });

  assert(cert.includes('PROMISSÁRIO COMPRADOR'), 'cert comprador');
  assert(cert.includes('CÔNJUGE ANUENTE'), 'cert cônjuge');
  assert(cert.includes('Maria da Silva'), 'nome cônjuge no cert');
  assert(cert.includes('PROMITENTE VENDEDOR') || cert.includes('VENDEDOR'), 'cert vendor');

  console.log('OK testSlotsAndCertificate');
}

function testMigrationAndWiring() {
  const migration = read(
    'supabase/migrations/20260723140000_contract_signature_parties.sql',
  );
  assert(migration.includes('contract_signature_parties'), 'tabela');
  assert(migration.includes('signature_token_hash'), 'hash');
  assert(migration.includes('PARTIALLY_SIGNED'), 'status parcial');
  assert(migration.includes('ROW LEVEL SECURITY'), 'rls');
  assert(migration.includes("role IN ('BUYER', 'SPOUSE', 'VENDOR')"), 'roles');

  const service = read('lib/saleContractSignatureService.ts');
  assert(service.includes('createSignaturePartiesAfterSend'), 'send parties');
  assert(service.includes('signPartyElectronically'), 'sign party');
  assert(service.includes('assertVendorCanSignWithParties'), 'vendor gate');
  assert(service.includes('getSaleContractBucket') || service.includes('saleContractStorage'), 'bucket helper');
  assert(!service.includes('SALE_CONTRACT_BUCKET'), 'sem SALE_CONTRACT_BUCKET quebrado');

  const storage = read('lib/saleContractStorage.ts');
  assert(storage.includes("company-assets"), 'bucket company-assets');
  assert(storage.includes('getSaleContractBucket'), 'getSaleContractBucket');
  assert(storage.includes('assertSaleContractBucketReady'), 'assert bucket');

  const signVendor = read('app/api/contracts/[id]/signature/sign-vendor/route.ts');
  assert(signVendor.includes('signSaleContractByVendor'), 'sign-vendor wiring');

  const mw = read('middleware.ts');
  assert(mw.includes("'/sign/sale'") || mw.includes("'/sign'"), 'middleware sign público');
  assert(mw.includes("'/api/sign/sale'") || mw.includes("'/api/sign'"), 'middleware api sign');

  const flow = read('lib/saleContractSignaturePartyFlow.ts');
  assert(flow.includes('reissueExternalPartyLink'), 'reissue');
  assert(flow.includes('BUYER_LINK_CREATED'), 'eventos');

  const ui = read('components/contracts/SaleContractSignatureSection.tsx');
  assert(ui.includes('Assinaturas'), 'painel');
  assert(ui.includes('handleReissueParty'), 'reenvio UI');
  assert(ui.includes('buildSalePartySignatureShareMessage'), 'share party');
  assert(ui.includes('saleAwaitingVendorPanelMessage'), 'mensagem vendedora');
  assert(ui.includes('isVendorWaitingForBuyers'), 'vendor waiting gate');

  console.log('OK testMigrationAndWiring');
}

function testUnifiedSpouseRuleAndViews() {
  const {
    hasRecantoSpouse,
    requiresSpouseSignature,
    contractHtmlHasSpouseAnuenteSlot,
  } = require('../lib/saleContractSignaturePartyRules') as typeof import('../lib/saleContractSignaturePartyRules');
  const { toPublicPartyViews } = require('../lib/saleContractSignatureParties') as typeof import('../lib/saleContractSignatureParties');
  const { hasSaleSpouseData } = require('../lib/saleSpouseFields') as typeof import('../lib/saleSpouseFields');

  const sale = {
    sale_spouse_name: 'Rosivan de Oliveira',
    sale_spouse_cpf: '39053344705',
    sale_spouse_phone: '9498141415',
  };

  assert(hasRecantoSpouse(sale) === hasSaleSpouseData(sale), 'alias = saleSpouseFields');
  assert(
    requiresSpouseSignature({
      contractModel: 'RECANTO_PRIMAVERA',
      sale,
      contractHtml: '',
    }),
    'requiresSpouse sem HTML',
  );
  assert(
    !requiresSpouseSignature({
      contractModel: 'RECANTO_PRIMAVERA',
      sale: { has_spouse: true },
      contractHtml: '',
    }),
    'has_spouse UI sozinho não basta',
  );
  assert(
    contractHtmlHasSpouseAnuenteSlot('<p>CÔNJUGE ANUENTE</p>'),
    'detecta slot HTML',
  );

  process.env.VERCEL_ENV = 'preview';
  process.env.VERCEL_URL = 'sv-lotes-vercel-test.vercel.app';

  const views = toPublicPartyViews(
    [
      {
        id: 'v',
        company_id: 'c',
        contract_signature_id: 's',
        contract_id: 'ct',
        sale_id: null,
        role: 'VENDOR',
        signer_name: 'Severino',
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
      {
        id: 's',
        company_id: 'c',
        contract_signature_id: 's',
        contract_id: 'ct',
        sale_id: null,
        role: 'SPOUSE',
        signer_name: 'Rosivan de Oliveira',
        signer_cpf: '39053344705',
        signer_phone: '9498141415',
        signer_email: null,
        signature_token_hash: 'h',
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
      {
        id: 'b',
        company_id: 'c',
        contract_signature_id: 's',
        contract_id: 'ct',
        sale_id: null,
        role: 'BUYER',
        signer_name: 'Severino José de França',
        signer_cpf: null,
        signer_phone: null,
        signer_email: null,
        signature_token_hash: 'h2',
        signature_url: 'https://old/sign/sale/tok-b',
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
    ],
    { includeUrls: true },
  );

  assert(views.map((p) => p.role).join(',') === 'BUYER,SPOUSE,VENDOR', 'ordem');
  assert(views[1].missingPublicUrl === true, 'SPOUSE sem URL → erro explícito');
  assert(views[1].name === 'Rosivan de Oliveira', 'nome cônjuge');
  assert(views[2].signatureUrl === null, 'vendor null');

  const modal = read('components/contracts/SaleContractMultiPartyShareModal.tsx');
  assert(modal.includes('CÔNJUGE ANUENTE'), 'heading modal');
  assert(modal.includes('missingPublicUrl') || modal.includes('link individual não foi gerado'), 'erro SPOUSE');
  assert(!modal.includes("parties.filter"), 'sem filtro silencioso');

  console.log('OK testUnifiedSpouseRuleAndViews');
}

function testPublicSignPanelUsesPartyNotAggregate() {
  // Cônjuge abre link com processo PARTIALLY_SIGNED → formulário, não "já assinei".
  assert(
    resolveSalePublicSignPanel({
      processStatus: 'PARTIALLY_SIGNED',
      partyStatus: 'VIEWED',
      partyRole: 'SPOUSE',
      canSign: true,
      awaitingOtherBuyers: false,
    }) === 'form',
    'SPOUSE VIEWED + parcial → form',
  );

  assert(
    resolveSalePublicSignPanel({
      processStatus: 'PARTIALLY_SIGNED',
      partyStatus: 'SIGNED',
      partyRole: 'BUYER',
      canSign: false,
      awaitingOtherBuyers: true,
    }) === 'awaiting_other_buyers',
    'BUYER já assinou → aguarda demais',
  );

  assert(
    resolveSalePublicSignPanel({
      processStatus: 'PARTIALLY_SIGNED',
      partyStatus: 'PENDING',
      partyRole: 'SPOUSE',
      canSign: true,
      awaitingOtherBuyers: false,
    }) === 'form',
    'SPOUSE PENDING + parcial → form',
  );

  assert(
    resolveSalePublicSignPanel({
      processStatus: 'CLIENT_SIGNED',
      partyStatus: 'SIGNED',
      partyRole: 'SPOUSE',
      canSign: false,
      awaitingVendor: true,
    }) === 'awaiting_vendor',
    'SPOUSE assinou → aguarda vendedor',
  );

  // Flag incorreta do agregado sozinho não deve bastar se party não assinou
  // (API corrigida envia false; UI também exige party SIGNED via awaitingOtherBuyers).
  assert(
    resolveSalePublicSignPanel({
      processStatus: 'PARTIALLY_SIGNED',
      partyStatus: 'VIEWED',
      partyRole: 'SPOUSE',
      canSign: true,
      awaitingOtherBuyers: false,
    }) !== 'awaiting_other_buyers',
    'VIEWED nunca awaiting_other_buyers',
  );

  const phone = pickCustomerPhoneForSignature({
    phone: '',
    whatsapp: '11999887766',
  });
  assert(phone === '11999887766', 'pick whatsapp');

  const enriched = enrichBuyerPartyPhone(
    [
      {
        role: 'BUYER' as const,
        signer_phone: null,
        phone: null,
      },
      {
        role: 'SPOUSE' as const,
        signer_phone: '11911112222',
        phone: '11911112222',
      },
    ],
    '11988776655',
  );
  assert(enriched[0].signer_phone === '11988776655', 'buyer phone fallback');
  assert(enriched[1].signer_phone === '11911112222', 'spouse intacto');
  assert(canShareViaWhatsApp(enriched[0].signer_phone), 'buyer WhatsApp ok');

  const page = read('app/sign/sale/[token]/page.tsx');
  assert(page.includes('resolveSalePublicSignPanel'), 'página usa painel por party');
  assert(
    !page.includes("status === 'PARTIALLY_SIGNED'"),
    'página não trata PARTIALLY_SIGNED como eu assinei',
  );

  const publicApi = read('app/api/sign/sale/[token]/route.ts');
  assert(
    publicApi.includes('thisPartySigned') &&
      publicApi.includes('nunca herdar signed_at'),
    'API awaitingOtherBuyers/signedAt por party',
  );

  console.log('OK testPublicSignPanelUsesPartyNotAggregate');
}

function testSaleContractBucketAndVendorPanel() {
  assert(
    getSaleContractBucket() === SALE_CONTRACT_STORAGE_BUCKET_DEFAULT,
    'bucket default company-assets',
  );
  assert(
    getSaleContractBucket() === 'company-assets',
    'bucket company-assets',
  );
  const path = buildSignedSaleContractStoragePath('tenant-1', '000000022/2026');
  assert(path.includes('contracts/sale-signed/tenant-1/'), 'path prefix');
  assert(path.endsWith('.pdf'), 'pdf');
  assert(path.includes('000000022_2026') || path.includes('000000022'), 'contract number sanitized');

  const withSpouse = saleAwaitingVendorPanelMessage([
    { role: 'BUYER', status: 'SIGNED' },
    { role: 'SPOUSE', status: 'SIGNED' },
    { role: 'VENDOR', status: 'PENDING' },
  ]);
  assert(withSpouse.includes('cônjuge anuente'), 'msg com cônjuge');
  assert(withSpouse.includes('vendedora'), 'msg vendedora');

  const withoutSpouse = saleAwaitingVendorPanelMessage([
    { role: 'BUYER', status: 'SIGNED' },
    { role: 'VENDOR', status: 'PENDING' },
  ]);
  assert(
    withoutSpouse === 'Comprador assinou. Aguardando assinatura da vendedora.',
    'msg sem cônjuge',
  );

  assert(
    isVendorWaitingForBuyers([
      { role: 'BUYER', status: 'SIGNED' },
      { role: 'SPOUSE', status: 'VIEWED' },
      { role: 'VENDOR', status: 'PENDING' },
    ]),
    'vendor waits spouse',
  );
  assert(
    !isVendorWaitingForBuyers([
      { role: 'BUYER', status: 'SIGNED' },
      { role: 'SPOUSE', status: 'SIGNED' },
      { role: 'VENDOR', status: 'PENDING' },
    ]),
    'vendor liberada',
  );

  console.log('OK testSaleContractBucketAndVendorPanel');
}

function main() {
  testModelGating();
  testSpouseValidation();
  testTokensDistinct();
  testAggregateStatusWithoutSpouse();
  testAggregateStatusWithSpouse();
  testShareMessagesDistinct();
  testSlotsAndCertificate();
  testMigrationAndWiring();
  testUnifiedSpouseRuleAndViews();
  testPublicSignPanelUsesPartyNotAggregate();
  testSaleContractBucketAndVendorPanel();
  console.log('\nTodos os testes de cônjuge/assinatura passaram.');
}

main();
