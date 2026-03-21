import React, { useRef, useEffect, useState } from 'react';
import { type Prize } from '../types';
import { makeReel, rarityClass, tg } from '../utils';

interface RouletteProps {
  prizes: Prize[];
  onSpinEnd: (winner: Prize) => void;
  isSpinning: boolean;
  winner?: Prize;
}

// Match CSS: min-width 90px + margin 0 4px = 98px per card
const CARD_STEP = 98;

export const Roulette: React.FC<RouletteProps> = ({ prizes, onSpinEnd, isSpinning, winner }) => {
  const [reelItems, setReelItems] = useState<Prize[]>([]);
  const [offset, setOffset] = useState(0);
  const [duration, setDuration] = useState(0);
  const [winIdx, setWinIdx] = useState(-1);
  const spinning = useRef(false);

  useEffect(() => {
    if (prizes.length) setReelItems(makeReel(prizes).reel);
  }, [prizes]);

  useEffect(() => {
    if (!isSpinning || !winner || spinning.current) return;
    spinning.current = true;

    const { reel, stopIndex } = makeReel(prizes, winner);
    setReelItems(reel);
    setWinIdx(-1);
    setDuration(0);
    setOffset(0);

    // padding: 0 50% already centers card 0.
    // To center card N: translateX = -(N * CARD_STEP) - CARD_STEP/2
    const target = -(stopIndex * CARD_STEP) - CARD_STEP / 2;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const t = 5.5;
        setDuration(t);
        setOffset(target);

        let tick = 0;
        const haptic = setInterval(() => {
          tick++;
          tg?.HapticFeedback?.impactOccurred?.(tick < 20 ? 'light' : tick < 40 ? 'medium' : 'heavy');
        }, 110);

        setTimeout(() => {
          clearInterval(haptic);
          setWinIdx(stopIndex);
          tg?.HapticFeedback?.notificationOccurred?.('success');
          spinning.current = false;
          onSpinEnd(winner);
        }, (t + 0.4) * 1000);
      });
    });
  }, [isSpinning, winner]);

  useEffect(() => {
    if (!isSpinning) spinning.current = false;
  }, [isSpinning]);

  return (
    <div className="roulette-wrap">
      <div className="roulette-pointer" />
      <div
        className="roulette-reel"
        style={{
          transform: `translateX(${offset}px)`,
          transition: duration > 0 ? `transform ${duration}s cubic-bezier(0.08, 0.65, 0.20, 1)` : 'none',
        }}
      >
        {reelItems.map((item, i) => (
          <div
            key={i}
            className={`prize-card rarity-${rarityClass(item.rarity)}${i === winIdx ? ' prize-card--winner' : ''}`}
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
