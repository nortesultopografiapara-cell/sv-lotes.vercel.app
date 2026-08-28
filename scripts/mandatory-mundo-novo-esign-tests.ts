/**
 * Testes obrigatórios — e-sign MUNDO_NOVO (Preview isolado).
 * npx tsx scripts/mandatory-mundo-novo-esign-tests.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MUNDO_NOVO_ESIGN_ALLOWED_COMPANY_IDS_ENV,
  MUNDO_NOVO_ESIGN_DEFAULT_ALLOWED_COMPANY_IDS,
  MUNDO_NOVO_ESIGN_DISABLED_MESSAGE,
  MUNDO_NOVO_ESIGN_ENABLED_ENV,
  MUNDO_NOVO_ESIGN_RR_COMPANY_ID,
  isMundoNovoEsignProductionLocked,
  shouldEnableMundoNovoEsign,
} from '../lib/mundoNovoEsignGate';
import {
  MUNDO_NOVO_DANIEL_VENDOR_FORBIDDEN_MESSAGE,
  MUNDO_NOVO_FORBIDDEN_VENDOR_CPF_DIGITS,
  MUNDO_NOVO_FORBIDDEN_VENDOR_NAME,
  MUNDO_NOVO_INTERVENIENT_FALLBACK_COMPANY_NAME,
  buildMundoNovoEsignExpectedPartyRoles,
  buildMundoNovoEsignVendorPartyInputs,
  buildMundoNovoIntervenientPartyInput,
  buildMundoNovoWitnessPartyInputs,
  findDisallowedMundoNovoDanielVendor,
  isMundoNovoForbiddenVendorCpf,
  isMundoNovoSaleContractModel,
} from '../lib/mundoNovoContractEsign';
import {
  applyMundoNovoElectronicSignaturesToContractHtml,
  applyMundoNovoElectronicCertificateNewPage,
  buildMundoNovoElectronicSignatureSlotsFromParties,
} from '../lib/mundoNovoContractElectronicSignatures';
import { buildMundoNovoSignaturesHtml } from '../lib/mundoNovoContractParties';
import { mergeMundoNovoSellerPartyContacts } from '../lib/mundoNovoContractSellers';
import { resolveMundoNovoHtml2pdfAvoid } from '../lib/mundoNovoHtml2PdfPagination';
import { splitMundoNovoContractAndCertificateHtml } from '../lib/mundoNovoContractSignedPdf';
import { shouldCreateSpouseSignatureParty } from '../lib/saleContractSignaturePartyRules';
import { buildSaleContractSignatureCertificateHtml } from '../lib/saleContractSignatureCertificateHtml';
import { SPOUSE_ELECTRONIC_SIGNATURE_MODELS } from '../lib/saleContractSignaturePartyRules';
import { resolveEffectiveSaleContractModel } from '../lib/saleContractSignaturePartyFlow';
import { PROJECT_UPDATE_KNOWN_COLUMNS } from '../lib/projects-update';
import { EMPTY_PROJECT_FORM, projectToFormInitialData } from '../lib/project-form';
import type { ContractSignaturePartyRow } from '../lib/saleContractSignaturePartyTypes';

const root = process.cwd();

function ok(cond: unknown, msg: string) {
  assert.ok(cond, msg);
  console.log(`  OK ${msg}`);
}

function envWith(overrides: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const e: NodeJS.ProcessEnv = { ...process.env };
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete e[k];
    else e[k] = v;
  }
  return e;
}

const RR = MUNDO_NOVO_ESIGN_RR_COMPANY_ID;
const DEVELOP_URL = 'https://hoynysmynxncdlptuzub.supabase.co';
const PRODUCTION_URL = 'https://aezktedncttwpqeunjej.supabase.co';

const MARIA = {
  role: 'PROMITENTE_VENDEDOR' as const,
  order: 1,
  name: 'Maria Elvira de Sousa',
  nationality: 'brasileira',
  maritalStatus: 'casada',
  profession: 'agricultora',
  rg: '7059327-SSP/PA',
  cpf: '248.031.972-53',
  address: 'Loteamento Palmares Sul – Lotes 33, 34 e 36 – Parauapebas – PA',
  email: 'maria.mundo.novo@example.com',
  phone: '94991001122',
};
const ADENIL = {
  role: 'PROMITENTE_VENDEDOR' as const,
  order: 2,
  name: 'Adenil Antonio de Sousa',
  nationality: 'brasileiro',
  maritalStatus: 'casado',
  profession: 'agricultor',
  rg: '7010624-SSP-PA',
  cpf: '175.200.962-20',
  address: 'Loteamento Palmares Sul – Lotes 33, 34 e 36 – Parauapebas – PA',
  email: 'adenil.mundo.novo@example.com',
  phone: '94991003344',
};

const PROJECT = {
  name: 'Chacreamento Mundo Novo',
  contract_model: 'MUNDO_NOVO',
  seller_parties_json: [MARIA, ADENIL],
};

const COMPANY = {
  id: RR,
  razao_social: 'R R NEGÓCIOS & SERVIÇOS LTDA',
  cnpj: '57590706000178',
  legal_representative: 'Daniel Roberto Rivelino de Sousa',
  representative_cpf: '820.912.262-20',
  legal_representative_email: 'rrnegocioseservicos@gmail.com',
  legal_representative_phone: '94991254320',
};

const TENANT = {
  ...COMPANY,
  contract_model: 'MUNDO_NOVO',
};

function mockParty(
  partial: Partial<ContractSignaturePartyRow> & { role: string },
): ContractSignaturePartyRow {
  return {
    id: partial.id || `party-${partial.role}`,
    company_id: RR,
    contract_signature_id: 'sig1',
    contract_id: 'ct1',
    sale_id: 's1',
    role: partial.role,
    signer_name: partial.signer_name ?? 'X',
    signer_cpf: partial.signer_cpf ?? '11144477735',
    signer_phone: partial.signer_phone ?? null,
    signer_email: partial.signer_email ?? null,
    signature_token_hash: null,
    signature_url: null,
    status: partial.status || 'SIGNED',
    sent_at: null,
    viewed_at: null,
    signed_at: partial.signed_at || '2026-08-27T12:00:00.000Z',
    cancelled_at: null,
    expires_at: null,
    signature_data: partial.signature_data || {},
    ip_address: partial.ip_address ?? null,
    user_agent: null,
    signature_hash: null,
    created_at: '2026-08-27T12:00:00.000Z',
    updated_at: '2026-08-27T12:00:00.000Z',
  };
}

const previewEnv = envWith({
  VERCEL_ENV: 'preview',
  NEXT_PUBLIC_SUPABASE_URL: DEVELOP_URL,
  [MUNDO_NOVO_ESIGN_ENABLED_ENV]: undefined,
  [MUNDO_NOVO_ESIGN_ALLOWED_COMPANY_IDS_ENV]: undefined,
});

function samplePhysicalHtml(): string {
  return buildMundoNovoSignaturesHtml({
    sellers: [MARIA, ADENIL],
    intervenienteName: MUNDO_NOVO_INTERVENIENT_FALLBACK_COMPANY_NAME,
    intervenienteCnpj: '57.590.706/0001-78',
    buyerName: 'Andre de Souza Lima',
    buyerCpf: '046.397.253-88',
    vendorSignatureLabels: ['PROMITENTE VENDEDORA', 'PROMITENTE VENDEDOR'],
    buyerSignatureLabel: 'PROMITENTE COMPRADOR',
    closingLine: 'Parauapebas – PA, 27 de agosto de 2026.',
  } as Parameters<typeof buildMundoNovoSignaturesHtml>[0]);
}

console.log('\n======== MUNDO NOVO E-SIGN — TESTES OBRIGATÓRIOS ========');

console.log('\n=== Isolamento de arquivos ===');
{
  const esign = readFileSync(join(root, 'lib/mundoNovoContractEsign.ts'), 'utf8');
  const gate = readFileSync(join(root, 'lib/mundoNovoEsignGate.ts'), 'utf8');
  const flow = readFileSync(join(root, 'lib/saleContractSignaturePartyFlow.ts'), 'utf8');
  const service = readFileSync(join(root, 'lib/saleContractSignatureService.ts'), 'utf8');
  const parties = readFileSync(join(root, 'lib/mundoNovoContractParties.ts'), 'utf8');
  const clauses = readFileSync(join(root, 'lib/mundoNovoContractClauses.ts'), 'utf8');
  ok(
    !esign.includes("from '@/lib/araguaia"),
    'mundoNovoContractEsign NÃO importa lib/araguaia*',
  );
  ok(
    !/buildAraguaiaEsignVendorPartyInputs\s*\(/.test(esign),
    'NÃO reutiliza buildAraguaiaEsignVendorPartyInputs',
  );
  ok(
    !gate.includes("from '@/lib/araguaia"),
    'gate Mundo Novo NÃO importa ARAGUAIA',
  );
  ok(
    flow.includes('buildAraguaiaEsignVendorPartyInputs'),
    'dispatcher ainda usa builder ARAGUAIA no ramo ARAGUAIA',
  );
  ok(
    flow.includes('buildMundoNovoEsignVendorPartyInputs'),
    'dispatcher tem ramo Mundo Novo',
  );
  ok(
    flow.includes('isMundoNovoSaleContractModel'),
    'dispatcher detecta modelo MUNDO_NOVO',
  );
  ok(
    service.includes('applyMundoNovoElectronicSignaturesToContractHtml'),
    'PDF assinado aplica bloco eletrônico Mundo Novo',
  );
  ok(
    service.includes('buildMundoNovoElectronicSignedPdfFromHtml'),
    'PDF eletrônico Mundo Novo força certificado em página própria',
  );
  {
    const loadFn = service.slice(
      service.indexOf('export async function loadSaleContractPdfForSign'),
      service.indexOf('export async function getLatestSignedSaleSignature'),
    );
    const importPos = loadFn.indexOf("'@/lib/mundoNovoContractEsign'");
    const certIfPos = loadFn.indexOf('shouldIssueSaleCertificate');
    const pdfBranchPos = loadFn.indexOf(
      'buildMundoNovoElectronicSignedPdfFromHtml',
    );
    ok(
      importPos >= 0 && certIfPos >= 0 && importPos < certIfPos,
      'isMundoNovoSaleContractModel importado no escopo de loadSaleContractPdfForSign, antes do if do certificado',
    );
    ok(
      pdfBranchPos > importPos,
      'ramo PDF eletrônico usa isMundoNovoSaleContractModel já importado',
    );
  }
  ok(
    service.includes('applyAraguaiaElectronicSignaturesToContractHtml'),
    'PDF ARAGUAIA permanece no serviço compartilhado',
  );
  ok(
    parties.includes('PHYSICAL_UNSIGNED') &&
      !parties.includes('ELECTRONIC_SIGNED'),
    'contrato físico Fase 1 permanece PHYSICAL_UNSIGNED',
  );
  ok(
    clauses.includes('CLÁUSULA') && !clauses.includes('ELECTRONIC_SIGNED'),
    'cláusulas homologadas da Fase 1 intactas',
  );
  const pagination = readFileSync(
    join(root, 'lib/mundoNovoHtml2PdfPagination.ts'),
    'utf8',
  );
  const postProcess = readFileSync(
    join(root, 'lib/contractPdfPostProcess.ts'),
    'utf8',
  );
  const template = readFileSync(
    join(root, 'lib/mundoNovoContractTemplate.ts'),
    'utf8',
  );
  ok(
    pagination.includes('MUNDO_NOVO_ELECTRONIC_HTML2PDF_PAGINATION_AVOID'),
    'paginação eletrônica isolada da física',
  );
  ok(
    postProcess.includes('resolveMundoNovoHtml2pdfAvoid'),
    'html2pdf Mundo Novo escolhe avoid pelo HTML',
  );
  ok(
    template.includes('page-break-inside: avoid !important') &&
      template.includes('.contract-closing-and-signatures--mundo-novo'),
    'template físico ainda evita quebra no fecho+linhas',
  );
}

console.log('\n=== Gate Preview × Production ===');
{
  ok(
    MUNDO_NOVO_ESIGN_DEFAULT_ALLOWED_COMPANY_IDS[0] === RR,
    'allowlist default = R R',
  );
  ok(
    shouldEnableMundoNovoEsign(
      { companyId: RR, contractModel: 'MUNDO_NOVO' },
      previewEnv,
    ),
    'Preview + R R + MUNDO_NOVO = ON',
  );
  ok(
    !shouldEnableMundoNovoEsign(
      { companyId: RR, contractModel: 'ARAGUAIA' },
      previewEnv,
    ),
    'ARAGUAIA no gate Mundo Novo = OFF',
  );
  ok(
    !shouldEnableMundoNovoEsign(
      { companyId: '', contractModel: 'MUNDO_NOVO' },
      previewEnv,
    ),
    'sem companyId = OFF',
  );
  ok(
    isMundoNovoEsignProductionLocked(
      envWith({
        VERCEL_ENV: 'production',
        NEXT_PUBLIC_SUPABASE_URL: DEVELOP_URL,
        [MUNDO_NOVO_ESIGN_ENABLED_ENV]: 'true',
      }),
    ),
    'VERCEL_ENV=production trava o gate',
  );
  ok(
    !shouldEnableMundoNovoEsign(
      { companyId: RR, contractModel: 'MUNDO_NOVO' },
      envWith({
        VERCEL_ENV: 'production',
        NEXT_PUBLIC_SUPABASE_URL: DEVELOP_URL,
        [MUNDO_NOVO_ESIGN_ENABLED_ENV]: 'true',
      }),
    ),
    'Production Vercel nunca liga e-sign Mundo Novo',
  );
  ok(
    !shouldEnableMundoNovoEsign(
      { companyId: RR, contractModel: 'MUNDO_NOVO' },
      envWith({
        VERCEL_ENV: 'preview',
        NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_URL,
        [MUNDO_NOVO_ESIGN_ENABLED_ENV]: 'true',
      }),
    ),
    'Preview apontando para banco Production = OFF',
  );
  ok(
    !shouldEnableMundoNovoEsign(
      { companyId: RR, contractModel: 'MUNDO_NOVO' },
      envWith({
        VERCEL_ENV: 'preview',
        NEXT_PUBLIC_SUPABASE_URL: DEVELOP_URL,
        [MUNDO_NOVO_ESIGN_ENABLED_ENV]: 'false',
      }),
    ),
    'flag explícita false desliga Preview',
  );
  ok(
    MUNDO_NOVO_ESIGN_DISABLED_MESSAGE.includes('não está habilitado'),
    'mensagem de gate desligado',
  );
}

console.log('\n=== Parties: Maria/Adenil VENDOR; Daniel NÃO VENDOR; R R INTERVENIENT ===');
{
  const vendors = buildMundoNovoEsignVendorPartyInputs({ project: PROJECT });
  ok(vendors.length === 2, '2 VENDOR');
  ok(vendors[0].name.includes('Maria Elvira'), 'Maria = VENDOR 1');
  ok(vendors[1].name.includes('Adenil'), 'Adenil = VENDOR 2');
  ok(
    !vendors.some((v) => isMundoNovoForbiddenVendorCpf(v.cpf)),
    'nenhum VENDOR com CPF de Daniel',
  );
  ok(
    !vendors.some((v) => v.name.includes('Daniel')),
    'Daniel NÃO é VENDOR',
  );
  ok(vendors[0].email.includes('maria'), 'Maria tem e-mail');
  ok(vendors[1].phone.length >= 10, 'Adenil tem telefone');

  const intervenient = buildMundoNovoIntervenientPartyInput({ company: COMPANY });
  ok(intervenient.role === 'INTERVENIENT', 'R R = INTERVENIENT');
  ok(
    intervenient.name.includes('R R NEGÓCIOS'),
    'signer_name = razão social R R',
  );
  ok(intervenient.cnpj.length >= 14, 'signer_cpf = CNPJ da R R');
  ok(
    intervenient.signatureData.party_kind === 'LEGAL_ENTITY',
    'party_kind = LEGAL_ENTITY',
  );
  ok(
    intervenient.signatureData.representative_name ===
      MUNDO_NOVO_FORBIDDEN_VENDOR_NAME,
    'representante da INTERVENIENT = Daniel',
  );
  ok(
    intervenient.signatureData.representative_cpf ===
      MUNDO_NOVO_FORBIDDEN_VENDOR_CPF_DIGITS,
    'CPF do representante = Daniel',
  );
  ok(intervenient.withPublicToken === false, 'INTERVENIENT sem token público');

  const witnesses = buildMundoNovoWitnessPartyInputs();
  ok(witnesses.map((w) => w.role).join(',') === 'WITNESS_1,WITNESS_2', 'WITNESS_1 e WITNESS_2');
  ok(
    witnesses.every((w) => w.withPublicToken === true),
    'testemunhas com link público',
  );

  const roles = buildMundoNovoEsignExpectedPartyRoles({ project: PROJECT });
  ok(roles.filter((r) => r === 'VENDOR').length === 2, '2 papéis VENDOR');
  ok(roles.includes('BUYER'), 'BUYER presente');
  ok(roles.includes('INTERVENIENT'), 'INTERVENIENT presente');
  ok(!roles.includes('SPOUSE'), 'Mundo Novo não cria SPOUSE');
  ok(isMundoNovoSaleContractModel('MUNDO_NOVO'), 'modelo MUNDO_NOVO');

  const danielVendor = findDisallowedMundoNovoDanielVendor([
    mockParty({
      role: 'VENDOR',
      signer_name: MUNDO_NOVO_FORBIDDEN_VENDOR_NAME,
      signer_cpf: MUNDO_NOVO_FORBIDDEN_VENDOR_CPF_DIGITS,
    }),
  ]);
  ok(Boolean(danielVendor), 'detector recusa Daniel como VENDOR');
  ok(
    MUNDO_NOVO_DANIEL_VENDOR_FORBIDDEN_MESSAGE.includes('não pode ser criado como VENDOR'),
    'mensagem explícita Daniel ≠ VENDOR',
  );
}

console.log('\n=== Fail closed: e-mail/telefone/CPF do vendedor ===');
{
  try {
    buildMundoNovoEsignVendorPartyInputs({
      project: {
        ...PROJECT,
        seller_parties_json: [{ ...MARIA, email: '' }, ADENIL],
      },
    });
    throw new Error('deveria falhar sem e-mail da Maria');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ok(message.includes('Maria Elvira'), 'mensagem cita Maria');
    ok(/e-mail/i.test(message), 'mensagem cita e-mail');
  }

  try {
    buildMundoNovoEsignVendorPartyInputs({
      project: {
        ...PROJECT,
        seller_parties_json: [MARIA, { ...ADENIL, phone: '' }],
      },
    });
    throw new Error('deveria falhar sem telefone do Adenil');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ok(message.includes('Adenil'), 'mensagem cita Adenil');
    ok(/telefone/i.test(message), 'mensagem cita telefone');
  }

  try {
    buildMundoNovoEsignVendorPartyInputs({
      project: {
        ...PROJECT,
        seller_parties_json: [
          MARIA,
          ADENIL,
          {
            role: 'PROMITENTE_VENDEDOR',
            order: 3,
            name: MUNDO_NOVO_FORBIDDEN_VENDOR_NAME,
            cpf: '820.912.262-20',
            email: 'daniel@example.com',
            phone: '94991254320',
          },
        ],
      },
    });
    throw new Error('deveria recusar Daniel como VENDOR');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ok(
      message.includes('não pode ser criado como VENDOR'),
      'Daniel no JSON do projeto é recusado como VENDOR',
    );
  }
}

console.log('\n=== SPOUSE + ARAGUAIA intactos + modelo efetivo ===');
{
  ok(
    !SPOUSE_ELECTRONIC_SIGNATURE_MODELS.includes('MUNDO_NOVO'),
    'MUNDO_NOVO fora da lista SPOUSE',
  );
  ok(
    SPOUSE_ELECTRONIC_SIGNATURE_MODELS.includes('MENESES'),
    'MENESES continua com SPOUSE',
  );
  ok(
    !shouldCreateSpouseSignatureParty({
      contractModel: 'MUNDO_NOVO',
      sale: {
        has_spouse: true,
        sale_spouse_name: 'Cônjuge Teste',
        sale_spouse_cpf: '39053344705',
      },
      contractHtml: '<div>CÔNJUGE ANUENTE</div>',
    }),
    'Mundo Novo não cria SPOUSE mesmo com cônjuge na venda',
  );
  ok(
    resolveEffectiveSaleContractModel('MUNDO_NOVO', '<div>CÔNJUGE ANUENTE</div>') ===
      'MUNDO_NOVO',
    'HTML Recanto não sobrescreve MUNDO_NOVO',
  );
  ok(
    resolveEffectiveSaleContractModel('ARAGUAIA', '<div>CÔNJUGE ANUENTE</div>') ===
      'ARAGUAIA',
    'ARAGUAIA permanece inalterado no dispatcher',
  );
}

console.log('\n=== seller_parties_json email/phone (sem migration) ===');
{
  ok(
    PROJECT_UPDATE_KNOWN_COLUMNS.includes('seller_parties_json'),
    'projects-update conhece seller_parties_json',
  );
  ok(
    Array.isArray(EMPTY_PROJECT_FORM.seller_party_contacts),
    'form inicial tem contatos vazios',
  );
  const form = projectToFormInitialData({
    name: 'Chacreamento Mundo Novo',
    city: 'Parauapebas',
    uf: 'PA',
    contract_model: 'MUNDO_NOVO',
    seller_parties_json: [MARIA, ADENIL],
  });
  ok(form.seller_party_contacts[0].email.includes('maria'), 'form carrega e-mail Maria');
  ok(form.seller_party_contacts[1].phone.includes('9499'), 'form carrega telefone Adenil');

  const merged = mergeMundoNovoSellerPartyContacts([MARIA, ADENIL], [
    { order: 1, email: 'nova.maria@example.com', phone: '94990000001' },
  ]);
  ok(merged[0].email === 'nova.maria@example.com', 'merge atualiza e-mail Maria');
  ok(merged[0].cpf === MARIA.cpf, 'merge NÃO altera CPF');
  ok(merged[0].name === MARIA.name, 'merge NÃO altera nome');
  ok(merged[1].email === ADENIL.email, 'Adenil preservado sem patch');
}

console.log('\n=== Contrato físico Fase 1 inalterado ===');
{
  const html = samplePhysicalHtml();
  ok(html.includes('data-signature-mode="PHYSICAL_UNSIGNED"'), 'físico PHYSICAL_UNSIGNED');
  ok(!html.includes('ELECTRONIC_SIGNED'), 'físico sem ELECTRONIC_SIGNED');
  ok(html.includes('Maria Elvira de Sousa'), 'físico Maria');
  ok(html.includes('Adenil Antonio de Sousa'), 'físico Adenil');
  ok(html.includes('R R NEGÓCIOS'), 'físico R R');
}

console.log('\n=== Bloco eletrônico + certificado ===');
{
  const physical = samplePhysicalHtml();
  const parties = [
    mockParty({
      id: 'v-maria',
      role: 'VENDOR',
      signer_name: MARIA.name,
      signer_cpf: '24803197253',
      signed_at: '2026-08-27T15:01:00.000Z',
      ip_address: '187.10.0.11',
      signature_data: { signature_event_id: 'evt-maria' },
    }),
    mockParty({
      id: 'v-adenil',
      role: 'VENDOR',
      signer_name: ADENIL.name,
      signer_cpf: '17520096220',
      signed_at: '2026-08-27T15:02:00.000Z',
      ip_address: '187.10.0.12',
      signature_data: { signature_event_id: 'evt-adenil' },
    }),
    mockParty({
      id: 'buyer',
      role: 'BUYER',
      signer_name: 'Comprador Teste',
      signer_cpf: '11144477735',
      signed_at: '2026-08-27T15:03:00.000Z',
      ip_address: '187.10.0.13',
      signature_data: { signature_event_id: 'evt-buyer' },
    }),
    mockParty({
      id: 'interv',
      role: 'INTERVENIENT',
      signer_name: 'R R NEGÓCIOS & SERVIÇOS LTDA',
      signer_cpf: '57590706000178',
      signed_at: '2026-08-27T15:04:00.000Z',
      ip_address: '187.10.0.14',
      signature_data: {
        signature_event_id: 'evt-rr',
        party_kind: 'LEGAL_ENTITY',
        company_name: 'R R NEGÓCIOS & SERVIÇOS LTDA',
        company_cnpj: '57590706000178',
        representative_name: MUNDO_NOVO_FORBIDDEN_VENDOR_NAME,
        representative_cpf: MUNDO_NOVO_FORBIDDEN_VENDOR_CPF_DIGITS,
      },
    }),
    mockParty({
      id: 'w1',
      role: 'WITNESS_1',
      signer_name: 'Testemunha Um',
      signer_cpf: '39053344705',
      signed_at: '2026-08-27T15:05:00.000Z',
      ip_address: '187.10.0.15',
      signature_data: { signature_event_id: 'evt-w1' },
    }),
    mockParty({
      id: 'w2',
      role: 'WITNESS_2',
      signer_name: 'Testemunha Dois',
      signer_cpf: '52998224725',
      signed_at: '2026-08-27T15:06:00.000Z',
      ip_address: '187.10.0.16',
      signature_data: { signature_event_id: 'evt-w2' },
    }),
  ];

  const slots = buildMundoNovoElectronicSignatureSlotsFromParties(parties);
  ok(slots.filter((s) => s.role === 'VENDOR').length === 2, 'bloco 2 vendedores');
  ok(
    slots.map((s) => s.role).join(',') ===
      'VENDOR,VENDOR,INTERVENIENT,BUYER,WITNESS_1,WITNESS_2',
    'ordem 3×2: Maria → Adenil → R R → comprador → testemunhas',
  );
  ok(slots[0].roleLabel === 'PROMITENTE VENDEDOR 1', 'rótulo vendedor 1');
  ok(slots[1].roleLabel === 'PROMITENTE VENDEDOR 2', 'rótulo vendedor 2');
  ok(slots[0].name.includes('Maria'), 'primeiro card Maria');
  ok(slots[1].name.includes('Adenil'), 'segundo card Adenil');
  ok(slots[2].role === 'INTERVENIENT', 'terceiro card INTERVENIENTE');
  ok(slots.some((s) => s.role === 'BUYER'), 'bloco comprador');
  ok(slots.some((s) => s.role === 'WITNESS_1'), 'bloco testemunha 1');
  ok(slots.some((s) => s.role === 'WITNESS_2'), 'bloco testemunha 2');
  const rrSlot = slots.find((s) => s.role === 'INTERVENIENT');
  ok(
    (rrSlot?.extraMeta || []).some((line) =>
      line.includes('Representada por Daniel Roberto Rivelino de Sousa'),
    ),
    'bloco R R mostra Representada por Daniel',
  );
  ok(
    (rrSlot?.extraMeta || []).some((line) => /CPF:/.test(line)),
    'bloco R R mostra CPF do representante',
  );

  const signedHtml = applyMundoNovoElectronicSignaturesToContractHtml(
    physical,
    parties,
  );
  ok(signedHtml.includes('ELECTRONIC_SIGNED'), 'PDF eletrônico ELECTRONIC_SIGNED');
  ok(
    signedHtml.includes('ASSINATURAS ELETRÔNICAS'),
    'título ASSINATURAS ELETRÔNICAS abaixo do fecho',
  );
  ok(
    signedHtml.includes('Assinado eletronicamente'),
    'selo compacto Assinado eletronicamente',
  );
  ok(
    signedHtml.includes('signature-grid--mundo-novo-electronic'),
    'grade compacta 3 colunas',
  );
  ok(
    signedHtml.includes('repeat(3, minmax(0, 1fr))'),
    'CSS da grade 3×2',
  );
  ok(signedHtml.includes('PROMITENTE VENDEDOR 1'), 'card vendedor 1 na página 7');
  ok(signedHtml.includes('PROMITENTE VENDEDOR 2'), 'card vendedor 2 na página 7');
  ok(signedHtml.includes('IP: 187.10.0.11'), 'card com IP real');
  ok(signedHtml.includes('CPF:'), 'card com CPF');
  ok(signedHtml.includes('ID: evt-maria'), 'card com ID único');
  ok(
    signedHtml.includes(
      'contract-closing-and-signatures--mundo-novo" data-signature-mode="ELECTRONIC_SIGNED"',
    ),
    'wrapper eletrônico libera quebra da página de rubricas isoladas',
  );
  ok(
    signedHtml.includes('page-break-inside: auto !important'),
    'CSS eletrônico não isola o fecho numa página só',
  );
  ok(
    signedHtml.includes(
      'body:has(.sv-contract-mundo-novo [data-signature-mode="ELECTRONIC_SIGNED"]) .sv-cert-official-block',
    ) && signedHtml.includes('page-break-before: always !important'),
    'certificado eletrônico começa em página própria',
  );
  ok(physical.includes('PHYSICAL_UNSIGNED'), 'físico permanece PHYSICAL_UNSIGNED');
  ok(!physical.includes('ASSINATURAS ELETRÔNICAS'), 'físico sem bloco eletrônico compacto');
  ok(signedHtml.includes(MARIA.name), 'PDF eletrônico Maria');
  ok(signedHtml.includes(ADENIL.name), 'PDF eletrônico Adenil');
  ok(
    signedHtml.includes('Representada por Daniel Roberto Rivelino de Sousa'),
    'PDF eletrônico Representada por Daniel',
  );
  ok(!signedHtml.includes('data-party-role="SPOUSE"'), 'PDF eletrônico sem SPOUSE');

  const cert = buildSaleContractSignatureCertificateHtml({
    contractNumber: '000000010/2026',
    projectName: 'Chacreamento Mundo Novo',
    quadra: '01',
    lote: '12',
    buyerName: 'Comprador Teste',
    buyerDocument: '11144477735',
    signatureStatus: 'ASSINADO ELETRONICAMENTE',
    companyName: 'R R NEGÓCIOS & SERVIÇOS LTDA',
    signedAt: '2026-08-27T15:03:00.000Z',
    buyerSignatureEventId: 'evt-buyer',
    personVendorCards: [
      {
        name: MARIA.name,
        cpf: '24803197253',
        email: MARIA.email,
        signedAt: '2026-08-27T15:01:00.000Z',
        signatureEventId: 'evt-maria',
      },
      {
        name: ADENIL.name,
        cpf: '17520096220',
        email: ADENIL.email,
        signedAt: '2026-08-27T15:02:00.000Z',
        signatureEventId: 'evt-adenil',
      },
    ],
    intervenientCard: {
      companyName: 'R R NEGÓCIOS & SERVIÇOS LTDA',
      companyCnpj: '57590706000178',
      representativeName: MUNDO_NOVO_FORBIDDEN_VENDOR_NAME,
      representativeCpf: MUNDO_NOVO_FORBIDDEN_VENDOR_CPF_DIGITS,
      signedAt: '2026-08-27T15:04:00.000Z',
      signatureEventId: 'evt-rr',
    },
    witnessCards: [
      {
        role: 'WITNESS_1',
        name: 'Testemunha Um',
        cpf: '39053344705',
        signedAt: '2026-08-27T15:05:00.000Z',
        signatureEventId: 'evt-w1',
      },
      {
        role: 'WITNESS_2',
        name: 'Testemunha Dois',
        cpf: '52998224725',
        signedAt: '2026-08-27T15:06:00.000Z',
        signatureEventId: 'evt-w2',
      },
    ],
  });
  ok(cert.includes(MARIA.name), 'certificado Maria');
  ok(cert.includes(ADENIL.name), 'certificado Adenil');
  ok(cert.includes('Comprador Teste'), 'certificado BUYER');
  ok(cert.includes('R R NEGÓCIOS'), 'certificado R R');
  ok(cert.includes(MUNDO_NOVO_FORBIDDEN_VENDOR_NAME), 'certificado Daniel representante');
  ok(!/PROMITENTE VENDEDOR[\s\S]{0,200}Daniel Roberto/i.test(cert), 'Daniel não aparece como VENDOR no certificado');
  ok(cert.includes('evt-maria') && cert.includes('evt-adenil'), 'IDs das parties no certificado padrão');
  ok(cert.includes('evt-rr') && cert.includes('evt-w1') && cert.includes('evt-w2'), 'IDs INTERVENIENT e testemunhas');
  const compactCert = buildSaleContractSignatureCertificateHtml({
    contractNumber: '000000010/2026',
    projectName: 'Chacreamento Mundo Novo',
    quadra: '01',
    lote: '12',
    buyerName: 'Comprador Teste',
    buyerDocument: '11144477735',
    signatureStatus: 'ASSINADO ELETRONICAMENTE',
    companyName: 'R R NEGÓCIOS & SERVIÇOS LTDA',
    signedAt: '2026-08-27T15:03:00.000Z',
    signatureToken: 'tok-compact-mn',
    signatureHash: 'abc123hash',
    publicUrl: 'https://example.test/verify/tok-compact-mn',
    qrCodeDataUrl: 'data:image/png;base64,AAA',
    omitPartyEvidenceCards: true,
    personVendorCards: [
      {
        name: MARIA.name,
        cpf: '24803197253',
        signedAt: '2026-08-27T15:01:00.000Z',
        signatureEventId: 'evt-maria',
      },
    ],
    intervenientCard: {
      companyName: 'R R NEGÓCIOS & SERVIÇOS LTDA',
      representativeName: MUNDO_NOVO_FORBIDDEN_VENDOR_NAME,
      representativeCpf: MUNDO_NOVO_FORBIDDEN_VENDOR_CPF_DIGITS,
      signedAt: '2026-08-27T15:04:00.000Z',
      signatureEventId: 'evt-rr',
    },
  });
  ok(!compactCert.includes('class="sv-cert-cards"'), 'layout compacto sem fichas extensas');
  ok(compactCert.includes('tok-compact-mn'), 'token real no certificado compacto');
  ok(compactCert.includes('abc123hash'), 'hash real no certificado compacto');
  ok(compactCert.includes('https://example.test/verify/tok-compact-mn'), 'URL pública real');
  const withCert = applyMundoNovoElectronicCertificateNewPage(signedHtml + compactCert);
  ok(
    withCert.includes('class="sv-cert-official-block sv-mundo-novo-cert-new-page sv-mundo-novo-cert-compact"') &&
      withCert.includes('class="sv-mundo-novo-cert-page-break"'),
    'certificado eletrônico com classe de página própria',
  );
  ok(
    !physical.includes('sv-mundo-novo-cert-new-page'),
    'físico sem classe de certificado eletrônico',
  );
  const split = splitMundoNovoContractAndCertificateHtml(withCert);
  ok(
    split.contractHtml.includes('ASSINATURAS ELETRÔNICAS') &&
      !split.contractHtml.includes('class="sv-cert-official-block'),
    'HTML do contrato eletrônico sem certificado',
  );
  ok(
    split.certificateHtml.includes('class="sv-cert-official-block'),
    'HTML do certificado separado para merge',
  );
  ok(
    !split.certificateHtml.includes('class="sv-cert-cards"'),
    'página 8 sem fichas extensas de evidência',
  );
  ok(
    split.certificateHtml.includes('Escaneie para validar este documento'),
    'página 8 com legenda do QR',
  );
  ok(
    split.certificateHtml.includes('sv-mundo-novo-cert-compact'),
    'página 8 com layout compacto QR + certificado',
  );
  ok(
    split.contractHtml.includes('evt-maria') &&
      split.contractHtml.includes('evt-adenil') &&
      split.contractHtml.includes('evt-rr'),
    'IDs das assinaturas permanecem nos cards da página 7',
  );

  const physicalAvoid = resolveMundoNovoHtml2pdfAvoid(physical);
  const electronicAvoid = resolveMundoNovoHtml2pdfAvoid(signedHtml);
  ok(
    physicalAvoid.includes('.contract-closing-and-signatures--mundo-novo'),
    'html2pdf físico ainda trata fecho+linhas como unidade',
  );
  ok(
    !electronicAvoid.includes('.contract-closing-and-signatures--mundo-novo'),
    'html2pdf eletrônico NÃO isola o wrapper de fecho+assinaturas',
  );
  ok(
    !electronicAvoid.some((sel) => sel.includes('contract-signatures--electronic')),
    'html2pdf eletrônico NÃO empurra o grid inteiro para a página seguinte',
  );
  ok(
    electronicAvoid.includes('.sv-contract-mundo-novo .signature-slot--electronic'),
    'html2pdf eletrônico evita partir card compacto no meio',
  );
  ok(
    physicalAvoid.includes('.contract-closing-and-signatures--mundo-novo') &&
      !electronicAvoid.includes('.contract-closing-and-signatures--mundo-novo'),
    'listas física e eletrônica são distintas',
  );
  ok(
    electronicAvoid.includes('.sv-cert-official-block'),
    'html2pdf eletrônico mantém certificado inteiro',
  );
}

console.log('\nTODOS OS TESTES OBRIGATÓRIOS DO E-SIGN MUNDO NOVO PASSARAM.\n');
