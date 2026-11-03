'use client';

import { useLayoutEffect, useRef } from 'react';
import { applyCustomA4Pagination } from '@/lib/customContractA4Layout';

export default function CustomA4PaginatedHtml({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    const paginate = () => applyCustomA4Pagination(root);
    paginate();
    const onWindowResize = () => paginate();
    const onImageLoad = (event: Event) => {
      if (event.target instanceof HTMLImageElement) paginate();
    };
    window.addEventListener('resize', onWindowResize);
    root.addEventListener('load', onImageLoad, true);
    void document.fonts?.ready?.then(() => paginate());
    return () => {
      window.removeEventListener('resize', onWindowResize);
      root.removeEventListener('load', onImageLoad, true);
    };
  }, [html]);

  return (
    <div
      ref={ref}
      className="sv-a4-sheet sv-a4-prose"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
