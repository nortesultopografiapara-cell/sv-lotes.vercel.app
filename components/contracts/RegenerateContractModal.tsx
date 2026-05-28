'use client';

import { RefreshCw, X } from 'lucide-react';

type Props = {
  open: boolean;
  title?: string;
  message?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function RegenerateContractModal({
  open,
  title = 'Regenerar contrato?',
  message = 'O contrato será recriado com os dados atuais do cliente, lote, venda, parcelas e empresa.\nA versão anterior será mantida no histórico.',
  busy = false,
  onCancel,
  onConfirm,
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-[#1a1f2b] border border-[#2d3340] rounded-xl max-w-md w-full shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-[#2d3340]">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-amber-400" />
            {title}
          </h3>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="p-1 text-gray-400 hover:text-white rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="p-4 text-sm text-gray-300 whitespace-pre-line">{message}</p>
        <div className="flex gap-3 p-4 border-t border-[#2d3340]">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 px-4 py-2 rounded-lg bg-[#2d3340] text-gray-200 text-sm font-semibold hover:bg-[#3d4450] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="flex-1 px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-500 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
            Regenerar
          </button>
        </div>
      </div>
    </div>
  );
}
