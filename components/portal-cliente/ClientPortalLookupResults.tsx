'use client';

import type { ClientPortalMaskedResult } from '@/lib/portal-cliente/types';

type Props = {
  results: ClientPortalMaskedResult[];
  selectedLinkKey: string | null;
  onSelect: (linkKey: string) => void;
};

function parseQuadraLote(quadraLote: string | null): { quadra: string | null; lote: string | null } {
  if (!quadraLote) return { quadra: null, lote: null };
  const match = quadraLote.match(/^QD\s+(.+?)\s+LT\s+(.+)$/i);
  if (match) return { quadra: match[1], lote: match[2] };
  if (quadraLote.startsWith('Quadra ')) {
    return { quadra: quadraLote.replace(/^Quadra\s+/i, ''), lote: null };
  }
  if (quadraLote.startsWith('Lote ')) {
    return { quadra: null, lote: quadraLote.replace(/^Lote\s+/i, '') };
  }
  return { quadra: null, lote: null };
}

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
          const { quadra, lote } = parseQuadraLote(item.quadraLote);
          const empreendimento =
            item.projectName || (item.linkLabel === 'Contrato SaaS' ? item.linkLabel : null);

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
                  <div className="min-w-0 space-y-2">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-cyan-400/80">
                        Empreendimento
                      </p>
                      <p className="text-sm font-semibold text-white">
                        {empreendimento || 'Cadastro localizado'}
                      </p>
                    </div>

                    {lote ? (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                          Lote
                        </p>
                        <p className="text-sm text-gray-200">{lote}</p>
                      </div>
                    ) : null}

                    {quadra ? (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                          Quadra
                        </p>
                        <p className="text-sm text-gray-200">{quadra}</p>
                      </div>
                    ) : null}

                    <div className="space-y-1 border-t border-white/5 pt-2 text-xs text-gray-500">
                      <p>
                        <span className="text-gray-400">Empresa:</span>{' '}
                        <span className="text-gray-300">{item.companyName}</span>
                      </p>
                      <p>
                        <span className="text-gray-400">Nome:</span> {item.customerNameMasked}
                      </p>
                      {item.phoneMasked ? (
                        <p>
                          <span className="text-gray-400">Telefone:</span> {item.phoneMasked}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
