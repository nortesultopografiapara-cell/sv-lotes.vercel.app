export type ClientPortalLinkType = 'lot_sale' | 'customer_record' | 'saas_contract';

export type ClientPortalMaskedResult = {
  /** Identificador opaco para seleção na etapa OTP — não é UUID interno. */
  linkKey: string;
  customerNameMasked: string;
  phoneMasked: string | null;
  companyName: string;
  projectName: string | null;
  quadraLote: string | null;
  linkType: ClientPortalLinkType;
  linkLabel: string | null;
  status: 'Encontrado';
};

export type ClientPortalLookupSuccess = {
  found: true;
  maskedResults: ClientPortalMaskedResult[];
};

export type ClientPortalLookupNotFound = {
  found: false;
};

export type ClientPortalLookupResponse =
  | ClientPortalLookupSuccess
  | ClientPortalLookupNotFound;
