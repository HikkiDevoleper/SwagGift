import React, { useRef, useEffect, useState, useCallback } from 'react';
import { type Prize } from '../types';
import { makeReel, rarityClass, tg } from '../utils';

interface RouletteProps {
  prizes: Prize[];
  onSpinEnd: (winner: Prize) => void;
  isSpinning: boolean;
  winner?: Prize;
}

const CARD_W = 95;   // min-width of .prize-card
const CARD_GAP = 10; // margin: 0 5px → 5*2
const CARD_STEP = CARD_W + CARD_GAP; // 105

export const Roulette: React.FC<RouletteProps> = ({ prizes, onSpinEnd, isSpinning, winner }) => {
  const [reelItems, setReelItems] = useState<Prize[]>([]);
  const [offset, setOffset] = useState(0);
  const [duration, setDuration] = useState(0);
  const [winIdx, setWinIdx] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const spinning = useRef(false);

  // Initial idle reel
  useEffect(() => {
    if (prizes.length) setReelItems(makeReel(prizes).reel);
  }, [prizes]);

  // Spin animation
  useEffect(() => {
    if (!isSpinning || !winner || spinning.current) return;
    spinning.current = true;

    const { reel, stopIndex } = makeReel(prizes, winner);
    setReelItems(reel);
    setWinIdx(-1);
    setDuration(0);
    setOffset(0);

    // Measure actual container width for precise centering
    const containerW = wrapRef.current?.offsetWidth ?? window.innerWidth;
    const halfContainer = containerW / 2;

    // The reel has padding-left = halfContainer (set via CSS 50%).
    // Card N center = paddingLeft + N*CARD_STEP + CARD_STEP/2
    // To put card center at container center:
    //   paddingLeft + N*CARD_STEP + CARD_STEP/2 + translateX = halfContainer
    //   translateX = halfContainer - paddingLeft - N*CARD_STEP - CARD_STEP/2
    //   Since paddingLeft = halfContainer (50% of container):
    //   translateX = -N*CARD_STEP - CARD_STEP/2
    const target = -(stopIndex * CARD_STEP) - CARD_STEP / 2;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const spinTime = 5.5;
        setDuration(spinTime);
        setOffset(target);

        // Escalating haptic feedback
        let tick = 0;
        const haptic = setInterval(() => {
          tick++;
          const level = tick < 20 ? 'light' : tick < 40 ? 'medium' : 'heavy';
          tg?.HapticFeedback?.impactOccurred?.(level);
        }, 110);

        setTimeout(() => {
          clearInterval(haptic);
          setWinIdx(stopIndex);
          tg?.HapticFeedback?.notificationOccurred?.('success');
          spinning.current = false;
          onSpinEnd(winner);
        }, (spinTime + 0.4) * 1000);
      });
    });
  }, [isSpinning, winner]);

  // Reset on cycle end
  useEffect(() => {
    if (!isSpinning) spinning.current = false;
  }, [isSpinning]);

  return (
    <div className="roulette-wrap" ref={wrapRef}>
      <div className="roulette-pointer" />
      <div
        className="roulette-reel"
        style={{
          transform: `translateX(${offset}px)`,
          transition: duration > 0
            ? `transform ${duration}s cubic-bezier(0.08, 0.65, 0.20, 1)`
            : 'none',
        }}
      >
        {reelItems.map((item, i) => (
          <div
            key={i}
            className={
              `prize-card rarity-${rarityClass(item.rarity)}` +
              (i === winIdx ? ' prize-card--winner' : '')
            }
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
