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

function destinationLabel(dest: TerminationDocumentSnapshot['refundDestination']): string {
  return dest === 'CREDIT_OTHER_UNIT'
    ? 'Crédito em outra unidade (intenção reconhecida neste ato; transferência ainda não executada)'
    : 'Restituição ao comprador (obrigação reconhecida neste ato; pagamento ainda não comprovado neste documento)';
}

function waitingImprovementAppraisal(
  status: string | null,
  improvements?: ImprovementsRecord | null,
): boolean {
  if (improvements?.appraisalStatus === 'PENDING') return true;
  const s = String(status || '').toUpperCase();
  return s.includes('WAITING');
}

function resolvedImprovements(snap: TerminationDocumentSnapshot): ImprovementsRecord {
  return resolveImprovementsForDocument({
    improvements: snap.improvements,
    improvementStatus: snap.improvementStatus,
  });
}

function resolvedObligation(snap: TerminationDocumentSnapshot): CustomerObligationBreakdown {
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

function improvementsClause(snap: TerminationDocumentSnapshot): string {
  const improvements = resolvedImprovements(snap);
  if (waitingImprovementAppraisal(snap.improvementStatus, improvements)) {
    return `<p>Foi informado que existem benfeitorias na unidade, sujeitas à avaliação técnica prevista nas disposições do contrato original (${esc(partyFacingClauseReference(snap.clauseReference))}). Enquanto essa avaliação não for concluída, o quadro de acerto financeiro deste instrumento <strong>não constitui cálculo final</strong> e <strong>não há quitação financeira definitiva</strong>.</p>`;
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
<p><strong>Valor total das benfeitorias reconhecidas: ${money(improvements.total)}.</strong></p>
<p>O valor das benfeitorias é tratado separadamente do cálculo contratual de restituição da aquisição e integra a obrigação financeira reconhecida nesta operação nos termos deste instrumento.</p>`;
  }
  return `<p>As partes declaram que não existem benfeitorias indenizáveis registradas nesta operação.</p>`;
}

function quitacaoClause(snap: TerminationDocumentSnapshot): string {
  const due = Number(snap.agreedRefundAmount || 0);
  const waiting = waitingImprovementAppraisal(snap.improvementStatus, snap.improvements);
  const obligation = resolvedObligation(snap);
  if (waiting) {
    return `<p>Em face da avaliação de benfeitorias pendente, as partes reconhecem apenas o encerramento da relação de aquisição da unidade, sem declaração de quitação financeira definitiva.</p>`;
  }
  if (obligation.improvementsTotal > 0) {
    const scheduleNote = snap.refundSchedule.defined
      ? ' com vencimentos formalizados no cronograma deste instrumento'
      : ', a ser cumprida na forma operacional/financeira aplicável';
    return `<p>As partes reconhecem o distrato da aquisição da unidade identificada e o acerto financeiro apurado neste ato. Ficam discriminados: restituição contratual de <strong>${money(obligation.contractualRefund)}</strong>; valor reconhecido das benfeitorias de <strong>${money(obligation.improvementsTotal)}</strong>; e total da obrigação com o cliente de <strong>${money(obligation.total)}</strong>${scheduleNote}. A assinatura deste instrumento reconhece essa obrigação e <strong>não equivale à comprovação futura de pagamento</strong>. A quitação financeira somente ocorrerá quando os pagamentos forem efetivamente realizados.</p>`;
  }
  if (due > 0 && snap.refundSchedule.defined) {
    return `<p>As partes reconhecem o distrato da aquisição da unidade identificada e o acerto financeiro apurado neste ato. Subsiste obrigação de restituição no valor líquido previsto de <strong>${money(due)}</strong>, com vencimentos formalizados no cronograma deste instrumento. A assinatura deste instrumento não equivale à comprovação futura de pagamento. A quitação financeira ocorrerá somente conforme as parcelas forem efetivamente pagas.</p>`;
  }
  if (due > 0) {
    return `<p>As partes reconhecem o distrato da aquisição da unidade identificada e o acerto financeiro apurado neste ato. Subsiste obrigação de restituição no valor líquido previsto de <strong>${money(due)}</strong>, a ser cumprida na forma operacional/financeira aplicável. <strong>Não se declara quitação financeira integral</strong> enquanto a restituição reconhecida não for efetivamente cumprida.</p>`;
  }
  return `<p>As partes reconhecem o distrato da aquisição da unidade identificada e o acerto financeiro apurado neste ato, sem saldo de restituição previsto no settlement congelado.</p>`;
}

function scheduleClause(snap: TerminationDocumentSnapshot): string {
  const due = Number(snap.agreedRefundAmount || 0);
  const obligation = resolvedObligation(snap);
  const waiting = waitingImprovementAppraisal(snap.improvementStatus, snap.improvements);
  if (snap.refundDestination === 'CREDIT_OTHER_UNIT') {
    return `<p>O destino reconhecido neste ato é crédito em outra unidade, como intenção. Não há cronograma de restituição em dinheiro neste instrumento.</p>`;
  }
  const scheduleAmount = obligation.improvementsTotal > 0 ? obligation.total : due;
  if (scheduleAmount <= 0) {
    return `<p>Não há valor líquido previsto para restituição neste acerto.</p>`;
  }
  const originPreamble =
    obligation.improvementsTotal > 0
      ? `<p>Restituição contratual: <strong>${money(obligation.contractualRefund)}</strong>.</p>
<p>Benfeitorias: <strong>${money(obligation.improvementsTotal)}</strong>.</p>
<p>Total reconhecido: <strong>${money(obligation.total)}</strong>.</p>`
      : '';
  if (!snap.refundSchedule.defined) {
    const n = snap.refundSchedule.installmentCount;
    const qty = n == null ? 'não definida neste ato' : String(n);
    if (waiting) {
      return `${originPreamble}<p>Valor líquido previsto para restituição (provisório): <strong>${money(due)}</strong>.</p>
<p>Quantidade prevista de parcelas de restituição: <strong>${esc(qty)}</strong>.</p>
<p>O cronograma de restituição será definido após a conclusão da avaliação das benfeitorias e o fechamento do acerto financeiro. Não se formalizam neste ato datas de vencimento nem valores individualizados das parcelas, porque o cálculo ainda não é definitivo.</p>`;
    }
    return `${originPreamble}<p>Valor líquido previsto para restituição: <strong>${money(due)}</strong>.</p>
<p>Quantidade prevista de parcelas de restituição: <strong>${esc(qty)}</strong>.</p>
<p>As datas de vencimento e os valores individualizados das parcelas de restituição não são definidos neste ato e deverão observar o ajuste operacional/financeiro aplicável.</p>`;
  }
  const rows = snap.refundSchedule.installments
    .map((item) => {
      const seq = String(item.number).padStart(2, '0');
      const total = String(snap.refundSchedule.installmentCount).padStart(2, '0');
      return `<tr><td>${esc(seq)}/${esc(total)}</td><td>${esc(formatIsoDateBr(item.dueDate))}</td><td>${money(item.amount)}</td></tr>`;
    })
    .join('');
  const heading =
    obligation.improvementsTotal > 0
      ? 'CRONOGRAMA DA OBRIGAÇÃO'
      : 'CRONOGRAMA DA RESTITUIÇÃO';
  const intro =
    obligation.improvementsTotal > 0
      ? `<p>O total reconhecido neste ato (${money(obligation.total)}) compreende a restituição contratual (${money(obligation.contractualRefund)}) e as benfeitorias reconhecidas (${money(obligation.improvementsTotal)}). As datas abaixo são as obrigações vencíveis acordadas nesta operação. A assinatura deste instrumento não equivale à comprovação futura de pagamento. A quitação financeira ocorrerá somente conforme as parcelas forem efetivamente pagas.</p>`
      : `<p>O valor líquido previsto para restituição é obrigação reconhecida neste ato. As datas abaixo são as obrigações vencíveis acordadas nesta operação. A assinatura deste instrumento não equivale à comprovação futura de pagamento. A quitação financeira ocorrerá somente conforme as parcelas forem efetivamente pagas.</p>`;
  return `${originPreamble}<h2>${heading}</h2>
${intro}
<table class="acerto cronograma">
  <thead><tr><th>Parcela</th><th>Vencimento</th><th>Valor</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<p>Este cronograma é a formalização operacional da obrigação definida neste ato, a partir dos valores já apurados no acerto, sem alterar as disposições do contrato original (${esc(partyFacingClauseReference(snap.clauseReference))}).</p>`;
}

function obligationTable(snap: TerminationDocumentSnapshot): string {
  const obligation = resolvedObligation(snap);
  if (!(obligation.improvementsTotal > 0)) return '';
  return `<table class="acerto">
      <thead><tr><th colspan="2">OBRIGAÇÃO COM O CLIENTE</th></tr></thead>
      <tbody>
        <tr><td>Restituição contratual</td><td>${money(obligation.contractualRefund)}</td></tr>
        <tr><td>Benfeitorias</td><td>${money(obligation.improvementsTotal)}</td></tr>
        <tr class="total"><td>Total da obrigação com o cliente</td><td>${money(obligation.total)}</td></tr>
      </tbody>
    </table>`;
}

function pendingClause(snap: TerminationDocumentSnapshot): string {
  if (snap.pendingObligationsCanceled) {
    return `<p>As obrigações de pagamento vincendas/pendentes da aquisição, registradas no acerto, foram canceladas internamente neste encerramento. Eventual cancelamento de cobrança bancária externa observa o resultado efetivo já processado pelo sistema neste ato. Pagamentos já quitados permanecem preservados para histórico e apuração do acerto.</p>`;
  }
  return `<p>O tratamento das obrigações pendentes observa o resultado efetivo do encerramento registrado no sistema. Este instrumento não afirma cancelamento que não tenha sido realizado.</p>`;
}

function reasonClause(snap: Omit<TerminationDocumentSnapshot, 'html' | 'contentHash'>): string {
  const detail = String(snap.reasonDetail || '').trim();
  if (!detail) return '';
  return `<p><strong>Motivo / justificativa do distrato registrado nesta operação:</strong> ${esc(detail)}</p>`;
}

/**
 * HTML do Instrumento Particular de Distrato a partir do snapshot já preenchido.
 * Não calcula valores — apenas formata os campos congelados do settlement.
 */
export function buildDistratoTermHtml(
  snap: Omit<TerminationDocumentSnapshot, 'html' | 'contentHash'>,
): string {
  const spouseBlock = snap.spouse?.name
    ? `<p><strong>Cônjuge / companheiro(a):</strong> ${partyLine(snap.spouse)}</p>`
    : '';

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
      <p><strong>Número do instrumento:</strong> ${esc(snap.documentNumber)}</p>
      <p><strong>Contrato original:</strong> ${esc(snap.contractNumber || '—')}</p>
      <p><strong>Data da operação:</strong> ${esc(formatIsoDateTimeBr(snap.generatedAt))}</p>
      <p><strong>Empreendimento:</strong> ${esc(snap.projectName || '—')}</p>
      <p><strong>Unidade:</strong> ${esc(snap.unitLabel || `Quadra ${snap.quadra || '—'} / Lote ${snap.lote || '—'}`)}</p>
    </div>

    <h2>A) Identificação</h2>
    <p><strong>Promitente vendedora:</strong> ${partyLine(snap.vendor)}</p>
    <p><strong>Comprador:</strong> ${partyLine(snap.buyer)}</p>
    ${spouseBlock}

    <h2>B) Considerandos</h2>
    <p>Considerando que as partes celebraram promessa/contrato de compra e venda da unidade acima, identificado pelo contrato ${esc(snap.contractNumber || 'sem número')}.</p>
    <p>Considerando que as partes, de comum acordo, resolvem formalizar o distrato da aquisição.</p>
    ${reasonClause(snap)}
    <p>Considerando que o acerto financeiro observa as disposições contratuais aplicáveis, ${esc(partyFacingPolicyWording({ contractNumber: snap.contractNumber, clauseReference: snap.clauseReference }))}.</p>

    <h2>C) Cláusula 1 — Objeto e distrato</h2>
    <p>As partes formalizam, neste ato, o distrato da aquisição da unidade identificada, com o consequente encerramento da relação contratual de compra e venda a ela referente, nos termos do acerto financeiro reconhecido neste instrumento.</p>

    <h2>D) Cláusula 2 — Devolução da unidade</h2>
    <p>Concluída a operação nos termos deste documento e do registro correspondente no sistema, a unidade retorna ao estoque/disponibilidade da vendedora, observadas as regras internas aplicáveis. O histórico da venda original, dos pagamentos e deste instrumento permanece preservado para auditoria.</p>

    <h2>E) Cláusula 3 — Acerto financeiro</h2>
    <table class="acerto">
      <thead><tr><th colspan="2">ACERTO FINANCEIRO</th></tr></thead>
      <tbody>
        <tr><td>Total pago</td><td>${money(snap.totalPaid)}</td></tr>
        <tr><td>(-) Entrada/sinal não reembolsável</td><td>${money(snap.nonRefundableAmount)}</td></tr>
        <tr><td>(=) Base da restituição</td><td>${money(snap.restitutionBase)}</td></tr>
        <tr><td>(-) Retenção contratual ${percent(snap.retentionPercent)}</td><td>${money(snap.retentionAmount)}</td></tr>
        <tr class="total"><td>(=) Valor líquido previsto</td><td>${money(snap.agreedRefundAmount)}</td></tr>
        <tr><td>Destino</td><td style="white-space:normal;font-weight:500;text-align:left">${esc(destinationLabel(snap.refundDestination))}</td></tr>
        <tr><td>Quantidade prevista de parcelas</td><td>${snap.refundInstallments == null ? '—' : String(snap.refundInstallments)}</td></tr>
      </tbody>
    </table>
    ${obligationTable(snap)}
    ${scheduleClause(snap)}
    <p>Entrada apurada: ${money(snap.entryAmount)}. Sinal apurado: ${money(snap.signalAmount)}.</p>

    <h2>F) Cláusula 4 — Parcelas e obrigações pendentes</h2>
    ${pendingClause(snap)}

    <h2>G) Cláusula 5 — Benfeitorias</h2>
    ${improvementsClause(snap)}

    <h2>H) Cláusula 6 — Documentos e histórico</h2>
    <p>Ficam preservados o contrato original (quando existente), este instrumento, o histórico da venda e as evidências do acerto financeiro. A venda original permanece como registro histórico, ainda que o lote retorne à disponibilidade.</p>

    <h2>I) Cláusula 7 — Quitação</h2>
    ${quitacaoClause(snap)}

    <h2>J) Cláusula 8 — Disposições finais</h2>
    <p>Este instrumento integra o histórico do contrato ${esc(snap.contractNumber || 'original da aquisição')}. ${snap.forumCitySnapshot ? `Fica referenciado o foro já documentado: ${esc(snap.forumCitySnapshot)}.` : 'Não se institui foro novo neste ato.'} Eventuais omissões serão resolvidas de acordo com o contrato original e ${esc(partyFacingClauseReference(snap.clauseReference))}.</p>

    <h2>K) Assinaturas</h2>
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
