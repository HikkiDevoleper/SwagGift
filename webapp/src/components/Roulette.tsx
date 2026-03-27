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
  
  const busy = useRef(false);
  const [reel, setReel] = useState<Prize[]>([]);
  const blockRef = useRef<Prize[]>([]);
  const [tx, setTx] = useState(0);
  const [dur, setDur] = useState(0);
  const [winIdx, setWinIdx] = useState(-1);
  const lastStopRef = useRef(0);

  const getW = () => wrapRef.current?.clientWidth || 320;

  // Helper to generate a truly random 100-item block
  const generateBlock = (p: Prize[]) => {
    if (!p.length) return [];
    let pool = [...p];
    const totalW = p.reduce((a, b) => a + (b.weight || 1), 0);
    const getRandom = () => {
      let r = Math.random() * totalW;
      for (const item of p) {
        if (r < (item.weight || 1)) return item;
        r -= (item.weight || 1);
      }
      return p[0];
    };
    // Fill up to 100 items for high variety
    while (pool.length < 100) pool.push(getRandom());
    // Fisher-Yates shuffle
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool;
  };

  const updateReelState = (newBlock: Prize[]) => {
    blockRef.current = newBlock;
    let r: Prize[] = [];
    for (let i = 0; i < 8; i++) r = r.concat(newBlock);
    setReel(r);
    return newBlock;
  };

  useEffect(() => {
    if (!prizes.length && !reel.length) return;
    if (prizes.length && !reel.length) {
      const b = updateReelState(generateBlock(prizes));
      const N = b.length;
      const initIdx = N + Math.floor(Math.random() * 10) + 2;
      setTx(getW() / 2 - initIdx * STEP - STEP / 2);
      lastStopRef.current = initIdx;
    }
  }, [prizes]);

  useEffect(() => {
    if (!isSpinning || !winner || busy.current || !prizes.length) return;
    busy.current = true;

    // 1. Generate a FRESH block for THIS spin
    const newBlock = updateReelState(generateBlock(prizes));
    const N = newBlock.length;

    // 2. Jump instantly to a random starting position in Block 1
    const baseIdx = Math.floor(Math.random() * N);
    const startIdx = N + baseIdx;
    
    setDur(0);
    setTx(getW() / 2 - startIdx * STEP - STEP / 2);
    setWinIdx(-1);

    // 3. Find target in Block 4 or 5
    const targetBase = newBlock.findIndex(p => p.key === winner.key);
    const safeTargetBase = targetBase >= 0 ? targetBase : 0;
    const targetIdx = safeTargetBase + N * (4 + Math.floor(Math.random() * 2));

    // 4. Trigger animation on next frame
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
