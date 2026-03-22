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
const STEP   = CARD_W + CARD_M * 2; // 96

export const Roulette: React.FC<Props> = ({ prizes, onSpinEnd, isSpinning, winner }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [reel, setReel]     = useState<Prize[]>([]);
  const [tx, setTx]         = useState(0);
  const [dur, setDur]       = useState(0);
  const [easing, setEasing] = useState('none');
  const [winIdx, setWinIdx] = useState(-1);
  const [shaking, setShaking] = useState(false);
  const busy = useRef(false);

  const getW = useCallback(() => wrapRef.current?.offsetWidth || 340, []);

  // Idle reel
  useEffect(() => {
    if (!prizes.length) return;
    const idleReel = makeReel(prizes).reel;
    setReel(idleReel);
    setDur(0);
    setEasing('none');
    setTx(getW() / 2 - 5 * STEP - STEP / 2);
  }, [prizes]);

  // SPIN — stronger physics
  useEffect(() => {
    if (!isSpinning || !winner || busy.current) return;
    busy.current = true;

    const { reel: newReel, stopIndex } = makeReel(prizes, winner);

    setWinIdx(-1);
    setDur(0);
    setEasing('none');
    setReel(newReel);
    setTx(getW() / 2 - STEP / 2); // snap to card 0

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const cw = getW();
        // Overshoot slightly past winner, then settle back
        const winTx = cw / 2 - stopIndex * STEP - STEP / 2;
        const overshootTx = winTx - 18; // px overshoot

        // Phase 1: fast scroll with strong deceleration (drum-roll feel)
        setDur(5.2);
        setEasing('cubic-bezier(0.05, 0.85, 0.18, 1)');
        setTx(overshootTx);

        // Haptic escalation throughout roll
        let tick = 0;
        const hap = setInterval(() => {
          tick++;
          tg?.HapticFeedback?.impactOccurred?.(
            tick < 15 ? 'light' : tick < 35 ? 'medium' : 'heavy'
          );
        }, 100);

        // Phase 2: elastic settle after overshoot
        setTimeout(() => {
          setDur(0.45);
          setEasing('cubic-bezier(0.34, 1.56, 0.64, 1)'); // spring back
          setTx(winTx);
        }, 5100);

        setTimeout(() => {
          clearInterval(hap);
          setShaking(true);
          tg?.HapticFeedback?.notificationOccurred?.('success');
          setTimeout(() => setShaking(false), 500);
          setWinIdx(stopIndex);
          busy.current = false;
          onSpinEnd(winner);
        }, 5600);
      });
    });
  }, [isSpinning, winner]);

  useEffect(() => {
    if (!isSpinning) busy.current = false;
  }, [isSpinning]);

  return (
    <div className={`reel-wrap${shaking ? ' reel-shake' : ''}`} ref={wrapRef}>
      <div className="reel-pointer" />
      <div
        className="reel-track"
        style={{
          transform:  `translateX(${tx}px)`,
          transition: dur > 0 ? `transform ${dur}s ${easing}` : 'none',
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
