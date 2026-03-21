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
        setDuration(5); // 5 seconds spin
        const targetOffset = -(stopIndex * CARD_WIDTH) + (window.innerWidth / 2) - (CARD_WIDTH / 2);
        setOffset(targetOffset);
        
        // Haptic feedback during spin
        const hapticInterval = setInterval(() => {
          tg?.HapticFeedback.impactOccurred('light');
        }, 100);

        setTimeout(() => {
          clearInterval(hapticInterval);
          onSpinEnd(winner);
          tg?.HapticFeedback.notificationOccurred('success');
        }, 5100);
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
          transition: duration > 0 ? `transform ${duration}s cubic-bezier(0.1, 0, 0.1, 1)` : 'none'
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
