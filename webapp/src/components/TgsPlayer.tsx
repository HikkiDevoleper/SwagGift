import React, { useRef, useEffect } from 'react';
import lottie, { type AnimationItem } from 'lottie-web';
import pako from 'pako';
import { type Prize } from '../types';

export const TGS_SVGS: Record<string, string> = {};

/**
 * Preloads all .tgs stickers from the catalog, renders their first frame
 * to a hidden container, and extracts the raw SVG as a base64 Data URI.
 * This guarantees 0% CPU usage and instant loading in large lists/roulette.
 */
export async function preloadTgs(prizes: Prize[]) {
  const promises = prizes.filter(p => p.tgs).map(async p => {
    if (TGS_SVGS[p.tgs!]) return;
    try {
      const resp = await fetch(`/gifts/${p.tgs}`);
      const buf = await resp.arrayBuffer();
      const json = JSON.parse(pako.inflate(new Uint8Array(buf), { to: 'string' }));

      const container = document.createElement('div');
      container.style.width = '120px';
      container.style.height = '120px';
      container.style.position = 'absolute';
      container.style.left = '-9999px';
      document.body.appendChild(container);

      const anim = lottie.loadAnimation({
        container, renderer: 'svg', loop: false, autoplay: false, animationData: json,
      });

      anim.goToAndStop(0, true);
      await new Promise(r => setTimeout(r, 20)); // tiny delay for render

      const svgStr = container.innerHTML;
      TGS_SVGS[p.tgs!] = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgStr)));

      anim.destroy();
      document.body.removeChild(container);
    } catch (e) {
      console.error('Failed to preload TGS', p.tgs, e);
    }
  });
  await Promise.all(promises);
}

// Global cache for actual parsed JSONs for animated players
const _jsonCache = new Map<string, Promise<any>>();

interface Props {
  src: string;
  size?: number;
  loop?: boolean;
  autoplay?: boolean;
  className?: string;
}

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
          renderer: 'canvas',
          loop,
          autoplay,
          animationData: json,
        });

        if (!autoplay && animRef.current) {
          animRef.current.goToAndStop(0, true);
        }
      } catch {}
    };

    load();

    return () => {
      cancelled = true;
      animRef.current?.destroy();
    };
  }, [src, loop, autoplay]);

  return <div ref={ref} className={`tgs-player ${className || ''}`} style={{ '--size': `${size}px` } as React.CSSProperties} />;
};

