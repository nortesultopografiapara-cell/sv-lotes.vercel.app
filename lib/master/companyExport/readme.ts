import type { CompanyExportReason } from '@/lib/master/companyExport/types';
import { COMPANY_EXPORT_SCHEMA_VERSION } from '@/lib/master/companyExport/types';
import { COMPANY_EXPORT_CONTENT_SUMMARY } from '@/lib/master/companyExport/registry';
import { reasonLabel } from '@/lib/master/companyExport/audit';

export function buildExportReadmeHtml(input: {
  companyName: string;
  companyDocument: string | null;
  exportId: string;
  reason: CompanyExportReason;
  notes: string | null;
  createdAt: string;
  files: string[];
  recordCounts: Record<string, number>;
}): string {
  const rows = Object.entries(input.recordCounts)
    .map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${v}</td></tr>`)
    .join('');
  const files = input.files.map((f) => `<li><code>${escapeHtml(f)}</code></li>`).join('');
  const summary = COMPANY_EXPORT_CONTENT_SUMMARY.map((s) => `<li>${escapeHtml(s)}</li>`).join(
    '',
  );

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>LEIA-ME — Exportação SV LOTES</title>
  <style>
    body { font-family: Georgia, serif; max-width: 820px; margin: 2rem auto; padding: 0 1rem; color: #111; line-height: 1.5; }
    h1, h2 { font-family: system-ui, sans-serif; }
    code { background: #f4f4f5; padding: 0.1rem 0.35rem; border-radius: 4px; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    td, th { border: 1px solid #ddd; padding: 0.4rem 0.6rem; text-align: left; }
    .warn { background: #fff7ed; border: 1px solid #fdba74; padding: 0.75rem 1rem; border-radius: 8px; }
  </style>
</head>
<body>
  <h1>Exportação de dados — SV LOTES</h1>
  <p><strong>Empresa:</strong> ${escapeHtml(input.companyName)}</p>
  <p><strong>Documento:</strong> ${escapeHtml(input.companyDocument || 'Não informado')}</p>
  <p><strong>Export ID:</strong> <code>${escapeHtml(input.exportId)}</code></p>
  <p><strong>Data:</strong> ${escapeHtml(input.createdAt)}</p>
  <p><strong>Motivo:</strong> ${escapeHtml(reasonLabel(input.reason))}</p>
  ${input.notes ? `<p><strong>Observação:</strong> ${escapeHtml(input.notes)}</p>` : ''}
  <p><strong>Schema:</strong> ${escapeHtml(COMPANY_EXPORT_SCHEMA_VERSION)} (Fase F1 — tabular)</p>

  <div class="warn">
    <strong>Aviso de dados pessoais (LGPD):</strong>
    este pacote contém dados pessoais e financeiros de clientes e usuários.
    Trate-o como confidencial. Esta exportação <em>não</em> desativa, suspende nem exclui a empresa no SV LOTES.
  </div>

  <h2>Conteúdo desta fase</h2>
  <ul>${summary}</ul>

  <h2>Estrutura das pastas</h2>
  <ul>
    <li><code>01_empresa/</code> — cadastro, usuários, assinatura, contas</li>
    <li><code>02_clientes/</code></li>
    <li><code>03_corretores/</code></li>
    <li><code>04_empreendimentos/</code> — CSV/JSON + GeoJSON de lotes</li>
    <li><code>05_vendas/</code></li>
    <li><code>06_contratos/</code> — índices + HTML persistido</li>
    <li><code>07_financeiro/</code></li>
    <li><code>09_auditoria/</code></li>
    <li><code>manifest.json</code> — inventário da exportação</li>
    <li><code>checksums.sha256</code> — hashes dos arquivos do pacote</li>
  </ul>

  <h2>Formatos</h2>
  <ul>
    <li>CSV: UTF-8 com BOM; separador vírgula; datas ISO-8601</li>
    <li>JSON: UTF-8; objetos/arrays</li>
    <li>GeoJSON: coordenadas conforme armazenadas no GIS (em geral WGS84 / EPSG:4326)</li>
    <li>HTML de contratos: texto persistido no momento da geração (não regenerado)</li>
  </ul>

  <h2>Registros por tabela</h2>
  <table>
    <thead><tr><th>Tabela</th><th>Registros</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="2">Nenhum</td></tr>'}</tbody>
  </table>

  <h2>Arquivos gerados</h2>
  <ul>${files || '<li>Nenhum</li>'}</ul>

  <p style="margin-top:2rem;color:#555;font-size:0.9rem;">
    Gerado pelo SV LOTES · Exportação Master SUPER_ADMIN · Fase F1 (sem arquivos binários do Storage).
  </p>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
