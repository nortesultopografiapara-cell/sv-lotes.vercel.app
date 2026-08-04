/**
 * Rótulos de parcela no Portal do Cliente.
 * Executar: npx tsx scripts/mandatory-client-portal-installment-label-tests.ts
 */

import fs from 'fs';
import path from 'path';
import { formatClientPortalInstallmentLabel } from '../lib/portal-cliente/installmentLabel';

const root = path.join(__dirname, '..');

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function testNumberFallbacks(): void {
  assert(
    formatClientPortalInstallmentLabel({ installmentNumber: 0 }) === 'Entrada',
    'número 0 → Entrada',
  );
  assert(
    formatClientPortalInstallmentLabel(0) === 'Entrada',
    'número 0 (atalho) → Entrada',
  );
  assert(
    formatClientPortalInstallmentLabel({ installmentNumber: 1 }) === 'Parcela 1',
    'número 1 → Parcela 1',
  );
  assert(
    formatClientPortalInstallmentLabel({ installmentNumber: 2 }) === 'Parcela 2',
    'número 2 → Parcela 2',
  );
  assert(
    formatClientPortalInstallmentLabel({ installmentNumber: '0' }) === 'Entrada',
    'string "0" → Entrada',
  );
}

function testExplicitTypes(): void {
  assert(
    formatClientPortalInstallmentLabel({
      installmentNumber: 3,
      type: 'ENTRADA',
    }) === 'Entrada',
    'tipo ENTRADA com número diferente → Entrada',
  );
  assert(
    formatClientPortalInstallmentLabel({
      installmentNumber: 1,
      type: 'ENTRY',
    }) === 'Entrada',
    'tipo ENTRY → Entrada',
  );
  assert(
    formatClientPortalInstallmentLabel({
      installmentNumber: 2,
      type: 'SINAL',
    }) === 'Sinal',
    'tipo SINAL → Sinal',
  );
  assert(
    formatClientPortalInstallmentLabel({
      installmentNumber: 5,
      type: 'BALAO',
    }) === 'Parcela balão',
    'tipo BALAO → Parcela balão',
  );
  assert(
    formatClientPortalInstallmentLabel({
      installmentNumber: 1,
      paymentType: 'DOWN_PAYMENT',
    }) === 'Entrada',
    'paymentType DOWN_PAYMENT → Entrada',
  );
}

function testExplicitDescriptionPreserved(): void {
  assert(
    formatClientPortalInstallmentLabel({
      installmentNumber: 0,
      description: 'Sinal',
    }) === 'Sinal',
    'descrição Sinal não sobrescrita pelo número 0',
  );
  assert(
    formatClientPortalInstallmentLabel({
      installmentNumber: 4,
      description: 'Parcela balão',
    }) === 'Parcela balão',
    'descrição Parcela balão preservada',
  );
  assert(
    formatClientPortalInstallmentLabel({
      installmentNumber: 0,
      description: 'Parcela 0',
    }) === 'Entrada',
    'descrição genérica Parcela 0 recalculada para Entrada',
  );
  assert(
    formatClientPortalInstallmentLabel({
      installmentNumber: 9,
      label: 'Taxa',
    }) === 'Taxa',
    'label Taxa preservado',
  );
}

function testInvalidNumbers(): void {
  assert(
    formatClientPortalInstallmentLabel({ installmentNumber: null }) === 'Cobrança',
    'null → Cobrança',
  );
  assert(
    formatClientPortalInstallmentLabel({ installmentNumber: undefined }) ===
      'Cobrança',
    'undefined → Cobrança',
  );
  assert(
    formatClientPortalInstallmentLabel({ installmentNumber: Number.NaN }) ===
      'Cobrança',
    'NaN → Cobrança',
  );
  assert(
    !formatClientPortalInstallmentLabel({ installmentNumber: null }).includes(
      'undefined',
    ),
    'não gerar Parcela undefined',
  );
}

function testPortalUiUsesCentralHelper(): void {
  const dashboard = fs.readFileSync(
    path.join(root, 'components/portal-cliente/ClientPortalDashboard.tsx'),
    'utf8',
  );
  assert(
    dashboard.includes('formatClientPortalInstallmentLabel'),
    'UI usa formatClientPortalInstallmentLabel',
  );
  assert(
    !dashboard.includes('Parcela {item.installmentNumber}'),
    'UI não concatena Parcela + número cru',
  );
  assert(
    !/`Parcela \$\{installmentNumber\}`/.test(dashboard),
    'ChargeCard não usa Parcela ${installmentNumber}',
  );
  assert(!dashboard.includes('Parcela 0'), 'UI sem texto fixo Parcela 0');
}

function main(): void {
  testNumberFallbacks();
  testExplicitTypes();
  testExplicitDescriptionPreserved();
  testInvalidNumbers();
  testPortalUiUsesCentralHelper();
  console.log('mandatory-client-portal-installment-label-tests: OK');
}

main();
