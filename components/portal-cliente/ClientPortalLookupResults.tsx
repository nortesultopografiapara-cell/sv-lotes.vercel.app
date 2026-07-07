'use client';

import type { ClientPortalMaskedResult } from '@/lib/portal-cliente/types';

type Props = {
  results: ClientPortalMaskedResult[];
  selectedLinkKey: string | null;
  onSelect: (linkKey: string) => void;
};

export function ClientPortalLookupResults({ results, selectedLinkKey, onSelect }: Props) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-400">
        {results.length === 1
          ? 'Encontramos um cadastro vinculado ao seu documento:'
          : 'Encontramos mais de um vínculo. Selecione o correto:'}
      </p>

      <ul className="space-y-2" role="listbox" aria-label="Vínculos encontrados">
        {results.map((item) => {
          const selected = selectedLinkKey === item.linkKey;
          return (
            <li key={item.linkKey}>
              <button
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => onSelect(item.linkKey)}
                className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                  selected
                    ? 'border-cyan-500/50 bg-cyan-500/10'
                    : 'border-[#2d3340] bg-[#0b0e14] hover:border-cyan-500/30'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-1 h-4 w-4 shrink-0 rounded-full border ${
                      selected ? 'border-cyan-400 bg-cyan-400' : 'border-gray-500'
                    }`}
                    aria-hidden
                  />
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-semibold text-white">{item.companyName}</p>
                    {item.projectName ? (
                      <p className="text-sm text-gray-300">{item.projectName}</p>
                    ) : null}
                    {item.quadraLote ? (
                      <p className="text-xs text-gray-500">{item.quadraLote}</p>
                    ) : null}
                    {item.linkLabel ? (
                      <p className="text-xs text-amber-300/90">{item.linkLabel}</p>
                    ) : null}
                    <div className="pt-1 text-xs text-gray-500 space-y-0.5">
                      <p>Nome: {item.customerNameMasked}</p>
                      {item.phoneMasked ? <p>Telefone: {item.phoneMasked}</p> : null}
                      <p>Status: {item.status}</p>
                    </div>
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-gray-500">
        Na próxima etapa você confirmará o acesso por WhatsApp. Detalhes de contratos e parcelas
        só serão exibidos após a validação do código.
      </p>
    </div>
  );
}
