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
  
  // 1. Create a randomly shuffled block of all prizes ONCE per mount.
  const block = useMemo(() => {
    if (!prizes.length) return [];
    const arr = [...prizes];
    // Fisher-Yates shuffle with true randomness
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, [prizes]);

  const [reel, setReel] = useState<Prize[]>(() => {
    if (!block.length) return [];
    let r: Prize[] = [];
    // 10 blocks gives us plenty of room (approx 100-150 items)
    for (let i = 0; i < 10; i++) r = r.concat(block);
    return r;
  });

  const N = Math.max(1, block.length);
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

    // 1. Calculate jump point and target point
    const lastTarget = lastStopRef.current;
    const baseIdx = lastTarget % N;
    const startIdx = N + baseIdx; // Jump back to a safe low index (block 1 equivalent)
    const targetIdx = startIdx + N * 4 + Math.floor(Math.random() * N); // Target is ~4-5 blocks ahead
    
    // 2. Mutate reel before jumping
    setReel(prev => {
      if (!prev.length) return prev;
      const next = [...prev];

      // Copy visual neighborhood of lastTarget exactly over startIdx
      // so the instant jump is 100% visually seamless! (-5 to +5 items)
      for (let i = -5; i <= 5; i++) {
        if (startIdx + i >= 0 && lastTarget + i >= 0 && lastTarget + i < next.length) {
          next[startIdx + i] = prev[lastTarget + i];
        }
      }

      // Randomize everything ahead of the visible area
      for (let i = startIdx + 6; i < next.length; i++) {
        if (i !== targetIdx) {
          next[i] = prizes[Math.floor(Math.random() * prizes.length)];
        }
      }

      // Slot in the guaranteed winner
      next[targetIdx] = winner;
      return next;
    });

    // 3. Jump instantly to startIdx
    setDur(0);
    setTx(getW() / 2 - startIdx * STEP - STEP / 2);
    setWinIdx(-1);

    // 4. Wait 2 frames so the instant jump and state flush renders, then spin!
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
