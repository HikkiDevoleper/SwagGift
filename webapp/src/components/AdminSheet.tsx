import React, { useState } from 'react';
import { type RuntimeFlags, type Prize } from '../types';

interface Props {
  flags: RuntimeFlags;
  onToggle: (key: keyof RuntimeFlags) => void;
  onClose: () => void;
  spinCost: number;
  onSetSpinCost: (cost: number) => void;
  prizes: Prize[];
  onSaveWeights: (w: Record<string, number>) => void;
  onEditBalance: (uid: number, amount: number) => void;
}

const FLAGS: Record<keyof RuntimeFlags, [string, string]> = {
  demo:    ['Демо', 'Спины без оплаты'],
  gifts:   ['Подарки', 'Автовыдача в Telegram'],
  maint:   ['Техработы', 'Закрыть для юзеров'],
  testpay: ['Тест оплаты', 'Резервный флаг'],
};

export const AdminSheet: React.FC<Props> = ({
  flags, onToggle, onClose, spinCost, onSetSpinCost, prizes, onSaveWeights, onEditBalance
}) => {
  const [costInput, setCostInput] = useState(spinCost);
  const [costDirty, setCostDirty] = useState(false);
  const [uidInput, setUidInput] = useState('');
  const [balInput, setBalInput] = useState('');
  const [wts, setWts] = useState(() =>
    Object.fromEntries(prizes.map(p => [p.key, p.weight]))
  );
  const [dirty, setDirty] = useState(false);
  const total = Object.values(wts).reduce((a, b) => a + b, 0);

  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-bar" />

        <div className="admin-hdr">
          <h2>Управление</h2>
          <button className="btn btn-outline btn-sm" onClick={onClose}>Закрыть</button>
        </div>

        {/* Spin Cost */}
        <div className="admin-row">
          <span>Цена спина</span>
          <div className="cost-edit">
            <input
              className="wt-input"
              type="number"
              min={0}
              title="Цена спина"
              aria-label="Цена спина"
              value={costInput}
              onChange={e => { setCostInput(Math.max(0, parseInt(e.target.value) || 0)); setCostDirty(true); }}
            />
            {costDirty && (
              <button
                className="btn btn-outline btn-sm"
                onClick={() => { onSetSpinCost(costInput); setCostDirty(false); }}
              >
                ОК
              </button>
            )}
          </div>
        </div>

        {/* Flags */}
        {(Object.keys(flags) as Array<keyof RuntimeFlags>).map(k => {
          const on = flags[k];
          const [t, s] = FLAGS[k];
          return (
            <div key={k} className={`tgl-row${on ? ' on' : ''}`} onClick={() => onToggle(k)}>
              <div className="tgl-info">
                <div className="tgl-title">{t}</div>
                <div className="tgl-sub">{s}</div>
              </div>
              <div className={`tgl${on ? ' on' : ''}`}>
                <div className="tgl-dot" />
              </div>
            </div>
          );
        })}

        {/* Weights */}
        <div className="wt-lbl">Шансы призов</div>
        {prizes.map(p => (
          <div key={p.key} className="wt-row">
            <span className="wt-emoji">{p.emoji}</span>
            <span className="wt-name">{p.name}</span>
            <input
              className="wt-input"
              type="number" min={0} max={999}
              title={`Вес: ${p.name}`}
              aria-label={`Вес: ${p.name}`}
              value={wts[p.key] ?? 0}
              onChange={e => {
                setWts(v => ({ ...v, [p.key]: Math.max(0, parseInt(e.target.value) || 0) }));
                setDirty(true);
              }}
            />
            <span className="wt-pct">
              {total > 0 ? Math.round((wts[p.key] / total) * 100) : 0}%
            </span>
          </div>
        ))}

        <button
          className="btn btn-w"
          disabled={!dirty}
          onClick={() => { onSaveWeights(wts); setDirty(false); }}
        >
          Сохранить шансы
        </button>

        {/* Edit Balance */}
        <div className="admin-row" style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>Выдать звёзды игроку</span>
          <div className="cost-edit" style={{ marginTop: 8 }}>
            <input
              className="wt-input"
              type="number" min={1} placeholder="User ID"
              value={uidInput} onChange={e => setUidInput(e.target.value)}
              style={{ flex: 1 }}
            />
            <input
              className="wt-input"
              type="number" min={0} placeholder="Кол-во ⭐"
              value={balInput} onChange={e => setBalInput(e.target.value)}
              style={{ width: 80 }}
            />
            <button
              className="btn btn-outline btn-sm"
              disabled={!uidInput || !balInput}
              onClick={() => {
                onEditBalance(parseInt(uidInput), parseInt(balInput));
                setUidInput('');
                setBalInput('');
              }}
            >
              Выдать
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
