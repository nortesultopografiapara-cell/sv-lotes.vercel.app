'use client';

import { useState } from 'react';
import { Play } from 'lucide-react';
import {
  LANDING_PRESENTATION_DURATION,
  LANDING_PRESENTATION_THUMB_HQ,
  LANDING_PRESENTATION_THUMB_MAX,
  LANDING_PRESENTATION_URL,
} from '../constants/landingConfig';

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
        <span className="landing-video-card-badge">Vídeo de apresentação</span>
        <span className="landing-video-card-duration">{LANDING_PRESENTATION_DURATION}</span>
      </div>
      <div className="landing-video-card-body">
        <h3 className="landing-video-card-title">Conheça o SV LOTES em 3 minutos</h3>
        <p className="landing-video-card-desc">
          Veja o Mapa GIS, vendas, contratos, financeiro e Portal do Cliente funcionando na prática.
        </p>
        <span className="landing-video-card-cta">
          <Play className="w-3.5 h-3.5 shrink-0" aria-hidden />
          Assistir apresentação completa
        </span>
      </div>
    </a>
  );
}
