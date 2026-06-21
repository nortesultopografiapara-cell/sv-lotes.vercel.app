/**
 * Validação layout Configurações v2 — sem I/O, sem credenciais.
 * npx tsx scripts/mandatory-company-settings-layout-tests.ts
 */

import {
  TOPOGRAFIA_COMPANY_ID,
  IVANILDE_LEGACY_CPF,
  SETTINGS_V2_ROLLOUT_ISO,
  resolveCompanySettingsLayout,
  isLegacySettingsCompanyDocument,
  isLegacySettingsCompany,
} from '../lib/companySettingsLayout';
import { MENESES_COMPANY_ID } from '../lib/saasContractContent';
import {
  buildCompanySettingsSavePayload,
  resolveLegalRepresentativeForSave,
  COMPANY_SETTINGS_COLUMNS,
} from '../lib/companySettingsFields';
import { isSaasContractPlaceholderValue } from '../lib/saasContractCompanyProfile';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testMenesesLegacy() {
  assert(
    resolveCompanySettingsLayout(MENESES_COMPANY_ID) === 'legacy',
    'Meneses usa layout legacy',
  );
  assert(isLegacySettingsCompany(MENESES_COMPANY_ID), 'Meneses é legacy explícito');
  console.log('OK testMenesesLegacy');
}

function testIvanildeLegacyByCpf() {
  assert(isLegacySettingsCompanyDocument(IVANILDE_LEGACY_CPF), 'CPF Ivanilde é legacy');
  assert(
    resolveCompanySettingsLayout('any-id', { documentRaw: IVANILDE_LEGACY_CPF }) === 'legacy',
    'Ivanilde por CPF usa legacy',
  );
  console.log('OK testIvanildeLegacyByCpf');
}

function testTopografiaV2() {
  assert(
    resolveCompanySettingsLayout(TOPOGRAFIA_COMPANY_ID) === 'v2',
    'SV Topografia usa layout v2',
  );
  console.log('OK testTopografiaV2');
}

function testSettingsColumnsExcludeCompaniesCpf() {
  const cols = COMPANY_SETTINGS_COLUMNS.split(',').map((s) => s.trim());
  assert(!cols.includes('cpf'), 'SELECT não referencia companies.cpf inexistente');
  console.log('OK testSettingsColumnsExcludeCompaniesCpf');
}

function testNewCompanyV2() {
  const afterRollout = new Date(SETTINGS_V2_ROLLOUT_ISO);
  afterRollout.setDate(afterRollout.getDate() + 1);
  assert(
    resolveCompanySettingsLayout('new-company-uuid', {
      createdAt: afterRollout.toISOString(),
    }) === 'v2',
    'empresa criada após rollout usa v2',
  );
  console.log('OK testNewCompanyV2');
}

function testExistingOtherCompanyLegacy() {
  assert(
    resolveCompanySettingsLayout('old-company-uuid', {
      createdAt: '2025-01-01T00:00:00.000Z',
    }) === 'legacy',
    'empresa antiga genérica permanece legacy',
  );
  console.log('OK testExistingOtherCompanyLegacy');
}

function testTopografiaNeverLegacyEvenIfOldCreatedAt() {
  assert(
    resolveCompanySettingsLayout(TOPOGRAFIA_COMPANY_ID, {
      createdAt: '2020-01-01T00:00:00.000Z',
    }) === 'v2',
    'Topografia sempre v2 pelo ID',
  );
  console.log('OK testTopografiaNeverLegacyEvenIfOldCreatedAt');
}

function testTechnicalDoesNotReplaceLegalWithoutCheckbox() {
  const rep = resolveLegalRepresentativeForSave(
    {
      legal_representative: '',
      representative_cpf: '',
      use_technical_as_legal_rep: false,
    },
    {
      name: 'RT Nome',
      cpf: '12345678901',
      title: 'Eng.',
      email: 'rt@test.com',
      phone: '94999999999',
      crea: '',
      cau: '',
      cft: '',
      signature_url: '',
      stamp_url: '',
    },
  );
  assert(rep.legal_representative === null, 'RT não vira representante sem checkbox');
  assert(rep.use_technical_as_legal_rep === false, 'flag false');
  console.log('OK testTechnicalDoesNotReplaceLegalWithoutCheckbox');
}

function testTechnicalAsLegalWhenChecked() {
  const rep = resolveLegalRepresentativeForSave(
    { use_technical_as_legal_rep: true },
    {
      name: 'Severino',
      cpf: '11122233344',
      title: 'Técnico',
      email: 's@test.com',
      phone: '94911111111',
      crea: '',
      cau: '',
      cft: '',
      signature_url: '',
      stamp_url: '',
    },
  );
  assert(rep.legal_representative === 'Severino', 'checkbox copia nome RT');
  assert(rep.representative_cpf === '11122233344', 'checkbox copia CPF RT');
  console.log('OK testTechnicalAsLegalWhenChecked');
}

function testLegacySaveDoesNotSyncName() {
  const payload = buildCompanySettingsSavePayload(
    { name: 'RAZÃO ORIGINAL', fantasy_name: 'Fantasia', address: 'Rua A' },
    {
      name: '',
      title: '',
      crea: '',
      cau: '',
      cft: '',
      cpf: '',
      phone: '',
      email: '',
      signature_url: '',
      stamp_url: '',
    },
    { normalizeAddress: false, syncNameFromFantasy: false },
  );
  assert(!('name' in payload), 'save legacy não envia campo name');
  console.log('OK testLegacySaveDoesNotSyncName');
}

function testV2SaveDoesNotSyncNameByDefault() {
  const payload = buildCompanySettingsSavePayload(
    { name: 'RAZÃO ORIGINAL', fantasy_name: 'Fantasia', address: 'Rua 02, Quadra 123' },
    {
      name: '',
      title: '',
      crea: '',
      cau: '',
      cft: '',
      cpf: '',
      phone: '',
      email: '',
      signature_url: '',
      stamp_url: '',
    },
    { normalizeAddress: true, syncNameFromFantasy: false },
  );
  assert(!('name' in payload), 'save v2 não sobrescreve name sem flag');
  assert(!('cnpj' in payload), 'save não envia cnpj');
  console.log('OK testV2SaveDoesNotSyncNameByDefault');
}

function testPlaceholderRejected() {
  const rep = resolveLegalRepresentativeForSave(
    { legal_representative: 'Representante legal', use_technical_as_legal_rep: false },
    {
      name: '',
      title: '',
      crea: '',
      cau: '',
      cft: '',
      cpf: '',
      phone: '',
      email: '',
      signature_url: '',
      stamp_url: '',
    },
  );
  assert(rep.legal_representative === null, 'placeholder vira null no save');
  assert(isSaasContractPlaceholderValue('Representante legal'), 'detector placeholder');
  console.log('OK testPlaceholderRejected');
}

function main() {
  testMenesesLegacy();
  testIvanildeLegacyByCpf();
  testTopografiaV2();
  testTopografiaNeverLegacyEvenIfOldCreatedAt();
  testSettingsColumnsExcludeCompaniesCpf();
  testNewCompanyV2();
  testExistingOtherCompanyLegacy();
  testTechnicalDoesNotReplaceLegalWithoutCheckbox();
  testTechnicalAsLegalWhenChecked();
  testLegacySaveDoesNotSyncName();
  testV2SaveDoesNotSyncNameByDefault();
  testPlaceholderRejected();
  console.log('\nTodos os testes de layout Configurações v2 passaram.');
}

main();
