/**
 * Geração do contrato SaaS em PDF (server-side).
 */

import { jsPDF } from 'jspdf';
import { getCompanySaasPlan } from '@/lib/saasPlans';
import {
  formatSaasCurrency,
  getStandardPlanMonthlyPrice,
  resolveCompanyPricing,
  type CompanyPricingSource,
} from '@/lib/companyPricing';
import { formatDateBr, type CompanySubscription } from '@/lib/saasSubscription';

export const SAAS_PROVIDER = {
  legalName: 'S.V TOPOGRAFIA E PROJETOS LTDA',
  cnpj: '12.631.238/0001-02',
  product: 'SV LOTES — Gestão Imobiliária e GIS',
};

export type SaasContractPdfInput = {
  company: CompanyPricingSource & {
    name?: string | null;
    cnpj?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
  };
  subscription: Pick<
    CompanySubscription,
    'contract_number' | 'plan_type' | 'monthly_price' | 'start_date' | 'next_due_date'
  >;
};

const CLAUSES = [
  '1. OBJETO — O presente contrato tem por objeto a licença de uso não exclusiva da plataforma SV LOTES, incluindo módulos de gestão de loteamentos, mapa GIS, contratos, financeiro e CRM, conforme plano contratado.',
  '2. PLANO E LIMITES — O CONTRATANTE adere ao plano indicado neste instrumento, com limites de empreendimentos (projetos) e corretores conforme tabela comercial vigente na data de assinatura.',
  '3. VALOR E PAGAMENTO — O valor mensal aplicável é o descrito neste contrato (podendo refletir condição comercial personalizada). O vencimento ocorre mensalmente na data indicada. Atraso superior a 10 dias úteis poderá suspender o acesso.',
  '4. SUPORTE — A CONTRATADA prestará suporte em horário comercial via canais oficiais (e-mail e sistema de tickets), para incidentes e dúvidas de uso da plataforma.',
  '5. USO DO SISTEMA — O CONTRATANTE compromete-se a utilizar o sistema de forma lícita, mantendo sigilo de credenciais e responsabilizando-se pelos dados inseridos por seus usuários.',
  '6. CANCELAMENTO — Qualquer das partes poderá rescindir mediante aviso prévio de 30 dias. Valores já faturados permanecem devidos.',
  '7. INADIMPLÊNCIA — O não pagamento na data de vencimento autoriza a CONTRATADA a suspender o acesso, sem prejuízo da cobrança dos valores em aberto.',
  '8. DISPOSIÇÕES GERAIS — Este contrato é regido pelas leis brasileiras. Foro: comarca da sede da CONTRATADA.',
];

function writeWrapped(doc: jsPDF, text: string, x: number, y: number, maxWidth: number): number {
  const lines = doc.splitTextToSize(text, maxWidth);
  doc.text(lines, x, y);
  return y + lines.length * 5.5;
}

export function buildSaasContractPdf(input: SaasContractPdfInput): Uint8Array {
  const { company, subscription } = input;
  const pricing = resolveCompanyPricing(company);
  const saas = getCompanySaasPlan(company);
  const standardPrice = getStandardPlanMonthlyPrice(company);
  const applied = Number(subscription.monthly_price) || pricing.appliedPrice;

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 18;
  const contentW = pageW - margin * 2;
  let y = 22;

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageW, 32, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('CONTRATO DE LICENÇA DE SOFTWARE (SaaS)', margin, 18);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(SAAS_PROVIDER.product, margin, 26);

  doc.setTextColor(30, 30, 30);
  y = 42;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`Contrato nº ${subscription.contract_number || '—'}`, margin, y);
  y += 8;

  doc.setFont('helvetica', 'normal');
  y = writeWrapped(
    doc,
    `Pelo presente instrumento, de um lado ${SAAS_PROVIDER.legalName}, CNPJ ${SAAS_PROVIDER.cnpj}, doravante CONTRATADA, e de outro ${company.name || 'CONTRATANTE'}, CNPJ ${company.cnpj || '—'}, doravante CONTRATANTE, firmam o seguinte:`,
    margin,
    y,
    contentW,
  );
  y += 10;

  doc.setFont('helvetica', 'bold');
  doc.text('DADOS DO CONTRATO', margin, y);
  y += 7;
  doc.setFont('helvetica', 'normal');

  const rows: [string, string][] = [
    ['Plano contratado', saas.displayName.toUpperCase()],
    ['Projetos (limite)', String(saas.maxProjects)],
    ['Corretores (limite)', String(saas.maxBrokers)],
    ['Preço padrão do plano', formatSaasCurrency(standardPrice)],
    ['Preço mensal aplicado', formatSaasCurrency(applied)],
  ];

  if (pricing.hasCustomPrice) {
    rows.push(['Desconto / condição especial', formatSaasCurrency(standardPrice - applied)]);
  }

  rows.push(
    ['Início da assinatura', formatDateBr(subscription.start_date)],
    ['Próximo vencimento', formatDateBr(subscription.next_due_date)],
    ['Ciclo de cobrança', 'Mensal'],
  );

  rows.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold');
    doc.text(`${label}:`, margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(value, margin + 52, y);
    y += 6;
  });

  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('CLÁUSULAS CONTRATUAIS', margin, y);
  y += 8;
  doc.setFont('helvetica', 'normal');

  for (const clause of CLAUSES) {
    if (y > 260) {
      doc.addPage();
      y = 20;
    }
    y = writeWrapped(doc, clause, margin, y, contentW);
    y += 4;
  }

  if (y > 230) {
    doc.addPage();
    y = 30;
  }

  y += 10;
  doc.setDrawColor(200);
  doc.line(margin, y, margin + 70, y);
  doc.line(pageW - margin - 70, y, pageW - margin, y);
  y += 8;
  doc.setFontSize(9);
  doc.text('CONTRATADA', margin, y);
  doc.text('CONTRATANTE', pageW - margin - 70, y);
  y += 20;
  doc.text(SAAS_PROVIDER.legalName, margin, y);
  doc.text(company.name || '', pageW - margin - 70, y);
  y += 5;
  doc.text(`CNPJ ${SAAS_PROVIDER.cnpj}`, margin, y);
  doc.text(`CNPJ ${company.cnpj || ''}`, pageW - margin - 70, y);

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text(
      `SV LOTES · Documento gerado em ${new Date().toLocaleString('pt-BR')}`,
      pageW / 2,
      290,
      { align: 'center' },
    );
  }

  return new Uint8Array(doc.output('arraybuffer'));
}
