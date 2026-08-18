'use client';

import { useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { LandingHeader } from './LandingHeader';
import { LandingFooter } from './LandingFooter';
import { HeroSection } from './sections/HeroSection';
import { SocialProofSection } from './sections/SocialProofSection';
import { GisSection } from './sections/GisSection';
import { FlowSection } from './sections/FlowSection';
import { DashboardSection } from './sections/DashboardSection';
import { ResourcesSection } from './sections/ResourcesSection';
import { SaleMapSection } from './sections/SaleMapSection';
import { ContractsSection } from './sections/ContractsSection';
import { FinanceSection } from './sections/FinanceSection';
import { MigrationSection } from './sections/MigrationSection';
import { CompareSection } from './sections/CompareSection';
import { DemoCtaSection } from './sections/DemoCtaSection';
import { ClientPortalSection } from './sections/ClientPortalSection';
import { PlansSection } from './sections/PlansSection';
import { AboutSection } from './sections/AboutSection';
import { ContactSection } from './sections/ContactSection';
import { CtaDemo, CtaWhatsApp } from './components/LandingCta';
import { buildWhatsAppUrl, handleLandingWhatsAppClick, LANDING_WHATSAPP_MESSAGES } from './constants/landingConfig';
import { trackClickWhatsApp } from '@/lib/analytics';
import './landing.css';
import './landing-v3.css';

type Props = {
  clientPortalEnabled: boolean;
};

export function LandingPage({ clientPortalEnabled }: Props) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="landing-page landing-page-v3">
      <LandingHeader scrolled={scrolled} clientPortalEnabled={clientPortalEnabled} />
      <main>
        <HeroSection />
        <SocialProofSection />
        <GisSection />
        <FlowSection />
        <DashboardSection />
        <ResourcesSection />
        <SaleMapSection />
        <ContractsSection />
        <FinanceSection />
        <MigrationSection />
        <CompareSection />
        <DemoCtaSection />
        <ClientPortalSection />
        <PlansSection />
        <AboutSection />
        <ContactSection />
      </main>
      <LandingFooter />

      <a
        href={buildWhatsAppUrl(LANDING_WHATSAPP_MESSAGES.demo, 'desktop')}
        target="_blank"
        rel="noopener noreferrer"
        className="landing-whatsapp-float"
        aria-label="Falar no WhatsApp"
        data-cta="cta_whatsapp_float"
        onClick={(event) => {
          handleLandingWhatsAppClick(event, LANDING_WHATSAPP_MESSAGES.demo);
          trackClickWhatsApp({ cta_id: 'cta_whatsapp_float', cta_label: 'float' });
        }}
      >
        <MessageCircle className="w-7 h-7" />
      </a>

      <div className="landing-mobile-bar" aria-label="Ações rápidas">
        <CtaDemo id="cta_mobile_bar_demo" label="Agendar demonstração" className="landing-mobile-bar-btn" />
        <CtaWhatsApp id="cta_mobile_bar_wa" label="WhatsApp" className="landing-mobile-bar-btn" />
      </div>
    </div>
  );
}
