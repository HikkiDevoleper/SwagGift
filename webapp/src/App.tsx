import React, { useState, useEffect } from 'react';
import { useAppLogic } from './hooks/useAppLogic';
import { Roulette } from './components/Roulette';
import { AdminSheet } from './components/AdminSheet';
import { tg, classNames, api, initialsOf, rankTitle, formatDate } from './utils';
import { type Prize, type RuntimeFlags, type LiveData } from './types';
import './styles.css';

export const App: React.FC = () => {
  const {
    boot,
    setBoot,
    activeScreen,
    setActiveScreen,
    liveConnected,
    setLiveConnected,
    notify,
    refreshUser,
    toast,
    toastType
  } = useAppLogic();

  const [isSpinning, setIsSpinning] = useState(false);
  const [winner, setWinner] = useState<Prize | undefined>();
  const [showResult, setShowResult] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [liveData, setLiveData] = useState<LiveData | null>(null);

  // Real-time live updates
  useEffect(() => {
    const connectLive = () => {
      const eventSource = new EventSource(`${import.meta.env.VITE_API_URL || ''}/api/live`);
      
      eventSource.onmessage = (event) => {
        if (event.data && event.data !== '{}') {
          try {
            const data = JSON.parse(event.data);
            if (data.history || data.leaderboard || data.stats) {
              setLiveData(data);
              setLiveConnected(true);
              // Update boot with live data
              if (boot) {
                setBoot({
                  ...boot,
                  history: data.history || boot.history,
                  leaderboard: data.leaderboard || boot.leaderboard
                });
              }
            }
          } catch (e) {}
        }
      };
      
      eventSource.onerror = () => {
        setLiveConnected(false);
        eventSource.close();
        // Reconnect after 5 seconds
        setTimeout(connectLive, 5000);
      };
      
      return eventSource;
    };

    const evt = connectLive();
    return () => evt?.close();
  }, [boot]);

  // Maintenance mode check
  if (boot?.flags.maint) {
    return (
      <div className="app-container">
        <div className="maint-screen">
          <div className="maint-icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 6v6l4 2"/>
            </svg>
          </div>
          <h1>Технические работы</h1>
          <p>Swagging Gift временно недоступен.<br/>Мы скоро вернёмся!</p>
        </div>
      </div>
    );
  }

  if (!boot) return <div className="app-container"><div className="content-scroll">Загрузка...</div></div>;

  const handlePaidSpin = async () => {
    if (isSpinning) return;

    // Demo mode: free spin without payment
    if (boot.flags.demo) {
      try {
        const res = await api<{ winner: Prize; is_demo: boolean }>("demo_spin", "POST");
        if (res.winner) {
          setWinner(res.winner);
          setIsSpinning(true);
        }
      } catch (e: any) {
        notify(e.message || "Ошибка демо-прокрутки", "error");
      }
      return;
    }

    // Normal paid spin
    try {
      const invoice = await api<{ invoice_link: string }>("create_invoice", "POST");
      tg?.openInvoice(invoice.invoice_link, async (status: string) => {
        if (status === "paid") {
          const poll = setInterval(async () => {
            try {
              const res = await api<{ result: { winner: Prize } | null }>("spin_result");
              if (res.result) {
                clearInterval(poll);
                setWinner(res.result.winner);
                setIsSpinning(true);
              }
            } catch (e) {
              console.error("Polling error:", e);
            }
          }, 2000);
          
          // Safety timeout for polling
          setTimeout(() => clearInterval(poll), 60000);
        }
      });
    } catch (e: any) {
      notify(e.message || "Ошибка при создании счета", "error");
    }
  };

  const handleFreeSpin = async () => {
    if (isSpinning || boot.free_used) return;
    try {
      const res = await api<{ winner?: Prize; error?: string; channel_url?: string }>("free_spin", "POST");
      if (res.winner) {
        setWinner(res.winner);
        setIsSpinning(true);
      } else if (res.error === "not_subscribed") {
        tg?.showConfirm("Нужна подписка на канал. Открыть?", (ok: boolean) => {
          if (ok) tg?.openLink(res.channel_url || boot.config.channel_url);
        });
      } else if (res.error === "already_used") {
        notify("Бесплатный шанс уже использован", "info");
        refreshUser();
      }
    } catch (e: any) {
      notify(e.message || "Ошибка при прокрутке", "error");
    }
  };

  const handleToggleFlag = async (key: keyof RuntimeFlags) => {
    try {
      const res = await api<{ value: boolean }>("admin/toggle", "POST", { key });
      if (boot) {
        setBoot({
          ...boot,
          flags: { ...boot.flags, [key]: res.value }
        });
        notify(`Настройка ${key} изменена на ${res.value ? 'ВКЛ' : 'ВЫКЛ'}`, "success");
      }
    } catch (e: any) {
      notify(e.message || "Ошибка при изменении настройки", "error");
    }
  };

  const onSpinEnd = (wonPrize: Prize) => {
    setIsSpinning(false);
    if (wonPrize.type !== 'nothing') {
      setShowResult(true);
    } else {
      notify("В этот раз ничего не выпало...", "info");
    }
    refreshUser();
  };

  return (
    <div className="app-container">
      <div className="content-scroll">
        {/* Header Section */}
        <div className="glass-card">
          <div className="profile-header">
            <div className="avatar">{initialsOf(boot.user)}</div>
            <div className="user-info">
              <h1>{boot.user.first_name}</h1>
              <p>{rankTitle(boot.user.wins)}</p>
            </div>
            {boot.is_owner && (
              <button 
                className="secondary-button" 
                style={{ width: 'auto', marginTop: 0, marginLeft: 'auto', padding: '6px 12px' }}
                onClick={() => setShowAdmin(true)}
              >
                Админ
              </button>
            )}
          </div>
          
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <div className={classNames("status-chip", liveConnected && "status-chip--active")} 
                 style={{ fontSize: '10px', padding: '4px 8px', borderRadius: '4px', background: liveConnected ? 'rgba(95,207,128,0.1)' : 'rgba(255,255,255,0.05)', color: liveConnected ? '#5fcf80' : '#97a6b6' }}>
              {liveConnected ? "● Лента активна" : "○ Лента ждет"}
            </div>
            <div className="status-chip" 
                 style={{ fontSize: '10px', padding: '4px 8px', borderRadius: '4px', background: boot.free_used ? 'rgba(255,255,255,0.05)' : 'rgba(75,163,255,0.1)', color: boot.free_used ? '#97a6b6' : '#4ba3ff' }}>
              {boot.free_used ? "Шанс использован" : "Шанс доступен"}
            </div>
          </div>

          <div className="stats-row">
            <div className="stat-item">
              <label>Побед</label>
              <span>{boot.user.wins}</span>
            </div>
            <div className="stat-item">
              <label>Спинов</label>
              <span>{boot.user.spins}</span>
            </div>
            <div className="stat-item">
              <label>Потрачено</label>
              <span>{boot.user.stars_spent}⭐</span>
            </div>
          </div>
        </div>

        {activeScreen === "spin" && (
          <>
            <div className="glass-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h2 style={{ margin: 0, fontSize: '18px' }}>Рулетка</h2>
                <div style={{ fontSize: '14px', fontWeight: 'bold', color: 'var(--gold)' }}>{boot.config.spin_cost}⭐</div>
              </div>
              <Roulette 
                prizes={boot.prizes_catalog} 
                isSpinning={isSpinning} 
                winner={winner} 
                onSpinEnd={onSpinEnd} 
              />
              <button 
                className="main-button" 
                onClick={handlePaidSpin}
                disabled={isSpinning}
                style={boot.flags.demo ? { background: 'linear-gradient(135deg, #ff6b6b, #ffa502)' } : undefined}
              >
                {isSpinning ? "Крутим..." : boot.flags.demo ? "🎯 ДЕМО-СПИН" : `Крутить за ${boot.config.spin_cost} ⭐`}
              </button>
              <button 
                className="secondary-button" 
                onClick={handleFreeSpin}
                disabled={isSpinning || boot.free_used}
              >
                {boot.free_used ? "Бесплатный шанс использован" : "Бесплатный шанс"}
              </button>
            </div>

            <div className="glass-card">
              <h2 style={{ margin: '0 0 12px', fontSize: '16px' }}>Последние выигрыши</h2>
              {boot.history.length > 0 ? boot.history.slice(0, 5).map((item, i) => (
                <div key={`${item.won_at}-${i}`} className="list-item">
                  <div className="list-content">
                    <div className="list-title">{item.first_name || item.username || "Игрок"}</div>
                    <div className="list-subtitle">{item.prize_name} • {formatDate(item.won_at)}</div>
                  </div>
                </div>
              )) : <p style={{ textAlign: 'center', color: 'var(--hint)', fontSize: '14px' }}>История пока пуста</p>}
            </div>
          </>
        )}

        {activeScreen === "inventory" && (
          <div className="glass-card">
            <h2 style={{ margin: '0 0 12px', fontSize: '18px' }}>Мои призы</h2>
            {boot.prizes.length > 0 ? boot.prizes.map((item, i) => (
              <div key={`${item.date}-${i}`} className="list-item">
                <div className="list-content">
                  <div className="list-title">{item.name}</div>
                  <div className="list-subtitle">{formatDate(item.date)}</div>
                </div>
                <div className={classNames("list-value", `rarity-${item.rarity.toLowerCase()}`)} style={{ fontSize: '12px' }}>
                  {item.rarity}
                </div>
              </div>
            )) : <p style={{ textAlign: 'center', color: '#97a6b6' }}>У вас пока нет призов</p>}
          </div>
        )}

        {activeScreen === "top" && (
          <div className="glass-card">
            <h2 style={{ margin: '0 0 12px', fontSize: '18px' }}>Рейтинг игроков</h2>
            {boot.leaderboard.length > 0 ? boot.leaderboard.map((item, i) => (
              <div key={`${item.user_id}-${i}`} className="list-item">
                <div className="list-rank">{i + 1}</div>
                <div className="list-content">
                  <div className="list-title">{item.first_name || item.username || "Игрок"}</div>
                  <div className="list-subtitle">{item.spins} спинов</div>
                </div>
                <div className="list-value">{item.wins} побед</div>
              </div>
            )) : <p style={{ textAlign: 'center', color: 'var(--hint)', fontSize: '14px' }}>Рейтинг пуст</p>}
          </div>
        )}
      </div>

      {/* Navigation Bar */}
      <div className="nav-bar">
        <button className={classNames("nav-item", activeScreen === "spin" && "active")} onClick={() => setActiveScreen("spin")}>
          <span className="nav-label">Игра</span>
        </button>
        <button className={classNames("nav-item", activeScreen === "inventory" && "active")} onClick={() => setActiveScreen("inventory")}>
          <span className="nav-label">Призы</span>
        </button>
        <button className={classNames("nav-item", activeScreen === "top" && "active")} onClick={() => setActiveScreen("top")}>
          <span className="nav-label">Топ</span>
        </button>
      </div>

      {/* Result Bottom Sheet */}
      {showResult && winner && (
        <>
          <div className="sheet-backdrop" onClick={() => setShowResult(false)} />
          <div className="bottom-sheet">
            <div className="sheet-handle" />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '64px', margin: '20px 0' }}>{winner.emoji}</div>
              <h2 style={{ margin: '0 0 8px' }}>Вы выиграли: {winner.name}!</h2>
              <p style={{ color: '#97a6b6', marginBottom: '20px' }}>{winner.rarity} предмет добавлен в ваш профиль.</p>
              <button className="main-button" onClick={() => setShowResult(false)}>Отлично!</button>
            </div>
          </div>
        </>
      )}

      {/* Admin Panel */}
      {showAdmin && (
        <AdminSheet 
          flags={boot.flags} 
          onToggle={handleToggleFlag} 
          onClose={() => setShowAdmin(false)} 
          spinCost={boot.config.spin_cost} 
        />
      )}

      {toast && (
        <div className={`toast toast--${toastType}`} style={{ bottom: '80px' }}>
          {toast}
        </div>
      )}
    </div>
  );
};

export default App;
