import React, { useState, useEffect, useRef } from 'react';
import { useAppLogic } from './hooks/useAppLogic';
import { Roulette } from './components/Roulette';
import { AdminSheet } from './components/AdminSheet';
import { tg, cn, api, initialsOf, rankTitle, rarityClass, formatDate } from './utils';
import { type Prize, type RuntimeFlags, type ScreenKey } from './types';
import './styles.css';

/* ── SVG icons (inline) ──────────────────────────── */

const IcDice = () => (
  <svg viewBox="0 0 24 24">
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <circle cx="8.5" cy="8.5" r="1.3" fill="currentColor" stroke="none"/>
    <circle cx="15.5" cy="8.5" r="1.3" fill="currentColor" stroke="none"/>
    <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/>
    <circle cx="8.5" cy="15.5" r="1.3" fill="currentColor" stroke="none"/>
    <circle cx="15.5" cy="15.5" r="1.3" fill="currentColor" stroke="none"/>
  </svg>
);

const IcBox = () => (
  <svg viewBox="0 0 24 24">
    <polyline points="21 8 21 21 3 21 3 8" />
    <rect x="1" y="3" width="22" height="5" rx="1" />
    <line x1="10" y1="12" x2="14" y2="12" />
  </svg>
);

const IcTrophy = () => (
  <svg viewBox="0 0 24 24">
    <path d="M6 9a6 6 0 0 0 12 0V3H6v6z" />
    <path d="M6 3H4a1 1 0 0 0-1 1v1a3 3 0 0 0 3 3" />
    <path d="M18 3h2a1 1 0 0 1 1 1v1a3 3 0 0 1-3 3" />
    <path d="M12 15v3M8 21h8" />
  </svg>
);

const IcUser = () => (
  <svg viewBox="0 0 24 24">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
  </svg>
);

/* ═══════════════════════════════════════════════════ */

export const App: React.FC = () => {
  const {
    boot, setBoot,
    activeScreen, setActiveScreen,
    liveConnected, setLiveConnected,
    notify, refreshUser, toast,
  } = useAppLogic();

  const [isSpinning, setIsSpinning] = useState(false);
  const [winner, setWinner]         = useState<Prize | undefined>();
  const [showResult, setShowResult] = useState(false);
  const [showAdmin, setShowAdmin]   = useState(false);

  /* ── SSE live feed ──────────────────────────────── */
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
          setBoot(prev => prev
            ? { ...prev, history: d.history ?? prev.history, leaderboard: d.leaderboard ?? prev.leaderboard }
            : prev);
        } catch {}
      });
      es.onerror = () => {
        setLiveConnected(false);
        es.close();
        retry = setTimeout(connect, 5000);
      };
    };

    connect();
    return () => { es?.close(); clearTimeout(retry); };
  }, [!!boot]);

  /* ── Guards ─────────────────────────────────────── */
  if (!boot) return <div className="app"><div className="loading">Загрузка…</div></div>;

  if (boot.flags.maint && !boot.is_owner) {
    return (
      <div className="app">
        <div className="maint">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
          <h1>Технические работы</h1>
          <p>Swag Gift временно недоступен.</p>
        </div>
      </div>
    );
  }

  const isDemo = boot.flags.demo && boot.is_owner;

  /* ── Handlers ───────────────────────────────────── */
  const handlePaidSpin = async () => {
    if (isSpinning) return;
    if (isDemo) {
      try {
        const r = await api<{ winner: Prize }>('demo_spin', 'POST');
        if (r.winner) { setWinner(r.winner); setIsSpinning(true); }
      } catch (e: any) { notify(e.message || 'Ошибка'); }
      return;
    }
    try {
      const inv = await api<{ invoice_link: string }>('create_invoice', 'POST');
      tg?.openInvoice(inv.invoice_link, async (status: string) => {
        if (status !== 'paid') return;
        const poll = setInterval(async () => {
          try {
            const r = await api<{ result: { winner: Prize } | null }>('spin_result');
            if (r.result) { clearInterval(poll); setWinner(r.result.winner); setIsSpinning(true); }
          } catch {}
        }, 1500);
        setTimeout(() => clearInterval(poll), 60000);
      });
    } catch (e: any) { notify(e.message || 'Ошибка'); }
  };

  const handleFreeSpin = async () => {
    if (isSpinning || boot.free_used) return;
    try {
      const r = await api<{ winner?: Prize; error?: string; channel_url?: string }>('free_spin', 'POST');
      if (r.winner) { setWinner(r.winner); setIsSpinning(true); }
      else if (r.error === 'not_subscribed') {
        tg?.showConfirm('Нужна подписка на канал. Открыть?', (ok: boolean) => {
          if (ok) tg?.openLink(r.channel_url || boot.config.channel_url);
        });
      } else if (r.error === 'already_used') { notify('Шанс уже использован'); refreshUser(); }
    } catch (e: any) { notify(e.message || 'Ошибка'); }
  };

  const handleToggleFlag = async (key: keyof RuntimeFlags) => {
    try {
      const r = await api<{ value: boolean }>('admin/toggle', 'POST', { key });
      setBoot(prev => prev ? { ...prev, flags: { ...prev.flags, [key]: r.value } } : prev);
      notify(`${key}: ${r.value ? 'вкл' : 'выкл'}`);
    } catch (e: any) { notify(e.message || 'Ошибка'); }
  };

  const handleSaveWeights = async (weights: Record<string, number>) => {
    try {
      const r = await api<{ prizes: Prize[] }>('admin/weights', 'POST', { weights });
      if (r.prizes) setBoot(prev => prev ? { ...prev, prizes_catalog: r.prizes } : prev);
      notify('Шансы обновлены');
    } catch (e: any) { notify(e.message || 'Ошибка'); }
  };

  const onSpinEnd = (won: Prize) => {
    setIsSpinning(false);
    if (won.type !== 'nothing') setShowResult(true);
    else notify('Пусто, попробуй снова');
    refreshUser();
  };

  /* ── Sub-screens ────────────────────────────────── */
  const renderSpin = () => (
    <div className="screen screen-enter" key="spin">
      <div className="card">
        <div className="spin-header">
          <h1 className="spin-title">Рулетка</h1>
          <span className="spin-cost">{boot.config.spin_cost} ⭐{isDemo ? ' · Demo' : ''}</span>
        </div>

        <Roulette prizes={boot.prizes_catalog} isSpinning={isSpinning} winner={winner} onSpinEnd={onSpinEnd} />

        <button className="btn-primary" onClick={handlePaidSpin} disabled={isSpinning}>
          {isSpinning ? 'Крутим…' : isDemo ? 'Демо-спин' : `Крутить — ${boot.config.spin_cost} ⭐`}
        </button>

        {!boot.free_used && (
          <button className="btn-ghost" onClick={handleFreeSpin} disabled={isSpinning}>
            Бесплатный шанс
          </button>
        )}
      </div>

      {boot.history.length > 0 && (
        <div className="card">
          <p className="feed-title">Последние выигрыши</p>
          {boot.history.slice(0, 7).map((row, i) => (
            <div key={i} className="feed-item">
              <div className="feed-dot" />
              <span className="feed-name">{row.first_name || row.username || 'Игрок'}</span>
              <span className="feed-prize">{row.prize_name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderInventory = () => (
    <div className="screen screen-enter" key="inventory">
      <h1 className="spin-title" style={{ marginBottom: 14, fontSize: 18 }}>Мои призы</h1>
      {boot.prizes.length === 0
        ? <div className="empty">Ещё нет призов</div>
        : (
          <div className="prizes-grid">
            {boot.prizes.map((item, i) => (
              <div key={i} className="prize-item">
                <span className="prize-item-emoji">{item.emoji || '🎁'}</span>
                <span className="prize-item-name">{item.name}</span>
                <span className={`prize-item-rarity r-${rarityClass(item.rarity)}`}>{item.rarity}</span>
                <span className="prize-item-date">{formatDate(item.date)}</span>
              </div>
            ))}
          </div>
        )
      }
    </div>
  );

  const renderTop = () => (
    <div className="screen screen-enter" key="top">
      <h1 className="spin-title" style={{ marginBottom: 14, fontSize: 18 }}>Рейтинг</h1>
      {boot.leaderboard.length === 0
        ? <div className="empty">Пока пусто</div>
        : boot.leaderboard.map((row, i) => (
          <div key={i} className="lb-item">
            <span className={cn('lb-rank', i === 0 && 'gold', i === 1 && 'silver', i === 2 && 'bronze')}>
              {i + 1}
            </span>
            <div className="lb-info">
              <div className="lb-name">{row.first_name || row.username || 'Игрок'}</div>
              <div className="lb-sub">{row.spins} спинов · {row.stars_spent} ⭐</div>
            </div>
            <span className="lb-wins">{row.wins} 🏆</span>
          </div>
        ))
      }
    </div>
  );

  const renderProfile = () => {
    const u = boot.user;
    const photoUrl = u.photo_url;
    return (
      <div className="screen screen-enter" key="profile">
        <div className="profile-hero">
          <div className="profile-avatar">
            {photoUrl
              ? <img src={photoUrl} alt="avatar" />
              : initialsOf(u)
            }
          </div>
      <h1 className="section-title">{u.first_name}</h1>
          {u.username && <p className="profile-handle">@{u.username}</p>}
          <p className="profile-rank">{rankTitle(u.wins)}</p>

          <div className="profile-stats">
            <div className="profile-stat">
              <span className="profile-stat-val">{u.wins}</span>
              <span className="profile-stat-lbl">Побед</span>
            </div>
            <div className="profile-stat">
              <span className="profile-stat-val">{u.spins}</span>
              <span className="profile-stat-lbl">Спинов</span>
            </div>
            <div className="profile-stat">
              <span className="profile-stat-val">{u.stars_spent}</span>
              <span className="profile-stat-lbl">Звёзд</span>
            </div>
          </div>

          <div className="profile-status">
            <span className={liveConnected ? 'dot-live' : undefined}
              style={!liveConnected ? { width: 6, height: 6, borderRadius: '50%', background: 'var(--text-3)' } : undefined}
            />
            {liveConnected ? 'Live' : 'Offline'}
        {!boot.free_used && (
              <span style={{ marginLeft: 8 }}> · <span className="badge on">Шанс доступен</span></span>
            )}
            {isDemo && (
              <span style={{ marginLeft: 8 }}><span className="badge demo">Demo</span></span>
            )}
          </div>
        </div>

        {boot.is_owner && (
          <button
            className="btn-ghost"
            style={{ marginBottom: 10 }}
            onClick={() => setShowAdmin(true)}
          >
            Панель управления
          </button>
        )}
      </div>
    );
  };

  const screens: Record<ScreenKey, () => React.ReactElement> = {
    spin: renderSpin,
    inventory: renderInventory,
    top: renderTop,
    profile: renderProfile,
  };

  const tabs: { key: ScreenKey; icon: React.ReactElement; label: string }[] = [
    { key: 'spin',      icon: <IcDice />,   label: 'Игра' },
    { key: 'inventory', icon: <IcBox />,    label: 'Призы' },
    { key: 'top',       icon: <IcTrophy />, label: 'Топ' },
    { key: 'profile',   icon: <IcUser />,   label: 'Профиль' },
  ];

  return (
    <div className="app">
      <div className="scroll">
        {screens[activeScreen]()}
      </div>

      {/* Nav */}
      <nav className="nav">
        {tabs.map(t => (
          <button
            key={t.key}
            className={cn('nav-btn', activeScreen === t.key && 'active')}
            onClick={() => setActiveScreen(t.key)}
          >
            {t.icon}
            <span className="nav-lbl">{t.label}</span>
          </button>
        ))}
      </nav>

      {/* Win result */}
      {showResult && winner && (
        <>
          <div className="overlay" onClick={() => setShowResult(false)} />
          <div className="sheet">
            <div className="sheet-bar" />
            <div className="result-wrap">
              <span className="result-emoji">{winner.emoji}</span>
              <h2 className="result-title">{winner.name}</h2>
              <p className="result-rarity">{winner.rarity}</p>
              <button className="btn-primary" onClick={() => setShowResult(false)}>
                Забрать
              </button>
            </div>
          </div>
        </>
      )}

      {/* Admin */}
      {showAdmin && (
        <AdminSheet
          flags={boot.flags}
          onToggle={handleToggleFlag}
          onClose={() => setShowAdmin(false)}
          spinCost={boot.config.spin_cost}
          prizes={boot.prizes_catalog}
          onSaveWeights={handleSaveWeights}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
};

export default App;
