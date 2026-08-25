import { formatCurrencyBRL } from '@/lib/currencyBrl';
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

function waitingImprovementAppraisal(status: string | null): boolean {
  const s = String(status || '').toUpperCase();
  return s.includes('WAITING');
}

function improvementsClause(snap: TerminationDocumentSnapshot): string {
  if (waitingImprovementAppraisal(snap.improvementStatus)) {
    return `<p>Foi informado que existem benfeitorias na unidade, sujeitas à avaliação técnica prevista na política contratual congelada (${esc(snap.policyVersion || '—')}). Enquanto essa avaliação não for concluída, o quadro de acerto financeiro deste termo <strong>não constitui cálculo final</strong> e <strong>não há quitação financeira definitiva</strong>.</p>`;
  }
  if (snap.improvementStatus) {
    return `<p>Situação de benfeitorias registrada no acerto: <strong>${esc(snap.improvementStatus)}</strong>.</p>`;
  }
  return `<p>Não foi informada, neste ato, a existência de benfeitorias sujeitas à avaliação para o acerto financeiro.</p>`;
}

function quitacaoClause(snap: TerminationDocumentSnapshot): string {
  const due = Number(snap.agreedRefundAmount || 0);
  const waiting = waitingImprovementAppraisal(snap.improvementStatus);
  if (waiting) {
    return `<p>Em face da avaliação de benfeitorias pendente, as partes reconhecem apenas o encerramento da relação de aquisição da unidade, sem declaração de quitação financeira definitiva.</p>`;
  }
  if (due > 0 && snap.refundSchedule.defined) {
    return `<p>As partes reconhecem o encerramento da relação contratual referente à aquisição da unidade identificada e o acerto financeiro apurado neste ato. Subsiste obrigação de restituição no valor líquido previsto de <strong>${money(due)}</strong>, com vencimentos formalizados no cronograma deste termo. A assinatura deste instrumento não equivale à comprovação futura de pagamento. A quitação financeira ocorrerá somente conforme as parcelas forem efetivamente pagas.</p>`;
  }
  if (due > 0) {
    return `<p>As partes reconhecem o encerramento da relação contratual referente à aquisição da unidade identificada e o acerto financeiro apurado neste ato. Subsiste obrigação de restituição no valor líquido previsto de <strong>${money(due)}</strong>, a ser cumprida na forma operacional/financeira aplicável. <strong>Não se declara quitação financeira integral</strong> enquanto a restituição reconhecida não for efetivamente cumprida.</p>`;
  }
  return `<p>As partes reconhecem o encerramento da relação contratual referente à aquisição da unidade identificada e o acerto financeiro apurado neste ato, sem saldo de restituição previsto no settlement congelado.</p>`;
}

function scheduleClause(snap: TerminationDocumentSnapshot): string {
  const due = Number(snap.agreedRefundAmount || 0);
  if (snap.refundDestination === 'CREDIT_OTHER_UNIT') {
    return `<p>O destino reconhecido neste ato é crédito em outra unidade, como intenção. Não há cronograma de restituição em dinheiro neste instrumento.</p>`;
  }
  if (due <= 0) {
    return `<p>Não há valor líquido previsto para restituição neste acerto.</p>`;
  }
  if (!snap.refundSchedule.defined) {
    const n = snap.refundSchedule.installmentCount;
    const qty = n == null ? 'não definida neste ato' : String(n);
    if (waitingImprovementAppraisal(snap.improvementStatus)) {
      return `<p>Valor líquido previsto para restituição (provisório): <strong>${money(due)}</strong>.</p>
<p>Quantidade prevista de parcelas de restituição: <strong>${esc(qty)}</strong>.</p>
<p>O cronograma de restituição será definido após a conclusão da avaliação das benfeitorias e o fechamento do acerto financeiro. Não se formalizam neste ato datas de vencimento nem valores individualizados das parcelas, porque o cálculo ainda não é definitivo.</p>`;
    }
    return `<p>Valor líquido previsto para restituição: <strong>${money(due)}</strong>.</p>
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
  return `<h2>CRONOGRAMA DA RESTITUIÇÃO</h2>
<p>O valor líquido previsto para restituição é obrigação reconhecida neste ato. As datas abaixo são as obrigações vencíveis acordadas nesta operação. A assinatura deste termo não equivale à comprovação futura de pagamento. A quitação financeira ocorrerá somente conforme as parcelas forem efetivamente pagas.</p>
<table class="acerto cronograma">
  <thead><tr><th>Parcela</th><th>Vencimento</th><th>Valor</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<p>Este cronograma é a formalização operacional da restituição definida neste ato, a partir do valor líquido já apurado no acerto, sem alterar a política contratual congelada.</p>`;
}

function pendingClause(snap: TerminationDocumentSnapshot): string {
  if (snap.pendingObligationsCanceled) {
    return `<p>As obrigações de pagamento vincendas/pendentes da aquisição, registradas no acerto, foram canceladas internamente neste encerramento. Eventual cancelamento de cobrança bancária externa observa o resultado efetivo já processado pelo sistema neste ato. Pagamentos já quitados permanecem preservados para histórico e apuração do acerto.</p>`;
  }
  return `<p>O tratamento das obrigações pendentes observa o resultado efetivo do encerramento registrado no sistema. Este termo não afirma cancelamento que não tenha sido realizado.</p>`;
}

/**
 * HTML profissional a partir do snapshot já preenchido (exceto html/hash).
 * Não calcula valores — apenas formata os campos congelados.
 */
export function buildDesistenciaTermHtml(
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
      <p><strong>Número do termo:</strong> ${esc(snap.documentNumber)}</p>
      <p><strong>Contrato original:</strong> ${esc(snap.contractNumber || '—')}</p>
      <p><strong>Data da operação:</strong> ${esc(formatIsoDateTimeBr(snap.generatedAt))}</p>
      <p><strong>Empreendimento:</strong> ${esc(snap.projectName || '—')}</p>
      <p><strong>Unidade:</strong> ${esc(snap.unitLabel || `Quadra ${snap.quadra || '—'} / Lote ${snap.lote || '—'}`)}</p>
    </div>

    <h2>A) Identificação</h2>
    <p><strong>Promitente vendedora:</strong> ${partyLine(snap.vendor)}</p>
    <p><strong>Comprador / desistente:</strong> ${partyLine(snap.buyer)}</p>
    ${spouseBlock}

    <h2>B) Considerandos</h2>
    <p>Considerando que as partes celebraram promessa/contrato de compra e venda da unidade acima, identificado pelo contrato ${esc(snap.contractNumber || 'sem número')}.</p>
    <p>Considerando que o comprador manifestou desistência da aquisição.</p>
    <p>Considerando que as partes reconhecem a necessidade de formalizar o encerramento da relação contratual relativa a essa unidade.</p>
    <p>Considerando que o acerto financeiro observa as disposições contratuais aplicáveis, conforme a política congelada na venda (${esc(snap.policyVersion || 'não identificada')}${snap.clauseReference ? `; ${esc(snap.clauseReference)}` : ''}).</p>

    <h2>C) Cláusula 1 — Objeto e desistência</h2>
    <p>O comprador formaliza, neste ato, a desistência da aquisição da unidade identificada, com o consequente encerramento da relação contratual de compra e venda a ela referente, nos termos do acerto financeiro reconhecido neste instrumento.</p>

    <h2>D) Cláusula 2 — Devolução da unidade</h2>
    <p>Concluída a operação nos termos deste documento e do registro correspondente no sistema, a unidade retorna ao estoque/disponibilidade da vendedora, observadas as regras internas aplicáveis. O histórico da venda original, dos pagamentos e deste termo permanece preservado para auditoria.</p>

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
    ${scheduleClause(snap)}
    <p>Entrada apurada: ${money(snap.entryAmount)}. Sinal apurado: ${money(snap.signalAmount)}.</p>

    <h2>F) Cláusula 4 — Parcelas e obrigações pendentes</h2>
    ${pendingClause(snap)}

    <h2>G) Cláusula 5 — Benfeitorias</h2>
    ${improvementsClause(snap)}

    <h2>H) Cláusula 6 — Documentos e histórico</h2>
    <p>Ficam preservados o contrato original (quando existente), este termo, o histórico da venda e as evidências do acerto financeiro. A venda original permanece como registro histórico, ainda que o lote retorne à disponibilidade.</p>

    <h2>I) Cláusula 7 — Quitação</h2>
    ${quitacaoClause(snap)}

    <h2>J) Cláusula 8 — Disposições finais</h2>
    <p>Este termo integra o histórico do contrato ${esc(snap.contractNumber || 'original da aquisição')}. ${snap.forumCitySnapshot ? `Fica referenciado o foro já documentado: ${esc(snap.forumCitySnapshot)}.` : 'Não se institui foro novo neste ato.'} Eventuais omissões serão resolvidas de acordo com o contrato original e a política congelada na venda.</p>

    <h2>K) Assinaturas</h2>
    <div class="signs">
      <div class="sign-line">${esc(snap.vendor.name || 'Promitente vendedora')}<br/>Promitente vendedora</div>
      <div class="sign-line">${esc(snap.buyer.name || 'Comprador / desistente')}<br/>Comprador / desistente</div>
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
