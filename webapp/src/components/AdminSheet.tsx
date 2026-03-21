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
  demo:    { title: "Демо-режим",        sub: "Спины без оплаты (только для вас)" },
  gifts:   { title: "Отправка подарков",  sub: "Автовыдача призов через Telegram" },
  maint:   { title: "Техрежим",          sub: "Закрыть доступ для игроков" },
  testpay: { title: "Тест оплаты",       sub: "Резервный флаг" },
};

export const AdminSheet: React.FC<AdminSheetProps> = ({
  flags, onToggle, onClose, spinCost, prizes, onSaveWeights
}) => {
  const [weights, setWeights] = useState<Record<string, number>>(() =>
    Object.fromEntries(prizes.map(p => [p.key, p.weight]))
  );
  const [dirty, setDirty] = useState(false);

  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);

  const handleWeightChange = (key: string, value: string) => {
    const num = Math.max(0, parseInt(value) || 0);
    setWeights(prev => ({ ...prev, [key]: num }));
    setDirty(true);
  };

  const handleSave = () => {
    onSaveWeights(weights);
    setDirty(false);
  };

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="bottom-sheet">
        <div className="sheet-handle" />

        <div className="admin-header">
          <h2>Управление</h2>
          <button className="btn-small" onClick={onClose}>Закрыть</button>
        </div>

        <div className="admin-info">
          <span className="label">Цена спина</span>
          <span className="value">{spinCost} ⭐</span>
        </div>

        {/* Flags */}
        {(Object.keys(flags) as Array<keyof RuntimeFlags>).map((key) => {
          const meta = FLAG_META[key];
          const on = flags[key];
          return (
            <div
              key={key}
              className={`toggle-row${on ? ' toggle-row--on' : ''}`}
              onClick={() => onToggle(key)}
            >
              <div className="list-content">
                <div className="list-title">{meta.title}</div>
                <div className="list-subtitle">{meta.sub}</div>
              </div>
              <div className={`toggle-track${on ? ' toggle-track--on' : ''}`}>
                <div className="toggle-thumb" />
              </div>
            </div>
          );
        })}

        {/* Weights Editor */}
        <div className="admin-section-title">Шансы призов</div>
        {prizes.map(p => (
          <div key={p.key} className="weight-row">
            <div className="prize-label">
              <span className="emoji">{p.emoji}</span>
              {p.name}
            </div>
            <input
              className="weight-input"
              type="number"
              aria-label={`Шанс для ${p.name}`}
              title="Шанс выпадения"
              min="0"
              max="999"
              value={weights[p.key] ?? p.weight}
              onChange={e => handleWeightChange(p.key, e.target.value)}
            />
            <span className="weight-pct">
              {totalWeight > 0 ? Math.round((weights[p.key] / totalWeight) * 100) : 0}%
            </span>
          </div>
        ))}

        <button className="btn-save" onClick={handleSave} disabled={!dirty}>
          Сохранить шансы
        </button>
      </div>
    </>
  );
};
