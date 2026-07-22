'use client';

import Link from 'next/link';
import Image from 'next/image';
import { MASTER_TOPOGRAFIA_LOGO_PATH } from '@/lib/master/config';
import styles from './masterExecutiveLayout.module.css';

type MasterBrandLogoProps = {
  collapsed?: boolean;
  onNavigate?: () => void;
};

/**
 * Logotipo oficial SV TOPOGRAFIA E PROJETOS (asset estático).
 * Não redesenha nem substitui por tipografia.
 */
export function MasterBrandLogo({ collapsed = false, onNavigate }: MasterBrandLogoProps) {
  return (
    <Link
      href="/dashboard"
      className={collapsed ? styles.brandLinkCollapsed : styles.brandLink}
      onClick={onNavigate}
      aria-label="SV Topografia e Projetos — Painel Master"
    >
      <span className={collapsed ? styles.brandFrameCollapsed : styles.brandFrame}>
        <Image
          src={MASTER_TOPOGRAFIA_LOGO_PATH}
          alt="SV Topografia e Projetos"
          width={collapsed ? 56 : 220}
          height={collapsed ? 56 : 88}
          className={collapsed ? styles.brandImgCollapsed : styles.brandImg}
          priority
          unoptimized
        />
      </span>
    </Link>
  );
}
