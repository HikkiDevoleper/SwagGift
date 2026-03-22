import React, { useState, useEffect, useRef } from 'react';
import { useAppLogic } from './hooks/useAppLogic';
import { Roulette } from './components/Roulette';
import { AdminSheet } from './components/AdminSheet';
import { tg, cn, api, initialsOf, rankTitle, rarityClass, formatDate } from './utils';
import { type Prize, type RuntimeFlags, type ScreenKey, type InventoryItem } from './types';
import './styles.css';

/* ── Icons ─────────────────────────────────── */
const IcDice = () => (<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="15.5" cy="8.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="8.5" cy="15.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="15.5" cy="15.5" r="1.3" fill="currentColor" stroke="none"/></svg>);
const IcGift = () => (<svg viewBox="0 0 24 24"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5" rx="1"/><line x1="10" y1="12" x2="14" y2="12"/></svg>);
const IcTrophy = () => (<svg viewBox="0 0 24 24"><path d="M6 9a6 6 0 0 0 12 0V3H6v6z"/><path d="M6 3H4a1 1 0 0 0-1 1v1a3 3 0 0 0 3 3"/><path d="M18 3h2a1 1 0 0 1 1 1v1a3 3 0 0 1-3 3"/><path d="M12 15v3M8 21h8"/></svg>);
const IcUser = () => (<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>);

/* ═══════════════════════════════════════════ */
export const App: React.FC = () => {
  const {
    boot, setBoot, activeScreen, setActiveScreen,
    liveConnected, setLiveConnected, notify, refreshUser, toast,
  } = useAppLogic();

  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner]     = useState<Prize>();
  const [showRes, setShowRes]   = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const spinRef = useRef(false);
  const tgPhoto = (tg?.initDataUnsafe?.user as any)?.photo_url || null;

  /* ── SSE ──────────────────────────────────── */
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
          if (!spinRef.current) {
            setBoot(p => p ? { ...p, history: d.history ?? p.history, leaderboard: d.leaderboard ?? p.leaderboard } : p);
          }
        } catch {}
      });
      es.onerror = () => { setLiveConnected(false); es.close(); retry = setTimeout(connect, 5000); };
    };
    connect();
    return () => { es?.close(); clearTimeout(retry); };
  }, [!!boot]);

  /* ── Guards ───────────────────────────────── */
  if (!boot) return <div className="app"><div className="loading">Загрузка…</div></div>;
  if (boot.flags.maint && !boot.is_owner) {
    return (<div className="app"><div className="maint">
      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
      <h1>Технические работы</h1><p>Swag Gift временно недоступен.</p>
    </div></div>);
  }

  const isDemo = boot.flags.demo && boot.is_owner;
  const balance = boot.user.balance || 0;
  const cost = boot.config.spin_cost;

  /* ── Handlers ─────────────────────────────── */
  const doSpin = async () => {
    if (spinning) return;
    // Demo spin — owner only, no cost
    if (isDemo) {
      try {
        const r = await api<{ winner: Prize }>('demo_spin', 'POST');
        if (r.winner) { setWinner(r.winner); spinRef.current = true; setSpinning(true); }
      } catch (e: any) { notify(e.message || 'Ошибка'); }
      return;
    }
    // Balance-based spin (instant)
    try {
      const r = await api<{ winner?: Prize; error?: string; balance?: number; spin_cost?: number }>('spin', 'POST');
      if (r.error === 'insufficient_balance') {
        notify(`Недостаточно ⭐ (нужно ${r.spin_cost}, баланс ${r.balance})`);
        return;
      }
      if (r.winner) { setWinner(r.winner); spinRef.current = true; setSpinning(true); }
    } catch (e: any) { notify(e.message || 'Ошибка'); }
  };

  const doFree = async () => {
    if (spinning || boot.free_used) return;
    try {
      const r = await api<{ winner?: Prize; error?: string; channel_url?: string }>('free_spin', 'POST');
      if (r.winner) { setWinner(r.winner); spinRef.current = true; setSpinning(true); }
      else if (r.error === 'not_subscribed') {
        tg?.showConfirm('Нужна подписка на канал. Открыть?', (ok: boolean) => {
          if (ok) tg?.openLink(r.channel_url || boot.config.channel_url);
        });
      } else if (r.error === 'already_used') { notify('Шанс использован'); refreshUser(); }
    } catch (e: any) { notify(e.message || 'Ошибка'); }
  };

  const doTopup = async (amount: number) => {
    try {
      const r = await api<{ invoice_link: string }>('topup', 'POST', { amount });
      tg?.openInvoice(r.invoice_link, (status: string) => {
        if (status === 'paid') {
          notify(`Баланс пополнен на ${amount} ⭐`);
          refreshUser();
        }
      });
    } catch (e: any) { notify(e.message || 'Ошибка'); }
  };

  const doSell = async (item: InventoryItem) => {
    const prizeInfo = boot.prizes_catalog.find(p => p.key === item.key);
    if (!prizeInfo || prizeInfo.sell_value <= 0) { notify('Нельзя продать'); return; }
    try {
      const r = await api<{ ok: boolean; sell_value: number; balance: number }>('sell', 'POST', {
        prize_id: item.id, prize_key: item.key,
      });
      if (r.ok) {
        notify(`Продано за ${r.sell_value} ⭐`);
        setBoot(p => p ? { ...p, user: { ...p.user, balance: r.balance } } : p);
        refreshUser();
      }
    } catch (e: any) { notify(e.message || 'Ошибка'); }
  };

  const onSpinEnd = (won: Prize) => {
    spinRef.current = false;
    setSpinning(false);
    if (won.type !== 'nothing') setShowRes(true);
    else notify('Пусто — попробуй ещё');
    refreshUser();
  };

  const toggleFlag = async (k: keyof RuntimeFlags) => {
    try {
      const r = await api<{ value: boolean }>('admin/toggle', 'POST', { key: k });
      setBoot(p => p ? { ...p, flags: { ...p.flags, [k]: r.value } } : p);
      notify(`${k}: ${r.value ? 'вкл' : 'выкл'}`);
    } catch (e: any) { notify(e.message || 'Ошибка'); }
  };

  const saveWeights = async (w: Record<string, number>) => {
    try {
      const r = await api<{ prizes: Prize[] }>('admin/weights', 'POST', { weights: w });
      if (r.prizes) setBoot(p => p ? { ...p, prizes_catalog: r.prizes } : p);
      notify('Шансы обновлены');
    } catch (e: any) { notify(e.message || 'Ошибка'); }
  };

  const setSpinCost = async (cost: number) => {
    try {
      const r = await api<{ spin_cost: number }>('admin/spin_cost', 'POST', { cost });
      setBoot(p => p ? { ...p, config: { ...p.config, spin_cost: r.spin_cost } } : p);
      notify(`Цена: ${r.spin_cost} ⭐`);
    } catch (e: any) { notify(e.message || 'Ошибка'); }
  };

  const claimPrize = () => {
    notify('Подарок будет отправлен в Telegram');
    setShowRes(false);
    refreshUser();
  };

  const sellWon = () => {
    if (!winner) return;
    const sv = boot.prizes_catalog.find(p => p.key === winner.key)?.sell_value || 0;
    notify(sv > 0 ? `Продано за ${sv} ⭐` : 'Нельзя продать');
    setShowRes(false);
    refreshUser();
  };

  /* ── Screens ─────────────────────────────── */
  const SpinPage = () => (
    <div className="page" key="spin">
      <div className="card">
        <div className="spin-head">
          <h1 className="spin-title">Рулетка</h1>
          <span className="spin-cost">{balance} ⭐{isDemo ? ' · demo' : ''}</span>
        </div>
        <Roulette prizes={boot.prizes_catalog} isSpinning={spinning} winner={winner} onSpinEnd={onSpinEnd} />
        <button className="btn btn-w" onClick={doSpin} disabled={spinning}>
          {spinning ? 'Крутим…' : isDemo ? 'Демо-спин' : cost > 0 ? `Крутить — ${cost} ⭐` : 'Крутить бесплатно'}
        </button>
        {!boot.free_used && (
          <button className="btn btn-outline btn-mt" onClick={doFree} disabled={spinning}>Бесплатный шанс</button>
        )}
        <button className="btn btn-outline btn-mt" onClick={() => doTopup(50)}>Пополнить баланс +50 ⭐</button>
      </div>
      {!spinning && boot.history.length > 0 && (
        <div className="card">
          <p className="feed-h">Последние выигрыши</p>
          {boot.history.slice(0, 6).map((r, i) => (
            <div key={i} className="feed-row">
              <div className="feed-dot" /><span className="feed-user">{r.first_name || r.username || 'Игрок'}</span><span className="feed-prize">{r.prize_name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const InvPage = () => (
    <div className="page" key="inv">
      <h1 className="pg-title">Мои призы</h1>
      {boot.prizes.length === 0
        ? <div className="empty">Ещё нет призов</div>
        : <div className="inv-grid">
            {boot.prizes.map((item, i) => {
              const cat = boot.prizes_catalog.find(p => p.key === item.key);
              const sv = cat?.sell_value || 0;
              return (
                <div key={item.id || i} className="inv-item">
                  <span className="inv-emoji">{cat?.emoji || '🎁'}</span>
                  <span className="inv-name">{item.name}</span>
                  <span className="inv-rarity">{item.rarity}</span>
                  <span className="inv-date">{formatDate(item.date)}</span>
                  {item.key !== 'nothing' && (
                    <div className="inv-btns">
                      <button className="inv-btn" onClick={() => notify('Отправка в Telegram')}>Вывести</button>
                      <button className="inv-btn" onClick={() => doSell(item)}>{sv > 0 ? `${sv} ⭐` : 'Продать'}</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
      }
    </div>
  );

  const TopPage = () => (
    <div className="page" key="top">
      <h1 className="pg-title">Рейтинг</h1>
      {boot.leaderboard.length === 0
        ? <div className="empty">Пусто</div>
        : boot.leaderboard.map((r, i) => (
            <div key={i} className="lb-row">
              <span className={cn('lb-n', i === 0 && 'g1', i === 1 && 'g2', i === 2 && 'g3')}>{i + 1}</span>
              <div className="lb-info">
                <div className="lb-name">{r.first_name || r.username || 'Игрок'}</div>
                <div className="lb-sub">{r.spins} спинов · {r.stars_spent} ⭐</div>
              </div>
              <span className="lb-wins">{r.wins}</span>
            </div>
          ))
      }
    </div>
  );

  const ProfPage = () => {
    const u = boot.user;
    return (
      <div className="page" key="prof">
        <div className="prof">
          <div className="prof-ava">
            {tgPhoto ? <img src={tgPhoto} alt="" /> : initialsOf(u)}
          </div>
          <h2 className="prof-name">{u.first_name}</h2>
          {u.username && <p className="prof-handle">@{u.username}</p>}
          <p className="prof-rank">{rankTitle(u.wins)}</p>
          <div className="prof-grid">
            <div className="prof-cell"><span className="prof-val">{u.balance || 0}</span><span className="prof-lbl">Баланс ⭐</span></div>
            <div className="prof-cell"><span className="prof-val">{u.wins}</span><span className="prof-lbl">Побед</span></div>
            <div className="prof-cell"><span className="prof-val">{u.spins}</span><span className="prof-lbl">Спинов</span></div>
          </div>
          <div className="prof-meta">
            <span className={liveConnected ? 'dot-live' : 'dot-off'} />
            {liveConnected ? 'Live' : 'Offline'}
            {!boot.free_used && <span className="tag tag-on">Шанс</span>}
            {isDemo && <span className="tag">Demo</span>}
          </div>
        </div>
        <button className="btn btn-outline" onClick={() => doTopup(100)}>Пополнить +100 ⭐</button>
        {boot.is_owner && (
          <button className="btn btn-outline btn-mt" onClick={() => setShowAdmin(true)}>Панель управления</button>
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
      {/* Win result */}
      {showRes && winner && (
        <>
          <div className="overlay" onClick={() => setShowRes(false)} />
          <div className="sheet">
            <div className="sheet-bar" />
            <div className="res">
              <span className="res-emoji">{winner.emoji}</span>
              <h2 className="res-title">{winner.name}</h2>
              <p className="res-sub">{winner.rarity}</p>
              <div className="btn-row">
                <button className="btn btn-w" onClick={claimPrize}>Забрать</button>
                <button className="btn btn-outline" onClick={sellWon}>
                  Продать {boot.prizes_catalog.find(p => p.key === winner.key)?.sell_value || 0} ⭐
                </button>
              </div>
            </div>
          </div>
        </>
      )}
      {showAdmin && (
        <AdminSheet
          flags={boot.flags} onToggle={toggleFlag}
          onClose={() => setShowAdmin(false)}
          spinCost={boot.config.spin_cost}
          onSetSpinCost={setSpinCost}
          prizes={boot.prizes_catalog}
          onSaveWeights={saveWeights}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
};

export default App;
