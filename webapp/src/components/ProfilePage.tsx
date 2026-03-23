import React from 'react';
import { type User } from '../types';

interface Props {
  user: User;
  onClose: () => void;
}

export const ProfilePage: React.FC<Props> = ({ user, onClose }) => {
  return (
    <div className="page fade-in">
      <div className="pg-hdr">
        <button className="btn-back" onClick={onClose}>Назад</button>
        <span className="pg-title">Профиль</span>
        <div className="pg-hdr-filler" />
      </div>

      <div className="prof-card">
        {user.photo_url ? (
          <img src={user.photo_url} alt="avatar" className="prof-avatar" />
        ) : (
          <div className="prof-avatar-placeholder" />
        )}
        <div className="prof-name">{user.first_name}</div>
        <div className="prof-un">@{user.username || user.user_id}</div>

        <div className="prof-stats-grid">
          <div className="stat-box">
            <span className="stat-v">{user.spins}</span>
            <span className="stat-l">Крутов</span>
          </div>
          <div className="stat-box">
            <span className="stat-v">{user.wins}</span>
            <span className="stat-l">Открытий</span>
          </div>
          <div className="stat-box">
            <span className="stat-v">{user.balance} ⭐</span>
            <span className="stat-l">Баланс</span>
          </div>
          <div className="stat-box">
            <span className="stat-v">{user.stars_spent} ⭐</span>
            <span className="stat-l">Потрачено</span>
          </div>
        </div>
      </div>
    </div>
  );
};
