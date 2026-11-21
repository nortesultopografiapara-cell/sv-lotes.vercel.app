'use client';

import { useState } from 'react';
import { Construction } from 'lucide-react';
import { listFinancialGatewayProviders } from '@/lib/finance/FinancialGateway';
import { FINANCIAL_INTEGRATION_VISIBLE_BANK_CODES } from '@/lib/finance/financialIntegrationUi';
import { C6BankConfigPanel } from '@/components/finance/C6BankConfigPanel';
import { InterBankConfigPanel } from '@/components/finance/InterBankConfigPanel';

const VISIBLE_BANK_CODES = new Set(FINANCIAL_INTEGRATION_VISIBLE_BANK_CODES);

const DEVELOPMENT_BANKS = listFinancialGatewayProviders().filter((provider) =>
  VISIBLE_BANK_CODES.has(provider.code),
);

type Props = {
  readOnlyDemo?: boolean;
};

export function BanksDevelopmentPanel({ readOnlyDemo = false }: Props) {
  const [interOpen, setInterOpen] = useState(false);
  const [c6Open, setC6Open] = useState(false);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
        <div className="flex items-start gap-3">
          <Construction className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              Bancos nativos
            </p>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              O <strong className="font-semibold text-[var(--text-primary)]">Inter</strong> já
              permite cadastrar credenciais (Fase A). Emissão de cobranças virá nas próximas fases.
              O C6 Bank aceita cadastro com emissão desativada. Nubank e Cora permanecem em preparação.
              O Asaas continua na aba própria, sem alteração.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {DEVELOPMENT_BANKS.map((bank) => {
          const isInter = bank.code === 'INTER';
          return (
            <div
              key={bank.code}
              className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-[var(--text-primary)]">{bank.label}</p>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    isInter
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'bg-amber-500/15 text-amber-300'
                  }`}
                >
                  {isInter ? 'Configuração' : 'Em desenvolvimento'}
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-2">
                {isInter
                  ? 'Cadastre Client ID, Secret, certificado e chave privada.'
                  : 'Provider registrado na arquitetura — configuração indisponível nesta versão.'}
              </p>
              {isInter ? (
                <button
                  type="button"
                  onClick={() => setInterOpen((v) => !v)}
                  className="mt-3 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-800"
                >
                  {interOpen ? 'Ocultar configuração' : 'Configurar Banco Inter'}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold text-[var(--text-primary)]">C6 Bank</p>
          <span className="inline-flex rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
            Emissão desativada
          </span>
        </div>
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          Client ID, Secret, certificado e chave privada. A emissão não pode ser ligada nesta tela.
        </p>
        <button
          type="button"
          onClick={() => setC6Open((open) => !open)}
          className="mt-3 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-800"
        >
          {c6Open ? 'Ocultar configuração' : 'Configurar C6 Bank'}
        </button>
      </div>

      {c6Open ? <C6BankConfigPanel readOnlyDemo={readOnlyDemo} /> : null}

      {interOpen ? (
        <InterBankConfigPanel
          readOnlyDemo={readOnlyDemo}
          onClose={() => setInterOpen(false)}
        />
      ) : null}
    </div>
  );
}
