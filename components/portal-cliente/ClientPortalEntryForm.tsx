'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AlertCircle, Loader2, Search } from 'lucide-react';
import {
  formatCpfCnpj,
  isValidBrazilianTaxDocument,
  onlyDigits,
} from '@/lib/inputMasks';
import type { ClientPortalLookupResponse, ClientPortalMaskedResult } from '@/lib/portal-cliente/types';
import { ClientPortalLookupResults } from '@/components/portal-cliente/ClientPortalLookupResults';

const PORTAL_OTP_STORAGE_KEY = 'client_portal_otp_context';

type LookupStep = 'form' | 'results' | 'not_found';

export type ClientPortalOtpContext = {
  cpfCnpj: string;
  linkKey: string;
  phoneMasked: string | null;
};

export function readClientPortalOtpContext(): ClientPortalOtpContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(PORTAL_OTP_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ClientPortalOtpContext;
  } catch {
    return null;
  }
}

export function writeClientPortalOtpContext(context: ClientPortalOtpContext): void {
  sessionStorage.setItem(PORTAL_OTP_STORAGE_KEY, JSON.stringify(context));
}

export function clearClientPortalOtpContext(): void {
  sessionStorage.removeItem(PORTAL_OTP_STORAGE_KEY);
}

export function ClientPortalEntryForm() {
  const router = useRouter();
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [step, setStep] = useState<LookupStep>('form');
  const [results, setResults] = useState<ClientPortalMaskedResult[]>([]);
  const [selectedLinkKey, setSelectedLinkKey] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const digits = onlyDigits(cpfCnpj);
    if (!isValidBrazilianTaxDocument(digits)) {
      setError('Informe um CPF ou CNPJ válido.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/portal-cliente/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cpf_cnpj: digits }),
      });

      if (response.status === 404) {
        setError('Portal do Cliente indisponível no momento.');
        return;
      }

      const data = (await response.json()) as ClientPortalLookupResponse;
      if (!data.found || data.maskedResults.length === 0) {
        setStep('not_found');
        setResults([]);
        setSelectedLinkKey(null);
        return;
      }

      setResults(data.maskedResults);
      setSelectedLinkKey(null);
      setStep('results');
    } catch {
      setError('Não foi possível consultar seu cadastro. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = async () => {
    if (!selectedLinkKey) return;
    const digits = onlyDigits(cpfCnpj);
    setError(null);
    setSendingOtp(true);

    try {
      const response = await fetch('/api/portal-cliente/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cpf_cnpj: digits, linkKey: selectedLinkKey }),
      });

      const data = (await response.json()) as {
        ok?: boolean;
        phoneMasked?: string | null;
        message?: string;
      };

      if (!response.ok || !data.ok) {
        setError(data.message || 'Não foi possível enviar o código por WhatsApp.');
        return;
      }

      writeClientPortalOtpContext({
        cpfCnpj: digits,
        linkKey: selectedLinkKey,
        phoneMasked: data.phoneMasked ?? null,
      });
      router.push('/portal-cliente/confirmar');
    } catch {
      setError('Não foi possível enviar o código. Tente novamente.');
    } finally {
      setSendingOtp(false);
    }
  };

  const handleBack = () => {
    setStep('form');
    setResults([]);
    setSelectedLinkKey(null);
    setError(null);
  };

  if (step === 'not_found') {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10">
          <AlertCircle className="h-6 w-6 text-amber-400" aria-hidden />
        </div>
        <p className="text-sm text-gray-300">
          Nenhum cadastro foi localizado para este CPF/CNPJ.
        </p>
        <button
          type="button"
          onClick={handleBack}
          className="text-sm font-medium text-cyan-400 hover:text-cyan-300"
        >
          Tentar outro documento
        </button>
      </div>
    );
  }

  if (step === 'results') {
    return (
      <div className="space-y-5">
        <ClientPortalLookupResults
          results={results}
          selectedLinkKey={selectedLinkKey}
          onSelect={setSelectedLinkKey}
        />

        {error ? (
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          onClick={handleContinue}
          disabled={!selectedLinkKey || sendingOtp}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sendingOtp ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Enviando código…
            </>
          ) : (
            'Continuar'
          )}
        </button>

        <button
          type="button"
          onClick={handleBack}
          className="w-full text-sm font-medium text-gray-400 hover:text-gray-200"
        >
          Voltar e informar outro CPF/CNPJ
        </button>
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
            Consultando…
          </>
        ) : (
          <>
            <Search className="h-4 w-4" aria-hidden />
            Continuar
          </>
        )}
      </button>
    </form>
  );
}
