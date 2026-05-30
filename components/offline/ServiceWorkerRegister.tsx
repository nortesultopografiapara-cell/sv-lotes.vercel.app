'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV === 'development') {
      /* Evita cache agressivo atrapalhando HMR local */
      return;
    }

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        console.log('PWA_SW_REGISTERED', { scope: reg.scope });
      })
      .catch((err) => {
        console.warn('PWA_SW_REGISTER_FAILED', err);
      });
  }, []);

  return null;
}
