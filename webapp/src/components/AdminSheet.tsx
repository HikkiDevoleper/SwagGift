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

  const realPrizes = prizes.filter(p => p.key !== 'nothing');
  const totalUsed = realPrizes.reduce((acc, p) => acc + (weights[p.key] || 0), 0);
  const nothingPct = Math.max(0, 100 - totalUsed);
  const isInvalid = totalUsed > 100;

  const handleSave = () => {
    if (isInvalid) return;
    onSaveWeights({ ...weights, nothing: nothingPct });
    setDirty(false);
  };

  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-bar" />
        <div className="admin-hdr">
          <h2>Управление</h2>
          {dirty && (
            <button
              className="btn btn-outline btn-sm"
              onClick={handleSave}
              disabled={isInvalid}
            >
              Сохранить
            </button>
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
        <div className="wt-lbl">Шансы призов (проценты)</div>
        {realPrizes.map(p => (
          <div key={p.key} className="wt-row">
            {p.tgs ? (
              <div style={{ flexShrink: 0, marginRight: 6 }}>
                <TgsPlayer src={`/gifts/${p.tgs}`} size={18} autoplay={false} />
              </div>
            ) : (
              <span className="wt-emoji">{p.emoji}</span>
            )}
            <span className="wt-name">{p.name}</span>
            <input
              className="wt-input"
              type="number" min={0} max={100}
              title={`Шанс: ${p.name}`} aria-label={`Шанс: ${p.name}`}
              value={weights[p.key] || 0}
              onChange={e => {
                setWeights(w => ({ ...w, [p.key]: parseInt(e.target.value) || 0 }));
                setDirty(true);
              }}
            />
            <span className="wt-pct">%</span>
          </div>
        ))}

        <div className="wt-row" style={{ marginTop: 10, opacity: 0.7 }}>
          <span className="wt-emoji">💨</span>
          <span className="wt-name">Пусто (вычисляется авто)</span>
          <span className="wt-pct" style={{ color: isInvalid ? 'red' : 'inherit' }}>
            {nothingPct}%
          </span>
        </div>

        {isInvalid && (
          <div style={{ color: 'red', fontSize: '10px', marginTop: '10px', textAlign: 'center' }}>
            Ошибка: Сумма шансов превышает 100% ({totalUsed}%)
          </div>
        )}

        <div style={{ paddingBottom: 60 }} />
      </div>
    </>
  );
};
