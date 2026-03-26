import React from 'react';
import { tg, initialsOf, rankTitle } from '../utils';
import { type User } from '../types';

interface Props {
  user: User;
  isOwner: boolean;
  onTopup: () => void;
  onAdmin: () => void;
}

function xpProgress(wins: number): { pct: number; next: string; label: string } {
  if (wins < 3)  return { pct: (wins / 3) * 100,         next: '3',  label: 'до Игрока' };
  if (wins < 10) return { pct: ((wins - 3) / 7) * 100,   next: '10', label: 'до Везунчика' };
  if (wins < 20) return { pct: ((wins - 10) / 10) * 100, next: '20', label: 'до Коллекционера' };
  if (wins < 50) return { pct: ((wins - 20) / 30) * 100, next: '50', label: 'до Легенды' };
  return { pct: 100, next: '∞', label: 'Max rank' };
}

export const ProfilePage: React.FC<Props> = ({ user, isOwner, onTopup, onAdmin }) => {
  const tgPhoto = (tg?.initDataUnsafe?.user as any)?.photo_url || null;
  const rank = rankTitle(user.wins);
  const xp = xpProgress(user.wins);
  const winratePct = user.spins > 0
    ? Math.round((user.wins / user.spins) * 100)
    : 0;

  return (
    <div className="page fade-in" key="prof">
      {/* ── Hero card ── */}
      <div className="prof-hero">
        <div className="prof-ava-wrap">
          <div className="prof-ava-lg">
            {tgPhoto ? <img src={tgPhoto} alt="" /> : initialsOf(user)}
          </div>
          {isOwner && <span className="prof-owner-badge">Owner</span>}
        </div>

        <h2 className="prof-name">{user.first_name}</h2>
        {user.username && <p className="prof-handle">@{user.username}</p>}

        <span className="prof-rank-badge">{rank}</span>

        {/* XP bar */}
        <div className="prof-xp-wrap">
          <div className="prof-xp-bar">
            <div
              className="prof-xp-fill"
              style={{ width: `${xp.pct}%` }}
            />
          </div>
          <span className="prof-xp-lbl">{user.wins} / {xp.next} побед {xp.label}</span>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="prof-stats-grid">
        <div className="prof-stat-card">
          <span className="prof-stat-icon">⭐</span>
          <span className="prof-stat-val">{user.balance || 0}</span>
          <span className="prof-stat-lbl">Баланс</span>
        </div>
        <div className="prof-stat-card">
          <span className="prof-stat-icon">🎁</span>
          <span className="prof-stat-val">{user.wins}</span>
          <span className="prof-stat-lbl">Победы</span>
        </div>
        <div className="prof-stat-card">
          <span className="prof-stat-icon">🎲</span>
          <span className="prof-stat-val">{user.spins}</span>
          <span className="prof-stat-lbl">Спинов</span>
        </div>
        <div className="prof-stat-card">
          <span className="prof-stat-icon">💸</span>
          <span className="prof-stat-val">{user.stars_spent || 0}</span>
          <span className="prof-stat-lbl">Потрачено</span>
        </div>
      </div>

      {/* ── Win rate ── */}
      {user.spins > 0 && (
        <div className="prof-winrate">
          <span className="prof-winrate-lbl">Winrate</span>
          <div className="prof-wr-bar-wrap">
            <div
              className="prof-wr-bar"
              style={{ width: `${winratePct}%` }}
            />
          </div>
          <span className="prof-winrate-pct">{winratePct}%</span>
        </div>
      )}

      <button className="btn btn-w" onClick={onTopup}>Пополнить баланс</button>
      {isOwner && (
        <button className="btn btn-outline btn-mt" onClick={onAdmin}>⚙ Управление</button>
      )}
    </div>
  );
};
