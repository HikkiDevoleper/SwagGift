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
  const spinTimeoutRef = useRef<NodeJS.Timeout>();
  const hapticIntervalRef = useRef<NodeJS.Timeout>();

  const CARD_WIDTH = 110; // width + margin
  const SPIN_DURATION = 5.5; // seconds

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

      // Force reflow to trigger animation
      const reflow = setTimeout(() => {
        setDuration(SPIN_DURATION);
        const targetOffset = -(stopIndex * CARD_WIDTH) + (window.innerWidth / 2) - (CARD_WIDTH / 2);
        setOffset(targetOffset);
        
        // Haptic feedback during spin - escalating intensity
        let hapticCount = 0;
        hapticIntervalRef.current = setInterval(() => {
          hapticCount++;
          if (hapticCount < 20) {
            tg?.HapticFeedback.impactOccurred('light');
          } else if (hapticCount < 35) {
            tg?.HapticFeedback.impactOccurred('medium');
          } else {
            tg?.HapticFeedback.impactOccurred('heavy');
          }
        }, 100);

        // Finish spin and trigger callback
        spinTimeoutRef.current = setTimeout(() => {
          if (hapticIntervalRef.current) {
            clearInterval(hapticIntervalRef.current);
          }
          onSpinEnd(winner);
          // Victory haptic pattern
          tg?.HapticFeedback.notificationOccurred('success');
        }, (SPIN_DURATION + 0.2) * 1000);
      }, 50);

      return () => {
        clearTimeout(reflow);
        if (spinTimeoutRef.current) clearTimeout(spinTimeoutRef.current);
        if (hapticIntervalRef.current) clearInterval(hapticIntervalRef.current);
      };
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
