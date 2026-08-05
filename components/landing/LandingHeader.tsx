'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Calendar, Lock, LogIn, Menu, UserCircle, X } from 'lucide-react';
import { SvLotesLogo } from '@/components/brand/SvLotesLogo';
import { trackSolicitarDemonstracao } from '@/lib/analytics';
import { LANDING_CLIENT_PORTAL_PATH, LANDING_LOGIN_PATH } from './constants/landingConfig';
import { LANDING_NAV_ITEMS, LANDING_SECTION_IDS, type LandingNavId } from './landingNav';

type Props = {
  scrolled: boolean;
  clientPortalEnabled: boolean;
};

export function LandingHeader({ scrolled, clientPortalEnabled }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeId, setActiveId] = useState<LandingNavId>('home');

  useEffect(() => {
    if (!menuOpen) {
      document.body.style.overflow = '';
      return;
    }
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
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

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

  /** Fecha o menu após o evento de navegação (não cancela o clique). */
  const handleNavActivate = useCallback(() => {
    setMenuOpen(false);
  }, []);

  return (
    <header
      className={`landing-header ${scrolled ? 'is-scrolled' : ''} ${menuOpen ? 'is-menu-open' : ''}`}
    >
      {menuOpen ? (
        <button
          type="button"
          className="landing-nav-backdrop"
          aria-label="Fechar menu"
          onClick={closeMenu}
        />
      ) : null}

      <div className="landing-header-bar">
        <SvLotesLogo
          href="#home"
          size={48}
          showText
          subtitle="Gestão Imobiliária Inteligente"
          className="landing-header-logo shrink-0 min-w-0"
          textClassName="landing-header-logo-text"
          onClick={handleNavActivate}
        />

        <nav className="landing-nav-desktop" aria-label="Navegação principal">
          <ul className="landing-nav-list">
            {LANDING_NAV_ITEMS.map((item) => (
              <li key={item.id}>
                <a
                  href={item.href}
                  className={`landing-nav-link ${activeId === item.id ? 'is-active' : ''}`}
                  onClick={handleNavActivate}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="landing-header-actions">
          <button
            type="button"
            className="landing-nav-toggle"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-controls="landing-nav-mobile"
            aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
          >
            {menuOpen ? <X className="w-5 h-5" aria-hidden /> : <Menu className="w-5 h-5" aria-hidden />}
          </button>

          {clientPortalEnabled ? (
            <Link
              href={LANDING_CLIENT_PORTAL_PATH}
              className="landing-btn-system landing-btn-system--header-outline landing-btn-system--desktop landing-btn-portal"
              aria-label="Portal do Cliente"
            >
              <UserCircle className="w-4 h-4 shrink-0" aria-hidden />
              <span className="landing-btn-portal-label">Portal do Cliente</span>
            </Link>
          ) : null}
          <Link
            href={LANDING_LOGIN_PATH}
            className="landing-btn-system landing-btn-system--header-outline landing-btn-system--desktop"
            aria-label="Acessar o sistema"
          >
            <Lock className="w-4 h-4" aria-hidden />
            Acessar o Sistema
          </Link>
          <a
            href="#contato"
            id="cta_header_demonstracao"
            data-cta="cta_header_demonstracao"
            className="landing-btn-primary landing-btn-header-demo landing-btn-system--desktop"
            onClick={() => {
              trackSolicitarDemonstracao({
                cta_id: 'cta_header_demonstracao',
                cta_label: 'Agendar demonstração',
              });
              handleNavActivate();
            }}
          >
            <Calendar className="w-4 h-4 shrink-0" aria-hidden />
            Agendar demonstração
          </a>
        </div>
      </div>

      <div className="landing-header-mobile-ctas" aria-label="Ações rápidas">
        <Link
          href={LANDING_LOGIN_PATH}
          className="landing-btn-system landing-btn-system--header-outline landing-header-mobile-cta"
          aria-label="Acessar o sistema"
          onClick={handleNavActivate}
        >
          <LogIn className="w-3.5 h-3.5 shrink-0" aria-hidden />
          <span>Acessar Sistema</span>
        </Link>
        {clientPortalEnabled ? (
          <Link
            href={LANDING_CLIENT_PORTAL_PATH}
            className="landing-btn-system landing-btn-system--header-outline landing-header-mobile-cta landing-btn-portal"
            aria-label="Portal do Cliente"
            onClick={handleNavActivate}
          >
            <UserCircle className="w-3.5 h-3.5 shrink-0" aria-hidden />
            <span>Portal do Cliente</span>
          </Link>
        ) : null}
        <a
          href="#contato"
          className="landing-btn-primary landing-header-mobile-cta"
          onClick={() => {
            trackSolicitarDemonstracao({
              cta_id: 'cta_header_mobile_demo',
              cta_label: 'Demo',
            });
            handleNavActivate();
          }}
        >
          <Calendar className="w-3.5 h-3.5 shrink-0" aria-hidden />
          <span>Demo</span>
        </a>
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
                onClick={handleNavActivate}
              >
                {item.label}
              </a>
            </li>
          ))}
          <li className="landing-nav-mobile-actions">
            {clientPortalEnabled ? (
              <Link
                href={LANDING_CLIENT_PORTAL_PATH}
                className="landing-btn-system landing-btn-system--header-outline landing-nav-mobile-action"
                aria-label="Portal do Cliente"
                onClick={handleNavActivate}
              >
                <UserCircle className="w-4 h-4" aria-hidden />
                Portal do Cliente
              </Link>
            ) : null}
            <Link
              href={LANDING_LOGIN_PATH}
              className="landing-btn-system landing-btn-system--header-outline landing-nav-mobile-action"
              aria-label="Acessar o sistema"
              onClick={handleNavActivate}
            >
              <Lock className="w-4 h-4" aria-hidden />
              Acessar o Sistema
            </Link>
            <a
              href="#contato"
              className="landing-btn-primary landing-nav-mobile-action"
              onClick={() => {
                trackSolicitarDemonstracao({
                  cta_id: 'cta_header_nav_mobile_demo',
                  cta_label: 'Agendar demonstração',
                });
                handleNavActivate();
              }}
            >
              <Calendar className="w-4 h-4" aria-hidden />
              Agendar demonstração
            </a>
          </li>
        </ul>
      </nav>
    </header>
  );
}
