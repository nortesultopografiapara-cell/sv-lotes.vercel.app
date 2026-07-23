'use client';

import { useState } from 'react';
import type { MasterCorporateReceivable } from '@/lib/master/corporateFinance/arApTypes';
import type { MasterCorporateFinancialAccount } from '@/lib/master/corporateFinance/types';
import type { CorporateAsaasBillingType } from '@/lib/master/corporateFinance/asaas/types';
import { maskCpfCnpj } from '@/lib/master/corporateFinance/asaas/domain';
import { useCorporateFinanceAuthParams } from './CorporateFinanceGuard';
import { formatCurrency, todayISO } from './format';
import styles from './corporateFinance.module.css';

type Props = {
  receivable: MasterCorporateReceivable;
  accounts: MasterCorporateFinancialAccount[];
  onClose: () => void;
  onCreated: () => void;
};

export default function CorporateAsaasGenerateModal({
  receivable,
  accounts,
  onClose,
  onCreated,
}: Props) {
  const { bodyAuth } = useCorporateFinanceAuthParams();
  const [billingType, setBillingType] = useState<CorporateAsaasBillingType>('UNDEFINED');
  const [financialAccountId, setFinancialAccountId] = useState(
    receivable.financial_account_id ||
      accounts.find((a) => a.is_default)?.id ||
      accounts[0]?.id ||
      '',
  );
  const [customerName, setCustomerName] = useState(receivable.customer_name || '');
  const [cpfCnpj, setCpfCnpj] = useState(receivable.customer_document || '');
  const [email, setEmail] = useState(receivable.customer_email || '');
  const [dueDate, setDueDate] = useState(receivable.due_date?.slice(0, 10) || todayISO());
  const [value, setValue] = useState(String(receivable.remaining_amount || ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/master/corporate-finance/asaas/charges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...bodyAuth(),
          receivable_id: receivable.id,
          billing_type: billingType,
          financial_account_id: financialAccountId,
          customer_name: customerName,
          cpf_cnpj: cpfCnpj,
          email: email || null,
          due_date: dueDate,
          value: Number(value),
          description: receivable.description,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao criar cobrança.');
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar cobrança.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.modalBackdrop} role="dialog" aria-modal="true">
      <form className={styles.modal} onSubmit={(e) => void submit(e)}>
        <div className={styles.modalHead}>
          <h3 className={styles.modalTitle}>Gerar cobrança Asaas — {receivable.code}</h3>
          <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={onClose}>
            Fechar
          </button>
        </div>
        <div className={styles.modalBody}>
          <p className={styles.muted}>
            Cria cobrança no Asaas (conta SV Topografia). A Conta a Receber permanece{' '}
            <strong>em aberto</strong> — sem caixa e sem liquidação até o pagamento confirmado.
          </p>
          <p className={styles.muted}>Documento: {maskCpfCnpj(cpfCnpj)}</p>
          {error ? <p className={styles.error}>{error}</p> : null}

          <div>
            <label className={styles.label}>Forma de cobrança *</label>
            <select
              className={styles.select}
              value={billingType}
              onChange={(e) => setBillingType(e.target.value as CorporateAsaasBillingType)}
            >
              <option value="UNDEFINED">PIX + Boleto</option>
              <option value="PIX">Somente PIX</option>
              <option value="BOLETO">Somente Boleto</option>
            </select>
          </div>

          <div>
            <label className={styles.label}>Conta financeira *</label>
            <select
              className={styles.select}
              value={financialAccountId}
              onChange={(e) => setFinancialAccountId(e.target.value)}
              required
            >
              <option value="">—</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={styles.label}>Cliente *</label>
            <input
              className={styles.input}
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              required
            />
          </div>

          <div className={styles.grid2}>
            <div>
              <label className={styles.label}>CPF/CNPJ *</label>
              <input
                className={styles.input}
                value={cpfCnpj}
                onChange={(e) => setCpfCnpj(e.target.value)}
                required
              />
            </div>
            <div>
              <label className={styles.label}>E-mail</label>
              <input
                className={styles.input}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className={styles.grid2}>
            <div>
              <label className={styles.label}>Valor *</label>
              <input
                className={styles.input}
                type="number"
                step="0.01"
                min="0"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                required
              />
              <p className={styles.muted} style={{ marginTop: 4 }}>
                Saldo da AR: {formatCurrency(receivable.remaining_amount)}
              </p>
            </div>
            <div>
              <label className={styles.label}>Vencimento *</label>
              <input
                className={styles.input}
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                required
              />
            </div>
          </div>
        </div>
        <div className={styles.modalFoot}>
          <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={busy}>
            {busy ? 'Gerando…' : 'Gerar cobrança'}
          </button>
        </div>
      </form>
    </div>
  );
}
