import React, { useState, useEffect, useRef, useMemo } from 'react';
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

export const Roulette: React.FC<Props> = ({ prizes, isSpinning, winner, onSpinEnd }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  
  // 1. Create a shuffled block of all prizes ONCE.
  const block = useMemo(() => {
    if (!prizes.length) return [];
    const arr = [...prizes];
    // Simple deterministic shuffle so it feels random but fixed
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.sin(i * 999) * 10000) % (i + 1);
      const absJ = Math.abs(j);
      [arr[i], arr[absJ]] = [arr[absJ], arr[i]];
    }
    return arr;
  }, [prizes]);

  // 2. Repeat the block 8 times to form a long track
  const reel = useMemo(() => {
    if (!block.length) return [];
    let r: Prize[] = [];
    for (let i = 0; i < 8; i++) r = r.concat(block);
    return r;
  }, [block]);

  const N = block.length;
  const [tx, setTx] = useState(0);
  const [dur, setDur] = useState(0);
  const [winIdx, setWinIdx] = useState(-1);
  const busy = useRef(false);
  
  // We track the logical stop index. Start slightly inside block 1.
  const lastStopRef = useRef(0);

  const getW = () => wrapRef.current?.clientWidth || 320;

  useEffect(() => {
    if (isSpinning || busy.current || !reel.length) return;
    if (lastStopRef.current === 0) {
      const initIdx = N + 2; 
      setDur(0);
      setTx(getW() / 2 - initIdx * STEP - STEP / 2);
      lastStopRef.current = initIdx;
    }
  }, [reel, isSpinning]);

  useEffect(() => {
    if (!isSpinning || !winner || busy.current || !reel.length) return;
    busy.current = true;

    // Since the track repeats, we seamlessly jump back to Block 1 
    // to give us plenty of room to spin forward without adding new DOM nodes!
    const baseIdx = lastStopRef.current % N;
    const startIdx = N + baseIdx; // Block 1 equivalent
    
    // Jump instantly
    setDur(0);
    setTx(getW() / 2 - startIdx * STEP - STEP / 2);
    setWinIdx(-1);

    // Find the target winner in Block 5 or 6
    const targetBase = block.findIndex(p => p.key === winner.key);
    // Fallback if not found
    const safeTargetBase = targetBase >= 0 ? targetBase : 0;
    
    const targetIdx = safeTargetBase + N * (4 + Math.floor(Math.random() * 2)); 

    // Wait 2 frames so the instant jump renders, then spin!
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setDur(5.8);
        setTx(getW() / 2 - targetIdx * STEP - STEP / 2);
        lastStopRef.current = targetIdx;

        let t = 0;
        const hap = setInterval(() => {
          t++;
          tg?.HapticFeedback?.impactOccurred?.(t < 20 ? 'light' : t < 40 ? 'medium' : 'heavy');
        }, 110);

        setTimeout(() => {
          clearInterval(hap);
          setWinIdx(targetIdx);
          tg?.HapticFeedback?.notificationOccurred?.('success');
          busy.current = false;
          onSpinEnd(winner);
        }, 6000);
      });
    });
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
            key={i} // IMPORTANT: key is index. React won't remount nodes.
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
