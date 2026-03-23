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

// Global cache for parsed TGS JSON to prevent massive lag during roulette generation
const _jsonCache = new Map<string, Promise<any>>();

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
        let jsonPromise = _jsonCache.get(src);
        if (!jsonPromise) {
          jsonPromise = fetch(src)
            .then(r => r.arrayBuffer())
            .then(buf => JSON.parse(pako.inflate(new Uint8Array(buf), { to: 'string' })));
          _jsonCache.set(src, jsonPromise);
        }

        const json = await jsonPromise;
        if (cancelled || !ref.current) return;

        animRef.current = lottie.loadAnimation({
          container: ref.current,
          renderer: 'canvas', // canvas is much faster for many instances
          loop,
          autoplay,
          animationData: json,
        });

        if (!autoplay && animRef.current) {
          animRef.current.goToAndStop(0, true);
        }
      } catch {
        // Silently fail
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
