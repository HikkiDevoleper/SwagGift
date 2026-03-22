import React, { useState, useEffect, useRef } from 'react';
import { useAppLogic } from './hooks/useAppLogic';
import { Roulette } from './components/Roulette';
import { AdminSheet } from './components/AdminSheet';
import { tg, cn, api, initialsOf, rankTitle, formatDate } from './utils';
import { type Prize, type RuntimeFlags, type ScreenKey, type InventoryItem } from './types';
import './styles.css';

/* ── Icons ─────────────────────────── */
const IcDice = () => (<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="15.5" cy="8.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="8.5" cy="15.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="15.5" cy="15.5" r="1.3" fill="currentColor" stroke="none"/></svg>);
const IcGift = () => (<svg viewBox="0 0 24 24"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5" rx="1"/><line x1="10" y1="12" x2="14" y2="12"/></svg>);
const IcTrophy = () => (<svg viewBox="0 0 24 24"><path d="M6 9a6 6 0 0 0 12 0V3H6v6z"/><path d="M6 3H4a1 1 0 0 0-1 1v1a3 3 0 0 0 3 3"/><path d="M18 3h2a1 1 0 0 1 1 1v1a3 3 0 0 1-3 3"/><path d="M12 15v3M8 21h8"/></svg>);
const IcUser = () => (<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>);

/* ═══════════════════════════════════ */
export const App: React.FC = () => {
  const {
    boot, setBoot, activeScreen, setActiveScreen,
    liveConnected, setLiveConnected, notify, refreshUser, toast,
  } = useAppLogic();

  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner]     = useState<Prize>();
  const [wonPrizeId, setWonPrizeId] = useState(0);
  const [showRes, setShowRes]   = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [topupAmt, setTopupAmt] = useState(50);
  const [showTopup, setShowTopup] = useState(false);
  const spinRef = useRef(false);
  const tgPhoto = (tg?.initDataUnsafe?.user as any)?.photo_url || null;

  /* ── SSE — always live, never blocked ── */
  useEffect(() => {
    if (!boot) return;
    let es: EventSource;
    let retry: ReturnType<typeof setTimeout>;
    const connect = () => {
      es = new EventSource('/api/live');
      es.addEventListener('snapshot', ev => {
        try {
          const d = JSON.parse(ev.data);
          setLiveConnected(true);
          setBoot(p => p ? {
            ...p,
            history: d.history ?? p.history,
            leaderboard: d.leaderboard ?? p.leaderboard,
          } : p);
        } catch {}
      });
      es.onerror = () => { setLiveConnected(false); es.close(); retry = setTimeout(connect, 5000); };
    };
    connect();
    return () => { es?.close(); clearTimeout(retry); };
  }, [!!boot]);

  /* ── Guards ── */
  if (!boot) return <div className="app"><div className="loading"><div className="loader" /><p>Загрузка…</p></div></div>;
  if (boot.flags.maint && !boot.is_owner) {
    return (<div className="app"><div className="maint">
      <div className="maint-icon">⏳</div>
      <h1>Технические работы</h1><p>Swag Gift временно недоступен</p>
    </div></div>);
  }

  const isDemo = boot.flags.demo && boot.is_owner;
  const balance = boot.user.balance || 0;
  const cost = boot.config.spin_cost;

  /* ── Handlers ── */
  const doSpin = async () => {
    if (spinning) return;
    if (isDemo) {
      try {
        const r = await api<{ winner: Prize; prize_id: number }>('demo_spin', 'POST');
        if (r.winner) { setWinner(r.winner); setWonPrizeId(r.prize_id); spinRef.current = true; setSpinning(true); }
      } catch (e: any) { notify(e.message || 'Ошибка'); }
      return;
    }
    try {
      const r = await api<{ winner?: Prize; prize_id?: number; balance?: number; error?: string; spin_cost?: number }>('spin', 'POST');
      if (r.error === 'insufficient_balance') {
        notify(`Нужно ${r.spin_cost} ⭐, у вас ${r.balance}`);
        setShowTopup(true);
        return;
      }
      if (r.winner) {
        setWinner(r.winner);
        setWonPrizeId(r.prize_id || 0);
        if (typeof r.balance === 'number') setBoot(p => p ? { ...p, user: { ...p.user, balance: r.balance! } } : p);
        spinRef.current = true;
        setSpinning(true);
      }
    } catch (e: any) { notify(e.message || 'Ошибка'); }
  };

  const doFree = async () => {
    if (spinning || boot.free_used) return;
    try {
      const r = await api<{ winner?: Prize; prize_id?: number; error?: string; channel_url?: string }>('free_spin', 'POST');
      if (r.winner) { setWinner(r.winner); setWonPrizeId(r.prize_id || 0); spinRef.current = true; setSpinning(true); }
      else if (r.error === 'not_subscribed') {
        tg?.showConfirm('Подпишитесь на @SwagGiftChannel для бесплатного спина', (ok: boolean) => {
          if (ok) tg?.openLink(r.channel_url || boot.config.channel_url);
        });
      } else if (r.error === 'already_used') { notify('Шанс использован'); refreshUser(); }
    } catch (e: any) { notify(e.message || 'Ошибка'); }
  };

  const doTopup = async (amount: number) => {
    try {
      const r = await api<{ invoice_link: string }>('topup', 'POST', { amount });
      tg?.openInvoice(r.invoice_link, (status: string) => {
        if (status === 'paid') { notify(`+${amount} ⭐`); refreshUser(); }
      });
    } catch (e: any) { notify(e.message || 'Ошибка'); }
    setShowTopup(false);
  };

  const doSell = async (prizeId: number, prizeKey: string) => {
    try {
      const r = await api<{ ok: boolean; sell_value: number; balance: number }>('sell', 'POST', { prize_id: prizeId, prize_key: prizeKey });
      if (r.ok) { notify(`+${r.sell_value} ⭐`); setBoot(p => p ? { ...p, user: { ...p.user, balance: r.balance } } : p); refreshUser(); }
    } catch (e: any) { notify(e.message || 'Ошибка'); }
  };

  const doWithdraw = async (prizeId: number) => {
    try {
      const r = await api<{ ok: boolean }>('withdraw', 'POST', { prize_id: prizeId });
      if (r.ok) { notify('Подарок будет выдан в ближайшее время'); refreshUser(); }
    } catch (e: any) { notify(e.message || 'Ошибка'); }
  };

  const onSpinEnd = (won: Prize) => {
    spinRef.current = false;
    setSpinning(false);
    if (won.type !== 'nothing') setShowRes(true);
    else notify('Пусто — повезёт в следующий раз');
    refreshUser();
  };

  const claimToInventory = () => setShowRes(false);

  const sellWonPrize = async () => {
    if (!winner || wonPrizeId <= 0) { notify('Ошибка'); return; }
    await doSell(wonPrizeId, winner.key);
    setShowRes(false);
  };

  const toggleFlag = async (k: keyof RuntimeFlags) => {
    try {
      const r = await api<{ value: boolean }>('admin/toggle', 'POST', { key: k });
      setBoot(p => p ? { ...p, flags: { ...p.flags, [k]: r.value } } : p);
    } catch (e: any) { notify(e.message || 'Ошибка'); }
  };

  const saveWeights = async (w: Record<string, number>) => {
    try {
      const r = await api<{ prizes: Prize[] }>('admin/weights', 'POST', { weights: w });
      if (r.prizes) setBoot(p => p ? { ...p, prizes_catalog: r.prizes } : p);
      notify('Обновлено');
    } catch (e: any) { notify(e.message || 'Ошибка'); }
  };

  const setSpinCost = async (c: number) => {
    try {
      const r = await api<{ spin_cost: number }>('admin/spin_cost', 'POST', { cost: c });
      setBoot(p => p ? { ...p, config: { ...p.config, spin_cost: r.spin_cost } } : p);
      notify(`Цена → ${r.spin_cost} ⭐`);
    } catch (e: any) { notify(e.message || 'Ошибка'); }
  };

  /* ── Spin Page ── */
  const SpinPage = () => (
    <div className="page fade-in" key="spin">
      {/* Top bar */}
      <div className="spin-bar">
        <div className="spin-bar-left">
          <div className="spin-bar-ava">
            {tgPhoto ? <img src={tgPhoto} alt="" /> : initialsOf(boot.user)}
          </div>
          <span className="spin-bar-name">{boot.user.first_name}</span>
          {isDemo && <span className="tag">Demo</span>}
        </div>
        <button className="spin-bar-bal" onClick={() => setShowTopup(true)}>{balance} ⭐</button>
      </div>

      {/* Live history bubble ticker */}
      {boot.history.length > 0 && (
        <div className="ticker-wrap">
          <div className="ticker">
            {boot.history.slice(0, 10).map((r, i) => {
              const cat = boot.prizes_catalog.find(p => p.key === r.prize_key);
              return (
                <div key={i} className="bubble">
                  <span className="bubble-emoji">{cat?.emoji || '🎁'}</span>
                  <span className="bubble-name">{r.first_name || r.username || 'Игрок'}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Roulette card */}
      <div className="card roulette-card">
        <Roulette prizes={boot.prizes_catalog} isSpinning={spinning} winner={winner} onSpinEnd={onSpinEnd} />
        <button className="btn btn-w spin-btn" onClick={doSpin} disabled={spinning}>
          {spinning ? '🎰 Крутим…' : isDemo ? '🎲 Демо' : cost > 0 ? `Крутить — ${cost} ⭐` : '🎲 Крутить'}
        </button>
        {!boot.free_used && (
          <button className="btn btn-outline btn-mt" onClick={doFree} disabled={spinning}>Бесплатный шанс</button>
        )}
      </div>
    </div>
  );

  /* ── Inventory ── */
  const InvPage = () => (
    <div className="page fade-in" key="inv">
      <h1 className="pg-title">Мои призы</h1>
      {boot.prizes.length === 0
        ? <div className="empty"><div className="empty-icon">📦</div><p>Ещё нет призов</p></div>
        : <div className="inv-grid">
            {boot.prizes.map((item, i) => {
              const cat = boot.prizes_catalog.find(p => p.key === item.key);
              const sv = cat?.sell_value || 0;
              const isWithdrawing = item.status === 'withdrawing';
              return (
                <div key={item.id || i} className={cn('inv-item', isWithdrawing && 'withdrawing')}>
                  <span className="inv-emoji">{cat?.emoji || '🎁'}</span>
                  <span className="inv-name">{item.name}</span>
                  <span className="inv-rarity">{item.rarity}</span>
                  {isWithdrawing ? (
                    <span className="inv-status">⏳ Вывод…</span>
                  ) : item.key !== 'nothing' && (
                    <div className="inv-btns">
                      <button className="inv-btn" onClick={() => doWithdraw(item.id)}>Вывести</button>
                      <button className="inv-btn inv-btn-sell" onClick={() => doSell(item.id, item.key)}>
                        {sv > 0 ? `${sv} ⭐` : 'Продать'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
      }
    </div>
  );

  /* ── Leaderboard ── */
  const TopPage = () => (
    <div className="page fade-in" key="top">
      <h1 className="pg-title">Рейтинг</h1>
      {boot.leaderboard.length === 0
        ? <div className="empty"><p>Пусто</p></div>
        : <div className="lb-list">
            {boot.leaderboard.map((r, i) => (
              <div key={i} className="lb-row">
                <span className={cn('lb-medal', i === 0 && 'gold', i === 1 && 'silver', i === 2 && 'bronze')}>
                  {i < 3 ? ['🥇','🥈','🥉'][i] : i + 1}
                </span>
                <div className="lb-ava">{initialsOf(r)}</div>
                <div className="lb-info">
                  <div className="lb-name">{r.first_name || r.username || 'Игрок'}</div>
                  <div className="lb-sub">{r.spins} спинов · {r.stars_spent} ⭐</div>
                </div>
                <div className="lb-wins">{r.wins} 🏆</div>
              </div>
            ))}
          </div>
      }
    </div>
  );

  /* ── Profile ── */
  const ProfPage = () => {
    const u = boot.user;
    return (
      <div className="page fade-in" key="prof">
        <div className="prof-card">
          <div className="prof-ava-lg">{tgPhoto ? <img src={tgPhoto} alt="" /> : initialsOf(u)}</div>
          <h2 className="prof-name">{u.first_name}</h2>
          {u.username && <p className="prof-handle">@{u.username}</p>}
          <p className="prof-rank">{rankTitle(u.wins)}</p>

          <div className="prof-stats">
            <div className="prof-stat">
              <span className="prof-stat-val">{balance}</span>
              <span className="prof-stat-lbl">Баланс ⭐</span>
            </div>
            <div className="prof-stat-sep" />
            <div className="prof-stat">
              <span className="prof-stat-val">{u.wins}</span>
              <span className="prof-stat-lbl">Побед</span>
            </div>
            <div className="prof-stat-sep" />
            <div className="prof-stat">
              <span className="prof-stat-val">{u.spins}</span>
              <span className="prof-stat-lbl">Спинов</span>
            </div>
          </div>
        </div>

        <button className="btn btn-w" onClick={() => setShowTopup(true)}>Пополнить баланс</button>
        {boot.is_owner && (
          <button className="btn btn-outline btn-mt" onClick={() => setShowAdmin(true)}>⚙️ Управление</button>
        )}
      </div>
    );
  };

  const TABS: { key: ScreenKey; icon: React.ReactElement; label: string }[] = [
    { key: 'spin',      icon: <IcDice />,    label: 'Игра' },
    { key: 'inventory', icon: <IcGift />,    label: 'Призы' },
    { key: 'top',       icon: <IcTrophy />,  label: 'Топ' },
    { key: 'profile',   icon: <IcUser />,    label: 'Профиль' },
  ];

  const pages: Record<ScreenKey, () => React.ReactElement> = {
    spin: SpinPage, inventory: InvPage, top: TopPage, profile: ProfPage,
  };

  return (
    <div className="app">
      <div className="scroll">{pages[activeScreen]()}</div>

      <nav className="nav">
        {TABS.map(t => (
          <button key={t.key} className={cn('nav-btn', activeScreen === t.key && 'on')} onClick={() => setActiveScreen(t.key)}>
            {t.icon}<span className="nav-lbl">{t.label}</span>
          </button>
        ))}
      </nav>

      {/* Win result sheet */}
      {showRes && winner && (
        <>
          <div className="overlay" onClick={claimToInventory} />
          <div className="sheet win-sheet">
            <div className="sheet-bar" />
            <div className="res">
              <div className="res-glow" />
              <span className="res-emoji bounce">{winner.emoji}</span>
              <h2 className="res-title">{winner.name}</h2>
              <p className="res-sub">{winner.rarity}</p>
              <div className="btn-row">
                <button className="btn btn-w" onClick={claimToInventory}>Забрать</button>
                <button className="btn btn-outline" onClick={sellWonPrize}>
                  Продать {boot.prizes_catalog.find(p => p.key === winner.key)?.sell_value || 0} ⭐
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Topup sheet */}
      {showTopup && (
        <>
          <div className="overlay" onClick={() => setShowTopup(false)} />
          <div className="sheet">
            <div className="sheet-bar" />
            <h2 className="sheet-title">Пополнение баланса</h2>
            <p className="sheet-desc">Текущий баланс: {balance} ⭐</p>
            <div className="topup-grid">
              {[25, 50, 100, 250, 500].map(a => (
                <button key={a} className={cn('topup-btn', topupAmt === a && 'on')} onClick={() => setTopupAmt(a)}>{a} ⭐</button>
              ))}
            </div>
            <div className="topup-custom">
              <input className="wt-input topup-input" type="number" min={1} max={10000} value={topupAmt}
                onChange={e => setTopupAmt(Math.max(1, parseInt(e.target.value) || 1))} aria-label="Сумма" />
              <span className="topup-label">⭐</span>
            </div>
            <button className="btn btn-w" onClick={() => doTopup(topupAmt)}>Пополнить {topupAmt} ⭐</button>
          </div>
        </>
      )}

      {showAdmin && (
        <AdminSheet
          flags={boot.flags} onToggle={toggleFlag} onClose={() => setShowAdmin(false)}
          spinCost={boot.config.spin_cost} onSetSpinCost={setSpinCost}
          prizes={boot.prizes_catalog} onSaveWeights={saveWeights} onNotify={notify}
        />
      )}

      {toast && <div className="toast show">{toast}</div>}
    </div>
  );
};

export default App;
