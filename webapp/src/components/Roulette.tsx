import React, { useState, useEffect, useRef, useMemo } from 'react';
import { tg, rarityClass, makeReel } from '../utils';
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

export const Roulette: React.FC<Props> = ({ prizes, isSpinning, winner, onSpinEnd }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [reel, setReel] = useState<Prize[]>([]);
  const [tx, setTx] = useState(0);
  const [dur, setDur] = useState(0);
  const [winIdx, setWinIdx] = useState(-1);
  const busy = useRef(false);

  // Current real-world translateX — survives across spins so we always
  // continue from wherever the reel stopped (no snap-to-start).
  const currentTx = useRef(0);

  const getW = () => wrapRef.current?.clientWidth || 320;

  // Build initial reel once — no transition
  useEffect(() => {
    if (isSpinning || busy.current || !prizes.length) return;
    const { reel: newReel } = makeReel(prizes);
    const w = getW();
    const initTx = w / 2 - 5 * STEP - STEP / 2;
    setReel(newReel);
    setWinIdx(-1);
    setDur(0);
    setTx(initTx);
    currentTx.current = initTx;
  }, [prizes]);

  // Spin effect
  useEffect(() => {
    if (!isSpinning || !winner || busy.current) return;
    busy.current = true;

    const { reel: newReel, stopIndex } = makeReel(prizes, winner);
    const w = getW();

    // Place new reel so card-0 is exactly where the reel currently sits
    // visually — then animate forward to the winner card.
    // We do NOT snap to start; we compute how far we still need to travel.
    const target = w / 2 - stopIndex * STEP - STEP / 2;

    setReel(newReel);
    setWinIdx(-1);

    // Apply the new reel without transition at current visual position
    setDur(0);
    setTx(currentTx.current);

    // One rAF pair is enough to flush the no-transition paint
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setDur(5.8);
        setTx(target);
        currentTx.current = target;

        // Haptic escalation
        let t = 0;
        const hap = setInterval(() => {
          t++;
          tg?.HapticFeedback?.impactOccurred?.(t < 18 ? 'light' : t < 36 ? 'medium' : 'heavy');
        }, 110);

        setTimeout(() => {
          clearInterval(hap);
          setWinIdx(stopIndex);
          tg?.HapticFeedback?.notificationOccurred?.('success');
          busy.current = false;
          onSpinEnd(winner);
        }, 6000);
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
