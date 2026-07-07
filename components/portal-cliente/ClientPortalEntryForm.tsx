'use client';

import { useState } from 'react';
import { Loader2, MessageCircle } from 'lucide-react';
import {
  formatCpfCnpj,
  isValidBrazilianTaxDocument,
  onlyDigits,
} from '@/lib/inputMasks';

export function ClientPortalEntryForm() {
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const digits = onlyDigits(cpfCnpj);
    if (!isValidBrazilianTaxDocument(digits)) {
      setError('Informe um CPF ou CNPJ válido.');
      return;
    }

    setLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 400));
    setLoading(false);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-6 text-center space-y-3">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
          <MessageCircle className="h-6 w-6 text-emerald-400" aria-hidden />
        </div>
        <h2 className="text-lg font-semibold text-white">Próxima etapa em breve</h2>
        <p className="text-sm text-gray-400 leading-relaxed">
          Após informar seu CPF ou CNPJ, você receberá um código de 6 dígitos no WhatsApp
          cadastrado para acessar seus contratos e parcelas com segurança.
        </p>
        <p className="text-xs text-gray-500">
          Esta versão ainda não envia o código — lookup e OTP serão liberados nas próximas etapas.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <div className="space-y-2">
        <label htmlFor="portal-cpf-cnpj" className="block text-sm font-medium text-gray-200">
          CPF ou CNPJ
        </label>
        <input
          id="portal-cpf-cnpj"
          name="cpf_cnpj"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="000.000.000-00"
          value={cpfCnpj}
          onChange={(event) => {
            setCpfCnpj(formatCpfCnpj(event.target.value));
            if (error) setError(null);
          }}
          className="w-full rounded-lg border border-[#2d3340] bg-[#0b0e14] px-4 py-3 text-white placeholder:text-gray-600 focus:border-cyan-500/60 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? 'portal-cpf-error' : 'portal-cpf-hint'}
        />
        <p id="portal-cpf-hint" className="text-xs text-gray-500">
          Usaremos seu documento apenas para localizar seus vínculos. O acesso exige confirmação por
          WhatsApp.
        </p>
        {error ? (
          <p id="portal-cpf-error" className="text-sm text-red-400" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Continuando…
          </>
        ) : (
          'Continuar'
        )}
      </button>
    </form>
  );
}
