import React from 'react';
import { Roulette } from './Roulette';
import { WinsTicker } from './WinsTicker';
import { tg, initialsOf } from '../utils';
import { type Prize, type BootstrapResponse } from '../types';

interface Props {
  boot: BootstrapResponse;
  spinning: boolean;
  winner?: Prize;
  isDemo: boolean;
  onSpin: () => void;
  onFreeSpin: () => void;
  onSpinEnd: (p: Prize) => void;
  onTopup: () => void;
}

export const SpinPage: React.FC<Props> = ({
  boot, spinning, winner, isDemo, onSpin, onFreeSpin, onSpinEnd, onTopup,
}) => {
  const tgPhoto = (tg?.initDataUnsafe?.user as any)?.photo_url || null;
  const balance = boot.user.balance || 0;
  const cost = boot.config.spin_cost;

  return (
    <div className="page fade-in" key="spin">
      {/* ── Top bar ── */}
      <div className="spin-bar">
        <div className="spin-bar-left">
          <div className="spin-bar-ava">
            {tgPhoto ? <img src={tgPhoto} alt="" /> : initialsOf(boot.user)}
          </div>
          <div className="spin-bar-info">
            <span className="spin-bar-name">{boot.user.first_name}</span>
            {isDemo && <span className="tag tag-demo">Demo</span>}
          </div>
        </div>
        <button className="spin-bar-bal" onClick={onTopup}>
          <span className="bal-star">⭐</span>
          <span className="bal-num">{balance}</span>
        </button>
      </div>

      {/* ── Roulette card ── */}
      <div className="card roulette-card">
        {/* Prize catalog preview strip */}
        <div className="catalog-strip">
          {boot.prizes_catalog.filter(p => p.type !== 'nothing').slice(0, 5).map(p => (
            <div key={p.key} className="catalog-chip">
              <span className="catalog-chip-emoji">{p.emoji}</span>
              <span className="catalog-chip-price">{p.sell_value}★</span>
            </div>
          ))}
          <div className="catalog-chip catalog-chip-more">
            <span className="catalog-chip-emoji">+{boot.prizes_catalog.filter(p => p.type !== 'nothing').length - 5}</span>
          </div>
        </div>

        <Roulette
          prizes={boot.prizes_catalog}
          isSpinning={spinning}
          winner={winner}
          onSpinEnd={onSpinEnd}
        />

        <button
          className={`btn btn-w spin-btn${spinning ? ' spinning' : ''}`}
          onClick={onSpin}
          disabled={spinning}
        >
          {spinning
            ? '🎰 Крутим…'
            : isDemo
              ? '🎲 Демо-спин'
              : cost > 0
                ? `🎰 Крутить — ${cost} ⭐`
                : '🎰 Крутить'}
        </button>

        {!boot.free_used && (
          <button
            className="btn btn-outline btn-mt"
            onClick={onFreeSpin}
            disabled={spinning}
          >
            🎁 Бесплатный шанс
          </button>
        )}
      </div>

      {/* Recent wins */}
      <WinsTicker
        history={boot.history}
        catalog={boot.prizes_catalog}
        isSpinning={spinning}
      />
    </div>
  );
};
