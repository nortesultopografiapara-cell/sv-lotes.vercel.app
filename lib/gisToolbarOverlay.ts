export type GisMapPageOverlayFlags = {
  streetGuideModal?: boolean;
  memorialTarget?: boolean;
  lotSheetTarget?: boolean;
  isImportModalOpen?: boolean;
  isImportTxtModalOpen?: boolean;
  isImportShpModalOpen?: boolean;
  isUpdateLotModalOpen?: boolean;
  isDeleteLotModalOpen?: boolean;
  isEnterpriseOverviewModalOpen?: boolean;
  deleteQuadraConfirm?: boolean;
  gisMapOverlayOpen?: boolean;
};

export type GisMapOverlayFlags = {
  customerForm?: boolean;
  customerContractValidation?: boolean;
  clearConfirmModal?: boolean;
  confrontEdit?: boolean;
  officialSideEdit?: boolean;
};

export function computeGisMapPageOverlayOpen(
  flags: GisMapPageOverlayFlags,
): boolean {
  return Boolean(
    flags.streetGuideModal ||
      flags.memorialTarget ||
      flags.lotSheetTarget ||
      flags.isImportModalOpen ||
      flags.isImportTxtModalOpen ||
      flags.isImportShpModalOpen ||
      flags.isUpdateLotModalOpen ||
      flags.isDeleteLotModalOpen ||
      flags.isEnterpriseOverviewModalOpen ||
      flags.deleteQuadraConfirm ||
      flags.gisMapOverlayOpen,
  );
}

export function computeGisMapOverlayOpen(flags: GisMapOverlayFlags): boolean {
  return Boolean(
    flags.customerForm ||
      flags.customerContractValidation ||
      flags.clearConfirmModal ||
      flags.confrontEdit ||
      flags.officialSideEdit,
  );
}

export const GIS_TOOLBAR_HIDE_CLASS =
  'opacity-0 pointer-events-none translate-x-2.5 max-md:hidden';

export const GIS_TOOLBAR_SHOW_CLASS =
  'opacity-100 pointer-events-auto translate-x-0';
