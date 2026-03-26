import React, { useState } from 'react';
import { cn } from '../utils';

interface Props {
  balance: number;
  onTopup: (amount: number) => void;
  onClose: () => void;
}

const PRESETS = [
  { amount: 15,  label: '15 ⭐', sub: 'Мини' },
  { amount: 50,  label: '50 ⭐', sub: 'Базовый' },
  { amount: 100, label: '100 ⭐', sub: 'Комфорт' },
  { amount: 250, label: '250 ⭐', sub: 'Свег' },
  { amount: 500, label: '500 ⭐', sub: 'Боярин' },
  { amount: 1000, label: '1000 ⭐', sub: 'Легенда' },
];

export const TopupSheet: React.FC<Props> = ({ balance, onTopup, onClose }) => {
  const [amt, setAmt] = useState(100);
  const [custom, setCustom] = useState(false);

  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="sheet topup-sheet">
        <div className="sheet-bar" />

        <div className="topup-header">
          <div className="topup-header-icon">⭐</div>
          <h2 className="topup-title">Пополнение</h2>
          <p className="topup-bal">Текущий баланс: <b>{balance} ⭐</b></p>
        </div>

        <div className="topup-presets">
          {PRESETS.map(p => (
            <button
              key={p.amount}
              className={cn('topup-preset', amt === p.amount && !custom && 'on')}
              onClick={() => { setAmt(p.amount); setCustom(false); }}
            >
              <span className="tp-amount">{p.label}</span>
              <span className="tp-sub">{p.sub}</span>
            </button>
          ))}
        </div>

        <div className="topup-custom-row">
          <label className="topup-custom-lbl">Своя сумма</label>
          <div className="topup-custom-input-wrap">
            <input
              className="topup-custom-input"
              type="number"
              min={1}
              max={99999}
              value={custom ? amt : ''}
              placeholder="Введи сумму"
              onChange={e => {
                const v = Math.max(1, parseInt(e.target.value) || 1);
                setAmt(v);
                setCustom(true);
              }}
            />
            <span className="topup-custom-icon">⭐</span>
          </div>
        </div>

        <button className="btn btn-w topup-cta" onClick={() => onTopup(amt)}>
          Пополнить {amt} ⭐
        </button>

        <p className="topup-note">Оплата через Telegram Stars</p>
      </div>
    </>
  );
};
