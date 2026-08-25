'use client';

import { useMemo, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { formatLotAuditDescription } from '@/lib/currencyBrl';
import type { FormattedLotAuditEvent } from '@/lib/lotAudit';
import {
  filterLotHistoryEvents,
  formatLotHistoryEventCount,
  groupLotHistoryByDate,
  listLotHistoryFilterChips,
  lotHistoryTerminationDocumentLinks,
  lotHistoryTimeLabel,
  resolveLotHistoryActor,
  splitLotHistoryDescription,
  type LotHistoryFilterId,
} from '@/lib/lotHistoryPresentation';

type Props = {
  events: FormattedLotAuditEvent[];
  loading: boolean;
  userNames: Record<string, string>;
};

export function LotHistoryPanel({ events, loading, userNames }: Props) {
  const [filterId, setFilterId] = useState<LotHistoryFilterId>('all');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const chips = useMemo(() => listLotHistoryFilterChips(events), [events]);
  const visible = useMemo(
    () => filterLotHistoryEvents(events, filterId, query),
    [events, filterId, query],
  );
  const groups = useMemo(() => groupLotHistoryByDate(visible), [visible]);
  const showSearch = events.length > 0;

  return (
    <div className="gis-lot-history flex flex-col min-h-0 h-full">
      <div className="gis-lot-history-header shrink-0">
        <div className="flex items-baseline justify-between gap-3">
          <h4 className="text-sm font-bold text-gray-900">Histórico do lote</h4>
          <p className="text-[11px] font-semibold text-gray-500 tabular-nums">
            {formatLotHistoryEventCount(visible.length)}
          </p>
        </div>
        {chips.length > 1 ? (
          <div className="gis-lot-history-filters mt-2 flex flex-wrap gap-1.5">
            {chips.map((chip) => {
              const active = chip.id === filterId;
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setFilterId(chip.id)}
                  className={`px-2 py-1 rounded-md text-[10px] font-bold border transition-colors ${
                    active
                      ? 'bg-blue-50 border-blue-300 text-blue-800'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:text-gray-800'
                  }`}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>
        ) : null}
        {showSearch ? (
          <label className="gis-lot-history-search mt-2 flex items-center gap-2 rounded-md border border-gray-200 bg-white px-2 py-1.5">
            <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por título ou descrição"
              className="min-w-0 flex-1 bg-transparent text-[11px] text-gray-800 placeholder:text-gray-400 outline-none"
            />
          </label>
        ) : null}
      </div>

      <div className="gis-lot-history-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5 mt-2.5">
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
          </div>
        ) : events.length === 0 ? (
          <p className="gis-lot-history-empty text-[12px] text-gray-500 py-8 text-center">
            Nenhum evento registrado para este lote.
          </p>
        ) : visible.length === 0 ? (
          <p className="gis-lot-history-empty text-[12px] text-gray-500 py-8 text-center">
            Nenhum evento encontrado para este filtro.
          </p>
        ) : (
          <div className="space-y-4 pb-4">
            {groups.map((group) => (
              <section key={group.dateKey}>
                <h5 className="gis-lot-history-day text-[10px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">
                  {group.dateLabel}
                </h5>
                <ul className="space-y-2">
                  {group.events.map((entry) => {
                    const formatted = formatLotAuditDescription(entry.description);
                    const split = splitLotHistoryDescription(formatted);
                    const open = Boolean(expanded[entry.id]);
                    const actor = resolveLotHistoryActor(entry.userId, userNames);
                    const meta = [actor, entry.sourceLabel].filter(Boolean).join(' · ');
                    const needsToggle = split.isLong || split.hasTechnical;
                    const shown = open ? split.full : split.preview;
                    const termLinks = lotHistoryTerminationDocumentLinks(entry);

                    return (
                      <li key={entry.id} className="gis-lot-history-card">
                        <div className="flex items-start gap-2.5">
                          <span className="gis-lot-history-time shrink-0 text-[11px] font-mono font-semibold text-gray-500 pt-0.5">
                            {lotHistoryTimeLabel(entry.createdAt)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-semibold text-gray-900 text-[12px] leading-tight">
                                {entry.title}
                              </p>
                              <span
                                className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${entry.badgeClass}`}
                              >
                                {entry.actionLabel}
                              </span>
                            </div>
                            {shown ? (
                              <p
                                className={`text-[11px] text-gray-600 mt-1 leading-snug ${
                                  !open && split.isLong ? 'gis-lot-history-clamp' : ''
                                }`}
                              >
                                {shown}
                              </p>
                            ) : null}
                            {needsToggle ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setExpanded((prev) => ({
                                    ...prev,
                                    [entry.id]: !open,
                                  }))
                                }
                                className="mt-1 text-[10px] font-bold text-blue-700 hover:text-blue-800"
                              >
                                {open
                                  ? 'Ver menos'
                                  : split.hasTechnical
                                    ? 'Ver detalhes'
                                    : 'Ver mais'}
                              </button>
                            ) : null}
                            {termLinks ? (
                              <button
                                type="button"
                                onClick={() =>
                                  window.open(
                                    termLinks.viewHref,
                                    '_blank',
                                    'noopener,noreferrer',
                                  )
                                }
                                className="mt-1.5 text-[10px] font-bold text-blue-700 hover:text-blue-800"
                              >
                                Ver documento
                              </button>
                            ) : null}
                            {meta ? (
                              <p className="text-[10px] text-gray-400 mt-1.5">
                                {meta}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
