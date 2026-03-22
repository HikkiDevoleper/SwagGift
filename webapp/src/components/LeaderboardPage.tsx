import React from 'react';
import { cn, initialsOf } from '../utils';
import { type LeaderboardRow } from '../types';

interface Props {
  rows: LeaderboardRow[];
}

const MEDALS = ['🥇', '🥈', '🥉'];

export const LeaderboardPage: React.FC<Props> = ({ rows }) => (
  <div className="page fade-in" key="top">
    <h1 className="pg-title">Рейтинг</h1>
    {rows.length === 0 ? (
      <div className="empty"><p>Пусто</p></div>
    ) : (
      <div className="lb-list">
        {rows.map((r, i) => (
          <div key={i} className="lb-row" style={{ animationDelay: `${i * 40}ms` }}>
            <span className={cn('lb-medal', i === 0 && 'gold', i === 1 && 'silver', i === 2 && 'bronze')}>
              {i < 3 ? MEDALS[i] : i + 1}
            </span>
            <div className="lb-ava">{initialsOf(r)}</div>
            <div className="lb-info">
              <div className="lb-name">{r.first_name || r.username || 'Игрок'}</div>
              <div className="lb-sub">{r.spins} спинов · {r.stars_spent} ⭐</div>
            </div>
            <div className="lb-wins">{r.wins} 🏆</div>
          </div>
        ))}
      </div>
    )}
  </div>
);
