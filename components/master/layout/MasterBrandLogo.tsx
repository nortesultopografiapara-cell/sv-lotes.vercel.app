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
 * Bloco institucional da sidebar Master V2.
 * Preserva o logotipo oficial; apenas melhora a apresentação.
 */
export function MasterBrandLogo({ collapsed = false, onNavigate }: MasterBrandLogoProps) {
  return (
    <Link
      href="/dashboard"
      className={collapsed ? styles.brandLinkCollapsed : styles.brandLink}
      onClick={onNavigate}
      aria-label="SV Topografia e Projetos — Painel Executivo"
    >
      <span className={collapsed ? styles.brandInstitutionCollapsed : styles.brandInstitution}>
        <span className={collapsed ? styles.brandFrameCollapsed : styles.brandFrame}>
          <Image
            src={MASTER_TOPOGRAFIA_LOGO_PATH}
            alt="SV Topografia e Projetos"
            width={collapsed ? 56 : 200}
            height={collapsed ? 56 : 72}
            className={collapsed ? styles.brandImgCollapsed : styles.brandImg}
            priority
            unoptimized
          />
        </span>
        {!collapsed ? (
          <span className={styles.brandCopy}>
            <span className={styles.brandName}>SV Topografia &amp; Projetos</span>
            <span className={styles.brandTag}>Painel Executivo</span>
          </span>
        ) : null}
      </span>
    </Link>
  );
}
