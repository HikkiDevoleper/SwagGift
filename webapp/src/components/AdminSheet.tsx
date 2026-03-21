import React from 'react';
import { type RuntimeFlags } from '../types';
import { classNames } from '../utils';

interface AdminSheetProps {
  flags: RuntimeFlags;
  onToggle: (key: keyof RuntimeFlags) => void;
  onClose: () => void;
  spinCost: number;
}

const ownerFlagMeta: Record<keyof RuntimeFlags, { title: string; subtitle: string }> = {
  demo: {
    title: "Демо-режим",
    subtitle: "Тестовая запись выигрышей",
  },
  gifts: {
    title: "Отправка подарков",
    subtitle: "Автовыдача призов в Telegram",
  },
  maint: {
    title: "Техрежим",
    subtitle: "Ограничить вход для игроков",
  },
  testpay: {
    title: "Тест оплаты",
    subtitle: "Резервный флаг владельца",
  },
};

export const AdminSheet: React.FC<AdminSheetProps> = ({ flags, onToggle, onClose, spinCost }) => {
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="bottom-sheet">
        <div className="sheet-handle" />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ margin: 0, fontSize: '20px' }}>Админ-панель</h2>
          <button className="secondary-button" style={{ width: 'auto', marginTop: 0 }} onClick={onClose}>Закрыть</button>
        </div>
        
        <div className="glass-card" style={{ padding: '12px', background: 'rgba(255,255,255,0.05)', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
            <span style={{ color: 'var(--hint)' }}>Цена спина:</span>
            <span style={{ fontWeight: 'bold', color: 'var(--gold)' }}>{spinCost} ⭐</span>
          </div>
        </div>

        <div style={{ display: 'grid', gap: '10px' }}>
          {(Object.keys(flags) as Array<keyof RuntimeFlags>).map((key) => {
            const meta = ownerFlagMeta[key];
            return (
              <div 
                key={key} 
                className="list-item" 
                onClick={() => onToggle(key)}
                style={{ cursor: 'pointer', border: flags[key] ? '1px solid var(--accent)' : '1px solid transparent' }}
              >
                <div className="list-content">
                  <div className="list-title">{meta.title}</div>
                  <div className="list-subtitle">{meta.subtitle}</div>
                </div>
                <div 
                  style={{ 
                    width: '40px', 
                    height: '20px', 
                    borderRadius: '10px', 
                    background: flags[key] ? 'var(--accent)' : 'var(--line)',
                    position: 'relative',
                    transition: '0.3s'
                  }}
                >
                  <div style={{ 
                    width: '16px', 
                    height: '16px', 
                    borderRadius: '50%', 
                    background: 'white', 
                    position: 'absolute',
                    top: '2px',
                    left: flags[key] ? '22px' : '2px',
                    transition: '0.3s'
                  }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
};
