import React from 'react';
import { cn, formatDate } from '../utils';
import { type InventoryItem, type Prize } from '../types';
import { TgsPlayer } from './TgsPlayer';

interface Props {
  prizes: InventoryItem[];
  catalog: Prize[];
  onSell: (id: number, key: string) => void;
  onWithdraw: (id: number) => void;
}

export const InventoryPage: React.FC<Props> = ({ prizes, catalog, onSell, onWithdraw }) => (
  <div className="page fade-in">
    <div className="page-header">
      <h1 className="pg-title">🎁 Мои призы</h1>
      <p className="pg-subtitle">Ваши выигранные подарки</p>
    </div>
    {prizes.length === 0 ? (
      <div className="empty">
        <div className="empty-icon">📦</div>
        <p>Ещё нет призов</p>
        <p className="empty-sub">Крутите рулетку чтобы выиграть!</p>
      </div>
    ) : (
      <div className="inv-grid">
        {prizes.map((item, i) => {
          const cat = catalog.find(p => p.key === item.key);
          const sv = cat?.sell_value || 0;
          const isW = item.status === 'withdrawing';
          return (
            <div key={item.id || i} className={cn('inv-item', isW && 'withdrawing')} style={{ animationDelay: `${i * 35}ms` }}>
              {cat?.tgs ? (
                <div style={{ alignSelf: 'center', marginBottom: 6 }}>
                  <TgsPlayer src={`/gifts/${cat.tgs}`} size={44} autoplay={false} />
                </div>
              ) : (
                <span className="inv-emoji">{cat?.emoji || '🎁'}</span>
              )}
              <span className="inv-name">{item.name}</span>
              <span className="inv-rarity">{item.rarity}</span>
              <span className="inv-date">{formatDate(item.date)}</span>
              {isW ? (
                <span className="inv-status">⏳ Выводится…</span>
              ) : item.key !== 'nothing' && (
                <div className="inv-btns">
                  <button className="inv-btn" onClick={() => onWithdraw(item.id)}>Получить</button>
                  <button className="inv-btn inv-btn-sell" onClick={() => onSell(item.id, item.key)}>
                    {sv > 0 ? `${sv} ⭐` : 'Продать'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    )}
  </div>
);
