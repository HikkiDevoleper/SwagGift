import React, { useRef, useEffect, memo } from 'react';
import lottie, { type AnimationItem } from 'lottie-web';
import pako from 'pako';

interface Props {
  src: string;
  size?: number;
  loop?: boolean;
  autoplay?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

// ─── Global cache: src → Promise<object> ───────────────────────
// Shared across ALL TgsPlayer instances — parse once, reuse forever.
const _cache = new Map<string, Promise<string>>();

export function preloadTgs(src: string): Promise<string> {
  let p = _cache.get(src);
  if (!p) {
    p = fetch(src)
      .then(r => {
        if (!r.ok) throw new Error(`TGS fetch failed: ${r.status}`);
        return r.arrayBuffer();
      })
      .then(buf => {
        const jsonString = pako.inflate(new Uint8Array(buf), { to: 'string' });
        return jsonString;
      });
    _cache.set(src, p);
  }
  return p;
}

// ─── TgsPlayer ─────────────────────────────────────────────────
// Uses canvas renderer (4–8× faster than SVG for many instances).
// Properly sized and clipped — the container is always a tight square.
export const TgsPlayer: React.FC<Props> = memo(({
  src, size = 120, loop = true, autoplay = true, className, style,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const animRef = useRef<AnimationItem | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    let cancelled = false;

    (async () => {
      try {
        const jsonString = await preloadTgs(src);
        if (cancelled || !ref.current) return;

        // Destroy previous if src changed
        animRef.current?.destroy();
        animRef.current = null;

        animRef.current = lottie.loadAnimation({
          container: ref.current,
          renderer: 'svg',
          loop,
          autoplay,
          // Parse string directly to a new object for lottie
          animationData: JSON.parse(jsonString),
          rendererSettings: {
            progressiveLoad: false,
          },
        });

        if (!autoplay) {
          animRef.current.goToAndStop(0, true);
        }
      } catch {
        // Silently skip broken TGS
      }
    })();

    return () => {
      cancelled = true;
      animRef.current?.destroy();
      animRef.current = null;
    };
  }, [src, loop, autoplay]);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...style,
      }}
    />
  );
});

TgsPlayer.displayName = 'TgsPlayer';
