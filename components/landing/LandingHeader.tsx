'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Calendar, Lock, LogIn, Menu, X } from 'lucide-react';
import { SvLotesLogo } from '@/components/brand/SvLotesLogo';
import {
  buildWhatsAppUrl,
  LANDING_LOGIN_PATH,
  LANDING_WHATSAPP_MESSAGES,
} from './constants/landingConfig';
import { LANDING_NAV_ITEMS, LANDING_SECTION_IDS, type LandingNavId } from './landingNav';

type Props = {
  scrolled: boolean;
};

export function LandingHeader({ scrolled }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeId, setActiveId] = useState<LandingNavId>('home');

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  useEffect(() => {
    const sections = LANDING_SECTION_IDS.map((id) => document.getElementById(id)).filter(Boolean);
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]?.target.id) {
          setActiveId(visible[0].target.id as LandingNavId);
        }
      },
      { rootMargin: '-15% 0px -55% 0px', threshold: [0, 0.12, 0.3] },
    );

    sections.forEach((el) => observer.observe(el!));
    return () => observer.disconnect();
  }, []);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  return (
    <header
      className={`landing-header ${scrolled ? 'is-scrolled' : ''} ${menuOpen ? 'is-menu-open' : ''}`}
    >
      <div className="landing-header-bar">
        <SvLotesLogo
          href="#home"
          size={40}
          showText
          subtitle="Gestão Imobiliária Inteligente"
          className="landing-header-logo shrink-0 min-w-0"
          textClassName="landing-header-logo-text"
          onClick={closeMenu}
        />

        <nav className="landing-nav-desktop" aria-label="Navegação principal">
          <ul className="landing-nav-list">
            {LANDING_NAV_ITEMS.map((item) => (
              <li key={item.id}>
                <a
                  href={item.href}
                  className={`landing-nav-link ${activeId === item.id ? 'is-active' : ''}`}
                  onClick={closeMenu}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="landing-header-actions">
          <Link
            href={LANDING_LOGIN_PATH}
            className="landing-btn-system landing-btn-system--header-outline landing-btn-system--header-mobile"
            aria-label="Acessar o sistema"
          >
            <LogIn className="w-3.5 h-3.5 shrink-0" />
            <span>Acessar Sistema</span>
          </Link>

          <button
            type="button"
            className="landing-nav-toggle"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-controls="landing-nav-mobile"
            aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
          >
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <a
            href={buildWhatsAppUrl(LANDING_WHATSAPP_MESSAGES.demo)}
            target="_blank"
            rel="noopener noreferrer"
            className="landing-btn-demo landing-btn-system--desktop hidden lg:inline-flex"
            aria-label="Agendar demonstração via WhatsApp"
          >
            <Calendar className="w-4 h-4" />
            Agendar Demonstração
          </a>
          <Link
            href={LANDING_LOGIN_PATH}
            className="landing-btn-system landing-btn-system--header-outline landing-btn-system--desktop hidden lg:inline-flex"
            aria-label="Acessar o sistema"
          >
            <Lock className="w-4 h-4" />
            Acessar o Sistema
          </Link>
        </div>
      </div>

      <nav
        id="landing-nav-mobile"
        className={`landing-nav-mobile ${menuOpen ? 'is-open' : ''}`}
        aria-label="Navegação mobile"
        aria-hidden={!menuOpen}
      >
        <ul className="landing-nav-mobile-list">
          {LANDING_NAV_ITEMS.map((item) => (
            <li key={item.id}>
              <a
                href={item.href}
                className={`landing-nav-link landing-nav-link--mobile ${activeId === item.id ? 'is-active' : ''}`}
                onClick={closeMenu}
              >
                {item.label}
              </a>
            </li>
          ))}
          <li className="pt-2 border-t border-white/10 space-y-2">
            <a
              href={buildWhatsAppUrl(LANDING_WHATSAPP_MESSAGES.demo)}
              target="_blank"
              rel="noopener noreferrer"
              className="landing-btn-demo w-full justify-center"
              onClick={closeMenu}
            >
              Agendar Demonstração
            </a>
            <Link
              href={LANDING_LOGIN_PATH}
              className="landing-btn-system landing-btn-system--header-outline w-full justify-center"
              onClick={closeMenu}
            >
              <Lock className="w-4 h-4" />
              Acessar o Sistema
            </Link>
          </li>
        </ul>
      </nav>

      {menuOpen ? (
        <button type="button" className="landing-nav-backdrop" aria-label="Fechar menu" onClick={closeMenu} />
      ) : null}
    </header>
  );
}
