'use client';

import { useState } from 'react';
import { AlertCircle, Loader2, Search } from 'lucide-react';
import {
  formatCpfCnpj,
  isValidBrazilianTaxDocument,
  onlyDigits,
} from '@/lib/inputMasks';
import type { ClientPortalLookupResponse, ClientPortalMaskedResult } from '@/lib/portal-cliente/types';
import { ClientPortalLookupResults } from '@/components/portal-cliente/ClientPortalLookupResults';

type LookupStep = 'form' | 'results' | 'not_found';

export function ClientPortalEntryForm() {
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
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
      setSelectedLinkKey(data.maskedResults.length === 1 ? data.maskedResults[0].linkKey : null);
      setStep('results');
    } catch {
      setError('Não foi possível consultar seu cadastro. Tente novamente.');
    } finally {
      setLoading(false);
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
