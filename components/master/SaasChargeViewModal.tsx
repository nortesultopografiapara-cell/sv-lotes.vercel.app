'use client';

import { formatDateBr } from '@/lib/saasSubscription';
import { formatSaasCurrency } from '@/lib/companyPricing';
import type { SaasInvoiceChargeRow } from '@/lib/saasInvoiceChargeView';
import { truncatePaymentId } from '@/lib/saasInvoiceChargeView';
import { X, Copy, ExternalLink } from 'lucide-react';

type Props = {
  row: SaasInvoiceChargeRow | null;
  onClose: () => void;
  onCopyPix: (pix: string) => void;
};

export function SaasChargeViewModal({ row, onClose, onCopyPix }: Props) {
  if (!row) return null;

  const pix = row.pixCopyPaste || '';
  const qrSrc =
    row.pixQrCode && (row.pixQrCode.startsWith('data:') || row.pixQrCode.startsWith('http'))
      ? row.pixQrCode
      : row.pixQrCode
        ? `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(row.pixQrCode)))}`
        : null;

  const title = row.billingType === 'BOLETO' ? 'Cobrança Boleto' : 'Cobrança PIX';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#11161d] shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <h3 className="text-[16px] font-bold text-white">{title}</h3>
            <p className="text-[12px] text-gray-400">{row.companyName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 hover:bg-white/5 hover:text-white"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="grid grid-cols-2 gap-3 text-[13px]">
            <div>
              <p className="text-gray-500">Valor</p>
              <p className="font-semibold text-emerald-300">{formatSaasCurrency(row.amount)}</p>
            </div>
            <div>
              <p className="text-gray-500">Vencimento</p>
              <p className="text-white">{formatDateBr(row.dueDate)}</p>
            </div>
            <div>
              <p className="text-gray-500">Forma</p>
              <p className="text-white">{row.billingType}</p>
            </div>
            <div>
              <p className="text-gray-500">Competência</p>
              <p className="text-white">{row.referenceMonth}</p>
            </div>
            <div>
              <p className="text-gray-500">Status interno</p>
              <p className="text-amber-300">{row.chargeStatus || row.invoiceStatus}</p>
            </div>
            <div>
              <p className="text-gray-500">Status Asaas</p>
              <p className="text-blue-300">{row.asaasStatus}</p>
            </div>
          </div>

          {qrSrc && row.billingType === 'PIX' && (
            <div className="flex justify-center rounded-xl border border-white/10 bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrSrc} alt="QR Code PIX" className="h-44 w-44 object-contain" />
            </div>
          )}

          {pix && row.billingType === 'PIX' && (
            <div>
              <p className="mb-1 text-[12px] text-gray-400">Pix Copia e Cola</p>
              <textarea
                readOnly
                value={pix}
                rows={3}
                className="w-full rounded-lg border border-white/10 bg-[#0B0E14] px-3 py-2 text-[11px] text-gray-200"
              />
              <button
                type="button"
                onClick={() => onCopyPix(pix)}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-gray-200 hover:bg-white/5"
              >
                <Copy className="h-3.5 w-3.5" /> Copiar PIX
              </button>
            </div>
          )}

          {row.bankSlipIdentification && (
            <div className="rounded-lg border border-white/10 bg-[#0B0E14] px-3 py-2 text-[12px]">
              <p className="text-gray-500">Identificação boleto</p>
              <p className="font-mono text-gray-200 break-all">{row.bankSlipIdentification}</p>
            </div>
          )}

          <div className="rounded-lg border border-white/10 bg-[#0B0E14] px-3 py-2 text-[12px]">
            <p className="text-gray-500">Payment ID</p>
            <p className="font-mono text-gray-200">{row.paymentId || '—'}</p>
            {row.paymentId && (
              <p className="text-[11px] text-gray-500">{truncatePaymentId(row.paymentId)}</p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {(row.invoiceUrl || row.paymentUrl) && (
              <a
                href={row.invoiceUrl || row.paymentUrl || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500/30 px-3 py-2 text-[12px] text-blue-300 hover:bg-blue-500/10"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Abrir fatura Asaas
              </a>
            )}
            {row.bankSlipUrl && (
              <a
                href={row.bankSlipUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 px-3 py-2 text-[12px] text-amber-300 hover:bg-amber-500/10"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Abrir boleto
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
