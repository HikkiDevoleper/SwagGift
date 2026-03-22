import React, { useState } from 'react';
import { type RuntimeFlags, type Prize } from '../types';
import { api } from '../utils';

interface Props {
  flags: RuntimeFlags;
  onToggle: (key: keyof RuntimeFlags) => void;
  onClose: () => void;
  spinCost: number;
  onSetSpinCost: (cost: number) => void;
  prizes: Prize[];
  onSaveWeights: (w: Record<string, number>) => void;
  onNotify: (msg: string) => void;
}

const FLAGS: Record<keyof RuntimeFlags, [string, string]> = {
  demo:    ['Демо', 'Спины без оплаты'],
  gifts:   ['Подарки', 'Автовыдача в Telegram'],
  maint:   ['Техработы', 'Закрыть для юзеров'],
  testpay: ['Тест оплаты', 'Резервный флаг'],
};

export const AdminSheet: React.FC<Props> = ({
  flags, onToggle, onClose, spinCost, onSetSpinCost, prizes, onSaveWeights, onNotify,
}) => {
  const [costInput, setCostInput] = useState(spinCost);
  const [costDirty, setCostDirty] = useState(false);
  const [wts, setWts] = useState(() =>
    Object.fromEntries(prizes.map(p => [p.key, p.weight]))
  );
  const [dirty, setDirty] = useState(false);
  const total = Object.values(wts).reduce((a, b) => a + b, 0);

  // Admin: set balance
  const [balUid, setBalUid] = useState('');
  const [balDelta, setBalDelta] = useState('');

  const doSetBalance = async () => {
    const uid = parseInt(balUid);
    const delta = parseInt(balDelta);
    if (!uid || isNaN(delta)) { onNotify('Ошибка ввода'); return; }
    try {
      const r = await api<{ ok: boolean; balance: number; user_id: number }>('admin/set_balance', 'POST', { user_id: uid, delta });
      onNotify(`uid=${r.user_id} баланс=${r.balance} ⭐`);
    } catch (e: any) { onNotify(e.message || 'Ошибка'); }
  };

  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-bar" />
        <div className="admin-hdr">
          <h2>Управление</h2>
          <button className="btn btn-outline btn-sm" onClick={onClose}>✕</button>
        </div>

        {/* Spin Cost */}
        <div className="admin-row">
          <span>Цена спина</span>
          <div className="cost-edit">
            <input
              className="wt-input"
              type="number" min={0}
              title="Цена спина" aria-label="Цена спина"
              value={costInput}
              onChange={e => { setCostInput(Math.max(0, parseInt(e.target.value) || 0)); setCostDirty(true); }}
            />
            {costDirty && (
              <button className="btn btn-outline btn-sm" onClick={() => { onSetSpinCost(costInput); setCostDirty(false); }}>ОК</button>
            )}
          </div>
        </div>

        {/* Flags */}
        {(Object.keys(flags) as Array<keyof RuntimeFlags>).map(k => {
          const on = flags[k];
          const [t, s] = FLAGS[k];
          return (
            <div key={k} className={`tgl-row${on ? ' on' : ''}`} onClick={() => onToggle(k)}>
              <div className="tgl-info"><div className="tgl-title">{t}</div><div className="tgl-sub">{s}</div></div>
              <div className={`tgl${on ? ' on' : ''}`}><div className="tgl-dot" /></div>
            </div>
          );
        })}

        {/* Balance management */}
        <div className="wt-lbl">Управление балансом</div>
        <div className="admin-bal-row">
          <input className="wt-input" type="number" placeholder="User ID" value={balUid} onChange={e => setBalUid(e.target.value)} aria-label="User ID" />
          <input className="wt-input" type="number" placeholder="+/- ⭐" value={balDelta} onChange={e => setBalDelta(e.target.value)} aria-label="Delta" />
          <button className="btn btn-outline btn-sm" onClick={doSetBalance}>OK</button>
        </div>

        {/* Weights */}
        <div className="wt-lbl">Шансы призов</div>
        {prizes.map(p => (
          <div key={p.key} className="wt-row">
            <span className="wt-emoji">{p.emoji}</span>
            <span className="wt-name">{p.name}</span>
            <input
              className="wt-input" type="number" min={0} max={999}
              title={`Вес: ${p.name}`} aria-label={`Вес: ${p.name}`}
              value={wts[p.key] ?? 0}
              onChange={e => { setWts(v => ({ ...v, [p.key]: Math.max(0, parseInt(e.target.value) || 0) })); setDirty(true); }}
            />
            <span className="wt-pct">{total > 0 ? Math.round((wts[p.key] / total) * 100) : 0}%</span>
          </div>
        ))}
        <button className="btn btn-w" disabled={!dirty} onClick={() => { onSaveWeights(wts); setDirty(false); }}>
          Сохранить шансы
        </button>
      </div>
    </>
  );
};
