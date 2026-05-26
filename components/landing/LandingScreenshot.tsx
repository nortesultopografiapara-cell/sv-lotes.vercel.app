'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { ScreenMock, SCREEN_IMAGE_PATHS, type ScreenId } from './ScreenMocks';

export function LandingScreenshot({
  id,
  priority,
  className = '',
}: {
  id: ScreenId;
  priority?: boolean;
  className?: string;
}) {
  const [useMock, setUseMock] = useState(true);
  const src = SCREEN_IMAGE_PATHS[id];

  useEffect(() => {
    const probe = new window.Image();
    probe.onload = () => setUseMock(false);
    probe.onerror = () => setUseMock(true);
    probe.src = src;
  }, [src]);

  if (useMock) {
    return (
      <div className={className}>
        <ScreenMock id={id} />
      </div>
    );
  }

  return (
    <div className={`relative w-full h-full ${className}`}>
      <Image
        src={src}
        alt={`Tela ${id} do SV LOTES`}
        fill
        className="object-cover object-top"
        sizes="(max-width: 768px) 100vw, 640px"
        priority={priority}
        onError={() => setUseMock(true)}
      />
    </div>
  );
}
