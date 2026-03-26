import React, { useState } from 'react';
import { cn, formatDate, rarityClass } from '../utils';
import { type InventoryItem, type Prize } from '../types';
import { TgsPlayer } from './TgsPlayer';

type Filter = 'all' | 'active' | 'sold';

interface Props {
  prizes: InventoryItem[];
  catalog: Prize[];
  onSell: (id: number, key: string) => void;
  onWithdraw: (id: number) => void;
  refreshPrizes?: () => void;
}

export const InventoryPage: React.FC<Props> = ({ prizes, catalog, onSell, onWithdraw }) => {
  const [filter, setFilter] = useState<Filter>('all');

  const filtered = prizes.filter(item => {
    if (filter === 'active') return item.status === 'active';
    if (filter === 'sold')   return item.status === 'sold';
    return true;
  });

  const counts = {
    all: prizes.length,
    active: prizes.filter(p => p.status === 'active').length,
    sold: prizes.filter(p => p.status === 'sold').length,
  };

  return (
    <div className="page fade-in" key="inv">
      <div className="pg-header">
        <h1 className="pg-title">Мои призы</h1>
        <span className="pg-sub">{prizes.length} шт.</span>
      </div>

      {/* Filter tabs */}
      <div className="inv-tabs">
        {(['all', 'active', 'sold'] as Filter[]).map(f => (
          <button
            key={f}
            className={cn('inv-tab', filter === f && 'on')}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'Все' : f === 'active' ? 'Активные' : 'Проданные'}
            <span className="inv-tab-cnt">{counts[f]}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty">
          <span className="empty-icon">🎁</span>
          <p>{prizes.length === 0 ? 'Ещё нет призов — крути и выигрывай' : 'Нет в этом разделе'}</p>
        </div>
      ) : (
        <div className="inv-grid">
          {filtered.map((item, i) => {
            const cat = catalog.find(p => p.key === item.key);
            const sv = cat?.sell_value || 0;
            const isW = item.status === 'withdrawing';
            const isSold = item.status === 'sold';
            return (
              <div
                key={item.id || i}
                className={cn('inv-item', `r-item-${rarityClass(item.rarity)}`, isW && 'withdrawing', isSold && 'sold')}
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <div className="inv-sticker">
                  {cat?.tgs ? (
                    <TgsPlayer src={`/gifts/${cat.tgs}`} size={52} autoplay={false} loop={false} />
                  ) : (
                    <span className="inv-emoji">{cat?.emoji || '🎁'}</span>
                  )}
                </div>
                <span className="inv-name">{item.name}</span>
                <div className="inv-meta-row">
                  <span className={`inv-rarity r-badge-${rarityClass(item.rarity)}`}>{item.rarity}</span>
                  {sv > 0 && <span className="inv-price">{sv}★</span>}
                </div>
                <span className="inv-date">{formatDate(item.date)}</span>

                {isW ? (
                  <span className="inv-status">⏳ Выводится…</span>
                ) : isSold ? (
                  <span className="inv-sold-lbl">Продано</span>
                ) : item.key !== 'nothing' && (
                  <div className="inv-btns">
                    <button className="inv-btn" onClick={() => onWithdraw(item.id)}>
                      Вывести
                    </button>
                    {sv > 0 && (
                      <button className="inv-btn inv-btn-sell" onClick={() => onSell(item.id, item.key)}>
                        {sv}⭐
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
