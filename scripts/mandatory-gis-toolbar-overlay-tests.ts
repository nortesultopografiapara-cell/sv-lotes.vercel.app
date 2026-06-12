/**
 * SVL-UI-029 — ocultação da barra GIS durante modais.
 * npx tsx scripts/mandatory-gis-toolbar-overlay-tests.ts
 */

import {
  computeGisMapOverlayOpen,
  computeGisMapPageOverlayOpen,
} from '../lib/gisToolbarOverlay';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testMapPageNoOverlay() {
  assert(
    !computeGisMapPageOverlayOpen({
      streetGuideModal: false,
      memorialTarget: null,
      lotSheetTarget: null,
      isImportModalOpen: false,
      isImportTxtModalOpen: false,
      isImportShpModalOpen: false,
      deleteQuadraConfirm: null,
      gisMapOverlayOpen: false,
    }),
    'toolbar visible when idle',
  );
  console.log('OK testMapPageNoOverlay');
}

function testMapPageSaleModal() {
  assert(
    computeGisMapPageOverlayOpen({ gisMapOverlayOpen: true }),
    'toolbar hidden when GIS sale modal open',
  );
  console.log('OK testMapPageSaleModal');
}

function testMapPageImportModal() {
  assert(
    computeGisMapPageOverlayOpen({ isImportTxtModalOpen: true }),
    'toolbar hidden on import modal',
  );
  console.log('OK testMapPageImportModal');
}

function testGisMapCustomerForm() {
  assert(
    computeGisMapOverlayOpen({ customerForm: true }),
    'GIS overlay when customer form',
  );
  console.log('OK testGisMapCustomerForm');
}

function testGisMapContractValidation() {
  assert(
    computeGisMapOverlayOpen({ customerContractValidation: true }),
    'GIS overlay when contract validation',
  );
  console.log('OK testGisMapContractValidation');
}

function testGisMapConfrontModal() {
  assert(
    computeGisMapOverlayOpen({ confrontEdit: true }),
    'GIS overlay when confront modal',
  );
  console.log('OK testGisMapConfrontModal');
}

function testGisMapClosed() {
  assert(!computeGisMapOverlayOpen({}), 'GIS map idle');
  console.log('OK testGisMapClosed');
}

function main() {
  testMapPageNoOverlay();
  testMapPageSaleModal();
  testMapPageImportModal();
  testGisMapCustomerForm();
  testGisMapContractValidation();
  testGisMapConfrontModal();
  testGisMapClosed();
  console.log('mandatory-gis-toolbar-overlay-tests: all passed');
}

main();
