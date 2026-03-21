import React, { useRef, useState, useCallback, useEffect } from 'react';
import { type Prize, type BootstrapResponse } from '../types';
import { makeReel, tg } from '../utils';

interface RouletteProps {
  prizes: Prize[];
  onSpinEnd: (winner: Prize) => void;
  isSpinning: boolean;
  winner?: Prize;
}

export const Roulette: React.FC<RouletteProps> = ({ prizes, onSpinEnd, isSpinning, winner }) => {
  const [reelItems, setReelItems] = useState<Prize[]>([]);
  const [offset, setOffset] = useState(0);
  const [duration, setDuration] = useState(0);
  const reelRef = useRef<HTMLDivElement>(null);

  const CARD_WIDTH = 110; // width + margin

  useEffect(() => {
    // Initial reel
    setReelItems(makeReel(prizes).reel);
  }, [prizes]);

  useEffect(() => {
    if (isSpinning && winner) {
      const { reel, stopIndex } = makeReel(prizes, winner);
      setReelItems(reel);
      setDuration(0);
      setOffset(0);

      // Force reflow
      setTimeout(() => {
        setDuration(6); // 6 seconds for more suspense
        const targetOffset = -(stopIndex * CARD_WIDTH) + (window.innerWidth / 2) - (CARD_WIDTH / 2);
        setOffset(targetOffset);
        
        // Haptic feedback during spin - escalating intensity
        let hapticCount = 0;
        const hapticInterval = setInterval(() => {
          hapticCount++;
          if (hapticCount < 30) {
            tg?.HapticFeedback.impactOccurred('light');
          } else if (hapticCount < 50) {
            tg?.HapticFeedback.impactOccurred('medium');
          } else {
            tg?.HapticFeedback.impactOccurred('heavy');
          }
        }, 80);

        setTimeout(() => {
          clearInterval(hapticInterval);
          onSpinEnd(winner);
          // Victory haptic pattern
          tg?.HapticFeedback.notificationOccurred('success');
        }, 6200);
      }, 50);
    }
  }, [isSpinning, winner, prizes, onSpinEnd]);

  return (
    <div className="roulette-container">
      <div className="roulette-pointer" />
      <div 
        ref={reelRef}
        className="roulette-reel"
        style={{
          transform: `translateX(${offset}px)`,
          transition: duration > 0 ? `transform ${duration}s cubic-bezier(0.15, 0.6, 0.2, 1)` : 'none'
        }}
      >
        {reelItems.map((item, i) => (
          <div key={i} className={`prize-card rarity-${item.rarity.toLowerCase()}`}>
            <span className="prize-emoji">{item.emoji}</span>
            <span className="prize-name">{item.name}</span>
            <span className="prize-rarity">{item.rarity}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
