'use client';

import type { SaasTimelineEvent } from '@/lib/masterSaasPanel';
import { saasTimelineMeta } from '@/lib/masterSaasPanel';

type Props = {
  events: SaasTimelineEvent[];
  emptyMessage?: string;
};

export function SaasTimeline({ events, emptyMessage = 'Nenhum evento registrado.' }: Props) {
  if (!events.length) {
    return <p className="text-sm text-gray-500 py-4">{emptyMessage}</p>;
  }

  return (
    <ol className="relative border-l border-white/10 ml-3 space-y-4">
      {events.map((ev) => {
        const meta = saasTimelineMeta(ev.type);
        return (
          <li key={ev.id} className="ml-5">
            <span
              className={`absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full ring-4 ring-[#11161d] ${meta.tone}`}
            />
            <p className="text-[13px] font-medium text-white">{ev.title}</p>
            <p className="text-[11px] text-gray-500">
              {new Date(ev.at).toLocaleString('pt-BR')}
            </p>
            {ev.detail ? <p className="text-[12px] text-gray-400 mt-0.5">{ev.detail}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}
