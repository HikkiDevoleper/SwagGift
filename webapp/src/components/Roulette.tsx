import React, { useRef, useEffect, useState, useCallback } from 'react';
import { type Prize } from '../types';
import { makeReel, rarityClass, tg } from '../utils';

interface Props {
  prizes: Prize[];
  onSpinEnd: (winner: Prize) => void;
  isSpinning: boolean;
  winner?: Prize;
}

// Must match CSS: .reel-card { width: 88px; margin: 0 4px; } → step = 96
const CARD_W = 88;
const CARD_M = 4;
const STEP = CARD_W + CARD_M * 2; // 96

export const Roulette: React.FC<Props> = ({ prizes, onSpinEnd, isSpinning, winner }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [reel, setReel]     = useState<Prize[]>([]);
  const [tx, setTx]         = useState(0);
  const [dur, setDur]       = useState(0);
  const [winIdx, setWinIdx] = useState(-1);
  const busy = useRef(false);

  // Measure actual container width
  const getW = useCallback(() => wrapRef.current?.offsetWidth || 340, []);

  // Idle reel — center card ~5 so the strip looks populated
  useEffect(() => {
    if (!prizes.length) return;
    const idleReel = makeReel(prizes).reel;
    setReel(idleReel);
    setDur(0);
    // No CSS padding! Center card 5 purely via translateX:
    setTx(getW() / 2 - 5 * STEP - STEP / 2);
  }, [prizes]);

  // SPIN
  useEffect(() => {
    if (!isSpinning || !winner || busy.current) return;
    busy.current = true;

    const { reel: newReel, stopIndex } = makeReel(prizes, winner);

    // 1) Reset: no transition, snap to start of reel
    setWinIdx(-1);
    setDur(0);
    setReel(newReel);
    setTx(getW() / 2 - STEP / 2); // card 0 centered

    // 2) After browser paints the reset, animate to winner
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const cw = getW();
        const target = cw / 2 - stopIndex * STEP - STEP / 2;

        setDur(5.5);
        setTx(target);

        // Haptic escalation
        let t = 0;
        const hap = setInterval(() => {
          t++;
          tg?.HapticFeedback?.impactOccurred?.(t < 20 ? 'light' : t < 40 ? 'medium' : 'heavy');
        }, 120);

        setTimeout(() => {
          clearInterval(hap);
          setWinIdx(stopIndex);
          tg?.HapticFeedback?.notificationOccurred?.('success');
          busy.current = false;
          onSpinEnd(winner);
        }, 5900);
      });
    });
  }, [isSpinning, winner]);

  useEffect(() => {
    if (!isSpinning) busy.current = false;
  }, [isSpinning]);

  return (
    <div className="reel-wrap" ref={wrapRef}>
      <div className="reel-pointer" />
      <div
        className="reel-track"
        style={{
          transform: `translateX(${tx}px)`,
          transition: dur > 0 ? `transform ${dur}s cubic-bezier(0.08, 0.82, 0.17, 1)` : 'none',
        }}
      >
        {reel.map((item, i) => (
          <div key={i} className={`reel-card r-${rarityClass(item.rarity)}${i === winIdx ? ' --win' : ''}`}>
            <span className="reel-emoji">{item.emoji}</span>
            <span className="reel-name">{item.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
