import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAppLogic } from './hooks/useAppLogic';
import { Roulette } from './components/Roulette';
import { AdminSheet } from './components/AdminSheet';
import { tg, cn, api, initialsOf, rankTitle, formatDate } from './utils';
import { type Prize, type RuntimeFlags, type ScreenKey, type InventoryItem, type HistoryRow } from './types';
import './styles.css';

/* ── Icons ─────────────────────────── */
const IcDice   = () => (<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="15.5" cy="8.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="8.5" cy="15.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="15.5" cy="15.5" r="1.3" fill="currentColor" stroke="none"/></svg>);
const IcGift   = () => (<svg viewBox="0 0 24 24"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5" rx="1"/><line x1="10" y1="12" x2="14" y2="12"/></svg>);
const IcTrophy = () => (<svg viewBox="0 0 24 24"><path d="M6 9a6 6 0 0 0 12 0V3H6v6z"/><path d="M6 3H4a1 1 0 0 0-1 1v1a3 3 0 0 0 3 3"/><path d="M18 3h2a1 1 0 0 1 1 1v1a3 3 0 0 1-3 3"/><path d="M12 15v3M8 21h8"/></svg>);
const IcUser   = () => (<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>);
const IcStar   = () => (<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>);

/* ══════════════════════════════════════════════ */
export const App: React.FC = () => {
  const {
    boot, setBoot, activeScreen, setActiveScreen,
    liveConnected, setLiveConnected, notify, refreshUser, toast,
  } = useAppLogic();

  const [spinning, setSpinning]       = useState(false);
  const [winner, setWinner]           = useState<Prize>();
  const [wonPrizeId, setWonPrizeId]   = useState(0);
  const [showRes, setShowRes]         = useState(false);
  const [showAdmin, setShowAdmin]     = useState(false);
  const [topupAmt, setTopupAmt]       = useState(100);
  const [showTopup, setShowTopup]     = useState(false);
  // spoiler: track the won_at timestamp so we can hide it from the ticker until spin ends
  const pendingWinAt = useRef<string | null>(null);
  const tgPhoto = (tg?.initDataUnsafe?.user as any)?.photo_url || null;

  /* ── SSE ─────────────────────────── */
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
  if (!boot) return (
    <div className="app">
      <div className="loading">
        <div className="loader-ring"><div/><div/><div/><div/></div>
        <p className="loading-text">Swag Gift</p>
      </div>
    </div>
  );
  if (boot.flags.maint && !boot.is_owner) {
    return (<div className="app"><div className="maint">
      <div className="maint-icon">⏳</div>
      <h1>Технические работы</h1>
      <p>Swag Gift временно недоступен</p>
    </div></div>);
  }

  const isDemo   = boot.flags.demo && boot.is_owner;
  const balance  = boot.user.balance || 0;
  const cost     = boot.config.spin_cost;
  const myUid    = boot.user.user_id;

  /* ── Spoiler-safe history ── */
  // While spinning: hide entries that belong to THIS user that appeared after spin started
  const safeHistory = useMemo<HistoryRow[]>(() => {
    if (!spinning && !pendingWinAt.current) return boot.history;
    return boot.history.filter(h => {
      // If h has a user_id field matching ours and appeared recently, hide it
      const isOwn = (h as any).user_id === myUid;
      if (!isOwn) return true;
      // Also hide if won_at is after we started the spin
      const t = pendingWinAt.current;
      if (!t) return true;
      return h.won_at < t;
    });
  }, [boot.history, spinning, myUid]);

  /* ── Win of the day: most recent legendary across ALL history ── */
  const winOfDay = useMemo<HistoryRow | null>(() => {
    const legendary = boot.history.filter(h => {
      const cat = boot.prizes_catalog.find(p => p.key === h.prize_key);
      return cat && cat.sell_value >= 100;
    });
    return legendary[0] ?? null;
  }, [boot.history, boot.prizes_catalog]);

  /* ── Spin ── */
  const doSpin = async () => {
    if (spinning) return;
    if (isDemo) {
      try {
        const r = await api<{ winner: Prize; prize_id: number }>('demo_spin', 'POST');
        if (r.winner) {
          pendingWinAt.current = new Date().toISOString();
          setWinner(r.winner); setWonPrizeId(r.prize_id); setSpinning(true);
        }
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
        pendingWinAt.current = new Date().toISOString();
        setWinner(r.winner);
        setWonPrizeId(r.prize_id || 0);
        if (typeof r.balance === 'number')
          setBoot(p => p ? { ...p, user: { ...p.user, balance: r.balance! } } : p);
        setSpinning(true);
      }
    } catch (e: any) { notify(e.message || 'Ошибка'); }
  };

  const doFree = async () => {
    if (spinning || boot.free_used) return;
    try {
      const r = await api<{ winner?: Prize; prize_id?: number; error?: string; channel_url?: string }>('free_spin', 'POST');
      if (r.winner) {
        pendingWinAt.current = new Date().toISOString();
        setWinner(r.winner); setWonPrizeId(r.prize_id || 0); setSpinning(true);
      } else if (r.error === 'not_subscribed') {
        tg?.showConfirm('Подпишитесь на @SwagGiftChannel', (ok: boolean) => {
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
    setSpinning(false);
    pendingWinAt.current = null; // reveal the win in history
    if (won.type !== 'nothing') setShowRes(true);
    else notify('Пусто — повезёт в следующий раз!');
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
      notify('Шансы обновлены');
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
        <button className="spin-bar-bal" onClick={() => setShowTopup(true)}>
          <span className="bal-val">{balance}</span>
          <span className="bal-star">⭐</span>
        </button>
      </div>

      {/* Wins block */}
      <div className="wins-block">
        <div className="wins-header">
          <span className="wins-label">Выигрыши участников</span>
          <span className={cn('wins-dot', liveConnected && 'live')} />
        </div>
        <div className="wins-row">
          {/* Pinned win of day */}
          {winOfDay && (
            <div className="win-of-day">
              <div className="wod-crown">👑</div>
              <span className="wod-emoji">
                {boot.prizes_catalog.find(p => p.key === winOfDay.prize_key)?.emoji || '💎'}
              </span>
              <span className="wod-name">{winOfDay.first_name || 'Игрок'}</span>
            </div>
          )}
          {/* Scrollable bubbles */}
          <div className="bubbles-scroll">
            {safeHistory.length === 0 ? (
              <span className="wins-empty">Будьте первым!</span>
            ) : safeHistory.map((r, i) => {
              const cat = boot.prizes_catalog.find(p => p.key === r.prize_key);
              return (
                <div key={`${r.won_at}-${i}`} className="bubble" style={{ animationDelay: `${i * 40}ms` }}>
                  <span className="bubble-emoji">{cat?.emoji || '🎁'}</span>
                  <span className="bubble-name">{r.first_name || r.username || 'Игрок'}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Roulette card */}
      <div className="card roulette-card">
        <Roulette
          prizes={boot.prizes_catalog}
          isSpinning={spinning}
          winner={winner}
          onSpinEnd={onSpinEnd}
        />
        <button className="btn btn-w spin-btn" onClick={doSpin} disabled={spinning}>
          {spinning
            ? <span className="spin-btn-spin">🎰 Крутим…</span>
            : isDemo
              ? '🎲 Демо'
              : cost > 0
                ? <><span className="spin-btn-label">Крутить</span><span className="spin-btn-cost">{cost} ⭐</span></>
                : '🎲 Крутить'}
        </button>
        {!boot.free_used && (
          <button className="btn btn-ghost btn-mt" onClick={doFree} disabled={spinning}>
            Бесплатный шанс
          </button>
        )}
      </div>
    </div>
  );

  /* ── Inventory ── */
  const InvPage = () => (
    <div className="page fade-in" key="inv">
      <h1 className="pg-title">Мои призы</h1>
      {boot.prizes.length === 0
        ? <div className="empty"><div className="empty-icon">📦</div><p>Пусто</p></div>
        : <div className="inv-grid">
            {boot.prizes.map((item: InventoryItem, i: number) => {
              const cat = boot.prizes_catalog.find(p => p.key === item.key);
              const sv = cat?.sell_value || 0;
              const withdrawing = item.status === 'withdrawing';
              return (
                <div key={item.id || i} className={cn('inv-item', withdrawing && 'withdrawing')}
                  style={{ animationDelay: `${i * 40}ms` }}>
                  <div className="inv-top">
                    <span className="inv-emoji">{cat?.emoji || '🎁'}</span>
                    {sv >= 100 && <span className="inv-badge-legendary">💎</span>}
                  </div>
                  <span className="inv-name">{item.name}</span>
                  <span className="inv-rarity inv-rarity-pill">{item.rarity}</span>
                  <span className="inv-date">{formatDate(item.date)}</span>
                  {withdrawing ? (
                    <div className="inv-status"><span className="withdraw-dot" />Выводится</div>
                  ) : item.key !== 'nothing' && (
                    <div className="inv-btns">
                      <button className="inv-btn" onClick={() => doWithdraw(item.id)}>Вывести</button>
                      {sv > 0 && (
                        <button className="inv-btn inv-btn-sell" onClick={() => doSell(item.id, item.key)}>
                          {sv} ⭐
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
      }
    </div>
  );

  /* ── Top ── */
  const TopPage = () => (
    <div className="page fade-in" key="top">
      <h1 className="pg-title">Рейтинг</h1>
      {boot.leaderboard.length === 0
        ? <div className="empty"><p>Пусто</p></div>
        : <div className="lb-list">
            {boot.leaderboard.map((r, i) => (
              <div key={i} className="lb-row" style={{ animationDelay: `${i * 45}ms` }}>
                <span className="lb-medal">{i < 3 ? ['🥇','🥈','🥉'][i] : i + 1}</span>
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
          <div className="prof-ava-wrap">
            <div className="prof-ava-lg">
              {tgPhoto ? <img src={tgPhoto} alt="" /> : initialsOf(u)}
            </div>
            <div className="prof-ava-ring" />
          </div>
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
              <span className="prof-stat-lbl">Победы</span>
            </div>
            <div className="prof-stat-sep" />
            <div className="prof-stat">
              <span className="prof-stat-val">{u.spins}</span>
              <span className="prof-stat-lbl">Спины</span>
            </div>
          </div>
        </div>

        <button className="btn btn-w" onClick={() => setShowTopup(true)}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
            Пополнить баланс
          </span>
        </button>
        {boot.is_owner && (
          <button className="btn btn-ghost btn-mt" onClick={() => setShowAdmin(true)}>
            ⚙️ Панель управления
          </button>
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
        {TABS.map((t, i) => (
          <button
            key={t.key}
            className={cn('nav-btn', activeScreen === t.key && 'on')}
            onClick={() => setActiveScreen(t.key)}
            style={{ animationDelay: `${i * 60}ms` }}
          >
            {t.icon}
            <span className="nav-lbl">{t.label}</span>
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
              <div className="res-particles">
                {Array.from({length: 8}, (_, i) => (
                  <div key={i} className="particle" style={{ '--i': i } as any} />
                ))}
              </div>
              <div className="res-glow" />
              <span className="res-emoji bounce">{winner.emoji}</span>
              <h2 className="res-title">{winner.name}</h2>
              <p className="res-sub">{winner.rarity}</p>
              <div className="res-sell-hint">
                {(boot.prizes_catalog.find(p => p.key === winner.key)?.sell_value || 0) > 0
                  ? `стоимость: ${boot.prizes_catalog.find(p => p.key === winner.key)?.sell_value} ⭐`
                  : ''}
              </div>
              <div className="btn-row">
                <button className="btn btn-w res-btn" onClick={claimToInventory}>Забрать</button>
                <button className="btn btn-ghost res-btn" onClick={sellWonPrize}>
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
            <p className="sheet-desc">Текущий баланс: <b>{balance} ⭐</b></p>
            <div className="topup-grid">
              {[25, 50, 100, 250, 500].map(a => (
                <button key={a} className={cn('topup-btn', topupAmt === a && 'on')} onClick={() => setTopupAmt(a)}>
                  {a} ⭐
                </button>
              ))}
            </div>
            <div className="topup-custom">
              <input className="topup-input" type="number" min={1} max={10000} value={topupAmt}
                onChange={e => setTopupAmt(Math.max(1, parseInt(e.target.value) || 1))}
                aria-label="Сумма пополнения"
              />
              <span className="topup-label">⭐</span>
            </div>
            <button className="btn btn-w" onClick={() => doTopup(topupAmt)}>
              Пополнить {topupAmt} ⭐
            </button>
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
