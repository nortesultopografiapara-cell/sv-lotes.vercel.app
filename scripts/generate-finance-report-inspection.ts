/**
 * Gera PDF/Excel de inspeção do cenário Severino (sem deploy).
 * npx tsx scripts/generate-finance-report-inspection.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildCanonicalFinanceReport } from '../lib/finance/reports/canonicalFinanceDataset';
import { getCanonicalFinanceTotals } from '../lib/finance/reports/financeReportFormat';
import { buildSeverinoCanonicalInput } from '../lib/finance/reports/severinoCanonicalFixture';
import {
  buildFinanceCompletoPdf,
  buildFinanceResumidoPdf,
} from '../lib/finance/reports/renderFinanceReportPdf';
import {
  buildFinanceCompletoWorkbook,
  buildFinanceResumidoWorkbook,
} from '../lib/finance/reports/renderFinanceReportExcel';

async function main() {
  const report = buildCanonicalFinanceReport(buildSeverinoCanonicalInput());
  const totals = getCanonicalFinanceTotals(report);
  const dir = join(process.cwd(), 'scripts/_fixtures/finance-reports');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'totais.json'), JSON.stringify({ totals, meta: report.meta }, null, 2), 'utf8');

  const resumidoPdf = await buildFinanceResumidoPdf(report);
  writeFileSync(
    join(dir, 'financeiro-resumido-severino.pdf'),
    Buffer.from(resumidoPdf.output('arraybuffer')),
  );

  const completoPdf = await buildFinanceCompletoPdf(report);
  writeFileSync(
    join(dir, 'financeiro-completo-severino.pdf'),
    Buffer.from(completoPdf.output('arraybuffer')),
  );

  const resumidoXlsx = await buildFinanceResumidoWorkbook(report);
  writeFileSync(
    join(dir, 'financeiro-resumido-severino.xlsx'),
    Buffer.from(await resumidoXlsx.xlsx.writeBuffer()),
  );

  const completoXlsx = await buildFinanceCompletoWorkbook(report);
  writeFileSync(
    join(dir, 'financeiro-completo-severino.xlsx'),
    Buffer.from(await completoXlsx.xlsx.writeBuffer()),
  );

  console.log('Inspection files written to', dir);
  console.log(JSON.stringify(totals, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
