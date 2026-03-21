import React from 'react';
import { type RuntimeFlags } from '../types';

interface AdminSheetProps {
  flags: RuntimeFlags;
  onToggle: (key: keyof RuntimeFlags) => void;
  onClose: () => void;
  spinCost: number;
}

const FLAG_META: Record<keyof RuntimeFlags, { title: string; sub: string }> = {
  demo:    { title: "Демо-режим",        sub: "Тестовые спины без оплаты" },
  gifts:   { title: "Отправка подарков",  sub: "Автовыдача призов в Telegram" },
  maint:   { title: "Техрежим",          sub: "Закрыть доступ для игроков" },
  testpay: { title: "Тест оплаты",       sub: "Резервный флаг владельца" },
};

export const AdminSheet: React.FC<AdminSheetProps> = ({ flags, onToggle, onClose, spinCost }) => (
  <>
    <div className="sheet-backdrop" onClick={onClose} />
    <div className="bottom-sheet">
      <div className="sheet-handle" />

      <div className="admin-header">
        <h2>Панель управления</h2>
        <button className="btn-small" onClick={onClose}>Закрыть</button>
      </div>

      <div className="admin-info">
        <span className="label">Цена спина</span>
        <span className="value">{spinCost} ⭐</span>
      </div>

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
    </div>
  </>
);
