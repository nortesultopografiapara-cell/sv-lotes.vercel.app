/**
 * Marcadores e estilos do modelo SV LOTES 2.0 (Recomendado).
 */

export const SV_LOTES_2_CONTRACT_TITLE =
  'INSTRUMENTO PARTICULAR DE COMPROMISSO DE COMPRA E VENDA DE IMÓVEL';

export const SV_LOTES_2_LEGAL_MARKER = 'SV_LOTES_2_SUMMARY_TABLE';

export const SV_LOTES_2_CONTRACT_CSS = `
<style type="text/css">
  .sv-contract-sv-lotes-2 {
    font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.55;
    color: #1a202c;
  }
  .sv-contract-sv-lotes-2 .sv2-header {
    text-align: center;
    margin-bottom: 12px;
    padding-bottom: 10px;
    border-bottom: 2px solid #2563eb;
  }
  .sv-contract-sv-lotes-2 .sv2-header-logo {
    margin-bottom: 6px;
  }
  .sv-contract-sv-lotes-2 .sv2-header-logo img {
    max-height: 48px;
    max-width: 160px;
    object-fit: contain;
  }
  .sv-contract-sv-lotes-2 .sv2-header h2 {
    font-size: 13pt;
    font-weight: 700;
    letter-spacing: 0.04em;
    margin: 0 0 4px 0;
    color: #1e3a8a;
    text-transform: uppercase;
  }
  .sv-contract-sv-lotes-2 .sv2-header-contract {
    margin: 0 0 6px 0;
    font-size: 9pt;
    color: #64748b;
  }
  .sv-contract-sv-lotes-2 .sv2-header-company {
    font-size: 8.5pt;
    color: #334155;
    line-height: 1.35;
  }
  .sv-contract-sv-lotes-2 .sv2-header-company p {
    margin: 0 0 2px 0;
  }
  .sv-contract-sv-lotes-2 .sv2-header-company-name {
    font-weight: 700;
    color: #1e3a8a;
  }
  .sv-contract-sv-lotes-2 .sv2-summary-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px 10px;
    margin: 0 0 12px 0;
    padding: 8px 10px;
    font-size: 8.5pt;
    background: #f8fafc;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
  }
  .sv-contract-sv-lotes-2 .sv2-summary-cell {
    min-width: 0;
  }
  .sv-contract-sv-lotes-2 .sv2-summary-cell--span2 {
    grid-column: span 2;
  }
  .sv-contract-sv-lotes-2 .sv2-summary-cell--span3 {
    grid-column: span 3;
  }
  .sv-contract-sv-lotes-2 .sv2-summary-label {
    display: block;
    font-size: 6.5pt;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: #64748b;
    margin-bottom: 1px;
  }
  .sv-contract-sv-lotes-2 .sv2-summary-value {
    display: block;
    font-size: 8.5pt;
    font-weight: 600;
    color: #0f172a;
    line-height: 1.3;
    word-break: break-word;
  }
  .sv-contract-sv-lotes-2 .sv2-section-title {
    font-size: 10pt;
    font-weight: 700;
    color: #1e40af;
    margin: 12px 0 6px 0;
    padding-bottom: 4px;
    border-bottom: 1px solid #dbeafe;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .sv-contract-sv-lotes-2 .sv2-party-block {
    margin-bottom: 8px;
  }
  .sv-contract-sv-lotes-2 .sv2-party-block p {
    margin: 0 0 3px 0;
  }
  .sv-contract-sv-lotes-2 .sv2-clause {
    margin-bottom: 8px;
    page-break-inside: avoid;
    break-inside: avoid-page;
  }
  .sv-contract-sv-lotes-2 .sv2-clause p {
    margin: 0 0 8px 0;
    text-align: justify;
  }
  .sv-contract-sv-lotes-2 .sv2-signatures {
    margin-top: 28px;
    page-break-inside: avoid;
  }
  .sv-contract-sv-lotes-2 .sv2-signatures-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    margin-top: 40px;
  }
  .sv-contract-sv-lotes-2 .sv2-sign-line {
    border-top: 1px solid #334155;
    padding-top: 6px;
    text-align: center;
    font-size: 10pt;
  }
</style>`;
