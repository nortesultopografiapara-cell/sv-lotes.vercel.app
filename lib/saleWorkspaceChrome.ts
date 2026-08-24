/** Chrome visual temporário do workspace desktop de Nova venda. Sem persistência. */

export const SALE_WORKSPACE_CHROME_EVENT = 'sv-lotes:sale-workspace-chrome';
export const SALE_WORKSPACE_RAIL_PX = 72;
export const SALE_WORKSPACE_OPEN_CLASS = 'sv-sale-workspace-open';

export type SaleWorkspaceChromeDetail = { open: boolean };

export function setSaleWorkspaceChromeOpen(open: boolean) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  document.body.classList.toggle(SALE_WORKSPACE_OPEN_CLASS, open);
  window.dispatchEvent(
    new CustomEvent<SaleWorkspaceChromeDetail>(SALE_WORKSPACE_CHROME_EVENT, {
      detail: { open },
    }),
  );
}
