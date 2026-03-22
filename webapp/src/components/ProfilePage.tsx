import React from 'react';
import { tg, initialsOf, rankTitle } from '../utils';
import { type User } from '../types';

interface Props {
  user: User;
  isOwner: boolean;
  onTopup: () => void;
  onAdmin: () => void;
}

export const ProfilePage: React.FC<Props> = ({ user, isOwner, onTopup, onAdmin }) => {
  const tgPhoto = (tg?.initDataUnsafe?.user as any)?.photo_url || null;

  return (
    <div className="page fade-in" key="prof">
      <div className="prof-card">
        <div className="prof-ava-lg">
          {tgPhoto ? <img src={tgPhoto} alt="" /> : initialsOf(user)}
        </div>
        <h2 className="prof-name">{user.first_name}</h2>
        {user.username && <p className="prof-handle">@{user.username}</p>}
        <p className="prof-rank">{rankTitle(user.wins)}</p>

        <div className="prof-stats">
          <div className="prof-stat">
            <span className="prof-stat-val">{user.balance || 0}</span>
            <span className="prof-stat-lbl">Баланс ⭐</span>
          </div>
          <div className="prof-stat-sep" />
          <div className="prof-stat">
            <span className="prof-stat-val">{user.wins}</span>
            <span className="prof-stat-lbl">Побед</span>
          </div>
          <div className="prof-stat-sep" />
          <div className="prof-stat">
            <span className="prof-stat-val">{user.spins}</span>
            <span className="prof-stat-lbl">Спинов</span>
          </div>
        </div>
      </div>

      <button className="btn btn-w" onClick={onTopup}>Пополнить баланс</button>
      {isOwner && (
        <button className="btn btn-outline btn-mt" onClick={onAdmin}>⚙️ Управление</button>
      )}
    </div>
  );
};
