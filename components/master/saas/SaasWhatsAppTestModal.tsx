'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { SAAS_WHATSAPP_TEST_MESSAGE } from '@/lib/saasWhatsAppTest';

type Props = {
  open: boolean;
  userId: string;
  whatsappConfigured: boolean;
  onClose: () => void;
};

export function SaasWhatsAppTestModal({ open, userId, whatsappConfigured, onClose }: Props) {
  const [phone, setPhone] = useState('');
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setPhone('');
    setFeedback(null);
    setSending(false);
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFeedback(null);

    const trimmed = phone.trim();
    if (!trimmed) {
      setFeedback({ type: 'error', text: 'Informe o número para teste.' });
      return;
    }

    if (!whatsappConfigured) {
      setFeedback({ type: 'error', text: 'Z-API não configurada no servidor.' });
      return;
    }

    setSending(true);
    try {
      const res = await fetch('/api/master/saas-whatsapp-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, phone: trimmed }),
      });
      const json = await res.json();

      if (!res.ok) {
        setFeedback({ type: 'error', text: json.error || 'Falha ao enviar teste.' });
        return;
      }

      setFeedback({
        type: 'ok',
        text: `Mensagem enviada para ${json.normalizedPhone || trimmed}.`,
      });
    } catch {
      setFeedback({ type: 'error', text: 'Erro de rede ao enviar teste.' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#11161d] shadow-xl">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <h3 className="text-lg font-bold text-white">Testar WhatsApp</h3>
            <p className="text-sm text-gray-400">Envio via Z-API (mesmo provider dos lembretes)</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="rounded-lg p-2 text-gray-400 hover:bg-white/5 hover:text-white disabled:opacity-50"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label htmlFor="saas-whatsapp-test-phone" className="block text-xs font-medium text-gray-400 mb-2">
              Número WhatsApp
            </label>
            <input
              id="saas-whatsapp-test-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(94) 99100-1988"
              className="w-full rounded-lg border border-white/10 bg-[#0B0E14] px-3 py-2 text-sm text-white placeholder:text-gray-600"
              disabled={sending}
            />
            <p className="mt-2 text-[11px] text-gray-500">
              DDI 55 será aplicado automaticamente quando necessário.
            </p>
          </div>

          <div className="rounded-lg border border-white/10 bg-[#0B0E14]/60 px-3 py-3">
            <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">Mensagem</p>
            <p className="text-sm text-gray-200 whitespace-pre-wrap">{SAAS_WHATSAPP_TEST_MESSAGE}</p>
          </div>

          {!whatsappConfigured ? (
            <p className="text-sm text-amber-300">
              Configure ZAPI_INSTANCE_ID e ZAPI_INSTANCE_TOKEN para habilitar o envio.
            </p>
          ) : null}

          {feedback ? (
            <p
              className={`text-sm ${
                feedback.type === 'ok' ? 'text-emerald-300' : 'text-red-300'
              }`}
            >
              {feedback.text}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={sending}
              className="px-4 py-2 rounded-lg border border-white/10 text-gray-300 text-sm hover:bg-white/5 disabled:opacity-50"
            >
              Fechar
            </button>
            <button
              type="submit"
              disabled={sending || !whatsappConfigured}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-sm font-semibold text-white"
            >
              {sending ? 'Enviando…' : 'Enviar teste'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
