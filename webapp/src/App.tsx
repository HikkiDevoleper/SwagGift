import React, { useState, useEffect } from 'react';
import { useAppLogic } from './hooks/useAppLogic';
import { Roulette } from './components/Roulette';
import { AdminSheet } from './components/AdminSheet';
import { tg, cn, api, initialsOf, rankTitle, rarityClass, formatDate } from './utils';
import { type Prize, type RuntimeFlags } from './types';
import './styles.css';

// Strict minimal icons
const IconCrosshair = () => (
  <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>
);
const IconUser = () => (
  <svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
);
const IconList = () => (
  <svg viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
);

export const App: React.FC = () => {
  const { boot, setBoot, activeScreen, setActiveScreen, liveConnected, setLiveConnected, notify, refreshUser, toast } = useAppLogic();

  const [isSpinning, setIsSpinning] = useState(false);
  const [winner, setWinner] = useState<Prize | undefined>();
  const [showResult, setShowResult] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);

  // SSE Live
  useEffect(() => {
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout>;
    const connect = () => {
      es = new EventSource('/api/live');
      es.addEventListener('snapshot', (e) => {
        try {
          const data = JSON.parse(e.data);
          setLiveConnected(true);
          setBoot(prev => prev ? { ...prev, history: data.history || prev.history, leaderboard: data.leaderboard || prev.leaderboard } : prev);
        } catch {}
      });
      es.onerror = () => { setLiveConnected(false); es?.close(); timer = setTimeout(connect, 5000); };
    };
    if (boot) connect();
    return () => { es?.close(); clearTimeout(timer); };
  }, [!!boot]);

  if (boot?.flags.maint && !boot.is_owner) {
    return (
      <div className="app-container">
        <div className="maint-screen">
          <svg width="48" height="48" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <h1>MAINTENANCE</h1><p>Система временно недоступна.</p>
        </div>
      </div>
    );
  }

  if (!boot) return <div className="app-container"><div className="loading-screen">ЛОАДИНГ...</div></div>;

  const isDemo = boot.flags.demo && boot.is_owner;

  const handlePaidSpin = async () => {
    if (isSpinning) return;
    if (isDemo) {
      try {
        const res = await api<{ winner: Prize }>('demo_spin', 'POST');
        if (res.winner) { setWinner(res.winner); setIsSpinning(true); }
      } catch (e: any) { notify(e.message || 'Error'); }
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
    } catch (e: any) { notify(e.message || 'Ошибка платежа'); }
  };

  const handleFreeSpin = async () => {
    if (isSpinning || boot.free_used) return;
    try {
      const res = await api<{ winner?: Prize; error?: string; channel_url?: string }>('free_spin', 'POST');
      if (res.winner) { setWinner(res.winner); setIsSpinning(true); }
      else if (res.error === 'not_subscribed') {
        tg?.showConfirm('Подпишитесь на канал для бесплатного шанса', (ok: boolean) => {
          if (ok) tg?.openLink(res.channel_url || boot.config.channel_url);
        });
      } else if (res.error === 'already_used') { notify('Шанс исчерпан'); refreshUser(); }
    } catch (e: any) { notify(e.message || 'Ошибка'); }
  };

  return (
    <div className="app-container">
      <div className="content-scroll">

        {/* ── ТАБ: ИГРА ────────────────────────────────────── */}
        {activeScreen === 'spin' && (
          <div className="animate-slide-up">
            <div className="status-header">
              <span className={cn('status-pill', liveConnected && 'live')}>{liveConnected ? 'Live' : 'Offline'}</span>
              {isDemo && <span className="status-pill demo">Демо режим</span>}
            </div>

            <Roulette prizes={boot.prizes_catalog} isSpinning={isSpinning} winner={winner} onSpinEnd={(w) => {
              setIsSpinning(false);
              if (w.type !== 'nothing') setShowResult(true);
              else notify('ПРОМАХ');
              refreshUser();
            }} />

            <div className="spin-actions">
              <button className="btn-primary" onClick={handlePaidSpin} disabled={isSpinning}>
                {isSpinning ? 'КРУТИМ...' : isDemo ? 'ТЕСТОВЫЙ СПИН' : `КРУТИТЬ ЗА ${boot.config.spin_cost} ⭐`}
              </button>
              {!boot.free_used && (
                <button className="btn-outline" onClick={handleFreeSpin} disabled={isSpinning}>
                  Использовать фриспин
                </button>
              )}
            </div>
            {boot.history.length > 0 && (
              <div className="animate-delay-1 live-drop-container">
                <div className="section-title sub-title">LIVE DROP</div>
                {boot.history.slice(0, 3).map((item, i) => (
                  <div key={i} className="row-item">
                    <div className="row-item-left">
                      <span className="row-item-title">{item.first_name || 'Игрок'}</span>
                    </div>
                    <div className="row-item-right">
                      <span className="tag tag-epic">{item.prize_name}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── ТАБ: ПРОФИЛЬ ─────────────────────────────────── */}
        {activeScreen === 'profile' && (
          <div className="animate-slide-up">
            <div className="profile-hero">
              <div className="avatar-large">{initialsOf(boot.user)}</div>
              <h1>{boot.user.first_name}</h1>
              <p>{rankTitle(boot.user.wins)}</p>
            </div>

            <div className="stats-grid">
              <div className="stat-box"><label>ПОБЕДЫ</label><span>{boot.user.wins}</span></div>
              <div className="stat-box"><label>СПИНЫ</label><span>{boot.user.spins}</span></div>
              <div className="stat-box"><label>ОПЛАТА</label><span>{boot.user.stars_spent}</span></div>
            </div>

            {boot.is_owner && (
              <div className="admin-button-wrap">
                <button className="btn-outline" onClick={() => setShowAdmin(true)}>
                  УПРАВЛЕНИЕ АДМИН
                </button>
              </div>
            )}

            <div className="section-title">ИНВЕНТАРЬ</div>
            {boot.prizes.length > 0 ? (
              boot.prizes.map((p, i) => (
                <div key={i} className="row-item">
                  <div className="row-item-left">
                    <span className="row-item-title">{p.name}</span>
                    <span className="row-item-sub">{formatDate(p.date)}</span>
                  </div>
                  <div className="row-item-right">
                    <span className={`tag tag-${rarityClass(p.rarity)}`}>{p.rarity}</span>
                  </div>
                </div>
              ))
            ) : <div className="empty-state">ПУСТО</div>}
          </div>
        )}

        {/* ── ТАБ: ТОП ─────────────────────────────────────── */}
        {activeScreen === 'top' && (
          <div className="animate-slide-up">
            <div className="section-title text-center">ТОП ИГРОКОВ</div>
            <div className="divider"></div>
            {boot.leaderboard.length > 0 ? (
              boot.leaderboard.map((item, i) => (
                <div key={i} className={`rank-item rank-${i + 1}`}>
                  <div className="rank-badge">{i + 1}</div>
                  <div className="rank-content">
                    <div className="rank-name">{item.first_name || 'Игрок'}</div>
                    <div className="rank-stats">{item.spins} СПИНОВ</div>
                  </div>
                  <div className="rank-score">{item.wins} WINS</div>
                </div>
              ))
            ) : <div className="empty-state">ПУСТО</div>}
          </div>
        )}
      </div>

      <div className="nav-bar">
        <button className={cn('nav-item', activeScreen === 'spin' && 'active')} onClick={() => setActiveScreen('spin')}>
          <IconCrosshair /><span className="nav-label">ИГРА</span>
        </button>
        <button className={cn('nav-item', activeScreen === 'profile' && 'active')} onClick={() => setActiveScreen('profile')}>
          <IconUser /><span className="nav-label">ПРОФИЛЬ</span>
        </button>
        <button className={cn('nav-item', activeScreen === 'top' && 'active')} onClick={() => setActiveScreen('top')}>
          <IconList /><span className="nav-label">ТОП</span>
        </button>
      </div>

      {showResult && winner && (
        <>
          <div className="sheet-backdrop" onClick={() => setShowResult(false)} />
          <div className="bottom-sheet text-center">
            <div className="result-view">
              <div className="result-emoji">{winner.emoji}</div>
              <div className="result-title">ВЫИГРЫШ</div>
              <div className="result-desc">ВЫ ПОЛУЧИЛИ <strong>{winner.name}</strong></div>
              <button className="btn-primary" onClick={() => setShowResult(false)}>ОТЛИЧНО</button>
            </div>
          </div>
        </>
      )}

      {showAdmin && (
        <AdminSheet
          flags={boot.flags}
          spinCost={boot.config.spin_cost}
          onToggle={async (key) => {
            const res = await api<{ value: boolean }>('admin/toggle', 'POST', { key });
            setBoot(prev => prev ? { ...prev, flags: { ...prev.flags, [key]: res.value } } : prev);
          }}
          onClose={() => setShowAdmin(false)}
          prizes={boot.prizes_catalog}
          onSaveWeights={async (weights) => {
            const res = await api<{ prizes: Prize[] }>('admin/weights', 'POST', { weights });
            if (res.prizes) setBoot(prev => prev ? { ...prev, prizes_catalog: res.prizes } : prev);
            notify('ШАНСЫ ОБНОВЛЕНЫ');
            setShowAdmin(false);
          }}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
};
