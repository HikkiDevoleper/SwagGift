import React, { useState, useEffect, useRef } from 'react';
import { useAppLogic } from './hooks/useAppLogic';
import { SpinPage } from './components/SpinPage';
import { InventoryPage } from './components/InventoryPage';
import { LeaderboardPage } from './components/LeaderboardPage';
import { ProfilePage } from './components/ProfilePage';
import { preloadTgs } from './components/TgsPlayer';
import { WinSheet } from './components/WinSheet';
import { TopupSheet } from './components/TopupSheet';
import { AdminSheet } from './components/AdminSheet';
import { tg, cn, api } from './utils';
import { type Prize, type RuntimeFlags, type ScreenKey } from './types';
import './styles.css';

/* ── Nav icons ─────────────────────── */
const IcDice = () => (<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="15.5" cy="8.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="8.5" cy="15.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="15.5" cy="15.5" r="1.3" fill="currentColor" stroke="none"/></svg>);
const IcGift = () => (<svg viewBox="0 0 24 24"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5" rx="1"/><line x1="10" y1="12" x2="14" y2="12"/></svg>);
const IcTrophy = () => (<svg viewBox="0 0 24 24"><path d="M6 9a6 6 0 0 0 12 0V3H6v6z"/><path d="M6 3H4a1 1 0 0 0-1 1v1a3 3 0 0 0 3 3"/><path d="M18 3h2a1 1 0 0 1 1 1v1a3 3 0 0 1-3 3"/><path d="M12 15v3M8 21h8"/></svg>);
const IcUser = () => (<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>);

/* ═══════════════════════════════════ */
export const App: React.FC = () => {
  const {
    boot, setBoot, activeScreen, setActiveScreen,
    liveConnected, setLiveConnected, notify, refreshUser, refreshPrizes, toast,
  } = useAppLogic();

  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<Prize>();
  const [wonPrizeId, setWonPrizeId] = useState(0);
  const [showRes, setShowRes] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showTopup, setShowTopup] = useState(false);
  const spinRef = useRef(false);
  const suppressOwnWinsSince = useRef<string | null>(null);

  /* ── Preload gift TGS once (reduces lag and repeated fetch/parse) ── */
  useEffect(() => {
    if (!boot?.prizes_catalog?.length) return;
    const list = boot.prizes_catalog
      .map(p => p.tgs)
      .filter((tgs): tgs is string => !!tgs)
      .slice(0, 40);

    // Warm-up: fetch + inflate + JSON parse into TgsPlayer cache.
    // Do sequentially to avoid spiking CPU on low-end devices.
    (async () => {
      for (const tgs of list) {
        try {
          await preloadTgs(`/gifts/${tgs}`);
        } catch {}
      }
    })();
  }, [!!boot]);

  /* ── SSE: always live (ticker is always visible, shows everyone's wins) ── */
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
          setBoot(p => {
            if (!p) return p;
            return {
              ...p,
              leaderboard: d.leaderboard ?? p.leaderboard,
              history: d.history ?? p.history,
            };
          });
        } catch {}
      });
      es.onerror = () => { setLiveConnected(false); es.close(); retry = setTimeout(connect, 5000); };
    };
    connect();
    return () => { es?.close(); clearTimeout(retry); };
  }, [!!boot]);

  /* ── Guards ── */
  if (!boot) {
    return (
      <div className="app">
        <div className="loading"><div className="loader" /><p>Загрузка…</p></div>
      </div>
    );
  }
  if (boot.flags.maint && !boot.is_owner) {
    return (
      <div className="app">
        <div className="maint"><div className="maint-icon">⏳</div><h1>Технические работы</h1><p>Скоро вернёмся</p></div>
      </div>
    );
  }

  const isDemo = boot.flags.demo && boot.is_owner;

  /* ── Actions ── */
  const doSpin = async () => {
    if (spinning) return;
    suppressOwnWinsSince.current = new Date().toISOString();
    if (isDemo) {
      try {
        const r = await api<{ winner: Prize; prize_id: number }>('demo_spin', 'POST');
        if (r.winner) {
          setWinner(r.winner);
          setWonPrizeId(r.prize_id);
          spinRef.current = true;
          setSpinning(true);
        }
      } catch (e: any) { notify(e.message || 'Ошибка'); }
      return;
    }
    try {
      const r = await api<{ winner?: Prize; prize_id?: number; balance?: number; error?: string; spin_cost?: number }>('spin', 'POST');
      if (r.error === 'insufficient_balance') {
        suppressOwnWinsSince.current = null;
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
      else {
        suppressOwnWinsSince.current = null;
      }
    } catch (e: any) {
      suppressOwnWinsSince.current = null;
      notify(e.message || 'Ошибка');
    }
  };

  const doFree = async () => {
    if (spinning || boot.free_used) return;
    suppressOwnWinsSince.current = new Date().toISOString();
    try {
      const r = await api<{ winner?: Prize; prize_id?: number; error?: string; channel_url?: string }>('free_spin', 'POST');
      if (r.winner) {
        setWinner(r.winner);
        setWonPrizeId(r.prize_id || 0);
        spinRef.current = true;
        setSpinning(true);
      }
      else if (r.error === 'not_subscribed') {
        suppressOwnWinsSince.current = null;
        tg?.showConfirm('Подпишитесь на @SwagGiftChannel для бесплатного спина', (ok: boolean) => {
          if (ok) tg?.openLink(r.channel_url || boot.config.channel_url);
        });
      } else if (r.error === 'already_used') { notify('Шанс использован'); refreshUser(); }
      else {
        suppressOwnWinsSince.current = null;
      }
    } catch (e: any) {
      suppressOwnWinsSince.current = null;
      notify(e.message || 'Ошибка');
    }
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
    suppressOwnWinsSince.current = null;
    setSpinning(false);
    if (won.type !== 'nothing') setShowRes(true);
    else notify('Пусто — повезёт в следующий раз');
    refreshUser();
  };

  const sellWonPrize = async () => {
    if (!winner || wonPrizeId <= 0) return;
    await doSell(wonPrizeId, winner.key);
    setShowRes(false);
    // Inventory changed; refresh just prizes list once
    refreshPrizes();
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

  /* ── Tabs ── */
  const TABS: { key: ScreenKey; icon: React.ReactElement; label: string }[] = [
    { key: 'spin', icon: <IcDice />, label: 'Игра' },
    { key: 'inventory', icon: <IcGift />, label: 'Призы' },
    { key: 'top', icon: <IcTrophy />, label: 'Топ' },
    { key: 'profile', icon: <IcUser />, label: 'Профиль' },
  ];

  return (
    <div className="app">
      <div className="scroll">
        {activeScreen === 'spin' && (
          <SpinPage
            boot={{
              ...boot,
              history: boot.history.filter(h => {
                // hide own win from ticker until spin end (SSE can arrive earlier)
                const sup = suppressOwnWinsSince.current;
                if (!sup) return true;
                const isMe = h.username && boot.user.username && h.username === boot.user.username;
                return !(isMe && h.won_at >= sup);
              }),
            }}
            spinning={spinning} winner={winner} isDemo={isDemo}
            onSpin={doSpin} onFreeSpin={doFree} onSpinEnd={onSpinEnd}
            onTopup={() => setShowTopup(true)}
          />
        )}
        {activeScreen === 'inventory' && (
          <InventoryPage prizes={boot.prizes} catalog={boot.prizes_catalog} onSell={doSell} onWithdraw={doWithdraw} refreshPrizes={refreshPrizes} />
        )}
        {activeScreen === 'top' && <LeaderboardPage rows={boot.leaderboard} />}
        {activeScreen === 'profile' && (
          <ProfilePage user={boot.user} isOwner={boot.is_owner}
            onTopup={() => setShowTopup(true)} onAdmin={() => setShowAdmin(true)}
          />
        )}
      </div>

      <nav className="nav">
        {TABS.map(t => (
          <button key={t.key} className={cn('nav-btn', activeScreen === t.key && 'on')} onClick={() => setActiveScreen(t.key)}>
            {t.icon}<span className="nav-lbl">{t.label}</span>
          </button>
        ))}
      </nav>

      {showRes && winner && (
        <WinSheet
          winner={winner}
          sellValue={boot.prizes_catalog.find(p => p.key === winner.key)?.sell_value || 0}
          onClaim={() => setShowRes(false)}
          onSell={sellWonPrize}
        />
      )}

      {showTopup && (
        <TopupSheet balance={boot.user.balance || 0} onTopup={doTopup} onClose={() => setShowTopup(false)} />
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
