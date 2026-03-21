import React, { useRef, useEffect, useState } from 'react';
import { type Prize } from '../types';
import { makeReel, rarityClass, tg } from '../utils';

interface RouletteProps {
  prizes: Prize[];
  onSpinEnd: (winner: Prize) => void;
  isSpinning: boolean;
  winner?: Prize;
}

// MUST match CSS exactly:
// .prize-card { min-width: 92px }  +  margin: 0 4px  →  step = 92 + 4*2 = 100
const CARD_STEP = 100;

export const Roulette: React.FC<RouletteProps> = ({
  prizes, onSpinEnd, isSpinning, winner
}) => {
  const [reel, setReel]       = useState<Prize[]>([]);
  const [offset, setOffset]   = useState(0);
  const [dur, setDur]         = useState(0);
  const [winIdx, setWinIdx]   = useState(-1);
  const live = useRef(false);

  // Idle reel on mount
  useEffect(() => {
    if (prizes.length) setReel(makeReel(prizes).reel);
  }, [prizes]);

  useEffect(() => {
    if (!isSpinning || !winner || live.current) return;
    live.current = true;

    const { reel: newReel, stopIndex } = makeReel(prizes, winner);

    // Reset — no transition, set to start
    setWinIdx(-1);
    setDur(0);
    setOffset(0);
    setReel(newReel);

    // Two rAF ensures the browser has painted the reset before animating
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // padding: 0 50% centers card 0 at the viewport center.
        // To center card N: translate = -(N * STEP) - STEP/2
        const target = -(stopIndex * CARD_STEP) - CARD_STEP / 2;

        setDur(5.5);
        setOffset(target);

        // Haptic: light → medium → heavy as reel decelerates
        let tick = 0;
        const hap = setInterval(() => {
          tick++;
          const f = tick < 22 ? 'light' : tick < 42 ? 'medium' : 'heavy';
          tg?.HapticFeedback?.impactOccurred?.(f);
        }, 110);

        setTimeout(() => {
          clearInterval(hap);
          setWinIdx(stopIndex);
          tg?.HapticFeedback?.notificationOccurred?.('success');
          live.current = false;
          onSpinEnd(winner);
        }, 5.9 * 1000);
      });
    });
  }, [isSpinning, winner]);

  useEffect(() => {
    if (!isSpinning) live.current = false;
  }, [isSpinning]);

  return (
    <div className="reel-wrap">
      <div className="reel-pointer" />
      <div
        className="reel-track"
        style={
          dur > 0
            ? { transform: `translateX(${offset}px)`, transition: `transform ${dur}s var(--ease-spin)` }
            : { transform: `translateX(${offset}px)`, transition: 'none' }
        }
      >
        {reel.map((item, i) => (
          <div
            key={i}
            className={`prize-card r-${rarityClass(item.rarity)}${i === winIdx ? ' --win' : ''}`}
          >
            <span className="prize-emoji">{item.emoji}</span>
            <span className="prize-name">{item.name}</span>
            <span className="prize-rarity">{item.rarity}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
