import React, { useState } from 'react';
import { type RuntimeFlags, type Prize } from '../types';

interface AdminSheetProps {
  flags: RuntimeFlags;
  onToggle: (key: keyof RuntimeFlags) => void;
  onClose: () => void;
  spinCost: number;
  prizes: Prize[];
  onSaveWeights: (weights: Record<string, number>) => void;
}

const FLAG_META: Record<keyof RuntimeFlags, { title: string; sub: string }> = {
  demo:    { title: 'Демо', sub: 'Спины без оплаты' },
  gifts:   { title: 'Подарки', sub: 'Автовыдача в Telegram' },
  maint:   { title: 'Техработы', sub: 'Закрыть для юзеров' },
  testpay: { title: 'Тест оплаты', sub: 'Резервный флаг' },
};

export const AdminSheet: React.FC<AdminSheetProps> = ({
  flags, onToggle, onClose, spinCost, prizes, onSaveWeights,
}) => {
  const [weights, setWeights] = useState<Record<string, number>>(() =>
    Object.fromEntries(prizes.map(p => [p.key, p.weight]))
  );
  const [dirty, setDirty] = useState(false);

  const total = Object.values(weights).reduce((a, b) => a + b, 0);

  const set = (key: string, val: string) => {
    setWeights(prev => ({ ...prev, [key]: Math.max(0, parseInt(val) || 0) }));
    setDirty(true);
  };

  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-bar" />

        <div className="admin-hdr">
          <h2>Управление</h2>
          <button className="btn-sm" onClick={onClose}>Закрыть</button>
        </div>

        <div className="admin-row">
          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>Цена спина</span>
          <span className="admin-cost-val">{spinCost} ⭐</span>
        </div>

        {(Object.keys(flags) as Array<keyof RuntimeFlags>).map(key => {
          const on = flags[key];
          const m  = FLAG_META[key];
          return (
            <div key={key} className={`toggle-row${on ? ' on' : ''}`} onClick={() => onToggle(key)}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{m.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>{m.sub}</div>
              </div>
              <div className={`toggle-track${on ? ' on' : ''}`}>
                <div className="toggle-thumb" />
              </div>
            </div>
          );
        })}

        <div className="admin-section-lbl">Шансы призов</div>
        {prizes.map(p => (
          <div key={p.key} className="weight-row">
            <span className="weight-emoji">{p.emoji}</span>
            <span className="weight-label">{p.name}</span>
            <input
              className="weight-input"
              type="number"
              min="0"
              max="999"
              title={`Вес для ${p.name}`}
              aria-label={`Вес для ${p.name}`}
              value={weights[p.key] ?? p.weight}
              onChange={e => set(p.key, e.target.value)}
            />
            <span className="weight-pct">
              {total > 0 ? Math.round((weights[p.key] / total) * 100) : 0}%
            </span>
          </div>
        ))}

        <button
          className="btn-primary"
          style={{ marginTop: 10 }}
          disabled={!dirty}
          onClick={() => { onSaveWeights(weights); setDirty(false); }}
        >
          Сохранить
        </button>
      </div>
    </>
  );
};
