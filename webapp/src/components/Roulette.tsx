import React, { useRef, useEffect, useState } from 'react';
import { type Prize } from '../types';
import { makeReel, rarityClass, tg } from '../utils';

interface RouletteProps {
  prizes: Prize[];
  onSpinEnd: (winner: Prize) => void;
  isSpinning: boolean;
  winner?: Prize;
}

const CARD_W = 100;

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

    // Reel is `left: 50%`. To center Card N:
    // Left edge of Card N is `N * CARD_W`. Center of Card N is `N * CARD_W + (CARD_W / 2)`.
    // Moving the reel left by that amount exactly centers the card on the pointer.
    const target = -(stopIndex * CARD_W) - (CARD_W / 2);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const span = 5.5;
        setDuration(span);
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
        }, (span + 0.4) * 1000);
      });
    });
  }, [isSpinning, winner]);

  useEffect(() => {
    if (!isSpinning) spinning.current = false;
  }, [isSpinning]);

  return (
    <div className="roulette-container">
      <div className="roulette-pointer" />
      <div
        className="roulette-reel"
        style={{
          transform: `translateX(${offset}px)`,
          transition: duration > 0 ? `transform ${duration}s cubic-bezier(0.16, 1, 0.3, 1)` : 'none',
        }}
      >
        {reelItems.map((item, i) => (
          <div
            key={i}
            className={`prize-card rarity-${rarityClass(item.rarity)}${i === winIdx ? ' winner' : ''}`}
            style={{ left: `${i * CARD_W}px` }}
          >
            <div className="prize-emoji">{item.emoji}</div>
            <div className="prize-name">{item.name}</div>
          </div>
        ))}
      </div>
    </div>
  );
};
