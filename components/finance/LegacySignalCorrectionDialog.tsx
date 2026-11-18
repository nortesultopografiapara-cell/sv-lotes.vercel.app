'use client';

import { useMemo, useState } from 'react';
import { Scale, X } from 'lucide-react';
import {
  formatCentsBRL,
  parseBrlToCents,
  splitCentsEvenly,
  type LegacySignalResult,
} from '@/lib/finance/legacySignalRegularization';

type DraftRow = { dueDate: string; amount: string };

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
  lotLabel: string;
  projectName: string;
  registeredAmount: number;
  onClose: () => void;
  onCompleted: () => void;
};

function moneyInput(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function LegacySignalCorrectionDialog({
  saleId,
  lotLabel,
  projectName,
  registeredAmount,
  onClose,
  onCompleted,
}: Props) {
  const registeredCents = Math.round(registeredAmount * 100);
  const [received, setReceived] = useState('');
  const [rows, setRows] = useState<DraftRow[]>([
    { dueDate: '', amount: '' },
    { dueDate: '', amount: '' },
    { dueDate: '', amount: '' },
  ]);
  const [reason, setReason] = useState('');
  const [requestKey, setRequestKey] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [preview, setPreview] = useState<LegacySignalResult | null>(null);
  const [busy, setBusy] = useState<'preview' | 'execute' | null>(null);
  const [formError, setFormError] = useState('');

  const receivedCents = parseBrlToCents(received);
  const balanceCents = receivedCents != null && receivedCents < registeredCents
    ? registeredCents - receivedCents
    : null;

  const installments = useMemo(
    () => rows.map((row) => ({
      dueDate: row.dueDate,
      amountCents: parseBrlToCents(row.amount) ?? Number.NaN,
    })),
    [rows],
  );

  function invalidate() {
    setPreview(null);
    setConfirmed(false);
  }

  function splitBalance() {
    if (balanceCents == null || balanceCents <= 0) {
      setFormError('Informe o valor efetivamente recebido, menor que o valor registrado.');
      return;
    }
    const parts = splitCentsEvenly(balanceCents, rows.length);
    setRows((current) => current.map((row, index) => ({
      ...row,
      amount: moneyInput(parts[index] || 0),
    })));
    setFormError('');
    invalidate();
  }

  async function consult() {
    setFormError('');
    setConfirmed(false);
    if (reason.trim().length < 10) {
      setFormError('Informe a justificativa com pelo menos 10 caracteres.');
      return;
    }
    if (receivedCents == null || balanceCents == null || installments.some((row) => !Number.isInteger(row.amountCents) || !row.dueDate)) {
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
          saleId,
          receivedCents,
          installments,
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

  async function confirmCorrection() {
    if (!preview?.ok || !confirmed || !requestKey || busy) return;
    setBusy('execute');
    setFormError('');
    try {
      const response = await fetch('/api/finance/legacy-signal-regularization/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          saleId,
          receivedCents,
          installments,
          reason,
          requestKey,
          confirm: true,
        }),
      });
      const body = await response.json() as LegacySignalResult;
      if (!body.ok) {
        setFormError(body.message);
        setPreview(body);
        return;
      }
      window.dispatchEvent(new Event('finance_updated'));
      onCompleted();
    } catch {
      setFormError('A correção não foi concluída.');
    } finally {
      setBusy(null);
    }
  }

  const blockers = (preview?.blockers || []).map((code) => BLOCKER_LABELS[code] || code);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-primary)] shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border-color)] px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Scale className="h-4 w-4" />
              Corrigir sinal antigo
            </h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {projectName} · {lotLabel}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-[var(--text-secondary)]" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 px-5 py-4 text-sm">
          <p className="text-[var(--text-secondary)]">
            A parcela original permanece paga pelo valor efetivamente recebido, com a data já registrada.
            O saldo fica em parcelas separadas do lote. Nenhum caixa, boleto, Pix ou contrato é gerado.
          </p>
          <dl className="grid gap-2 sm:grid-cols-2">
            <div className="flex justify-between gap-3"><dt>Valor registrado como pago</dt><dd>{formatCentsBRL(registeredCents)}</dd></div>
            <div className="flex justify-between gap-3"><dt>Valor efetivamente recebido</dt><dd>{receivedCents == null ? '—' : formatCentsBRL(receivedCents)}</dd></div>
            <div className="flex justify-between gap-3"><dt>Saldo a regularizar</dt><dd>{balanceCents == null ? '—' : formatCentsBRL(balanceCents)}</dd></div>
            <div className="flex justify-between gap-3"><dt>Venda</dt><dd className="truncate">{saleId}</dd></div>
          </dl>
          <label className="block space-y-1">
            <span>Valor efetivamente recebido</span>
            <input
              className="w-full rounded-lg border border-[var(--border-color)] bg-transparent px-3 py-2"
              value={received}
              placeholder="1.500,00"
              onChange={(event) => { setReceived(event.target.value); invalidate(); }}
            />
          </label>
          <label className="block space-y-1">
            <span>Justificativa</span>
            <textarea
              className="w-full rounded-lg border border-[var(--border-color)] bg-transparent px-3 py-2"
              rows={2}
              value={reason}
              onChange={(event) => { setReason(event.target.value); invalidate(); }}
            />
          </label>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Parcelas do saldo, separadas do lote</h3>
              <button type="button" className="text-emerald-500" onClick={splitBalance}>Dividir o saldo</button>
            </div>
            {rows.map((row, index) => (
              <div key={index} className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  className="rounded-lg border border-[var(--border-color)] bg-transparent px-3 py-2"
                  value={row.dueDate}
                  onChange={(event) => {
                    const dueDate = event.target.value;
                    setRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, dueDate } : item));
                    invalidate();
                  }}
                />
                <input
                  className="rounded-lg border border-[var(--border-color)] bg-transparent px-3 py-2"
                  value={row.amount}
                  placeholder="Valor"
                  onChange={(event) => {
                    const amount = event.target.value;
                    setRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, amount } : item));
                    invalidate();
                  }}
                />
              </div>
            ))}
          </div>
          {formError ? <p className="text-red-500">{formError}</p> : null}
          {blockers.length ? (
            <div className="rounded-lg border border-red-500/40 p-3 text-red-500">
              <p className="font-medium">A correção está bloqueada.</p>
              <ul className="mt-1 list-disc pl-5">{blockers.map((label) => <li key={label}>{label}</li>)}</ul>
            </div>
          ) : null}
          {preview?.ok ? (
            <p className="text-[var(--text-secondary)]">
              A consulta preserva a data original e as parcelas do lote. A confirmação abaixo é o único passo que grava.
            </p>
          ) : null}
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
            <span>Confirmo corrigir este sinal. O valor recebido permanece pago, o saldo fica pendente e separado do lote, e nenhum caixa ou cobrança será criado.</span>
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--border-color)] px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-[var(--text-secondary)]">Cancelar</button>
          <button type="button" className="rounded-lg border border-[var(--border-color)] px-4 py-2" disabled={busy !== null} onClick={consult}>
            {busy === 'preview' ? 'Consultando…' : 'Ver situação'}
          </button>
          <button
            type="button"
            className="rounded-lg bg-emerald-700 px-4 py-2 font-medium text-white disabled:opacity-60"
            disabled={!preview?.ok || !confirmed || busy !== null}
            onClick={confirmCorrection}
          >
            {busy === 'execute' ? 'Corrigindo…' : 'Confirmar correção'}
          </button>
        </div>
      </div>
    </div>
  );
}
