'use client';

import Image from 'next/image';
import { LANDING_CLIENT_LOGOS, LANDING_EXPERIENCE_LINE } from '../constants/landingConfig';
import { Reveal } from '../LandingMotion';

export function SocialProofSection() {
  return (
    <section className="landing-section landing-social-proof" aria-label="Empresas que utilizam o SV LOTES">
      <div className="landing-container">
        <Reveal className="landing-social-proof-inner">
          <h2 className="landing-social-proof-title">Empresas que já utilizam o SV LOTES</h2>
          <div className="landing-client-logos">
            {LANDING_CLIENT_LOGOS.map((logo) => (
              <div key={logo.name} className="landing-client-logo" title={logo.name}>
                <Image
                  src={logo.src}
                  alt={logo.name}
                  width={logo.width}
                  height={logo.height}
                  className="landing-client-logo-img"
                  loading="lazy"
                />
              </div>
            ))}
          </div>
          <p className="landing-social-proof-line">{LANDING_EXPERIENCE_LINE}</p>
        </Reveal>
      </div>
    </section>
  );
}
