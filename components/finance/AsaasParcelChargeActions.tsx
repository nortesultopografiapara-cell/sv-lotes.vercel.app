'use client';

import { useState } from 'react';
import {
  Banknote,
  Copy,
  ExternalLink,
  Loader2,
  QrCode,
  RefreshCw,
} from 'lucide-react';
import type { CompanyAsaasChargeResponse } from '@/lib/finance/companyAsaasChargeTypes';
import { FinanceParcelActionBtn } from '@/components/finance/FinancePremiumUI';

type Props = {
  disabled?: boolean;
  charge: CompanyAsaasChargeResponse | null;
  loading?: boolean;
  onGeneratePix: () => void;
  onGenerateBoleto: () => void;
  onRefreshStatus: () => void;
};

async function copyText(value: string, label: string) {
  if (!value) {
    alert(`${label} indisponível.`);
    return;
  }
  try {
    await navigator.clipboard.writeText(value);
    alert(`${label} copiado.`);
  } catch {
    alert(`Não foi possível copiar ${label.toLowerCase()}.`);
  }
}

export function AsaasParcelChargeActions({
  disabled = false,
  charge,
  loading = false,
  onGeneratePix,
  onGenerateBoleto,
  onRefreshStatus,
}: Props) {
  const [open, setOpen] = useState(false);
  const paymentLink = charge?.paymentLink || charge?.invoiceUrl || charge?.bankSlipUrl || '';
  const hasActiveCharge =
    charge && ['PENDING', 'REGISTERED', 'OVERDUE'].includes(charge.status);

  return (
    <div className="relative inline-flex items-center">
      <FinanceParcelActionBtn
        title="Cobrança Asaas"
        onClick={() => setOpen((v) => !v)}
        className="hover:!text-violet-400"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Banknote className="w-4 h-4" />}
      </FinanceParcelActionBtn>

      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Fechar menu Asaas"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full z-50 mt-1 min-w-[210px] rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-1 shadow-xl">
            <button
              type="button"
              disabled={disabled || loading}
              onClick={() => {
                setOpen(false);
                onGeneratePix();
              }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs hover:bg-[var(--bg-elevated)] disabled:opacity-50"
            >
              <QrCode className="w-3.5 h-3.5" />
              Gerar PIX
            </button>
            <button
              type="button"
              disabled={disabled || loading}
              onClick={() => {
                setOpen(false);
                onGenerateBoleto();
              }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs hover:bg-[var(--bg-elevated)] disabled:opacity-50"
            >
              <Banknote className="w-3.5 h-3.5" />
              Gerar Boleto
            </button>
            {charge ? (
              <>
                <div className="my-1 border-t border-[var(--border-color)]" />
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setOpen(false);
                    onRefreshStatus();
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs hover:bg-[var(--bg-elevated)] disabled:opacity-50"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Atualizar status
                </button>
                {paymentLink ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        void copyText(paymentLink, 'Link de pagamento');
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs hover:bg-[var(--bg-elevated)]"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Copiar link
                    </button>
                    <a
                      href={paymentLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setOpen(false)}
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs hover:bg-[var(--bg-elevated)]"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Abrir {charge.billingType === 'BOLETO' ? 'boleto' : 'link'}
                    </a>
                  </>
                ) : null}
                {charge.pixCopyPaste ? (
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      void copyText(charge.pixCopyPaste || '', 'Pix copia e cola');
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs hover:bg-[var(--bg-elevated)]"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copiar Pix
                  </button>
                ) : null}
                {hasActiveCharge ? (
                  <p className="px-2.5 py-1 text-[10px] text-[var(--text-muted)]">
                    Status: {charge.status}
                  </p>
                ) : null}
              </>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
