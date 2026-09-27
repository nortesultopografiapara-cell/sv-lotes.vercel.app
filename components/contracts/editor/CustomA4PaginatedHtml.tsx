'use client';

import { useLayoutEffect, useRef } from 'react';
import { applyCustomA4Pagination } from '@/lib/customContractA4Layout';

export default function CustomA4PaginatedHtml({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    applyCustomA4Pagination(root);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => applyCustomA4Pagination(root));
    observer.observe(root);
    return () => observer.disconnect();
  }, [html]);

  return (
    <div
      ref={ref}
      className="sv-a4-sheet sv-a4-prose"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
