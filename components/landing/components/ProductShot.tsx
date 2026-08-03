'use client';

import Image from 'next/image';
import { PRODUCT_SHOTS, type ProductShotKey } from '../productShots';

type Props = {
  shot: ProductShotKey;
  priority?: boolean;
  frame?: 'browser' | 'panel' | 'phone';
  className?: string;
  showCaption?: boolean;
  objectPosition?: string;
};

export function ProductShot({
  shot,
  priority = false,
  frame = 'browser',
  className = '',
  showCaption = true,
  objectPosition = 'top left',
}: Props) {
  const meta = PRODUCT_SHOTS[shot];

  return (
    <figure className={`landing-product-shot landing-product-shot--${frame} ${className}`.trim()}>
      {frame === 'browser' ? (
        <div className="landing-product-chrome" aria-hidden>
          <span />
          <span />
          <span />
          <div className="landing-product-chrome-url">svlotes.com.br</div>
        </div>
      ) : null}
      {frame === 'phone' ? <div className="landing-product-phone-notch" aria-hidden /> : null}
      <div className="landing-product-shot-media">
        <Image
          src={meta.src}
          alt={meta.alt}
          width={frame === 'phone' ? 506 : 1024}
          height={frame === 'phone' ? 664 : 475}
          className="landing-product-shot-img"
          style={{ objectPosition }}
          priority={priority}
          loading={priority ? 'eager' : 'lazy'}
          sizes={
            frame === 'phone'
              ? '(max-width: 768px) 70vw, 320px'
              : '(max-width: 768px) 100vw, 720px'
          }
        />
      </div>
      {showCaption ? <figcaption className="landing-product-caption">{meta.caption}</figcaption> : null}
    </figure>
  );
}
