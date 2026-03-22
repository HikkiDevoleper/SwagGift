import React, { useState } from 'react';
import { cn } from '../utils';

interface Props {
  balance: number;
  onTopup: (amount: number) => void;
  onClose: () => void;
}

const PRESETS = [25, 50, 100, 250, 500];

export const TopupSheet: React.FC<Props> = ({ balance, onTopup, onClose }) => {
  const [amt, setAmt] = useState(50);

  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-bar" />
        <h2 className="sheet-title">Пополнение баланса</h2>
        <p className="sheet-desc">Текущий баланс: {balance} ⭐</p>
        <div className="topup-grid">
          {PRESETS.map(a => (
            <button key={a} className={cn('topup-btn', amt === a && 'on')} onClick={() => setAmt(a)}>
              {a} ⭐
            </button>
          ))}
        </div>
        <div className="topup-custom">
          <input
            className="wt-input topup-input"
            type="number" min={1} max={10000}
            value={amt}
            onChange={e => setAmt(Math.max(1, parseInt(e.target.value) || 1))}
            aria-label="Сумма"
          />
          <span className="topup-label">⭐</span>
        </div>
        <button className="btn btn-w" onClick={() => onTopup(amt)}>Пополнить {amt} ⭐</button>
      </div>
    </>
  );
};
