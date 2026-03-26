import React, { useState, useEffect, useRef } from 'react';
import { tg, rarityClass } from '../utils';
import { type Prize } from '../types';
import { TgsPlayer } from './TgsPlayer';

const CARD_W = 92;
const GAP = 8;
const STEP = CARD_W + GAP;

interface Props {
  prizes: Prize[];
  isSpinning: boolean;
  winner?: Prize;
  onSpinEnd: (p: Prize) => void;
}

const getRandomItem = (arr: Prize[]) => arr[Math.floor(Math.random() * arr.length)];

export const Roulette: React.FC<Props> = ({ prizes, isSpinning, winner, onSpinEnd }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [reel, setReel] = useState<Prize[]>([]);
  const [tx, setTx] = useState(0);
  const [dur, setDur] = useState(0);
  const [winIdx, setWinIdx] = useState(-1);
  const busy = useRef(false);

  // Track the absolute stopping index across multiple spins
  const lastStopRef = useRef(0);

  const getW = () => wrapRef.current?.clientWidth || 320;

  // Initialize reel once
  useEffect(() => {
    if (isSpinning || busy.current || !prizes.length || reel.length > 0) return;
    const initialItems = Array.from({ length: 15 }, () => getRandomItem(prizes));
    setReel(initialItems);
    setDur(0);
    // 3 items offset visually initially
    const initTx = getW() / 2 - 3 * STEP - STEP / 2;
    setTx(initTx);
    lastStopRef.current = 3;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prizes]);

  // Spin effect
  useEffect(() => {
    if (!isSpinning || !winner || busy.current) return;
    busy.current = true;

    // We want to travel ~40 cards forward from the current stop index
    const travelDistance = 38 + Math.floor(Math.random() * 5); // 38..42
    const targetStop = lastStopRef.current + travelDistance;

    // Pad the reel up to targetStop + 10 items (so it doesn't look empty at the end)
    setReel(prev => {
      const needed = targetStop + 10 - prev.length;
      const extra = Array.from({ length: Math.max(0, needed) }, (_, i) => {
        // Drop the winner exactly at targetStop
        if (prev.length + i === targetStop) return winner;
        return getRandomItem(prizes);
      });
      return [...prev, ...extra];
    });

    setWinIdx(-1);
    
    // Animate to new target
    const targetTx = getW() / 2 - targetStop * STEP - STEP / 2;
    
    // Small timeout to ensure DOM paints the new reel items before transitioning
    setTimeout(() => {
      setDur(5.8);
      setTx(targetTx);
      lastStopRef.current = targetStop;

      // Haptic escalation
      let t = 0;
      const hap = setInterval(() => {
        t++;
        tg?.HapticFeedback?.impactOccurred?.(t < 18 ? 'light' : t < 36 ? 'medium' : 'heavy');
      }, 110);

      setTimeout(() => {
        clearInterval(hap);
        setWinIdx(targetStop);
        tg?.HapticFeedback?.notificationOccurred?.('success');
        busy.current = false;
        onSpinEnd(winner);
      }, 6000);
    }, 50);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSpinning, winner]);

  return (
    <div className="reel-wrap" ref={wrapRef}>
      <div className="reel-pointer" />
      <div
        className="reel-track"
        style={{
          transform: `translateX(${tx}px)`,
          transition: dur > 0
            ? `transform ${dur}s cubic-bezier(0.02, 0.96, 0.01, 1)`
            : 'none',
        }}
      >
        {reel.map((item, i) => (
          <div
            key={`${i}-${item.key}`}
            className={`reel-card r-${rarityClass(item.rarity)}${i === winIdx ? ' --win' : ''}`}
          >
            {item.tgs ? (
              <TgsPlayer
                src={`/gifts/${item.tgs}`}
                size={54}
                autoplay={false}
                loop={false}
              />
            ) : (
              <span className="reel-emoji">{item.emoji}</span>
            )}
            <span className="reel-name">{item.name}</span>
            {item.sell_value > 0 && (
              <span className="reel-price">{item.sell_value}★</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
