import React, { useState } from 'react';
import { tg } from '../utils';
import { type RuntimeFlags, type Prize } from '../types';
import { TgsPlayer } from './TgsPlayer';

const FLAGS: Record<keyof RuntimeFlags, [string, string]> = {
  demo: ['Режим Демо', 'Бесплатная прокрутка для тестов'],
  gifts: ['Выдача призов', 'Зачислять призы в инвентарь'],
  maint: ['Тех. работы', 'Закрыть доступ обычным юзерам'],
  testpay: ['Тестовая оплата', 'Telegram Stars v2 API (Test)'],
};

interface Props {
  flags: RuntimeFlags;
  spinCost: number;
  prizes: Prize[];
  onToggle: (k: keyof RuntimeFlags) => void;
  onSetSpinCost: (c: number) => void;
  onSaveWeights: (v: Record<string, number>) => void;
  onNotify: (msg: string) => void;
  onClose: () => void;
}

export const AdminSheet: React.FC<Props> = ({
  flags, spinCost, prizes, onToggle, onSetSpinCost, onSaveWeights, onNotify, onClose,
}) => {
  const [weights, setWeights] = useState<Record<string, number>>(
    prizes.reduce((a, p) => ({ ...a, [p.key]: p.weight }), {})
  );
  const [dirty, setDirty] = useState(false);
  const [costInput, setCostInput] = useState(spinCost);
  const [costDirty, setCostDirty] = useState(false);

  const [balUid, setBalUid] = useState('');
  const [balDelta, setBalDelta] = useState('');

  const doSetBalance = async () => {
    if (!balUid || !balDelta) return;
    try {
      const resp = await fetch('/api/admin/set_balance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Init-Data': tg?.initData || '',
        },
        body: JSON.stringify({ user_id: parseInt(balUid), delta: parseInt(balDelta) }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail);
      onNotify(`Баланс обновлен: ${data.balance} ⭐`);
      setBalUid(''); setBalDelta('');
    } catch (e: any) {
      onNotify('Ошибка: ' + e.message);
    }
  };

  const total = Object.values(weights).reduce((a, b) => a + Number(b), 0);

  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-bar" />
        <div className="admin-hdr">
          <h2>Управление</h2>
          {dirty && (
            <button className="btn btn-outline btn-sm" onClick={() => { onSaveWeights(weights); setDirty(false); }}>Сохранить</button>
          )}
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
        <div className="wt-lbl-group">
          <div className="wt-lbl">Шансы призов</div>
          <div className={`wt-total${total === 100 ? ' ok' : ''}`}>
            Сумма: <b>{total}</b> / 100
          </div>
        </div>

        {total !== 100 && (
          <button 
            className="btn btn-outline btn-xs btn-wt-normalize" 
            onClick={() => {
              if (total === 0) return;
              const newWeights: Record<string, number> = {};
              prizes.forEach(p => {
                newWeights[p.key] = Math.round((weights[p.key] / total) * 100);
              });
              const newTotal = Object.values(newWeights).reduce((a, b) => a + b, 0);
              const diff = 100 - newTotal;
              if (diff !== 0 && prizes.length > 0) {
                newWeights[prizes[prizes.length - 1].key] += diff;
              }
              setWeights(newWeights);
              setDirty(true);
            }}
          >
            Нормализовать до 100%
          </button>
        )}

        {prizes.map(p => (
          <div key={p.key} className="wt-row">
            {p.tgs ? (
              <div className="wt-tgs">
                <TgsPlayer src={`/gifts/${p.tgs}`} size={18} autoplay={false} />
              </div>
            ) : (
              <span className="wt-emoji">{p.emoji}</span>
            )}
            <span className="wt-name">{p.name}</span>
            <span className={`wt-pct${total === 100 ? ' ok' : ''}`}>
              {total > 0 ? ((weights[p.key] / total) * 100).toFixed(0) : 0}%
            </span>
            <input
              className="wt-input"
              type="number" min={0}
              title={`Шанс: ${p.name}`} aria-label={`Шанс: ${p.name}`}
              value={weights[p.key]}
              onChange={e => {
                setWeights(w => ({ ...w, [p.key]: parseInt(e.target.value) || 0 }));
                setDirty(true);
              }}
            />
          </div>
        ))}
        <div className="sheet-pad" />
      </div>
    </>
  );
};
