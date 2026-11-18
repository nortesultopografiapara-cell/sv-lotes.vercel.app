'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { isTenantEnterpriseAdminRole } from '@/lib/rolePermissions';
import {
  formatCentsBRL,
  parseBrlToCents,
  splitCentsEvenly,
  type FinancialPicture,
  type LegacySignalResult,
} from '@/lib/finance/legacySignalRegularization';

type DraftRow = { dueDate: string; amount: string };

const EMPTY_ROWS: DraftRow[] = [
  { dueDate: '', amount: '' },
  { dueDate: '', amount: '' },
  { dueDate: '', amount: '' },
];

const BLOCKER_LABELS: Record<string, string> = {
  receipt: 'Há recibo vinculado à parcela.',
  cash: 'Há lançamento de caixa vinculado.',
  bank_charge: 'Há cobrança bancária vinculada.',
  asaas_charge: 'Há cobrança Asaas vinculada.',
  settlement: 'Há repasse vinculado.',
  paid_commission: 'Há comissão já paga.',
  financial_account: 'A parcela está vinculada a uma conta financeira.',
  separate_schedule: 'Esta venda já separa o sinal do lote.',
};

type Props = {
  saleId: string;
  onSaleIdChange?: (value: string) => void;
  suggestedReceived?: string;
  onCompleted?: (result: LegacySignalResult) => void;
};

function centsLabel(cents: number | null | undefined): string {
  return cents == null ? '—' : formatCentsBRL(cents);
}

export function LegacySignalRegularizationPanel({
  saleId,
  onSaleIdChange,
  suggestedReceived = '',
  onCompleted,
}: Props) {
  const { user, loading } = useAuth();
  const allowed = isTenantEnterpriseAdminRole(user?.role);
  const [received, setReceived] = useState('');
  const [rows, setRows] = useState<DraftRow[]>(EMPTY_ROWS);
  const [reason, setReason] = useState('');
  const [requestKey, setRequestKey] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [preview, setPreview] = useState<LegacySignalResult | null>(null);
  const [result, setResult] = useState<LegacySignalResult | null>(null);
  const [busy, setBusy] = useState<'preview' | 'execute' | 'contract' | null>(null);
  const [formError, setFormError] = useState('');
  const [regenConfirmed, setRegenConfirmed] = useState(false);
  const [regenMessage, setRegenMessage] = useState('');
  const [expanded, setExpanded] = useState(Boolean(onSaleIdChange));
  const seeded = useRef(false);

  useEffect(() => {
    if (seeded.current || !suggestedReceived.trim()) return;
    seeded.current = true;
    setReceived(suggestedReceived);
  }, [suggestedReceived]);

  const payload = useMemo(() => {
    const receivedCents = parseBrlToCents(received);
    const installments = rows.map((row) => ({
      dueDate: row.dueDate,
      amountCents: parseBrlToCents(row.amount) ?? Number.NaN,
    }));
    return { receivedCents, installments };
  }, [received, rows]);

  function invalidate() {
    setPreview(null);
    setResult(null);
    setConfirmed(false);
    setRequestKey('');
    setRegenConfirmed(false);
    setRegenMessage('');
  }

  function updateRow(index: number, patch: Partial<DraftRow>) {
    invalidate();
    setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  function splitBalance() {
    const receivedCents = parseBrlToCents(received);
    const contracted = preview?.before?.originalAmountCents;
    if (receivedCents == null || contracted == null || contracted <= receivedCents) {
      setFormError('Consulte a situação para conhecer o valor marcado como pago.');
      return;
    }
    const parts = splitCentsEvenly(contracted - receivedCents, rows.length);
    setRows((current) => current.map((row, index) => ({
      ...row,
      amount: (parts[index] / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    })));
    invalidate();
  }

  async function consult() {
    setFormError('');
    setResult(null);
    setConfirmed(false);
    if (!saleId.trim()) {
      setFormError('A venda selecionada não possui identificador.');
      return;
    }
    if (reason.trim().length < 10) {
      setFormError('Informe a justificativa com pelo menos 10 caracteres.');
      return;
    }
    if (payload.receivedCents == null || payload.installments.some((row) => !Number.isInteger(row.amountCents) || !row.dueDate)) {
      setFormError('Informe o valor recebido, o vencimento e o valor de cada parcela do saldo.');
      return;
    }
    const key = requestKey || crypto.randomUUID().replace(/-/g, '');
    setRequestKey(key);
    setBusy('preview');
    try {
      const response = await fetch('/api/finance/legacy-signal-regularization/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          saleId: saleId.trim(),
          receivedCents: payload.receivedCents,
          installments: payload.installments,
          reason,
          requestKey: key,
          confirm: false,
        }),
      });
      const body = await response.json() as LegacySignalResult;
      setPreview(body);
      if (!body.ok) setFormError(body.message);
    } catch {
      setFormError('Não foi possível consultar a situação.');
    } finally {
      setBusy(null);
    }
  }

  async function confirmRegularization() {
    if (!preview?.ok || !confirmed || !requestKey) return;
    setBusy('execute');
    setFormError('');
    try {
      const response = await fetch('/api/finance/legacy-signal-regularization/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          saleId: saleId.trim(),
          receivedCents: payload.receivedCents,
          installments: payload.installments,
          reason,
          requestKey,
          confirm: true,
        }),
      });
      const body = await response.json() as LegacySignalResult;
      setResult(body);
      if (!body.ok) {
        setFormError(body.message);
        return;
      }
      window.dispatchEvent(new Event('finance_updated'));
      onCompleted?.(body);
    } catch {
      setFormError('A regularização não foi concluída.');
    } finally {
      setBusy(null);
    }
  }

  async function prepareContractRegeneration() {
    if (!regenConfirmed || !result?.ok) return;
    setBusy('contract');
    setRegenMessage('');
    try {
      const { data, error } = await supabase
        .from('contracts')
        .update({ needs_regenerar: true })
        .eq('sale_id', saleId.trim())
        .in('status', ['ativo', 'active', 'assinado'])
        .select('id, version, status');
      if (error) {
        setRegenMessage('Não foi possível marcar o contrato. Nenhuma versão foi alterada.');
        return;
      }
      const versions = (data || []).map((row) => row.version).filter((version) => version != null);
      setRegenMessage(
        versions.length
          ? `O contrato vigente, versão ${versions.join(', ')}, foi marcado para regeneração posterior. O texto atual permanece.`
          : 'Nenhum contrato vigente foi encontrado para marcar. Nenhuma versão foi apagada.',
      );
    } catch {
      setRegenMessage('Não foi possível marcar o contrato. Nenhuma versão foi alterada.');
    } finally {
      setBusy(null);
    }
  }

  if (loading || !allowed) return null;

  const registeredPaid = preview?.before?.originalAmountCents ?? null;
  const receivedCents = payload.receivedCents;
  const difference = registeredPaid != null && receivedCents != null ? registeredPaid - receivedCents : null;
  const blockers = (preview?.blockers || []).map((code) => BLOCKER_LABELS[code] || code);

  return (
    <details
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
      className="mt-6 space-y-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-slate-900"
    >
      <summary className="cursor-pointer text-base font-semibold">Regularizar sinal antigo</summary>
      <header className="space-y-1">
        <p className="text-sm text-slate-700">
          Ajusta a parcela original para o valor efetivamente recebido e cria o saldo pendente.
          Não usa o botão Salvar alterações. Não lança caixa, não emite boleto ou Pix e não regenera o contrato.
        </p>
      </header>

      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div className="flex justify-between gap-3"><dt>Sinal registrado como pago</dt><dd>{centsLabel(registeredPaid)}</dd></div>
        <div className="flex justify-between gap-3"><dt>Valor efetivamente recebido</dt><dd>{centsLabel(receivedCents)}</dd></div>
        <div className="flex justify-between gap-3"><dt>Diferença a regularizar</dt><dd>{centsLabel(difference)}</dd></div>
        <div className="flex justify-between gap-3"><dt>Parcelas do lote</dt><dd>{preview?.before ? `${preview.before.lotCount} · ${formatCentsBRL(preview.before.lotCents)}` : 'consulte a situação'}</dd></div>
      </dl>

      <div className="grid gap-3 md:grid-cols-2">
        {onSaleIdChange ? (
          <label className="space-y-1 text-sm md:col-span-2">
            <span>Identificador da venda</span>
            <input className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2" value={saleId} onChange={(event) => { onSaleIdChange(event.target.value); invalidate(); }} />
          </label>
        ) : null}
        <label className="space-y-1 text-sm">
          <span>Valor efetivamente recebido</span>
          <input className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2" value={received} placeholder="1.500,00" onChange={(event) => { setReceived(event.target.value); invalidate(); }} />
        </label>
        <label className="space-y-1 text-sm">
          <span>Justificativa</span>
          <input className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2" value={reason} onChange={(event) => { setReason(event.target.value); invalidate(); }} />
        </label>
        <div className="space-y-2 md:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Parcelas do saldo</h3>
            <button type="button" className="text-sm text-emerald-800" onClick={splitBalance}>Dividir o saldo</button>
          </div>
          {rows.map((row, index) => (
            <div key={index} className="grid grid-cols-2 gap-2">
              <input type="date" className="rounded-lg border border-amber-300 bg-white px-3 py-2" value={row.dueDate} onChange={(event) => updateRow(index, { dueDate: event.target.value })} />
              <input className="rounded-lg border border-amber-300 bg-white px-3 py-2" value={row.amount} placeholder="Valor" onChange={(event) => updateRow(index, { amount: event.target.value })} />
            </div>
          ))}
          <button type="button" className="text-sm" onClick={() => { setRows((current) => [...current, { dueDate: '', amount: '' }]); invalidate(); }}>Adicionar parcela</button>
        </div>
        <button type="button" className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60" disabled={busy !== null} onClick={consult}>
          {busy === 'preview' ? 'Consultando…' : 'Ver situação'}
        </button>
      </div>

      <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
        <li>A parcela original permanece, com a data de pagamento já registrada.</li>
        <li>As parcelas do lote, seus vencimentos e seus valores permanecem.</li>
        <li>Nenhum caixa, boleto, Pix ou recibo é gerado.</li>
        <li>O contrato vigente e as versões anteriores permanecem até uma regeneração confirmada à parte.</li>
      </ul>

      {formError ? <p className="text-sm text-red-700">{formError}</p> : null}
      {blockers.length ? (
        <div className="rounded-lg border border-red-200 bg-white p-3 text-sm text-red-700">
          <p className="font-medium">A regularização está bloqueada.</p>
          <ul className="mt-1 list-disc pl-5">{blockers.map((label) => <li key={label}>{label}</li>)}</ul>
        </div>
      ) : null}

      {preview?.ok && preview.after ? (
        <div className="grid gap-3 text-sm md:grid-cols-2">
          <article className="rounded-lg border border-amber-200 bg-white p-3">
            <h3 className="mb-2 font-medium">Situação atual</h3>
            <PictureList picture={preview.before} />
          </article>
          <article className="rounded-lg border border-amber-200 bg-white p-3">
            <h3 className="mb-2 font-medium">Parcelas que serão criadas</h3>
            <ul className="space-y-1">
              {rows.map((row, index) => (
                <li key={`${row.dueDate}-${index}`}>{row.dueDate || 'sem data'} · {row.amount || 'sem valor'} · pendente</li>
              ))}
            </ul>
            <p className="mt-2 text-slate-600">Sinal depois da regularização: {formatCentsBRL(preview.after.signalPaidCents)} recebidos e {formatCentsBRL(preview.after.signalPendingCents)} pendentes.</p>
          </article>
        </div>
      ) : null}

      <div className="space-y-3">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
          <span>Confirmo a regularização destes valores. A parcela original será preservada, o saldo ficará pendente e nenhum caixa ou cobrança será criado.</span>
        </label>
        <button type="button" className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-black disabled:opacity-60" disabled={!preview?.ok || !confirmed || busy !== null} onClick={confirmRegularization}>
          {busy === 'execute' ? 'Regularizando…' : 'Confirmar regularização'}
        </button>
        {result?.ok ? <p className="text-sm">{result.message} A visualização financeira foi atualizada. O contrato não foi regenerado.</p> : null}
      </div>

      {result?.ok ? (
        <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
          <h3 className="text-sm font-medium">Regeneração do contrato, etapa posterior</h3>
          <p className="text-sm text-slate-600">Esta ação não gera texto novo e não apaga versões. Ela apenas marca o contrato vigente para ser regenerado depois, na tela de Contratos.</p>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={regenConfirmed} onChange={(event) => setRegenConfirmed(event.target.checked)} />
            <span>Confirmo preparar a regeneração, sem substituir a versão atual agora.</span>
          </label>
          <button type="button" className="rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-60" disabled={!regenConfirmed || busy !== null} onClick={prepareContractRegeneration}>
            {busy === 'contract' ? 'Marcando…' : 'Preparar regeneração do contrato'}
          </button>
          {regenMessage ? <p className="text-sm">{regenMessage}</p> : null}
        </div>
      ) : null}
    </details>
  );
}

function PictureList({ picture }: { picture: FinancialPicture | null }) {
  if (!picture) return null;
  const lines: Array<[string, string]> = [
    ['Sinal recebido', formatCentsBRL(picture.signalPaidCents)],
    ['Sinal pendente', formatCentsBRL(picture.signalPendingCents)],
    ['Sinal total', formatCentsBRL(picture.signalTotalCents)],
    ['Parcelas do lote', `${picture.lotCount} · ${formatCentsBRL(picture.lotCents)}`],
  ];
  return (
    <dl className="space-y-1">
      {lines.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-3"><dt>{label}</dt><dd>{value}</dd></div>
      ))}
    </dl>
  );
}
