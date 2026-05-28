/**
 * Contrato SaaS profissional em PDF (server-side).
 */

import { jsPDF } from 'jspdf';
import {
  formatSaasCurrency,
  getStandardPlanMonthlyPrice,
  resolveCompanyPricing,
  type CompanyPricingSource,
} from '@/lib/companyPricing';
import { resolveCompanySubscriptionDates } from '@/lib/companySubscriptionDates';
import { getCompanySaasPlan } from '@/lib/saasPlans';
import { loadSvLotesLogoDataUrl } from '@/lib/brandLogoServer';
import { formatDateBr, type CompanySubscription } from '@/lib/saasSubscription';

export const SAAS_PROVIDER = {
  legalName: 'S.V TOPOGRAFIA E PROJETO LTDA',
  tradeName: 'NORTE & SUL TOPOGRAFIA',
  cnpj: '12.631.238/0001-02',
  city: 'Parauapebas/PA',
  product: 'SV LOTES — Plataforma SaaS de Gestão Imobiliária',
  services: [
    'Plataforma SaaS SV LOTES',
    'Gestão imobiliária',
    'CRM loteadora',
    'Dashboard financeiro',
    'GIS / mapas',
    'Contratos automáticos',
  ],
};

const CLAUSES = [
  '1. LICENCIAMENTO SAAS — A CONTRATADA concede ao CONTRATANTE licença de uso não exclusiva, mensal e intransferível da plataforma SV LOTES, nos limites do plano contratado.',
  '2. USO MENSAL DA PLATAFORMA — O acesso é concedido mediante pagamento recorrente. O CONTRATANTE utilizará o sistema conforme políticas de uso aceitável e legislação vigente.',
  '3. ACESSO MULTIUSUÁRIO — O plano inclui usuários conforme limites comerciais (corretores e projetos). Credenciais são pessoais e intransferíveis.',
  '4. COBRANÇA RECORRENTE — O valor mensal negociado será cobrado na data de vencimento indicada neste instrumento, com reajuste conforme política comercial da CONTRATADA.',
  '5. SUSPENSÃO POR INADIMPLÊNCIA — O atraso superior a 10 (dez) dias úteis autoriza a suspensão do acesso até a regularização dos débitos.',
  '6. BACKUP E SEGURANÇA — A CONTRATADA adota medidas técnicas razoáveis de disponibilidade, backup e proteção. O CONTRATANTE é responsável pelos dados inseridos.',
  '7. LGPD — As partes comprometem-se a tratar dados pessoais conforme a Lei nº 13.709/2018, na qualidade de controlador/operador conforme o caso.',
  '8. FORO — Fica eleito o foro da comarca de Parauapebas/PA para dirimir controvérsias oriundas deste contrato.',
];

export type SaasContractPdfInput = {
  company: CompanyPricingSource & {
    name?: string | null;
    cnpj?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    cep?: string | null;
    subscription_due_day?: number | string | null;
    responsible_name?: string | null;
    legal_representative?: string | null;
  };
  subscription: Pick<
    CompanySubscription,
    'contract_number' | 'plan_type' | 'monthly_price' | 'start_date' | 'next_due_date'
  >;
};

function writeWrapped(doc: jsPDF, text: string, x: number, y: number, maxWidth: number): number {
  const lines = doc.splitTextToSize(text, maxWidth);
  doc.text(lines, x, y);
  return y + lines.length * 5.2;
}

function drawLogoBadge(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  title: string,
  subtitle: string,
  fill: [number, number, number],
) {
  doc.setFillColor(...fill);
  doc.roundedRect(x, y, w, h, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(title, x + 4, y + 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(subtitle, x + 4, y + 14);
}

function ensureSpace(doc: jsPDF, y: number, need: number): number {
  const pageH = doc.internal.pageSize.getHeight();
  if (y + need > pageH - 20) {
    doc.addPage();
    return 22;
  }
  return y;
}

export function buildSaasContractPdf(input: SaasContractPdfInput): Uint8Array {
  const { company, subscription } = input;
  const pricing = resolveCompanyPricing(company);
  const saas = getCompanySaasPlan(company);
  const standardPrice = getStandardPlanMonthlyPrice(company);
  const applied = Number(subscription.monthly_price) || pricing.appliedPrice;
  const dates = resolveCompanySubscriptionDates(company);
  const dueDay = dates.subscription_due_day;
  const responsible =
    company.legal_representative || company.responsible_name || 'Representante legal';

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 16;
  const contentW = pageW - margin * 2;
  let y = 14;

  doc.setFillColor(8, 15, 30);
  doc.rect(0, 0, pageW, 38, 'F');
  const platformLogo = loadSvLotesLogoDataUrl();
  if (platformLogo) {
    doc.addImage(platformLogo, 'PNG', margin, 5, 30, 30);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(SAAS_PROVIDER.tradeName, margin + 36, 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(SAAS_PROVIDER.legalName, margin + 36, 20);
  } else {
    drawLogoBadge(doc, margin, 8, 42, 18, 'SV LOTES', 'Gestão Imobiliária SaaS', [37, 99, 235]);
    drawLogoBadge(doc, margin + 48, 8, 52, 18, 'NORTE & SUL', 'Topografia', [16, 120, 100]);
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('CONTRATO DE LICENÇA DE SOFTWARE (SaaS)', pageW / 2, 32, { align: 'center' });

  doc.setTextColor(30, 30, 30);
  y = 46;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`Nº ${subscription.contract_number || '—'}`, margin, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, pageW - margin, y, { align: 'right' });
  y += 10;

  y = writeWrapped(
    doc,
    `Pelo presente instrumento particular, as partes abaixo qualificadas celebram contrato de licenciamento SaaS da plataforma SV LOTES, nos termos a seguir.`,
    margin,
    y,
    contentW,
  );
  y += 8;

  const section = (title: string) => {
    y = ensureSpace(doc, y, 12);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(title, margin, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(40, 40, 40);
  };

  const row = (label: string, value: string) => {
    y = ensureSpace(doc, y, 8);
    doc.setFont('helvetica', 'bold');
    doc.text(`${label}:`, margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(value, margin + 48, y);
    y += 5.5;
  };

  section('DADOS DA FORNECEDORA');
  row('Razão social', SAAS_PROVIDER.legalName);
  row('Nome fantasia', SAAS_PROVIDER.tradeName);
  row('CNPJ', SAAS_PROVIDER.cnpj);
  row('Cidade', SAAS_PROVIDER.city);
  y += 2;
  doc.setFont('helvetica', 'bold');
  doc.text('Serviços:', margin, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  for (const s of SAAS_PROVIDER.services) {
    y = ensureSpace(doc, y, 6);
    doc.text(`• ${s}`, margin + 4, y);
    y += 5;
  }
  y += 4;

  section('DADOS DA CONTRATANTE');
  row('Empresa', company.name || '—');
  row('CNPJ', company.cnpj || '—');
  row('Responsável', responsible);
  row('Telefone', company.phone || '—');
  row('E-mail', company.email || '—');
  row('Endereço', company.address || '—');
  row('Cidade/UF', `${company.city || '—'}/${company.state || '—'}`);
  if (company.cep) row('CEP', company.cep);
  y += 4;

  section('DADOS DO PLANO E COBRANÇA');
  row('Plano contratado', saas.displayName.toUpperCase());
  row('Valor padrão', formatSaasCurrency(standardPrice));
  row('Valor negociado', formatSaasCurrency(applied));
  if (pricing.hasCustomPrice && standardPrice > applied) {
    row('Desconto aplicado', formatSaasCurrency(standardPrice - applied));
  }
  row('Dia de vencimento', `Dia ${dueDay} de cada mês`);
  row('Data de início', formatDateBr(subscription.start_date || dates.subscription_start_date));
  row('Próximo vencimento', formatDateBr(subscription.next_due_date || dates.next_payment_date));
  row('Ciclo', 'Mensal');
  y += 4;

  section('CLÁUSULAS CONTRATUAIS');
  for (const clause of CLAUSES) {
    y = ensureSpace(doc, y, 20);
    y = writeWrapped(doc, clause, margin, y, contentW);
    y += 3;
  }

  y = ensureSpace(doc, y, 50);
  y += 8;
  const signDate = new Date().toLocaleDateString('pt-BR');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('ASSINATURA DIGITAL', margin, y);
  y += 8;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');

  const colW = (contentW - 10) / 2;
  doc.setDrawColor(180);
  doc.line(margin, y + 18, margin + colW, y + 18);
  doc.line(margin + colW + 10, y + 18, margin + contentW, y + 18);
  doc.setFont('helvetica', 'bold');
  doc.text('ASSINATURA DA CONTRATANTE', margin, y);
  doc.text('ASSINATURA DA FORNECEDORA', margin + colW + 10, y);
  y += 22;
  doc.setFont('helvetica', 'normal');
  doc.text(company.name || '', margin, y);
  doc.text(SAAS_PROVIDER.legalName, margin + colW + 10, y);
  y += 5;
  doc.text(`CNPJ ${company.cnpj || ''}`, margin, y);
  doc.text(`CNPJ ${SAAS_PROVIDER.cnpj}`, margin + colW + 10, y);
  y += 8;
  doc.text(`Data: ${signDate}`, margin, y);
  doc.text(`Data: ${signDate}`, margin + colW + 10, y);

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text(
      `${SAAS_PROVIDER.product} · ${SAAS_PROVIDER.tradeName} · Página ${i}/${pageCount}`,
      pageW / 2,
      290,
      { align: 'center' },
    );
  }

  return new Uint8Array(doc.output('arraybuffer'));
}
