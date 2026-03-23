import React from 'react';
import { type HistoryRow, type Prize } from '../types';
import { TGS_SVGS } from './TgsPlayer';

interface Props {
  history: HistoryRow[];
  catalog: Prize[];
  spinning?: boolean;
  userId?: number;
}

export const WinsTicker: React.FC<Props> = ({ history, catalog, spinning, userId }) => {
  if (!history.length) return null;

  let display = history;
  if (spinning && userId) {
    const idx = display.findIndex(r => r.user_id === userId);
    if (idx !== -1 && idx < 3) {
      display = [...display];
      display.splice(idx, 1);
    }
  }

  return (
    <div className="wins-block">
      <p className="wins-label">Выигрыши участников</p>
      <div className="wins-scroll">
        {display.slice(0, 10).map((r, i) => {
          const cat = catalog.find(p => p.key === r.prize_key);
          return (
            <div key={`${r.won_at}-${i}`} className="bubble" style={{ '--delay': `${i * 40}ms` } as React.CSSProperties}>
              {cat?.tgs && TGS_SVGS[cat.tgs] ? (
                <img src={TGS_SVGS[cat.tgs]} alt="" className="bubble-tgs" />
              ) : (
                <span className="bubble-emoji">{cat?.emoji || '🎁'}</span>
              )}
              <span className="bubble-name">{r.first_name || r.username || 'Игрок'}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
