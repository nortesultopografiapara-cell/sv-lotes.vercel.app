'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  corporateAsaasBillingTypeLabel,
  corporateAsaasLocalStatusLabel,
  isCorporateAsaasActiveStatus,
  isCorporateAsaasPaidStatus,
  type MasterCorporateAsaasCharge,
} from '@/lib/master/corporateFinance/asaas/types';
import { semanticToneForAsaasStatus } from '@/lib/master/corporateFinance/semantic';
import { MasterSecureDeleteModal } from '@/components/master/MasterSecureDeleteModal';
import { CorporateFinanceSemanticBadge } from './CorporateFinanceSemantic';
import { useCorporateFinanceAuthParams } from './CorporateFinanceGuard';
import { formatCurrency, formatDate } from './format';
import styles from './corporateFinance.module.css';

type Props = {
  chargeId: string;
  receivableCode?: string;
  onClose: () => void;
  onChanged: () => void;
};

export default function CorporateAsaasViewModal({
  chargeId,
  receivableCode,
  onClose,
  onChanged,
}: Props) {
  const { qs, bodyAuth } = useCorporateFinanceAuthParams();
  const [charge, setCharge] = useState<MasterCorporateAsaasCharge | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteLocalOnly, setDeleteLocalOnly] = useState(false);
  const [forceLocalUnlink, setForceLocalUnlink] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/master/corporate-finance/asaas/charges/${chargeId}?${qs()}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar cobrança.');
      setCharge(data.charge || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar.');
    } finally {
      setLoading(false);
    }
  }, [chargeId, qs]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runAction(action: 'sync' | 'cancel' | 'reprocess' | 'pix') {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(
        `/api/master/corporate-finance/asaas/charges/${chargeId}/${action}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyAuth()),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Falha em ${action}.`);
      if (data.charge) setCharge(data.charge as MasterCorporateAsaasCharge);
      else await load();
      setInfo(
        action === 'cancel'
          ? 'Cobrança cancelada no Asaas. A Conta a Receber permanece aberta.'
          : 'Ação concluída (sem duplicar recebimento).',
      );
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro na ação.');
    } finally {
      setBusy(false);
    }
  }

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setInfo(`${label} copiado.`);
    } catch {
      setError(`Não foi possível copiar ${label}.`);
    }
  }

  function openSecureDelete() {
    if (!charge) return;
    const paid = isCorporateAsaasPaidStatus(charge.local_status);
    setDeleteError(null);
    setDeleteLocalOnly(false);
    setForceLocalUnlink(paid);
    setDeleteOpen(true);
  }

  async function confirmSecureDelete(confirmWord: string) {
    if (!charge) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const paid = isCorporateAsaasPaidStatus(charge.local_status);
      const res = await fetch(
        `/api/master/corporate-finance/asaas/charges/${charge.id}/delete`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...bodyAuth(),
            confirmWord,
            forceLocalUnlink: paid || forceLocalUnlink,
            localOnly: deleteLocalOnly,
            reason: 'Exclusão segura via Painel Executivo',
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao excluir vínculo.');
      setDeleteOpen(false);
      setInfo(data.message || 'Vínculo local da cobrança removido.');
      onChanged();
      onClose();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Erro ao excluir.');
    } finally {
      setDeleteBusy(false);
    }
  }

  const c = charge;

  return (
    <>
    <div className={styles.modalBackdrop} role="dialog" aria-modal="true">
      <div className={styles.modal} style={{ maxWidth: 640 }}>
        <div className={styles.modalHead}>
          <h3 className={styles.modalTitle}>
            Cobrança Asaas{receivableCode ? ` — ${receivableCode}` : ''}
          </h3>
          <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={onClose}>
            Fechar
          </button>
        </div>
        <div className={styles.modalBody}>
          {error ? <p className={styles.error}>{error}</p> : null}
          {info ? <p className={styles.muted}>{info}</p> : null}
          {loading || !c ? (
            <p className={styles.muted}>Carregando…</p>
          ) : (
            <>
              <div className={styles.detailGrid}>
                <div className={styles.detailItem}>
                  <label>Status</label>
                  <p>
                    <CorporateFinanceSemanticBadge tone={semanticToneForAsaasStatus(c.local_status)}>
                      {corporateAsaasLocalStatusLabel(c.local_status)}
                    </CorporateFinanceSemanticBadge>
                  </p>
                </div>
                <div className={styles.detailItem}>
                  <label>Tipo</label>
                  <p>{corporateAsaasBillingTypeLabel(c.billing_type)}</p>
                </div>
                <div className={styles.detailItem}>
                  <label>Valor</label>
                  <p>{formatCurrency(c.original_value)}</p>
                </div>
                <div className={styles.detailItem}>
                  <label>Vencimento</label>
                  <p>{formatDate(c.due_date)}</p>
                </div>
                <div className={styles.detailItem}>
                  <label>ID Asaas</label>
                  <p>
                    <code style={{ fontSize: '0.8rem' }}>{c.asaas_payment_id}</code>
                  </p>
                </div>
                <div className={styles.detailItem}>
                  <label>Status Asaas</label>
                  <p>{c.asaas_status || '—'}</p>
                </div>
              </div>

              {(c.billing_type === 'PIX' ||
                c.billing_type === 'UNDEFINED' ||
                c.pix_payload ||
                c.pix_qr_code) && (
                <div style={{ marginTop: '1rem' }}>
                  <h4 className={styles.panelTitle}>PIX</h4>
                  {c.pix_qr_code ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.pix_qr_code}
                      alt="QR Code PIX"
                      style={{ width: 180, height: 180, background: '#fff', marginTop: 8 }}
                    />
                  ) : (
                    <p className={styles.muted}>QR Code indisponível — use Sincronizar / Atualizar PIX.</p>
                  )}
                  {c.pix_payload ? (
                    <div style={{ marginTop: 8 }}>
                      <label className={styles.label}>PIX Copia e Cola</label>
                      <textarea
                        className={styles.textarea}
                        readOnly
                        rows={3}
                        value={c.pix_payload}
                      />
                      <button
                        type="button"
                        className={`${styles.btn} ${styles.btnGhost}`}
                        style={{ marginTop: 6 }}
                        onClick={() => void copyText(c.pix_payload!, 'PIX')}
                      >
                        Copiar PIX
                      </button>
                    </div>
                  ) : null}
                </div>
              )}

              {(c.billing_type === 'BOLETO' ||
                c.billing_type === 'UNDEFINED' ||
                c.bank_slip_url ||
                c.identification_field) && (
                <div style={{ marginTop: '1rem' }}>
                  <h4 className={styles.panelTitle}>Boleto</h4>
                  {c.identification_field ? (
                    <div>
                      <label className={styles.label}>Linha digitável</label>
                      <input className={styles.input} readOnly value={c.identification_field} />
                      <button
                        type="button"
                        className={`${styles.btn} ${styles.btnGhost}`}
                        style={{ marginTop: 6 }}
                        onClick={() => void copyText(c.identification_field!, 'Linha digitável')}
                      >
                        Copiar linha digitável
                      </button>
                    </div>
                  ) : (
                    <p className={styles.muted}>Linha digitável ainda não disponível.</p>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                    {c.bank_slip_url ? (
                      <a
                        className={`${styles.btn} ${styles.btnPrimary}`}
                        href={c.bank_slip_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Abrir / baixar boleto PDF
                      </a>
                    ) : null}
                  </div>
                </div>
              )}

              <div style={{ marginTop: '1rem' }}>
                <h4 className={styles.panelTitle}>Links</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {c.invoice_url ? (
                    <a href={c.invoice_url} target="_blank" rel="noreferrer">
                      Link público de pagamento (Asaas)
                    </a>
                  ) : (
                    <span className={styles.muted}>Link de pagamento indisponível</span>
                  )}
                  {c.transaction_receipt_url ? (
                    <a href={c.transaction_receipt_url} target="_blank" rel="noreferrer">
                      Comprovante
                    </a>
                  ) : null}
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: '1.25rem' }}>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnGhost}`}
                  disabled={busy}
                  onClick={() => void runAction('sync')}
                >
                  Sincronizar
                </button>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnGhost}`}
                  disabled={busy}
                  onClick={() => void runAction('reprocess')}
                >
                  Reprocessar
                </button>
                {(c.billing_type === 'PIX' || c.billing_type === 'UNDEFINED') &&
                !isCorporateAsaasPaidStatus(c.local_status) ? (
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnGhost}`}
                    disabled={busy}
                    onClick={() => void runAction('pix')}
                  >
                    Atualizar PIX
                  </button>
                ) : null}
                {isCorporateAsaasActiveStatus(c.local_status) ? (
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnDanger}`}
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          'Cancelar cobrança no Asaas? A Conta a Receber NÃO será cancelada.',
                        )
                      ) {
                        void runAction('cancel');
                      }
                    }}
                  >
                    Cancelar cobrança
                  </button>
                ) : null}
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnDanger}`}
                  disabled={busy || deleteBusy}
                  onClick={openSecureDelete}
                >
                  Excluir vínculo local
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>

        <MasterSecureDeleteModal
          open={deleteOpen && Boolean(c)}
          title="Excluir vínculo Asaas"
          recordLabel={
            c
              ? `${c.asaas_payment_id || c.id} — ${c.description || receivableCode || 'cobrança'}`
              : ''
          }
          amountLabel={c ? formatCurrency(c.original_value) : null}
          linksWarning={
            c && isCorporateAsaasPaidStatus(c.local_status)
              ? 'Cobrança paga: apenas o vínculo local será removido (forceLocalUnlink). Nada será apagado no Asaas remoto.'
              : 'Cobrança em aberto: tentará cancelar no Asaas e remover o registro local. A Conta a Receber permanece.'
          }
          localOnlyOption={
            c && !isCorporateAsaasPaidStatus(c.local_status)
              ? {
                  label: 'Somente vínculo local (não cancelar no Asaas)',
                  checked: deleteLocalOnly,
                  onChange: setDeleteLocalOnly,
                }
              : c && isCorporateAsaasPaidStatus(c.local_status)
                ? {
                    label: 'Confirmar desvínculo local da cobrança paga (forceLocalUnlink)',
                    checked: forceLocalUnlink,
                    onChange: setForceLocalUnlink,
                  }
                : null
          }
          busy={deleteBusy}
          error={deleteError}
          onClose={() => {
            if (deleteBusy) return;
            setDeleteOpen(false);
            setDeleteError(null);
          }}
          onConfirm={(word) => void confirmSecureDelete(word)}
        />
    </>
  );
}
