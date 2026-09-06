import { formatCurrencyBRL } from '@/lib/currencyBrl';
import {
  resolveImprovementsForDocument,
  type CustomerObligationBreakdown,
  type ImprovementsRecord,
} from '@/lib/contract-termination/improvements';
import { partyFacingClauseReference, partyFacingPolicyWording } from '@/lib/termination-documents/partyFacingHtml';
import { formatIsoDateBr } from '@/lib/termination-documents/refundSchedule';
import type { TerminationDocumentSnapshot } from '@/lib/termination-documents/types';

function esc(value?: string | null): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function money(value: number | null | undefined): string {
  return formatCurrencyBRL(Number(value) || 0) || 'R$ 0,00';
}

function percent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return `${Number(value)}%`;
}

function formatIsoDateTimeBr(iso: string | null | undefined): string {
  const raw = String(iso || '');
  const d = raw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function partyLine(party: TerminationDocumentSnapshot['vendor']): string {
  const name = esc(party.name || '—');
  const doc = party.document ? ` · Documento: ${esc(party.document)}` : '';
  const extra = party.extra ? `<br/>${esc(party.extra)}` : '';
  return `<strong>${name}</strong>${doc}${extra}`;
}

function waitingImprovementAppraisal(
  status: string | null,
  improvements?: ImprovementsRecord | null,
): boolean {
  if (improvements?.appraisalStatus === 'PENDING') return true;
  const s = String(status || '').toUpperCase();
  return s.includes('WAITING');
}

function resolvedImprovements(snap: Omit<TerminationDocumentSnapshot, 'html' | 'contentHash'>): ImprovementsRecord {
  return resolveImprovementsForDocument({
    improvements: snap.improvements,
    improvementStatus: snap.improvementStatus,
  });
}

function resolvedObligation(snap: Omit<TerminationDocumentSnapshot, 'html' | 'contentHash'>): CustomerObligationBreakdown {
  if (snap.obligation && typeof snap.obligation === 'object') {
    return snap.obligation;
  }
  const improvements = resolvedImprovements(snap);
  const contractual = Number(snap.agreedRefundAmount || 0);
  return {
    contractualRefund: contractual,
    improvementsTotal: improvements.total,
    total: contractual + improvements.total,
  };
}

function improvementsClause(snap: Omit<TerminationDocumentSnapshot, 'html' | 'contentHash'>): string {
  const improvements = resolvedImprovements(snap);
  if (waitingImprovementAppraisal(snap.improvementStatus, improvements)) {
    return `<p>Foi informado que existem benfeitorias na unidade, sujeitas à avaliação técnica prevista nas disposições do contrato original (${esc(partyFacingClauseReference(snap.clauseReference))}). Enquanto essa avaliação não for concluída, o quadro de acerto financeiro deste termo <strong>não constitui cálculo final</strong>.</p>`;
  }
  if (improvements.declared && improvements.appraisalStatus === 'COMPLETED') {
    const rows =
      improvements.items.length > 0
        ? `<ul>${improvements.items
            .map(
              (item) =>
                `<li>${esc(item.description || 'Benfeitoria')} — ${money(item.amount)}</li>`,
            )
            .join('')}</ul>`
        : '<p>Foram reconhecidas benfeitorias nesta operação, sem discriminação individual de itens neste registro.</p>';
    return `<p>Foram identificadas e avaliadas as seguintes benfeitorias existentes na unidade:</p>
${rows}
<p><strong>Valor total das benfeitorias reconhecidas: ${money(improvements.total)}.</strong></p>`;
  }
  return `<p>Não há benfeitorias indenizáveis registradas nesta operação.</p>`;
}

function scheduleClause(snap: Omit<TerminationDocumentSnapshot, 'html' | 'contentHash'>): string {
  const due = Number(snap.agreedRefundAmount || 0);
  const obligation = resolvedObligation(snap);
  if (snap.refundDestination === 'CREDIT_OTHER_UNIT') {
    return `<p>O destino reconhecido neste ato é crédito em outra unidade, como intenção. Não há cronograma de restituição em dinheiro neste termo.</p>`;
  }
  if (!snap.refundSchedule.defined) {
    if (due <= 0 && obligation.total <= 0) {
      return `<p>Não há valor líquido previsto para restituição neste acerto.</p>`;
    }
    const n = snap.refundSchedule.installmentCount;
    const qty = n == null ? 'não definida neste ato' : String(n);
    return `<p>Valor líquido previsto: <strong>${money(snap.agreedRefundAmount)}</strong>. Quantidade prevista de parcelas de restituição: <strong>${esc(qty)}</strong>.</p>`;
  }
  const rows = snap.refundSchedule.installments
    .map((item) => {
      const seq = String(item.number).padStart(2, '0');
      const total = String(snap.refundSchedule.installmentCount).padStart(2, '0');
      return `<tr><td>${esc(seq)}/${esc(total)}</td><td>${esc(formatIsoDateBr(item.dueDate))}</td><td>${money(item.amount)}</td></tr>`;
    })
    .join('');
  return `<h2>CRONOGRAMA DA RESTITUIÇÃO</h2>
<table class="acerto cronograma">
  <thead><tr><th>Parcela</th><th>Vencimento</th><th>Valor</th></tr></thead>
  <tbody>${rows}</tbody>
</table>`;
}

function reasonClause(snap: Omit<TerminationDocumentSnapshot, 'html' | 'contentHash'>): string {
  const detail = String(snap.reasonDetail || '').trim();
  if (!detail) return '';
  return `<p><strong>Motivo / justificativa da inadimplência registrado nesta operação:</strong> ${esc(detail)}</p>`;
}

/**
 * HTML do Termo de Rescisão Contratual por Inadimplência.
 * Não calcula valores — formata o settlement congelado.
 */
export function buildInadimplenciaTermHtml(
  snap: Omit<TerminationDocumentSnapshot, 'html' | 'contentHash'>,
): string {
  const spouseBlock = snap.spouse?.name
    ? `<p><strong>Cônjuge / companheiro(a):</strong> ${partyLine(snap.spouse)}</p>`
    : '';
  const overdueCount = snap.overdueReceiptCount == null ? '—' : String(snap.overdueReceiptCount);
  const paidCount = snap.paidReceiptCount == null ? '—' : String(snap.paidReceiptCount);
  const policyLabel = [
    snap.policySource,
    snap.policyVersion,
    snap.clauseReference,
  ]
    .filter(Boolean)
    .join(' · ');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${esc(snap.title)}</title>
  <style>
    body { font-family: "Times New Roman", Times, serif; color: #111; font-size: 12.5pt; line-height: 1.45; margin: 0; }
    .term-wrap { max-width: 820px; margin: 0 auto; padding: 24px 32px 48px; }
    h1 { font-size: 14.5pt; text-align: center; letter-spacing: .03em; margin: 8px 0 18px; }
    h2 { font-size: 12pt; margin: 18px 0 8px; text-transform: uppercase; }
    p { margin: 0 0 10px; text-align: justify; }
    .term-meta { font-size: 11pt; margin-bottom: 16px; border-bottom: 1px solid #334155; padding-bottom: 12px; }
    table.acerto { width: 100%; border-collapse: collapse; margin: 12px 0 16px; }
    table.acerto th { background: #1e293b; color: #fff; text-align: left; padding: 8px 10px; font-size: 11pt; }
    table.acerto td { border: 1px solid #94a3b8; padding: 7px 10px; }
    table.acerto td:last-child { text-align: right; white-space: nowrap; font-weight: 600; }
    table.acerto tr.total td { background: #f1f5f9; }
    table.cronograma th { text-align: left; }
    table.cronograma td:last-child { text-align: right; }
    .signs { display: grid; grid-template-columns: 1fr 1fr; gap: 36px 28px; margin-top: 40px; }
    .sign-line { border-top: 1px solid #111; margin-top: 42px; padding-top: 6px; font-size: 10.5pt; text-align: center; }
  </style>
</head>
<body>
  <div class="term-wrap">
    <h1>${esc(snap.title)}</h1>
    <div class="term-meta">
      <p><strong>Número do documento:</strong> ${esc(snap.documentNumber)}</p>
      <p><strong>Contrato original:</strong> ${esc(snap.contractNumber || '—')}</p>
      <p><strong>Data da operação:</strong> ${esc(formatIsoDateTimeBr(snap.generatedAt))}</p>
      <p><strong>Empreendimento:</strong> ${esc(snap.projectName || '—')}</p>
      <p><strong>Unidade:</strong> ${esc(snap.unitLabel || `Quadra ${snap.quadra || '—'} / Lote ${snap.lote || '—'}`)}</p>
    </div>

    <h2>A) Identificação das partes</h2>
    <p><strong>Promitente vendedora:</strong> ${partyLine(snap.vendor)}</p>
    <p><strong>Comprador:</strong> ${partyLine(snap.buyer)}</p>
    ${spouseBlock}

    <h2>B) Considerandos</h2>
    <p>Considerando que as partes celebraram promessa/contrato de compra e venda da unidade acima, identificado pelo contrato ${esc(snap.contractNumber || 'sem número')}.</p>
    <p>Considerando o descumprimento das obrigações de pagamento apurado nesta operação de inadimplência.</p>
    ${reasonClause(snap)}
    <p>Considerando que o acerto financeiro observa a política contratual congelada da venda, ${esc(partyFacingPolicyWording({ contractNumber: snap.contractNumber, clauseReference: snap.clauseReference }))}.</p>
    ${policyLabel ? `<p><strong>Política contratual congelada aplicada:</strong> ${esc(policyLabel)}.</p>` : ''}

    <h2>C) Inadimplência apurada</h2>
    <table class="acerto">
      <thead><tr><th colspan="2">SITUAÇÃO FINANCEIRA CONGELADA</th></tr></thead>
      <tbody>
        <tr><td>Quantidade de parcelas vencidas</td><td>${esc(overdueCount)}</td></tr>
        <tr><td>Valor total vencido</td><td>${money(snap.overdueAmount)}</td></tr>
        <tr><td>Quantidade de parcelas pagas</td><td>${esc(paidCount)}</td></tr>
        <tr><td>Total pago</td><td>${money(snap.totalPaid)}</td></tr>
        <tr><td>Entrada apurada</td><td>${money(snap.entryAmount)}</td></tr>
        <tr><td>Sinal apurado</td><td>${money(snap.signalAmount)}</td></tr>
      </tbody>
    </table>

    <h2>D) Acerto financeiro</h2>
    <table class="acerto">
      <thead><tr><th colspan="2">ACERTO FINANCEIRO</th></tr></thead>
      <tbody>
        <tr><td>Total pago</td><td>${money(snap.totalPaid)}</td></tr>
        <tr><td>(-) Entrada/sinal não reembolsável</td><td>${money(snap.nonRefundableAmount)}</td></tr>
        <tr><td>(=) Base da restituição</td><td>${money(snap.restitutionBase)}</td></tr>
        <tr><td>(-) Retenção contratual ${percent(snap.retentionPercent)}</td><td>${money(snap.retentionAmount)}</td></tr>
        <tr class="total"><td>(=) Valor líquido previsto</td><td>${money(snap.agreedRefundAmount)}</td></tr>
      </tbody>
    </table>
    ${scheduleClause(snap)}

    <h2>E) Parcelas, cobranças e estoque</h2>
    <p>${snap.pendingObligationsCanceled
      ? 'As parcelas pendentes da aquisição foram canceladas internamente neste encerramento.'
      : 'O tratamento das parcelas pendentes observa o resultado efetivo já registrado no sistema.'
    } Eventual cancelamento de cobranças externas (Asaas/Inter) observa somente as cobranças canceláveis já processadas neste ato. Pagamentos já quitados permanecem preservados.</p>
    <p>Concluída a operação, a unidade retorna ao status <strong>Disponível</strong>. O contrato original, os documentos da venda, os pagamentos quitados e o histórico permanecem preservados para auditoria. A venda original fica encerrada (CANCELLED), mantido o vínculo histórico do contrato.</p>

    <h2>F) Benfeitorias</h2>
    ${improvementsClause(snap)}

    <h2>G) Assinaturas eletrônicas</h2>
    <p>Quando aplicável, este termo admite assinatura eletrônica das partes, gerando o artefato assinado correspondente sem alterar o conteúdo congelado neste ato.</p>
    <div class="signs">
      <div class="sign-line">${esc(snap.vendor.name || 'Promitente vendedora')}<br/>Promitente vendedora</div>
      <div class="sign-line">${esc(snap.buyer.name || 'Comprador')}<br/>Comprador</div>
      ${
        snap.spouse?.name
          ? `<div class="sign-line">${esc(snap.spouse.name)}<br/>Cônjuge / companheiro(a)</div>`
          : ''
      }
    </div>
  </div>
</body>
</html>`;
}
