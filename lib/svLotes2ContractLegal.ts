/**
 * Marcadores e estilos do modelo SV LOTES 2.0 (Recomendado).
 */

export const SV_LOTES_2_CONTRACT_TITLE =
  'INSTRUMENTO PARTICULAR DE COMPROMISSO DE COMPRA E VENDA DE IMÓVEL';

export const SV_LOTES_2_LEGAL_MARKER = 'SV_LOTES_2_SUMMARY_TABLE';

export const SV_LOTES_2_CONTRACT_CSS = `
<style type="text/css">
  .sv-contract-sv-lotes-2 {
    font-family: 'Times New Roman', Times, serif;
    font-size: 11pt;
    line-height: 1.45;
    color: #111;
  }
  .sv-contract-sv-lotes-2 .sv2-header {
    text-align: center;
    margin-bottom: 6px;
    padding-bottom: 4px;
    border-bottom: 1.5px solid #1e40af;
  }
  .sv-contract-sv-lotes-2 .sv2-header h2 {
    font-family: 'Times New Roman', Times, serif;
    font-size: 12.5pt;
    font-weight: 700;
    letter-spacing: 0.03em;
    margin: 0 0 2px 0;
    color: #1e3a8a;
    text-transform: uppercase;
    line-height: 1.3;
  }
  .sv-contract-sv-lotes-2 .sv2-header-contract {
    margin: 0;
    font-size: 9pt;
    color: #475569;
  }
  .sv-contract-sv-lotes-2 .sv2-summary-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    column-gap: 8px;
    row-gap: 0;
    margin: 0 0 6px 0;
    padding: 5px 8px 4px;
    font-size: 9pt;
    background: #fff;
    border: 1px solid #1e40af;
    border-radius: 3px;
  }
  .sv-contract-sv-lotes-2 .sv2-summary-cell {
    min-width: 0;
    padding: 3px 2px 4px;
    border-bottom: 1px dotted #94a3b8;
  }
  .sv-contract-sv-lotes-2 .sv2-summary-cell--span2 {
    grid-column: span 2;
  }
  .sv-contract-sv-lotes-2 .sv2-summary-cell--span3 {
    grid-column: span 3;
  }
  .sv-contract-sv-lotes-2 .sv2-summary-cell--span4 {
    grid-column: span 4;
  }
  .sv-contract-sv-lotes-2 .sv2-summary-label {
    display: block;
    font-family: 'Times New Roman', Times, serif;
    font-size: 6.5pt;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #1e40af;
    margin: 0 0 1px 0;
    line-height: 1.15;
  }
  .sv-contract-sv-lotes-2 .sv2-summary-value {
    display: block;
    font-family: 'Times New Roman', Times, serif;
    font-size: 9pt;
    font-weight: 700;
    color: #111;
    line-height: 1.2;
    word-break: break-word;
  }
  .sv-contract-sv-lotes-2 .contract-finance-quadro {
    margin: 0 0 8px 0;
    padding: 6px 8px 5px;
    border: 1px solid #1e40af;
    border-radius: 3px;
    background: #fff;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .sv-contract-sv-lotes-2 .contract-finance-quadro-title {
    margin: 0 0 4px 0;
    padding: 0 0 3px 0;
    text-align: center;
    font-family: 'Times New Roman', Times, serif;
    font-size: 10pt;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: #1e40af;
    line-height: 1.25;
    border-bottom: 1px dotted #94a3b8;
  }
  .sv-contract-sv-lotes-2 .contract-finance-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    column-gap: 8px;
    row-gap: 0;
    margin: 0;
  }
  .sv-contract-sv-lotes-2 .contract-finance-cell {
    min-width: 0;
    padding: 3px 2px 4px;
    border-bottom: 1px dotted #94a3b8;
  }
  .sv-contract-sv-lotes-2 .contract-finance-label {
    display: block;
    font-family: 'Times New Roman', Times, serif;
    font-size: 6.5pt;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #1e40af;
    margin: 0 0 1px 0;
    line-height: 1.15;
  }
  .sv-contract-sv-lotes-2 .contract-finance-value {
    display: block;
    font-family: 'Times New Roman', Times, serif;
    font-size: 9pt;
    font-weight: 700;
    color: #111;
    line-height: 1.2;
    word-break: break-word;
  }
  .sv-contract-sv-lotes-2 .contract-finance-balloons {
    margin: 4px 0 0 0;
    padding: 3px 0 2px;
    border-top: 1px dotted #94a3b8;
    border-bottom: 1px dotted #94a3b8;
  }
  .sv-contract-sv-lotes-2 .contract-finance-balloons-title {
    margin: 0 0 2px 0;
    font-family: 'Times New Roman', Times, serif;
    font-size: 7.5pt;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #1e40af;
    line-height: 1.2;
  }
  .sv-contract-sv-lotes-2 .contract-finance-balloon-line {
    margin: 0 0 2px 0;
    padding: 0;
    font-family: 'Times New Roman', Times, serif;
    font-size: 9pt;
    line-height: 1.3;
    color: #111;
  }
  .sv-contract-sv-lotes-2 .contract-finance-total {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
    margin: 4px 0 0 0;
    padding: 3px 0 0 0;
    font-family: 'Times New Roman', Times, serif;
    line-height: 1.25;
  }
  .sv-contract-sv-lotes-2 .contract-finance-total-label {
    font-size: 8pt;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #1e40af;
  }
  .sv-contract-sv-lotes-2 .contract-finance-total-value {
    font-size: 10pt;
    font-weight: 700;
    color: #111;
    white-space: nowrap;
  }
  .sv-contract-sv-lotes-2 .sv2-section-title {
    font-family: 'Times New Roman', Times, serif;
    font-size: 10pt;
    font-weight: 700;
    color: #1e40af;
    margin: 6px 0 3px 0;
    padding-bottom: 2px;
    border-bottom: 1px solid #cbd5e1;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .sv-contract-sv-lotes-2 .sv2-party-block {
    margin-bottom: 6px;
  }
  .sv-contract-sv-lotes-2 .sv2-party-block p {
    margin: 0 0 2px 0;
    font-family: 'Times New Roman', Times, serif;
    font-size: 10.5pt;
    line-height: 1.4;
  }
  .sv-contract-sv-lotes-2 .sv2-clause {
    margin-bottom: 7px;
    page-break-inside: avoid;
    break-inside: avoid-page;
  }
  .sv-contract-sv-lotes-2 .sv2-clause p {
    margin: 0 0 7px 0;
    text-align: justify;
    font-family: 'Times New Roman', Times, serif;
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
