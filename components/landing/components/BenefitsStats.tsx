'use client';

import { useEffect, useRef, useState } from 'react';
import { LANDING_STATS } from '../constants/landingConfig';
import { useCountUp } from '../hooks/useCountUp';
import { Reveal } from '../LandingMotion';

function StatItem({
  value,
  suffix,
  label,
  textOnly,
}: {
  value: number;
  suffix: string;
  label: string;
  textOnly?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const count = useCountUp(value, 2000, inView && !textOnly);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setInView(true);
      },
      { threshold: 0.35 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} className="landing-stat-item">
      <p className="landing-stat-value">
        {textOnly ? (
          <span>+milhares</span>
        ) : (
          <>
            +{count.toLocaleString('pt-BR')}
            {suffix}
          </>
        )}
      </p>
      <p className="landing-stat-label">{label}</p>
    </div>
  );
}

export function BenefitsStats() {
  return (
    <Reveal className="landing-stats-row">
      {LANDING_STATS.map((stat) => (
        <StatItem
          key={stat.label}
          value={stat.value}
          suffix={stat.suffix}
          label={stat.label}
          textOnly={'textOnly' in stat ? stat.textOnly : false}
        />
      ))}
    </Reveal>
  );
}
