import React from 'react';
import { Roulette } from './Roulette';
import { WinsTicker } from './WinsTicker';
import { tg, initialsOf } from '../utils';
import { type Prize, type HistoryRow, type BootstrapResponse } from '../types';

interface Props {
  boot: BootstrapResponse;
  spinning: boolean;
  winner?: Prize;
  isDemo: boolean;
  showHistory: boolean;
  onSpin: () => void;
  onFreeSpin: () => void;
  onSpinEnd: (p: Prize) => void;
  onTopup: () => void;
}

export const SpinPage: React.FC<Props> = ({
  boot, spinning, winner, isDemo, showHistory, onSpin, onFreeSpin, onSpinEnd, onTopup,
}) => {
  const tgPhoto = (tg?.initDataUnsafe?.user as any)?.photo_url || null;
  const balance = boot.user.balance || 0;
  const cost = boot.config.spin_cost;

  return (
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
        <button className="spin-bar-bal" onClick={onTopup}>{balance} ⭐</button>
      </div>

      {/* Recent wins — hidden during spin to prevent spoilers */}
      {showHistory && (
        <WinsTicker history={boot.history} catalog={boot.prizes_catalog} />
      )}

      {/* Roulette */}
      <div className="card roulette-card">
        <Roulette prizes={boot.prizes_catalog} isSpinning={spinning} winner={winner} onSpinEnd={onSpinEnd} />
        <button className={`btn btn-w spin-btn ${spinning ? 'spinning' : ''}`} onClick={onSpin} disabled={spinning}>
          {spinning ? '🎰 Крутим…' : isDemo ? '🎲 Демо' : cost > 0 ? `Крутить — ${cost} ⭐` : '🎲 Крутить'}
        </button>
        {!boot.free_used && (
          <button className="btn btn-outline btn-mt" onClick={onFreeSpin} disabled={spinning}>
            Бесплатный шанс
          </button>
        )}
      </div>
    </div>
  );
};
