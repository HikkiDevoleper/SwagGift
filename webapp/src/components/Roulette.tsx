import React, { useRef, useEffect, useState } from 'react';
import { type Prize } from '../types';
import { makeReel, rarityClass, tg } from '../utils';

interface RouletteProps {
  prizes: Prize[];
  onSpinEnd: (winner: Prize) => void;
  isSpinning: boolean;
  winner?: Prize;
}

const CARD_TOTAL = 105; // 95px width + 2*5px margin

export const Roulette: React.FC<RouletteProps> = ({ prizes, onSpinEnd, isSpinning, winner }) => {
  const [reelItems, setReelItems] = useState<Prize[]>([]);
  const [offset, setOffset] = useState(0);
  const [duration, setDuration] = useState(0);
  const [winIndex, setWinIndex] = useState(-1);
  const spinDone = useRef(false);

  // Generate initial idle reel
  useEffect(() => {
    if (prizes.length) {
      setReelItems(makeReel(prizes).reel);
    }
  }, [prizes]);

  // Spin animation
  useEffect(() => {
    if (!isSpinning || !winner || spinDone.current) return;
    spinDone.current = true;

    const { reel, stopIndex } = makeReel(prizes, winner);
    setReelItems(reel);
    setWinIndex(-1);
    setDuration(0);
    setOffset(0);

    // Force layout recalc, then animate
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const spinTime = 5.5;
        setDuration(spinTime);
        const target = -(stopIndex * CARD_TOTAL) + (window.innerWidth / 2) - (CARD_TOTAL / 2);
        setOffset(target);

        // Haptic — escalating pattern tied to progress
        let count = 0;
        const haptic = setInterval(() => {
          count++;
          const intensity = count < 25 ? 'light' : count < 45 ? 'medium' : 'heavy';
          tg?.HapticFeedback?.impactOccurred?.(intensity);
        }, 100);

        setTimeout(() => {
          clearInterval(haptic);
          setWinIndex(stopIndex);
          tg?.HapticFeedback?.notificationOccurred?.('success');
          onSpinEnd(winner);
          spinDone.current = false;
        }, (spinTime + 0.3) * 1000);
      });
    });
  }, [isSpinning, winner, prizes, onSpinEnd]);

  // Reset on new spin cycle
  useEffect(() => {
    if (!isSpinning) {
      spinDone.current = false;
    }
  }, [isSpinning]);

  return (
    <div className="roulette-wrap">
      <div className="roulette-pointer" />
      <div
        className="roulette-reel"
        style={{
          transform: `translateX(${offset}px)`,
          transition: duration > 0
            ? `transform ${duration}s cubic-bezier(0.12, 0.7, 0.22, 1)`
            : 'none'
        }}
      >
        {reelItems.map((item, i) => (
          <div
            key={i}
            className={`prize-card rarity-${rarityClass(item.rarity)}${i === winIndex ? ' prize-card--winner' : ''}`}
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
