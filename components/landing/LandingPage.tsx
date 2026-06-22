'use client';

import { useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { LandingHeader } from './LandingHeader';
import { LandingFooter } from './LandingFooter';
import { HeroSection } from './sections/HeroSection';
import { ResourcesSection } from './sections/ResourcesSection';
import { FunctionalitiesSection } from './sections/FunctionalitiesSection';
import { BenefitsSection } from './sections/BenefitsSection';
import { PlansSection } from './sections/PlansSection';
import { AboutSection } from './sections/AboutSection';
import { ContactSection } from './sections/ContactSection';
import { buildWhatsAppUrl, LANDING_WHATSAPP_MESSAGES } from './constants/landingConfig';
import './landing.css';

export function LandingPage() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="landing-page">
      <LandingHeader scrolled={scrolled} />
      <main>
        <HeroSection />
        <ResourcesSection />
        <FunctionalitiesSection />
        <BenefitsSection />
        <PlansSection />
        <AboutSection />
        <ContactSection />
      </main>
      <LandingFooter />

      <a
        href={buildWhatsAppUrl(LANDING_WHATSAPP_MESSAGES.demo)}
        target="_blank"
        rel="noopener noreferrer"
        className="landing-whatsapp-float"
        aria-label="Falar no WhatsApp"
      >
        <MessageCircle className="w-7 h-7" />
      </a>
    </div>
  );
}
