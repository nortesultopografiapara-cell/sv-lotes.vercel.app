'use client';

import { useEffect, useState } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { useCompanyLogoUrl } from '@/components/contracts/editor/CompanyLogoContext';
import {
  COMPANY_LOGO_EDITOR_EMPTY,
  isSafeCompanyLogoUrl,
  normalizeCompanyLogoLayout,
} from '@/lib/customContractLogo';

export default function CompanyLogoView({ node }: NodeViewProps) {
  const liveUrl = useCompanyLogoUrl();
  const layout = normalizeCompanyLogoLayout({
    align: node.attrs.align,
    width: node.attrs.width,
    marginBefore: node.attrs.marginBefore,
    marginAfter: node.attrs.marginAfter,
  });
  const [broken, setBroken] = useState(false);
  const src = isSafeCompanyLogoUrl(liveUrl) ? String(liveUrl).trim() : '';

  useEffect(() => {
    setBroken(false);
  }, [src]);

  return (
    <NodeViewWrapper
      as="div"
      className="sv-company-logo"
      data-sv-placeholder="COMPANY_LOGO_URL"
      data-sv-company-logo="true"
      data-align={layout.align}
      data-width={layout.width}
      data-margin-before={layout.marginBefore}
      data-margin-after={layout.marginAfter}
      style={{
        textAlign: layout.align,
        margin: `${layout.marginBefore}px 0 ${layout.marginAfter}px`,
        ['--sv-logo-width' as string]: `${layout.width}px`,
      }}
    >
      {src && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt="Logo da empresa"
          className="sv-company-logo-img"
          style={{
            width: `${layout.width}px`,
            height: 'auto',
            maxWidth: '100%',
            objectFit: 'contain',
          }}
          onError={() => setBroken(true)}
        />
      ) : (
        <span className="sv-company-logo-empty">{COMPANY_LOGO_EDITOR_EMPTY}</span>
      )}
    </NodeViewWrapper>
  );
}
