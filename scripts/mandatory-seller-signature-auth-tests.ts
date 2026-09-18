/**
 * Testes obrigatórios — Fase 3 assinatura interna do vendedor.
 * npx tsx scripts/mandatory-seller-signature-auth-tests.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PRIMARY_ADMIN_VERIFY_DENIED_MESSAGE,
  type PrimaryAdminPasswordVerifyInput,
  type PrimaryAdminReauthDeps,
  type PrimaryAdminUserRow,
} from '../lib/primaryAdminReauth';
import {
  SELLER_SIGNATURE_ALREADY_SIGNED_MESSAGE,
  SELLER_SIGNATURE_AUTHORIZED_ACTION,
  SELLER_SIGNATURE_BROKER_DENIED_MESSAGE,
  SELLER_SIGNATURE_FAILED_ACTION,
  authorizeAndExecuteInternalVendorSign,
  canRequestInternalVendorSign,
  classifyInternalSignTarget,
  classifyInternalVendorSignRole,
  decideInternalVendorSignAfterPreview,
  internalSignRequiresPrimaryAdminPassword,
  previewInternalVendorSignAuthorization,
  stripClientVendorSignIdentity,
  toPublicVendorSignError,
  type VendorSignAuthDeps,
  type VendorSignContractSnapshot,
  type VendorSignPartySnapshot,
  type VendorSignSignatureSnapshot,
} from '../lib/saleContractVendorSignAuth';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

const SV = 'f26f2331-1885-4ac6-8d0e-4131cc8a8014';
const OTHER = 'aaaaaaaa-bbbb-4000-8000-ffffffffffff';
const PRINCIPAL = '8ffc7eec-2df7-4f91-b536-ddf3fc393a14';
const MARCOS = 'da9ab925-b398-4dc2-9020-92832ca4e9f8';
const BROKER = 'cccccccc-dddd-4000-8000-222222222222';
const OWNER = 'dddddddd-eeee-4000-8000-333333333333';
const SUPER = 'eeeeeeee-ffff-4000-8000-444444444444';
const CONTRACT = '11111111-2222-4000-8000-aaaaaaaaaaaa';
const SIGNATURE = '22222222-3333-4000-8000-bbbbbbbbbbbb';
const VENDOR_PARTY = '33333333-4444-4000-8000-cccccccccccc';
const VENDOR_PARTY_2 = '44444444-5555-4000-8000-dddddddddddd';
const INTERVENIENT_PARTY = '55555555-6666-4000-8000-eeeeeeeeeeee';
const PRINCIPAL_EMAIL = 'demostrar@svlotes.com.br';
const MARCOS_EMAIL = 'marcos@svlotes.com.br';
const PRINCIPAL_PASSWORD = 'principal-secret';
const MARCOS_PASSWORD = 'marcos-secret';

function users(): Record<string, PrimaryAdminUserRow> {
  return {
    [PRINCIPAL]: {
      id: PRINCIPAL,
      tenant_id: SV,
      role: 'ADMIN',
      status: 'ACTIVE',
      email: PRINCIPAL_EMAIL,
      full_name: 'Admin - S.V TOPOGRAFIA E PROJETO LTDA',
    },
    [MARCOS]: {
      id: MARCOS,
      tenant_id: SV,
      role: 'ADMIN_EMPRESA',
      status: 'ACTIVE',
      email: MARCOS_EMAIL,
      full_name: 'Marco francisco oliveira',
    },
    [BROKER]: {
      id: BROKER,
      tenant_id: SV,
      role: 'BROKER',
      status: 'ACTIVE',
      email: 'corretor@svlotes.com.br',
      full_name: 'Corretor',
    },
    [OWNER]: {
      id: OWNER,
      tenant_id: SV,
      role: 'OWNER',
      status: 'ACTIVE',
      email: 'owner@svlotes.com.br',
      full_name: 'Proprietário',
    },
    [SUPER]: {
      id: SUPER,
      tenant_id: null,
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      email: 'super@svlotes.com.br',
      full_name: 'Super Admin',
    },
  };
}

function pendingVendorParties(): VendorSignPartySnapshot[] {
  return [
    {
      id: VENDOR_PARTY,
      role: 'VENDOR',
      status: 'PENDING',
      signer_name: 'Daniel Roberto',
      signer_cpf: '11144477735',
    },
    {
      id: 'buyer-1',
      role: 'BUYER',
      status: 'SIGNED',
      signer_name: 'Comprador',
      signer_cpf: '39053344705',
    },
  ];
}

/** Shape do contrato 031 na homologação: 2 VENDOR + INTERVENIENT + BUYER. */
function contract031HomologParties(): VendorSignPartySnapshot[] {
  return [
    {
      id: 'buyer-rosivan',
      role: 'BUYER',
      status: 'SIGNED',
      signer_name: 'ROSIVAN DE OLIVEIRA',
      signer_cpf: '39053344705',
    },
    {
      id: VENDOR_PARTY,
      role: 'VENDOR',
      status: 'PENDING',
      signer_name: 'SEVERINO JOSE DE FRANÇA',
      signer_cpf: '11144477735',
    },
    {
      id: VENDOR_PARTY_2,
      role: 'VENDOR',
      status: 'PENDING',
      signer_name: 'ANA SOPHIA OLIVEIRA FRANÇA',
      signer_cpf: '39053344705',
    },
    {
      id: INTERVENIENT_PARTY,
      role: 'INTERVENIENT',
      status: 'PENDING',
      signer_name: 'S.V TOPOGRAFIA E PROJETO LTDA',
      signer_cpf: '57590706000178',
    },
    {
      id: 'w1',
      role: 'WITNESS_1',
      status: 'SIGNED',
      signer_name: 'SEVERINO JOSE DE FRANÇA',
      signer_cpf: '11144477735',
    },
    {
      id: 'w2',
      role: 'WITNESS_2',
      status: 'SIGNED',
      signer_name: 'SEVERINO JOSE DE FRANÇA',
      signer_cpf: '11144477735',
    },
  ];
}

function makeDeps(over: {
  operatorId?: string;
  parties?: VendorSignPartySnapshot[];
  signature?: Partial<VendorSignSignatureSnapshot>;
  contract?: Partial<VendorSignContractSnapshot>;
  sign?: VendorSignAuthDeps['signAsVendor'];
} = {}) {
  const table = users();
  const passwordCalls: PrimaryAdminPasswordVerifyInput[] = [];
  const signCalls: Array<{ partyId: string | null; vendorName: string }> = [];
  const reauthBase: PrimaryAdminReauthDeps = {
    rateLimitStore: new Map(),
    loadOperator: async (id) => table[id] || null,
    loadCompanyPrimaryAdminUserId: async (companyId) => (companyId === SV ? PRINCIPAL : null),
    loadUser: async (id) => table[id] || null,
    verifyPassword: async (input) => {
      passwordCalls.push(input);
      if (input.email === PRINCIPAL_EMAIL && input.password === PRINCIPAL_PASSWORD) {
        return { userId: PRINCIPAL, accessToken: 'ephemeral-access' };
      }
      if (input.email === MARCOS_EMAIL && input.password === MARCOS_PASSWORD) {
        return { userId: MARCOS, accessToken: 'marcos-token' };
      }
      return { userId: null };
    },
  };
  const contract: VendorSignContractSnapshot = {
    id: CONTRACT,
    tenant_id: SV,
    company_id: SV,
    contract_number: '000000026/2026',
    sale_id: 'sale-1',
    status: 'ativo',
    ...over.contract,
  };
  const signature: VendorSignSignatureSnapshot = {
    id: SIGNATURE,
    contract_id: CONTRACT,
    tenant_id: SV,
    signature_status: 'CLIENT_SIGNED',
    vendor_signed_at: null,
    vendor_signer_name: null,
    vendor_signer_document: null,
    ...over.signature,
  };
  const parties = over.parties || pendingVendorParties();
  const deps: VendorSignAuthDeps = {
    ...reauthBase,
    loadContract: async (id) => (id === CONTRACT ? contract : null),
    loadSignature: async (contractId, signatureId) =>
      contractId === CONTRACT && signatureId === SIGNATURE ? signature : null,
    loadParties: async () => parties,
    signAsVendor:
      over.sign ||
      (async (input) => {
        signCalls.push({ partyId: input.partyId, vendorName: input.vendorName });
        return {
          signature: { id: SIGNATURE, signature_status: 'SIGNED' },
          pdfSignedUrl: 'https://signed.example/pdf',
        };
      }),
  };
  return { deps, passwordCalls, signCalls, contract, signature, parties };
}

async function runAuthorize(
  operatorUserId: string,
  over: Parameters<typeof makeDeps>[0] & {
    password?: string;
    partyId?: string | null;
    vendorName?: string;
  } = {},
) {
  const wired = makeDeps(over);
  const { result, verify } = await authorizeAndExecuteInternalVendorSign(wired.deps, {
    operatorUserId,
    contractId: CONTRACT,
    signatureId: SIGNATURE,
    password: over.password ?? '',
    vendorName: over.vendorName || 'Daniel Roberto',
    vendorDocument: '11144477735',
    vendorEmail: 'daniel@example.com',
    vendorRole: 'Promitente vendedor',
    partyId: over.partyId === undefined ? VENDOR_PARTY : over.partyId,
  });
  return { ...wired, result, verify };
}

function testRoleGate() {
  assert(canRequestInternalVendorSign('ADMIN'), 'ADMIN solicita');
  assert(canRequestInternalVendorSign('ADMIN_EMPRESA'), 'ADMIN_EMPRESA solicita');
  assert(canRequestInternalVendorSign('COMPANY_ADMIN'), 'COMPANY_ADMIN solicita');
  assert(canRequestInternalVendorSign('SUPER_ADMIN'), 'SUPER_ADMIN solicita');
  assert(!canRequestInternalVendorSign('BROKER'), 'BROKER não solicita');
  assert(!canRequestInternalVendorSign('OWNER'), 'OWNER não solicita');
  assert(classifyInternalVendorSignRole('BROKER').code === 'broker', 'broker code');
  assert(classifyInternalVendorSignRole('OWNER').code === 'owner', 'owner code');
  console.log('OK role gate');
}

function testClassifyVendorVsIntervenient() {
  const parties: VendorSignPartySnapshot[] = [
    ...pendingVendorParties(),
    {
      id: INTERVENIENT_PARTY,
      role: 'INTERVENIENT',
      status: 'PENDING',
      signer_name: 'R R NEGÓCIOS',
      signer_cpf: '57590706000178',
    },
  ];
  const vendor = classifyInternalSignTarget({ parties, partyId: VENDOR_PARTY });
  assert(vendor.kind === 'vendor', 'VENDOR classificado');
  const intervenient = classifyInternalSignTarget({
    parties,
    partyId: INTERVENIENT_PARTY,
  });
  assert(intervenient.kind === 'intervenient', 'INTERVENIENT separado');
  const classic = classifyInternalSignTarget({
    parties: [],
    signatureStatus: 'CLIENT_SIGNED',
  });
  assert(classic.kind === 'vendor' && classic.partyId === null, 'clássico é VENDOR');
  assert(internalSignRequiresPrimaryAdminPassword(vendor), 'VENDOR exige senha');
  assert(!internalSignRequiresPrimaryAdminPassword(intervenient), 'INTERVENIENT não exige senha');
  assert(internalSignRequiresPrimaryAdminPassword(classic), 'clássico exige senha');
  const missingPartyIdWithVendors = classifyInternalSignTarget({
    parties,
    partyId: null,
  });
  assert(
    missingPartyIdWithVendors.kind === 'vendor' &&
      missingPartyIdWithVendors.partyId === VENDOR_PARTY,
    'partyId ausente resolve o VENDOR pendente — não INTERVENIENT',
  );
  assert(
    internalSignRequiresPrimaryAdminPassword(missingPartyIdWithVendors),
    'partyId ausente com VENDOR exige senha',
  );
  console.log('OK classify VENDOR vs INTERVENIENT');
}

async function testMarcosPasswordDenied() {
  const { result, passwordCalls, signCalls } = await runAuthorize(MARCOS, {
    password: MARCOS_PASSWORD,
  });
  assert(!result.ok && result.code === 'denied', 'B senha do Marcos nega');
  assert(passwordCalls.length === 1, 'tentou verificar senha');
  assert(passwordCalls[0].email === PRINCIPAL_EMAIL, 'verifica e-mail do Principal');
  assert(signCalls.length === 0, 'não assinou');
  assert(toPublicVendorSignError(result).error === PRIMARY_ADMIN_VERIFY_DENIED_MESSAGE, 'msg pública');
  console.log('OK B senha do Marcos');
}

async function testWrongPasswordDenied() {
  const { result, signCalls } = await runAuthorize(MARCOS, { password: 'errada' });
  assert(!result.ok && result.code === 'denied', 'C senha errada nega');
  assert(signCalls.length === 0, 'não assinou');
  console.log('OK C senha errada');
}

async function testPrincipalPasswordAllows() {
  const { result, verify, signCalls } = await runAuthorize(MARCOS, {
    password: PRINCIPAL_PASSWORD,
  });
  assert(result.ok === true, 'D senha do Principal permite');
  if (!result.ok) throw new Error('expected ok');
  assert(result.requestedBy === MARCOS, 'F requested_by Marcos');
  assert(result.authorizedBy === PRINCIPAL, 'F authorized_by Principal');
  assert(result.skippedAuth === false, 'VENDOR não pula auth');
  assert(signCalls.length === 1, 'assinou uma vez');
  assert(verify?.ok === true, 'verify ok');
  console.log('OK D/F Principal autoriza e audit ids');
}

async function testEmptyPasswordDenied() {
  const { result, signCalls } = await runAuthorize(MARCOS, { password: '' });
  assert(!result.ok, 'POST sem password nega');
  assert(signCalls.length === 0, 'não assinou sem senha');
  console.log('OK POST sem password');
}

async function testPrincipalLoggedInStillRetypes() {
  const { result, signCalls } = await runAuthorize(PRINCIPAL, {
    password: PRINCIPAL_PASSWORD,
  });
  assert(result.ok === true, 'G Principal logado também autoriza com senha');
  if (!result.ok) throw new Error('expected ok');
  assert(result.requestedBy === PRINCIPAL, 'requested_by Principal');
  assert(result.authorizedBy === PRINCIPAL, 'authorized_by Principal');
  assert(signCalls.length === 1, 'assinou');
  console.log('OK G Principal logado redigita');
}

async function testEachVendorNeedsNewAuth() {
  const parties: VendorSignPartySnapshot[] = [
    {
      id: VENDOR_PARTY,
      role: 'VENDOR',
      status: 'PENDING',
      signer_name: 'Daniel',
      signer_cpf: '11144477735',
    },
    {
      id: VENDOR_PARTY_2,
      role: 'VENDOR',
      status: 'PENDING',
      signer_name: 'Aldenise',
      signer_cpf: '39053344705',
    },
    { id: 'buyer-1', role: 'BUYER', status: 'SIGNED', signer_name: 'C', signer_cpf: '1' },
  ];
  const first = await runAuthorize(MARCOS, {
    password: PRINCIPAL_PASSWORD,
    partyId: VENDOR_PARTY,
    parties,
  });
  assert(first.result.ok === true, 'H VENDOR 1 autorizado');
  if (!first.result.ok) throw new Error('expected ok');
  assert(first.signCalls.length === 1, 'H uma autorização assina uma party');
  assert(first.signCalls[0].partyId === VENDOR_PARTY, 'H assinou só VENDOR 1');
  const second = await runAuthorize(MARCOS, {
    password: PRINCIPAL_PASSWORD,
    partyId: VENDOR_PARTY_2,
    vendorName: 'Aldenise',
    parties,
  });
  assert(second.result.ok === true, 'H VENDOR 2 exige nova autorização');
  assert(second.passwordCalls.length === 1, 'H segunda chamada verifica senha de novo');
  assert(second.signCalls[0].partyId === VENDOR_PARTY_2, 'H assinou só VENDOR 2');
  console.log('OK H múltiplos VENDORs');
}

async function testIntervenientSkipsPassword() {
  const parties: VendorSignPartySnapshot[] = [
    ...pendingVendorParties(),
    {
      id: INTERVENIENT_PARTY,
      role: 'INTERVENIENT',
      status: 'PENDING',
      signer_name: 'R R NEGÓCIOS',
      signer_cpf: '57590706000178',
    },
  ];
  const { result, passwordCalls, signCalls } = await runAuthorize(MARCOS, {
    password: '',
    partyId: INTERVENIENT_PARTY,
    vendorName: 'R R NEGÓCIOS',
    parties,
  });
  assert(result.ok === true, 'J INTERVENIENT sem senha');
  if (!result.ok) throw new Error('expected ok');
  assert(result.skippedAuth === true, 'pula Primary Admin');
  assert(passwordCalls.length === 0, 'não verificou senha');
  assert(signCalls.length === 1, 'assinou interveniente');
  console.log('OK J INTERVENIENT sem senha');
}

async function testBrokerDenied() {
  const { result, passwordCalls, signCalls } = await runAuthorize(BROKER, {
    password: PRINCIPAL_PASSWORD,
  });
  assert(!result.ok && result.code === 'broker', 'O BROKER negado');
  assert(passwordCalls.length === 0, 'BROKER não chega na senha');
  assert(signCalls.length === 0, 'BROKER não assina');
  assert(
    toPublicVendorSignError(result).error === SELLER_SIGNATURE_BROKER_DENIED_MESSAGE,
    'msg broker',
  );
  console.log('OK O BROKER');
}

async function testOwnerDenied() {
  const { result, signCalls } = await runAuthorize(OWNER, {
    password: PRINCIPAL_PASSWORD,
  });
  assert(!result.ok && result.code === 'owner', 'P OWNER negado');
  assert(signCalls.length === 0, 'OWNER não assina');
  console.log('OK P OWNER');
}

async function testWrongTenantDenied() {
  const { result, signCalls } = await runAuthorize(MARCOS, {
    password: PRINCIPAL_PASSWORD,
    contract: { tenant_id: OTHER, company_id: OTHER },
  });
  assert(!result.ok && result.code === 'wrong_tenant', 'Q tenant errado');
  assert(signCalls.length === 0, 'não assinou outro tenant');
  console.log('OK Q tenant errado');
}

async function testAlreadySignedDoesNotReauth() {
  const { result, passwordCalls, signCalls } = await runAuthorize(MARCOS, {
    password: PRINCIPAL_PASSWORD,
    parties: [
      {
        id: VENDOR_PARTY,
        role: 'VENDOR',
        status: 'SIGNED',
        signer_name: 'Daniel',
        signer_cpf: '11144477735',
      },
      { id: 'buyer-1', role: 'BUYER', status: 'SIGNED', signer_name: 'C', signer_cpf: '1' },
    ],
  });
  assert(!result.ok && result.code === 'already_signed', 'R já SIGNED');
  assert(passwordCalls.length === 0, 'não consome senha');
  assert(signCalls.length === 0, 'não duplica');
  assert(
    toPublicVendorSignError(result).error === SELLER_SIGNATURE_ALREADY_SIGNED_MESSAGE,
    'msg já assinado',
  );
  console.log('OK R party já SIGNED');
}

async function testClassicRequiresAuth() {
  const { result, passwordCalls, signCalls } = await runAuthorize(MARCOS, {
    password: PRINCIPAL_PASSWORD,
    partyId: null,
    parties: [],
  });
  assert(result.ok === true, 'clássico com senha');
  assert(passwordCalls.length === 1, 'clássico reautentica');
  assert(signCalls.length === 1, 'clássico assina');
  console.log('OK modelo clássico');
}

async function testSuperAdminUsesContractPrimary() {
  const { result, passwordCalls } = await runAuthorize(SUPER, {
    password: PRINCIPAL_PASSWORD,
  });
  assert(result.ok === true, 'SUPER_ADMIN operacional');
  if (!result.ok) throw new Error('expected ok');
  assert(result.authorizedBy === PRINCIPAL, 'usa Principal da empresa do contrato');
  assert(passwordCalls[0].email === PRINCIPAL_EMAIL, 'senha do Principal da empresa');
  console.log('OK SUPER_ADMIN + Principal do contrato');
}

async function testPreviewDoesNotNeedPassword() {
  const { deps } = makeDeps();
  const preview = await previewInternalVendorSignAuthorization(deps, {
    operatorUserId: MARCOS,
    contractId: CONTRACT,
    signatureId: SIGNATURE,
    partyId: VENDOR_PARTY,
  });
  assert(preview.ok === true, 'preview ok');
  if (!preview.ok) throw new Error('expected preview');
  assert(preview.requiresAuthorization === true, 'VENDOR exige autorização');
  if (!preview.requiresAuthorization) throw new Error('expected vendor preview');
  assert(preview.principal.maskedEmail.includes('*****'), 'e-mail mascarado');
  assert(preview.kind === 'vendor', 'preview VENDOR');
  assert(decideInternalVendorSignAfterPreview(preview).action === 'authorize', 'GET manda etapa senha');
  console.log('OK preview sem senha');
}

async function testClassicWithoutPasswordDenied() {
  const { result, signCalls } = await runAuthorize(MARCOS, {
    password: '',
    partyId: null,
    parties: [],
  });
  assert(!result.ok && result.code === 'denied', 'clássico sem senha nega');
  assert(signCalls.length === 0, 'clássico sem senha não assina');
  console.log('OK clássico sem senha');
}

async function testHomologation031ModalCannotSignVendorWithoutPassword() {
  const parties = contract031HomologParties();
  const { deps } = makeDeps({
    parties,
    signature: { signature_status: 'PARTIALLY_SIGNED' },
    contract: { contract_number: '000000031/2026' },
  });

  const previewIntervenient = await previewInternalVendorSignAuthorization(deps, {
    operatorUserId: MARCOS,
    contractId: CONTRACT,
    signatureId: SIGNATURE,
    partyId: INTERVENIENT_PARTY,
    vendorName: 'S.V TOPOGRAFIA E PROJETO LTDA',
  });
  assert(previewIntervenient.ok === true, '031 GET INTERVENIENT ok');
  if (!previewIntervenient.ok || previewIntervenient.requiresAuthorization) {
    throw new Error('expected intervenient preview');
  }
  assert(previewIntervenient.requiresAuthorization === false, '031 INTERVENIENT sem senha no GET');
  assert(previewIntervenient.kind === 'intervenient', '031 GET kind persistido');
  assert(
    decideInternalVendorSignAfterPreview(previewIntervenient).action === 'sign_without_password',
    '031 modal INTERVENIENT confirma sem etapa senha',
  );

  const previewVendor = await previewInternalVendorSignAuthorization(deps, {
    operatorUserId: MARCOS,
    contractId: CONTRACT,
    signatureId: SIGNATURE,
    partyId: VENDOR_PARTY,
    vendorName: 'SEVERINO JOSE DE FRANÇA',
  });
  assert(previewVendor.ok === true, '031 GET VENDOR ok');
  if (!previewVendor.ok || !previewVendor.requiresAuthorization) {
    throw new Error('expected vendor preview');
  }
  assert(previewVendor.requiresAuthorization === true, '031 Promitente vendedor exige senha no GET');
  assert(
    decideInternalVendorSignAfterPreview(previewVendor).action === 'authorize',
    '031 seletor PROMITENTE VENDEDOR não POST ainda',
  );

  const previewClassic = await previewInternalVendorSignAuthorization(deps, {
    operatorUserId: MARCOS,
    contractId: CONTRACT,
    signatureId: SIGNATURE,
    partyId: null,
    vendorName: 'S.V TOPOGRAFIA E PROJETO LTDA',
  });
  assert(previewClassic.ok === true, '031 GET sem partyId ok');
  if (!previewClassic.ok || !previewClassic.requiresAuthorization) {
    throw new Error('expected classic preview');
  }
  assert(previewClassic.kind === 'vendor', '031 partyId ausente = VENDOR persistido');
  assert(previewClassic.requiresAuthorization === true, '031 clássico exige senha');
  assert(previewClassic.contract.partyId === VENDOR_PARTY, '031 clássico aponta VENDOR 1');

  const homologLookalike = await runAuthorize(MARCOS, {
    password: '',
    partyId: INTERVENIENT_PARTY,
    vendorName: 'S.V TOPOGRAFIA E PROJETO LTDA',
    parties,
  });
  assert(homologLookalike.result.ok === true, '031 INTERVENIENT confirma sem senha');
  assert(homologLookalike.passwordCalls.length === 0, '031 INTERVENIENT não reautentica');
  assert(homologLookalike.signCalls.length === 1, '031 INTERVENIENT assina uma party');
  assert(
    homologLookalike.signCalls[0].partyId === INTERVENIENT_PARTY,
    '031 POST INTERVENIENT não marca VENDOR',
  );

  const selectedPromitente = await runAuthorize(MARCOS, {
    password: '',
    partyId: VENDOR_PARTY,
    vendorName: 'SEVERINO JOSE DE FRANÇA',
    parties,
  });
  assert(!selectedPromitente.result.ok, '031 PROMITENTE VENDEDOR sem senha nega');
  assert(selectedPromitente.signCalls.length === 0, '031 VENDOR 1 não vira SIGNED');

  const marcosPassword = await runAuthorize(MARCOS, {
    password: MARCOS_PASSWORD,
    partyId: VENDOR_PARTY,
    vendorName: 'SEVERINO JOSE DE FRANÇA',
    parties,
  });
  assert(!marcosPassword.result.ok, '031 senha do Marcos nega VENDOR');
  assert(marcosPassword.signCalls.length === 0, '031 senha Marcos não assina');

  const wrongPassword = await runAuthorize(MARCOS, {
    password: 'errada',
    partyId: VENDOR_PARTY,
    vendorName: 'SEVERINO JOSE DE FRANÇA',
    parties,
  });
  assert(!wrongPassword.result.ok, '031 senha errada nega VENDOR');
  assert(wrongPassword.signCalls.length === 0, '031 senha errada não assina');

  const missingPartyId = await runAuthorize(MARCOS, {
    password: '',
    partyId: null,
    vendorName: 'S.V TOPOGRAFIA E PROJETO LTDA',
    parties,
  });
  assert(!missingPartyId.result.ok, '031 clássico sem senha nega');
  assert(missingPartyId.signCalls.length === 0, '031 clássico não assina VENDOR');

  const principalVendor1 = await runAuthorize(MARCOS, {
    password: PRINCIPAL_PASSWORD,
    partyId: VENDOR_PARTY,
    vendorName: 'SEVERINO JOSE DE FRANÇA',
    parties,
  });
  assert(principalVendor1.result.ok === true, '031 senha do Principal assina VENDOR 1');
  if (!principalVendor1.result.ok) throw new Error('expected vendor 1');
  assert(principalVendor1.result.requestedBy === MARCOS, '031 requested_by operador');
  assert(principalVendor1.result.authorizedBy === PRINCIPAL, '031 authorized_by Principal');
  assert(principalVendor1.result.sellerPartyId === VENDOR_PARTY, '031 seller_party_id VENDOR 1');
  assert(principalVendor1.signCalls.length === 1, '031 uma autorização = uma party');
  assert(principalVendor1.signCalls[0].partyId === VENDOR_PARTY, '031 não assina VENDOR 2 junto');

  const stillPendingVendor2 = await runAuthorize(MARCOS, {
    password: '',
    partyId: VENDOR_PARTY_2,
    vendorName: 'ANA SOPHIA OLIVEIRA FRANÇA',
    parties,
  });
  assert(!stillPendingVendor2.result.ok, '031 VENDOR 2 segue pendente sem nova senha');
  assert(stillPendingVendor2.signCalls.length === 0, '031 VENDOR 2 não assinado');
  console.log('OK homologação 031 modal interno');
}

async function testClientIdentityStripped() {
  const parsed = stripClientVendorSignIdentity({
    signatureId: SIGNATURE,
    vendorName: 'Daniel',
    vendorDocument: '11144477735',
    vendorEmail: 'd@x.com',
    vendorRole: 'Vendedor',
    partyId: VENDOR_PARTY,
    password: PRINCIPAL_PASSWORD,
    company_id: OTHER,
    tenant_id: OTHER,
    primary_admin_user_id: MARCOS,
    authorized_by: MARCOS,
    signature_status: 'SIGNED',
    signed_at: '2026-01-01',
    signature_hash: 'forged',
  });
  assert(parsed.password === PRINCIPAL_PASSWORD, 'lê só a senha');
  assert(parsed.signatureId === SIGNATURE, 'lê signatureId');
  assert(!('company_id' in parsed), 'não devolve company_id');
  assert(!('authorized_by' in parsed), 'não devolve authorized_by');
  console.log('OK client identity ignorada');
}

function testSourceWiring() {
  const modal = read('components/contracts/SaleContractVendorSignModal.tsx');
  assert(modal.includes("step === 'form'"), 'A modal abre no form');
  assert(modal.includes('Senha do Administrador Principal'), 'campo senha na etapa 2');
  assert(modal.includes('AUTORIZAÇÃO DO ADMINISTRADOR PRINCIPAL'), 'título auth');
  assert(modal.includes('Autorizar e assinar como vendedor'), 'botão final');
  assert(modal.includes('json.requiresAuthorization'), 'senha vem do GET server-side');
  assert(!modal.includes('requiresPrimaryAdminAuthorization'), 'não usa flag do client');
  assert(modal.includes("signKind === 'intervenient'"), 'copy INTERVENIENT separado');
  assert(
    modal.includes('na condição de interveniente'),
    'checkbox INTERVENIENT não diz promitente vendedor',
  );
  assert(modal.includes("step === 'form'"), 'senha não na abertura');
  assert(
    modal.includes('loadAuthorizationPreview') && modal.includes("step === 'form'"),
    'Assinar na etapa 1 só consulta GET',
  );

  const section = read('components/contracts/SaleContractSignatureSection.tsx');
  assert(section.includes('signKind="intervenient"'), 'J INTERVENIENT separado');
  assert(section.includes('signKind="vendor"'), 'VENDOR usa signKind vendor');
  assert(!section.includes('requiresPrimaryAdminAuthorization'), 'section sem flag client');
  assert(section.includes('password: input.password'), 'POST envia password');
  assert(
    section.includes('partyId={pendingIntervenientTarget.partyId}'),
    'INTERVENIENT envia party persistida',
  );

  const route = read('app/api/contracts/[id]/signature/sign-vendor/route.ts');
  assert(route.includes('authorizeAndExecuteInternalVendorSign'), 'POST usa auth+sign');
  assert(route.includes('stripClientVendorSignIdentity'), 'ignora identidade do client');
  assert(route.includes('previewInternalVendorSignAuthorization'), 'GET preview');
  assert(!route.includes('resolveCallerProfile'), 'gate passou para lib de roles');

  const publicRoute = read('app/api/sign/sale/[token]/route.ts');
  assert(!publicRoute.includes('verifyPrimaryAdminPassword'), 'N público sem senha Principal');
  assert(!publicRoute.includes('authorizeAndExecuteInternalVendorSign'), 'N público não é painel');
  assert(publicRoute.includes('signSaleContractElectronically'), 'N público intacto');

  const partyFlow = read('lib/saleContractSignaturePartyFlow.ts');
  assert(partyFlow.includes('withPublicToken: true'), 'N token público VENDOR mantido');

  const service = read('lib/saleContractSignatureService.ts');
  assert(
    service.includes('!intervenientJustCompletedProcess'),
    'INTERVENIENT não marca VENDOR no PDF',
  );

  const migration = read(
    'supabase/migrations/20261022120000_block_client_vendor_signature.sql',
  );
  assert(migration.includes("party_role <> 'VENDOR'"), 'S só VENDOR na party');
  assert(migration.includes('vendor_signed_at'), 'T vendor_signed_at');
  assert(migration.includes("jwt_role NOT IN ('authenticated', 'anon')"), 'U service_role passa');
  assert(
    !/IF party_role = 'BUYER'/.test(migration) &&
      !/NEW\.role.*BUYER/.test(migration),
    'não bloqueia BUYER por regra',
  );
  assert(!migration.includes('MUNDO_NOVO'), 'não mexe Mundo Novo');

  const finance = read('lib/finance/manualReceiptPayment.ts');
  assert(finance.includes('authorizeAndExecuteManualReceiptPayment'), 'W Fase 2 intacta');

  const auditLib = read('lib/saleContractVendorSignAuth.ts');
  assert(auditLib.includes(SELLER_SIGNATURE_AUTHORIZED_ACTION), 'audit sucesso');
  assert(auditLib.includes(SELLER_SIGNATURE_FAILED_ACTION), 'audit falha');
  assert(auditLib.includes('internalSignRequiresPrimaryAdminPassword'), 'decisão server-side');
  assert(!auditLib.includes('refresh_token'), 'sem refresh token');
  console.log('OK source wiring A/J/N/S/T/U/W');
}

async function main() {
  testRoleGate();
  testClassifyVendorVsIntervenient();
  await testMarcosPasswordDenied();
  await testWrongPasswordDenied();
  await testEmptyPasswordDenied();
  await testPrincipalPasswordAllows();
  await testPrincipalLoggedInStillRetypes();
  await testEachVendorNeedsNewAuth();
  await testIntervenientSkipsPassword();
  await testBrokerDenied();
  await testOwnerDenied();
  await testWrongTenantDenied();
  await testAlreadySignedDoesNotReauth();
  await testClassicRequiresAuth();
  await testClassicWithoutPasswordDenied();
  await testHomologation031ModalCannotSignVendorWithoutPassword();
  await testSuperAdminUsesContractPrimary();
  await testPreviewDoesNotNeedPassword();
  await testClientIdentityStripped();
  testSourceWiring();
  console.log('OK mandatory-seller-signature-auth-tests');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
