'use client';

import { useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
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

function pictureLines(picture: FinancialPicture | null) {
  if (!picture) return [];
  return [
    ['Sinal recebido', formatCentsBRL(picture.signalPaidCents)],
    ['Sinal pendente', formatCentsBRL(picture.signalPendingCents)],
    ['Sinal total', formatCentsBRL(picture.signalTotalCents)],
    ['Parcelas do lote', `${picture.lotCount} · ${formatCentsBRL(picture.lotCents)}`],
    ['Lançamentos de caixa', String(picture.cashCount)],
    ['Contratos', picture.contractIds.length ? picture.contractIds.join(', ') : 'nenhum lido'],
    ['Comissões', picture.commissionStatuses.length ? picture.commissionStatuses.join(', ') : 'nenhuma'],
  ];
}

export default function LegacySignalRegularizationPage() {
  const { user, loading } = useAuth();
  const allowed = isTenantEnterpriseAdminRole(user?.role);
  const [saleId, setSaleId] = useState('');
  const [received, setReceived] = useState('');
  const [rows, setRows] = useState<DraftRow[]>(EMPTY_ROWS);
  const [reason, setReason] = useState('');
  const [requestKey, setRequestKey] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [preview, setPreview] = useState<LegacySignalResult | null>(null);
  const [result, setResult] = useState<LegacySignalResult | null>(null);
  const [busy, setBusy] = useState<'preview' | 'execute' | null>(null);
  const [formError, setFormError] = useState('');

  const payload = useMemo(() => {
    const receivedCents = parseBrlToCents(received);
    const installments = rows.map((row) => ({
      dueDate: row.dueDate,
      amountCents: parseBrlToCents(row.amount) ?? Number.NaN,
    }));
    return { receivedCents, installments };
  }, [received, rows]);

  function updateRow(index: number, patch: Partial<DraftRow>) {
    setPreview(null);
    setResult(null);
    setConfirmed(false);
    setRequestKey('');
    setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  function splitBalance() {
    const receivedCents = parseBrlToCents(received);
    if (receivedCents == null) {
      setFormError('Informe o valor recebido antes de dividir o saldo.');
      return;
    }
    const contracted = preview?.before?.originalAmountCents;
    if (contracted == null || contracted <= receivedCents) {
      setFormError('Consulte a situação para conhecer o sinal marcado como pago.');
      return;
    }
    const parts = splitCentsEvenly(contracted - receivedCents, rows.length);
    setRows((current) => current.map((row, index) => ({
      ...row,
      amount: (parts[index] / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    })));
    setPreview(null);
    setConfirmed(false);
  }

  async function consult() {
    setFormError('');
    setResult(null);
    if (payload.receivedCents == null || payload.installments.some((row) => !Number.isInteger(row.amountCents))) {
      setFormError('Informe valores em reais, com até dois centavos.');
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
      if (!body.ok) setFormError(body.message);
    } catch {
      setFormError('A regularização não foi concluída.');
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <main className="p-6 text-sm text-[var(--color-text-muted)]">Carregando…</main>;
  if (!allowed) {
    return <main className="mx-auto max-w-3xl p-6">Esta rotina é restrita ao administrador da empresa.</main>;
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Regularizar sinal antigo</h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          Ajusta a parcela original para o valor efetivamente recebido e cria o saldo pendente.
          Não lança caixa, não emite cobrança e não altera as parcelas do lote nem o contrato.
        </p>
      </header>

      <section className="grid gap-4 rounded-xl border border-[var(--color-border)] p-4 md:grid-cols-2">
        <label className="space-y-1 text-sm md:col-span-2">
          <span>Identificador da venda</span>
          <input className="w-full rounded-lg border border-[var(--color-border)] bg-transparent px-3 py-2" value={saleId} onChange={(event) => { setSaleId(event.target.value); setPreview(null); setRequestKey(''); }} />
        </label>
        <label className="space-y-1 text-sm">
          <span>Valor efetivamente recebido</span>
          <input className="w-full rounded-lg border border-[var(--color-border)] bg-transparent px-3 py-2" value={received} onChange={(event) => { setReceived(event.target.value); setPreview(null); setRequestKey(''); }} placeholder="1.500,00" />
        </label>
        <label className="space-y-1 text-sm">
          <span>Motivo</span>
          <input className="w-full rounded-lg border border-[var(--color-border)] bg-transparent px-3 py-2" value={reason} onChange={(event) => { setReason(event.target.value); setPreview(null); }} />
        </label>
        <div className="md:col-span-2 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">Parcelas pendentes do saldo</h2>
            <button type="button" className="text-sm text-[var(--color-primary)]" onClick={splitBalance}>Dividir o saldo</button>
          </div>
          {rows.map((row, index) => (
            <div key={index} className="grid grid-cols-2 gap-2">
              <input type="date" className="rounded-lg border border-[var(--color-border)] bg-transparent px-3 py-2" value={row.dueDate} onChange={(event) => updateRow(index, { dueDate: event.target.value })} />
              <input className="rounded-lg border border-[var(--color-border)] bg-transparent px-3 py-2" value={row.amount} placeholder="Valor" onChange={(event) => updateRow(index, { amount: event.target.value })} />
            </div>
          ))}
          <button type="button" className="text-sm" onClick={() => { setRows((current) => [...current, { dueDate: '', amount: '' }]); setPreview(null); }}>Adicionar parcela</button>
        </div>
        <button type="button" className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60" disabled={busy !== null} onClick={consult}>
          {busy === 'preview' ? 'Consultando…' : 'Ver situação'}
        </button>
      </section>

      {formError ? <p className="text-sm text-red-500">{formError}</p> : null}
      {preview?.blockers?.length ? <p className="text-sm text-red-500">Bloqueios: {preview.blockers.join(', ')}</p> : null}

      {preview?.before ? (
        <section className="grid gap-4 md:grid-cols-2">
          <article className="rounded-xl border border-[var(--color-border)] p-4">
            <h2 className="mb-3 font-medium">Situação atual</h2>
            <dl className="space-y-2 text-sm">
              {pictureLines(preview.before).map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4"><dt>{label}</dt><dd>{value}</dd></div>
              ))}
            </dl>
          </article>
          <article className="rounded-xl border border-[var(--color-border)] p-4">
            <h2 className="mb-3 font-medium">Situação proposta</h2>
            {preview.after ? (
              <dl className="space-y-2 text-sm">
                {pictureLines(preview.after).map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4"><dt>{label}</dt><dd>{value}</dd></div>
                ))}
              </dl>
            ) : <p className="text-sm text-[var(--color-text-muted)]">A proposta não pode ser aplicada.</p>}
          </article>
        </section>
      ) : null}

      <section className="space-y-3 rounded-xl border border-[var(--color-border)] p-4">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
          <span>Confirmo a regularização destes valores. A parcela original será preservada, o saldo ficará pendente e nenhum caixa ou cobrança será criado.</span>
        </label>
        <button type="button" className="rounded-lg bg-[var(--color-warning)] px-4 py-2 text-sm font-medium text-black disabled:opacity-60" disabled={!preview?.ok || !confirmed || busy !== null} onClick={confirmRegularization}>
          {busy === 'execute' ? 'Regularizando…' : 'Confirmar regularização'}
        </button>
        {result ? <p className="text-sm">{result.message}</p> : null}
      </section>
    </main>
  );
}
