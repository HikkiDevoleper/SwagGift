import React, { useState, useEffect, useRef } from 'react';
import { useAppLogic } from './hooks/useAppLogic';
import { Roulette } from './components/Roulette';
import { AdminSheet } from './components/AdminSheet';
import { tg, cn, api, initialsOf, rankTitle, rarityClass, formatDate } from './utils';
import { type Prize, type RuntimeFlags } from './types';
import './styles.css';

const IconDice = () => (
  <svg viewBox="0 0 24 24">
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <circle cx="8.5" cy="8.5" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="15.5" cy="8.5" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="8.5" cy="15.5" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="15.5" cy="15.5" r="1.2" fill="currentColor" stroke="none" />
  </svg>
);

const IconGift = () => (
  <svg viewBox="0 0 24 24">
    <rect x="3" y="11" width="18" height="10" rx="2" />
    <rect x="5" y="7" width="14" height="4" rx="1" />
    <path d="M12 7v14" />
    <path d="M12 7c-1.5-2-4-3-5-2s0 3.5 5 2" />
    <path d="M12 7c1.5-2 4-3 5-2s0 3.5-5 2" />
  </svg>
);

const IconTrophy = () => (
  <svg viewBox="0 0 24 24">
    <path d="M6 9a6 6 0 0 0 12 0V4H6v5z" />
    <path d="M6 4H4a1 1 0 0 0-1 1v2a3 3 0 0 0 3 3" />
    <path d="M18 4h2a1 1 0 0 1 1 1v2a3 3 0 0 1-3 3" />
    <path d="M12 15v3" />
    <path d="M8 21h8" />
  </svg>
);

export const App: React.FC = () => {
  const {
    boot, setBoot,
    activeScreen, setActiveScreen,
    liveConnected, setLiveConnected,
    notify, refreshUser, toast
  } = useAppLogic();

  const [isSpinning, setIsSpinning] = useState(false);
  const [winner, setWinner] = useState<Prize | undefined>();
  const [showResult, setShowResult] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);

  // SSE live feed
  useEffect(() => {
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout>;

    const connect = () => {
      es = new EventSource('/api/live');
      es.addEventListener('snapshot', (e) => {
        try {
          const data = JSON.parse(e.data);
          setLiveConnected(true);
          setBoot(prev => prev ? {
            ...prev,
            history: data.history || prev.history,
            leaderboard: data.leaderboard || prev.leaderboard,
          } : prev);
        } catch {}
      });
      es.onerror = () => {
        setLiveConnected(false);
        es?.close();
        timer = setTimeout(connect, 5000);
      };
    };

    if (boot) connect();
    return () => { es?.close(); clearTimeout(timer); };
  }, [!!boot]);

  if (boot?.flags.maint && !boot.is_owner) {
    return (
      <div className="app-container">
        <div className="maint-screen">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
          <h1>Технические работы</h1>
          <p>Swag Gift временно недоступен. Скоро вернёмся.</p>
        </div>
      </div>
    );
  }

  if (!boot) {
    return (
      <div className="app-container">
        <div className="loading-screen">Загрузка...</div>
      </div>
    );
  }

  // Demo mode — owner only
  const isDemo = boot.flags.demo && boot.is_owner;

  const handlePaidSpin = async () => {
    if (isSpinning) return;

    if (isDemo) {
      try {
        const res = await api<{ winner: Prize }>('demo_spin', 'POST');
        if (res.winner) { setWinner(res.winner); setIsSpinning(true); }
      } catch (e: any) { notify(e.message || 'Ошибка'); }
      return;
    }

    try {
      const inv = await api<{ invoice_link: string }>('create_invoice', 'POST');
      tg?.openInvoice(inv.invoice_link, async (status: string) => {
        if (status === 'paid') {
          const poll = setInterval(async () => {
            try {
              const res = await api<{ result: { winner: Prize } | null }>('spin_result');
              if (res.result) { clearInterval(poll); setWinner(res.result.winner); setIsSpinning(true); }
            } catch {}
          }, 1500);
          setTimeout(() => clearInterval(poll), 60000);
        }
      });
    } catch (e: any) { notify(e.message || 'Ошибка'); }
  };

  const handleFreeSpin = async () => {
    if (isSpinning || boot.free_used) return;
    try {
      const res = await api<{ winner?: Prize; error?: string; channel_url?: string }>('free_spin', 'POST');
      if (res.winner) { setWinner(res.winner); setIsSpinning(true); }
      else if (res.error === 'not_subscribed') {
        tg?.showConfirm('Нужна подписка на канал. Открыть?', (ok: boolean) => {
          if (ok) tg?.openLink(res.channel_url || boot.config.channel_url);
        });
      } else if (res.error === 'already_used') { notify('Шанс уже использован'); refreshUser(); }
    } catch (e: any) { notify(e.message || 'Ошибка'); }
  };

  const handleToggleFlag = async (key: keyof RuntimeFlags) => {
    try {
      const res = await api<{ value: boolean }>('admin/toggle', 'POST', { key });
      setBoot(prev => prev ? { ...prev, flags: { ...prev.flags, [key]: res.value } } : prev);
      notify(`${key}: ${res.value ? 'вкл' : 'выкл'}`);
    } catch (e: any) { notify(e.message || 'Ошибка'); }
  };

  const handleSaveWeights = async (weights: Record<string, number>) => {
    try {
      const res = await api<{ prizes: Prize[] }>('admin/weights', 'POST', { weights });
      if (res.prizes) {
        setBoot(prev => prev ? { ...prev, prizes_catalog: res.prizes } : prev);
      }
      notify('Шансы сохранены');
    } catch (e: any) { notify(e.message || 'Ошибка'); }
  };

  const onSpinEnd = (wonPrize: Prize) => {
    setIsSpinning(false);
    if (wonPrize.type !== 'nothing') setShowResult(true);
    else notify('Пусто');
    refreshUser();
  };

  return (
    <div className="app-container">
      <div className="content-scroll">

        {/* Profile */}
        <div className="card">
          <div className="profile-header">
            <div className="avatar">{initialsOf(boot.user)}</div>
            <div className="user-info">
              <h1>{boot.user.first_name}</h1>
              <p>{rankTitle(boot.user.wins)}</p>
            </div>
            {boot.is_owner && (
              <button className="btn-small" onClick={() => setShowAdmin(true)}>Админ</button>
            )}
          </div>

          <div className="badges-row">
            <span className={cn('badge', liveConnected ? 'badge--live' : 'badge--used')}>
              {liveConnected ? 'Live' : 'Offline'}
            </span>
            {!boot.free_used && <span className="badge badge--free">Шанс</span>}
            {isDemo && <span className="badge badge--demo">Demo</span>}
          </div>

          <div className="stats-row">
            <div className="stat-item"><label>Побед</label><span>{boot.user.wins}</span></div>
            <div className="stat-item"><label>Спинов</label><span>{boot.user.spins}</span></div>
            <div className="stat-item"><label>Потрачено</label><span>{boot.user.stars_spent} ⭐</span></div>
          </div>
        </div>

        {/* Spin */}
        {activeScreen === 'spin' && (
          <>
            <div className="card">
              <div className="section-header">
                <h2 className="section-title">Рулетка</h2>
                <span className="section-badge">{boot.config.spin_cost} ⭐</span>
              </div>

              <Roulette prizes={boot.prizes_catalog} isSpinning={isSpinning} winner={winner} onSpinEnd={onSpinEnd} />

              <button
                className={cn('btn-spin', isDemo && 'btn-spin--demo')}
                onClick={handlePaidSpin}
                disabled={isSpinning}
              >
                {isSpinning ? 'Крутим...' : isDemo ? 'Demo спин' : `Крутить за ${boot.config.spin_cost} ⭐`}
              </button>

              {!boot.free_used && (
                <button className="btn-secondary" onClick={handleFreeSpin} disabled={isSpinning}>
                  Бесплатный шанс
                </button>
              )}
            </div>

            <div className="card">
              <div className="section-header">
                <h2 className="section-title">Последние выигрыши</h2>
              </div>
              {boot.history.length > 0
                ? boot.history.slice(0, 6).map((item, i) => (
                    <div key={`${item.won_at}-${i}`} className="list-item">
                      <div className="list-content">
                        <div className="list-title">{item.first_name || item.username || 'Игрок'}</div>
                        <div className="list-subtitle">{item.prize_name} · {formatDate(item.won_at)}</div>
                      </div>
                    </div>
                  ))
                : <div className="empty-state">Пока пусто</div>
              }
            </div>
          </>
        )}

        {/* Inventory */}
        {activeScreen === 'inventory' && (
          <div className="card">
            <div className="section-header"><h2 className="section-title">Мои призы</h2></div>
            {boot.prizes.length > 0
              ? boot.prizes.map((item, i) => (
                  <div key={`${item.date}-${i}`} className="list-item">
                    <div className="list-content">
                      <div className="list-title">{item.name}</div>
                      <div className="list-subtitle">{formatDate(item.date)}</div>
                    </div>
                    <span className={`rarity-badge rarity-badge--${rarityClass(item.rarity)}`}>{item.rarity}</span>
                  </div>
                ))
              : <div className="empty-state">Нет призов</div>
            }
          </div>
        )}

        {/* Leaderboard */}
        {activeScreen === 'top' && (
          <div className="card">
            <div className="section-header"><h2 className="section-title">Рейтинг</h2></div>
            {boot.leaderboard.length > 0
              ? boot.leaderboard.map((item, i) => (
                  <div key={`${item.user_id}-${i}`} className="list-item">
                    <div className={cn('list-rank', i === 0 && 'list-rank--gold', i === 1 && 'list-rank--silver', i === 2 && 'list-rank--bronze')}>{i + 1}</div>
                    <div className="list-content">
                      <div className="list-title">{item.first_name || item.username || 'Игрок'}</div>
                      <div className="list-subtitle">{item.spins} спинов</div>
                    </div>
                    <div className="list-value">{item.wins}</div>
                  </div>
                ))
              : <div className="empty-state">Пусто</div>
            }
          </div>
        )}
      </div>

      {/* Nav */}
      <div className="nav-bar">
        <button className={cn('nav-item', activeScreen === 'spin' && 'active')} onClick={() => setActiveScreen('spin')}>
          <IconDice /><span className="nav-label">Игра</span>
        </button>
        <button className={cn('nav-item', activeScreen === 'inventory' && 'active')} onClick={() => setActiveScreen('inventory')}>
          <IconGift /><span className="nav-label">Призы</span>
        </button>
        <button className={cn('nav-item', activeScreen === 'top' && 'active')} onClick={() => setActiveScreen('top')}>
          <IconTrophy /><span className="nav-label">Топ</span>
        </button>
      </div>

      {/* Result Sheet */}
      {showResult && winner && (
        <>
          <div className="sheet-backdrop" onClick={() => setShowResult(false)} />
          <div className="bottom-sheet">
            <div className="sheet-handle" />
            <div className="result-content">
              <div className="result-emoji">{winner.emoji}</div>
              <h2 className="result-title">{winner.name}</h2>
              <p className="result-subtitle">{winner.rarity}</p>
              <button className="btn-spin" onClick={() => setShowResult(false)}>Забрать</button>
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
