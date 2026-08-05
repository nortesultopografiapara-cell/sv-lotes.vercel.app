'use client';

import Link from 'next/link';
import { Calendar, Map, MessageCircle, Play } from 'lucide-react';
import {
  trackClickWhatsApp,
  trackSolicitarDemonstracao,
} from '@/lib/analytics';
import {
  buildWhatsAppUrl,
  LANDING_PRESENTATION_URL,
  LANDING_TEST_LOTEMENT_PATH,
  LANDING_WHATSAPP_MESSAGES,
} from '../constants/landingConfig';

type DemoProps = {
  id?: string;
  label?: string;
  className?: string;
  variant?: 'primary' | 'outline' | 'ghost';
};

/** CTA principal — ancora no formulário de contato (mesmo destino atual). */
export function CtaDemo({
  id = 'cta_hero_demonstracao',
  label = 'Agendar demonstração',
  className = '',
  variant = 'primary',
}: DemoProps) {
  const variantClass =
    variant === 'primary'
      ? 'landing-btn-primary'
      : variant === 'outline'
        ? 'landing-btn-outline'
        : 'landing-btn-ghost';
  return (
    <a
      href="#contato"
      id={id}
      data-cta={id}
      className={`${variantClass} landing-btn-interactive ${className}`.trim()}
      onClick={() =>
        trackSolicitarDemonstracao({ cta_id: id, cta_label: label })
      }
    >
      <Calendar className="w-4 h-4 shrink-0" aria-hidden />
      {label}
    </a>
  );
}

export function CtaPresentation({
  id = 'cta_video_apresentacao',
  label = 'Assistir apresentação',
  className = '',
}: { id?: string; label?: string; className?: string }) {
  return (
    <a
      href={LANDING_PRESENTATION_URL}
      id={id}
      data-cta={id}
      target="_blank"
      rel="noopener noreferrer"
      className={`landing-btn-outline landing-btn-interactive ${className}`.trim()}
    >
      <Play className="w-4 h-4 shrink-0" aria-hidden />
      {label}
    </a>
  );
}

export function CtaWhatsApp({
  id = 'cta_whatsapp',
  label = 'Falar no WhatsApp',
  message = LANDING_WHATSAPP_MESSAGES.demo,
  className = '',
}: {
  id?: string;
  label?: string;
  message?: string;
  className?: string;
}) {
  return (
    <a
      href={buildWhatsAppUrl(message)}
      id={id}
      data-cta={id}
      target="_blank"
      rel="noopener noreferrer"
      className={`landing-btn-whatsapp landing-btn-interactive ${className}`.trim()}
      onClick={() => trackClickWhatsApp({ cta_id: id, cta_label: label })}
    >
      <MessageCircle className="w-4 h-4 shrink-0" aria-hidden />
      {label}
    </a>
  );
}

export function CtaTestLot({
  id = 'cta_teste',
  label = 'Acessar Loteamento de Demonstração',
  className = '',
}: { id?: string; label?: string; className?: string }) {
  return (
    <Link
      href={LANDING_TEST_LOTEMENT_PATH}
      id={id}
      data-cta={id}
      className={`landing-btn-outline landing-btn-interactive ${className}`.trim()}
    >
      <Map className="w-4 h-4 shrink-0" aria-hidden />
      {label}
    </Link>
  );
}
