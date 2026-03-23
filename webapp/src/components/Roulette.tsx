import React, { useState, useEffect, useRef } from 'react';
import { tg, rarityClass, makeReel } from '../utils';
import { type Prize } from '../types';
import { TgsPlayer } from './TgsPlayer';

const CARD_W = 88;
const GAP = 8;
const STEP = CARD_W + GAP;

interface Props {
  prizes: Prize[];
  isSpinning: boolean;
  winner?: Prize;
  onSpinEnd: (p: Prize) => void;
}

export const Roulette: React.FC<Props> = ({ prizes, isSpinning, winner, onSpinEnd }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [reel, setReel] = useState<Prize[]>([]);
  const [tx, setTx] = useState(0);
  const [dur, setDur] = useState(0);
  const [winIdx, setWinIdx] = useState(-1);
  const busy = useRef(false);

  // Helper
  const getW = () => wrapRef.current?.clientWidth || 300;

  // INIT
  useEffect(() => {
    if (isSpinning || busy.current || !prizes.length) return;
    const { reel: newReel } = makeReel(prizes);
    setReel(newReel);
    setWinIdx(-1);
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

        setDur(6.5);
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
        }, 6800);
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
          transition: dur > 0 ? `transform ${dur}s cubic-bezier(0.02, 0.95, 0.05, 1)` : 'none',
        }}
      >
        {reel.map((item, i) => (
          <div key={`${i}-${item.key}`} className={`reel-card r-${rarityClass(item.rarity)}${i === winIdx ? ' --win' : ''}`}>
            {item.tgs ? (
              <TgsPlayer src={`/gifts/${item.tgs}`} size={56} autoplay={false} />
            ) : (
              <span className="reel-emoji">{item.emoji}</span>
            )}
            <span className="reel-name">{item.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
