'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { SvLotesLogo } from '@/components/brand/SvLotesLogo';
import { LANDING_NAV_ITEMS, LANDING_SECTION_IDS, type LandingNavId } from './landingNav';

type LandingHeaderProps = {
  scrolled: boolean;
};

export function LandingHeader({ scrolled }: LandingHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeId, setActiveId] = useState<LandingNavId>('inicio');

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
      { rootMargin: '-20% 0px -55% 0px', threshold: [0, 0.15, 0.35, 0.5] }
    );

    sections.forEach((el) => observer.observe(el!));
    return () => observer.disconnect();
  }, []);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const handleNavClick = useCallback(() => {
    closeMenu();
  }, [closeMenu]);

  return (
    <header
      className={`landing-header ${scrolled ? 'is-scrolled' : ''} ${menuOpen ? 'is-menu-open' : ''}`}
    >
      <div className="landing-header-bar">
        <SvLotesLogo
          href="#inicio"
          size={36}
          showText
          subtitle="Gestão para loteadoras"
          className="landing-header-logo shrink-0 min-w-0"
          textClassName="landing-header-logo-text"
        />

        <nav className="landing-nav-desktop" aria-label="Navegação principal">
          <ul className="landing-nav-list">
            {LANDING_NAV_ITEMS.map((item) => (
              <li key={item.id}>
                <a
                  href={item.href}
                  className={`landing-nav-link ${activeId === item.id ? 'is-active' : ''}`}
                  onClick={handleNavClick}
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
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <Link href="/login" className="landing-btn-primary landing-header-cta-btn text-sm py-2 px-3 sm:px-4 shrink-0">
            Entrar no Sistema
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
                onClick={handleNavClick}
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {menuOpen ? (
        <button
          type="button"
          className="landing-nav-backdrop"
          aria-label="Fechar menu"
          onClick={closeMenu}
        />
      ) : null}
    </header>
  );
}
