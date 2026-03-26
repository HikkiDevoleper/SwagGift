import React, { useEffect, useRef, useState } from 'react';
import { type HistoryRow, type Prize } from '../types';
import { TgsPlayer } from './TgsPlayer';

interface Props {
  history: HistoryRow[];
  catalog: Prize[];
  isSpinning?: boolean;
}

export const WinsTicker: React.FC<Props> = ({ history, catalog, isSpinning }) => {
  const [visible, setVisible] = useState(true);
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    window.clearTimeout(timerRef.current);
    if (isSpinning) {
      setVisible(false);
    } else {
      timerRef.current = window.setTimeout(() => setVisible(true), 500);
    }
    return () => window.clearTimeout(timerRef.current);
  }, [isSpinning]);

  if (!history.length) return null;

  return (
    <div className={`wins-block${visible ? '' : ' wins-hidden'}`}>
      <div className="wins-label-row">
        <span className="wins-dot" />
        <p className="wins-label">Выигрыши участников</p>
      </div>
      <div className="wins-scroll">
        {history.slice(0, 12).map((r, i) => {
          const cat = catalog.find(p => p.key === r.prize_key);
          return (
            <div
              key={`${r.won_at}-${i}`}
              className={`bubble bubble-delay-${Math.min(i, 7)}`}
            >
              {cat?.tgs ? (
                <TgsPlayer
                  src={`/gifts/${cat.tgs}`}
                  size={16}
                  autoplay={false}
                  loop={false}
                />
              ) : (
                <span className="bubble-emoji">{cat?.emoji || '🎁'}</span>
              )}
              <span className="bubble-name">{r.first_name || r.username || 'Игрок'}</span>
              {cat && cat.sell_value > 0 && (
                <span className="bubble-price">{cat.sell_value}★</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
