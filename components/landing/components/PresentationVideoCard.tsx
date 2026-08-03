'use client';

import { useState } from 'react';
import { Check, Play } from 'lucide-react';
import {
  LANDING_PRESENTATION_THUMB_HQ,
  LANDING_PRESENTATION_THUMB_MAX,
  LANDING_PRESENTATION_URL,
} from '../constants/landingConfig';

const OVERLAY_ITEMS = [
  'Mapa GIS',
  'Venda de Lotes',
  'Contratos',
  'Financeiro',
  'Cobranças',
  'Portal do Cliente',
] as const;

type Props = {
  id?: string;
  className?: string;
  /** Hero está na primeira dobra — carregar miniatura com prioridade. */
  priority?: boolean;
};

export function PresentationVideoCard({
  id = 'cta_video_apresentacao',
  className = '',
  priority = false,
}: Props) {
  const [thumbSrc, setThumbSrc] = useState(LANDING_PRESENTATION_THUMB_MAX);

  return (
    <a
      href={LANDING_PRESENTATION_URL}
      id={id}
      data-cta={id}
      target="_blank"
      rel="noopener noreferrer"
      className={`landing-video-card ${className}`.trim()}
      aria-label="Assistir vídeo de apresentação do SV LOTES no YouTube"
    >
      <p className="landing-video-card-kicker">
        <Play className="landing-video-card-kicker-icon" fill="currentColor" aria-hidden />
        Veja o sistema funcionando
      </p>

      <div className="landing-video-card-media">
        {/* eslint-disable-next-line @next/next/no-img-element -- fallback dinâmico maxres → hq */}
        <img
          src={thumbSrc}
          alt="Vídeo de apresentação do sistema SV LOTES"
          className="landing-video-card-thumb"
          width={1280}
          height={720}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          onError={() => {
            if (thumbSrc !== LANDING_PRESENTATION_THUMB_HQ) {
              setThumbSrc(LANDING_PRESENTATION_THUMB_HQ);
            }
          }}
        />
        <span className="landing-video-card-play" aria-hidden>
          <Play className="landing-video-card-play-icon" fill="currentColor" />
        </span>

        <div className="landing-video-card-overlay" aria-hidden>
          <ul className="landing-video-card-overlay-list">
            {OVERLAY_ITEMS.map((item) => (
              <li key={item}>
                <Check className="w-3.5 h-3.5 shrink-0" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
          <span className="landing-video-card-overlay-cta">
            <Play className="w-3.5 h-3.5 shrink-0" fill="currentColor" aria-hidden />
            Assistir apresentação completa
          </span>
        </div>
      </div>

      <div className="landing-video-card-body">
        <h3 className="landing-video-card-title">Apresentação completa (3min40s)</h3>
        <p className="landing-video-card-desc">
          Conheça o funcionamento do SV LOTES em poucos minutos.
        </p>
      </div>
    </a>
  );
}
