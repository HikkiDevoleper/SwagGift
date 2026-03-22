import React from 'react';
import { type HistoryRow, type Prize } from '../types';
import { TgsPlayer } from './TgsPlayer';

interface Props {
  history: HistoryRow[];
  catalog: Prize[];
}

export const WinsTicker: React.FC<Props> = ({ history, catalog }) => {
  if (!history.length) return null;

  return (
    <div className="wins-block">
      <p className="wins-label">Выигрыши участников</p>
      <div className="wins-scroll">
        {history.slice(0, 10).map((r, i) => {
          const cat = catalog.find(p => p.key === r.prize_key);
          return (
            <div key={`${r.won_at}-${i}`} className="bubble" style={{ animationDelay: `${i * 40}ms` }}>
              {cat?.tgs ? (
                <div style={{ flexShrink: 0, marginTop: -2, paddingRight: 2 }}>
                  <TgsPlayer src={`/gifts/${cat.tgs}`} size={18} autoplay={false} />
                </div>
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
