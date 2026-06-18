/**
 * Constantes e classes utilitárias para layout mobile (rolagem + bottom nav).
 * Usado em Layout, modais e testes obrigatórios.
 */

/** Altura da bottom navigation mobile (Layout.tsx). */
export const MOBILE_BOTTOM_NAV_HEIGHT_PX = 72;

export const MOBILE_LAYOUT_CSS_VAR_BOTTOM_NAV = '--sv-mobile-bottom-nav-height';
export const MOBILE_LAYOUT_CSS_VAR_CONTENT_PAD =
  '--sv-mobile-content-pad-bottom';

/** Padding inferior do conteúdo principal (nav + safe area). */
export const MOBILE_CONTENT_PAD_BOTTOM_CLASS =
  'pb-[var(--sv-mobile-content-pad-bottom)]';

export const MOBILE_SCROLL_AREA_CLASS =
  'sv-mobile-scroll-area overflow-y-auto overscroll-y-contain min-h-0';

export const SV_PAGE_MOBILE_CLASS = 'sv-page sv-page--scroll-y';

export const SV_MODAL_OVERLAY_CLASS = 'sv-modal-overlay';
export const SV_MODAL_SHELL_CLASS = 'sv-modal-shell';
export const SV_MODAL_BODY_CLASS = 'sv-modal-body';
export const SV_MODAL_FOOTER_CLASS = 'sv-modal-footer';
export const SV_MODAL_HEADER_CLASS = 'sv-modal-header';
export const SV_MODAL_OVERLAY_IMMERSIVE_CLASS = 'sv-modal-overlay--immersive';
export const SV_MODAL_SHELL_FULL_MOBILE_CLASS = 'sv-modal-shell--full-mobile';

/** z-index da bottom nav no Layout — modais devem ficar acima. */
export const MOBILE_BOTTOM_NAV_Z_INDEX = 300;
export const SV_MODAL_OVERLAY_Z_INDEX = 400;

/** Arquivos que devem usar o padrão de modal mobile. */
export const MOBILE_MODAL_SOURCE_FILES = [
  'app/dashboard/brokers/page.tsx',
  'app/customers/page.tsx',
  'components/map/CustomerLotFormModal.tsx',
  'app/finance/page.tsx',
  'components/dashboard/LotReportExportModal.tsx',
  'components/UserProfileModals.tsx',
  'components/brokers/ManageSaleBrokerCommissionModal.tsx',
] as const;

/** Páginas principais que devem permitir rolagem vertical no mobile. */
export const MOBILE_PAGE_SOURCE_FILES = [
  'components/Layout.tsx',
  'app/dashboard/page.tsx',
  'app/dashboard/brokers/page.tsx',
  'app/customers/page.tsx',
  'app/finance/page.tsx',
  'app/contracts/page.tsx',
  'app/map/page.tsx',
  'app/settings/page.tsx',
  'app/owners/page.tsx',
  'app/offline-sync/page.tsx',
] as const;
