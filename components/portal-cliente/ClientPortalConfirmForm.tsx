'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, MessageCircle } from 'lucide-react';
import {
  clearClientPortalOtpContext,
  readClientPortalOtpContext,
} from '@/components/portal-cliente/ClientPortalEntryForm';

export function ClientPortalConfirmForm() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [context, setContext] = useState<ReturnType<typeof readClientPortalOtpContext>>(null);

  useEffect(() => {
    const stored = readClientPortalOtpContext();
    if (!stored) {
      router.replace('/portal-cliente');
      return;
    }
    setContext(stored);
  }, [router]);

  const handleVerify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!context) return;
    setError(null);
    setLoading(true);

    try {
      const response = await fetch('/api/portal-cliente/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cpf_cnpj: context.cpfCnpj,
          linkKey: context.linkKey,
          code,
        }),
      });

      const data = (await response.json()) as {
        ok?: boolean;
        message?: string;
        redirectTo?: string;
      };
      if (!response.ok || !data.ok) {
        setError(data.message || 'Código inválido. Tente novamente.');
        return;
      }

      clearClientPortalOtpContext();
      router.push(data.redirectTo || '/portal-cliente/painel');
    } catch {
      setError('Não foi possível validar o código. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!context) return;
    setError(null);
    setResending(true);

    try {
      const response = await fetch('/api/portal-cliente/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cpf_cnpj: context.cpfCnpj,
          linkKey: context.linkKey,
          resend: true,
        }),
      });

      const data = (await response.json()) as {
        ok?: boolean;
        phoneMasked?: string | null;
        message?: string;
      };

      if (!response.ok || !data.ok) {
        setError(data.message || 'Não foi possível reenviar o código.');
        return;
      }

      if (data.phoneMasked) {
        setContext({ ...context, phoneMasked: data.phoneMasked });
      }
    } catch {
      setError('Não foi possível reenviar o código.');
    } finally {
      setResending(false);
    }
  };

  if (!context) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-cyan-400" aria-hidden />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
        <MessageCircle className="h-5 w-5 shrink-0 text-cyan-400 mt-0.5" aria-hidden />
        <div className="space-y-2 text-sm text-gray-300">
          <p>Enviamos um código para o WhatsApp cadastrado.</p>
          {context.phoneMasked ? (
            <p>
              <span className="text-gray-400">Telefone:</span> {context.phoneMasked}
            </p>
          ) : null}
        </div>
      </div>

      <form onSubmit={handleVerify} className="space-y-4" noValidate>
        <div className="space-y-2">
          <label htmlFor="portal-otp-code" className="block text-sm font-medium text-gray-200">
            Código
          </label>
          <input
            id="portal-otp-code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            maxLength={6}
            value={code}
            onChange={(event) => {
              setCode(event.target.value.replace(/\D/g, '').slice(0, 6));
              if (error) setError(null);
            }}
            className="w-full rounded-lg border border-[#2d3340] bg-[#0b0e14] px-4 py-3 text-center text-lg tracking-[0.35em] text-white placeholder:text-gray-600 focus:border-cyan-500/60 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
          />
          {error ? (
            <p className="text-sm text-red-400" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={loading || code.length !== 6}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Confirmando…
            </>
          ) : (
            'Confirmar'
          )}
        </button>
      </form>

      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={handleResend}
          disabled={resending}
          className="font-medium text-cyan-400 hover:text-cyan-300 disabled:opacity-50"
        >
          {resending ? 'Reenviando…' : 'Reenviar código'}
        </button>
        <Link href="/portal-cliente" className="text-gray-400 hover:text-gray-200">
          Voltar
        </Link>
      </div>
    </div>
  );
}
