import React, { useRef, useEffect } from 'react';
import lottie, { type AnimationItem } from 'lottie-web';
import pako from 'pako';

interface Props {
  src: string;
  size?: number;
  loop?: boolean;
  autoplay?: boolean;
  className?: string;
}

/**
 * Renders a Telegram .tgs sticker (gzipped Lottie JSON).
 * Falls back to nothing if loading fails.
 */
export const TgsPlayer: React.FC<Props> = ({
  src, size = 120, loop = true, autoplay = true, className,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const animRef = useRef<AnimationItem | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    let cancelled = false;

    const load = async () => {
      try {
        const resp = await fetch(src);
        const buf = await resp.arrayBuffer();
        const json = JSON.parse(pako.inflate(new Uint8Array(buf), { to: 'string' }));

        if (cancelled || !ref.current) return;

        animRef.current = lottie.loadAnimation({
          container: ref.current,
          renderer: 'svg',
          loop,
          autoplay,
          animationData: json,
        });
      } catch {
        // Silently fail — emoji fallback is in parent
      }
    };

    load();

    return () => {
      cancelled = true;
      animRef.current?.destroy();
    };
  }, [src, loop, autoplay]);

  return (
    <div
      ref={ref}
      className={className}
      style={{ width: size, height: size }}
    />
  );
};
