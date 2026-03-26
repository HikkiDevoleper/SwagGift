import React from 'react';
import { TgsPlayer } from './TgsPlayer';
import { rarityClass } from '../utils';
import { type Prize } from '../types';

interface Props {
  winner: Prize;
  sellValue: number;
  onClaim: () => void;
  onSell: () => void;
}

const CONFETTI_COLORS = ['c-0', 'c-1', 'c-2', 'c-3'];

export const WinSheet: React.FC<Props> = ({ winner, sellValue, onClaim, onSell }) => (
  <>
    <div className="overlay" onClick={onClaim} />
    <div className="sheet win-sheet">
      <div className="sheet-bar" />

      {/* Confetti particles — CSS-class-based delays only */}
      <div className="confetti" aria-hidden="true">
        {Array.from({ length: 12 }).map((_, i) => (
          <span
            key={i}
            className={`confetti-dot ${CONFETTI_COLORS[i % 4]} confetti-pos-${i}`}
          />
        ))}
      </div>

      <div className="res">
        <div className={`res-glow r-glow-${rarityClass(winner.rarity)}`} />

        {winner.tgs ? (
          <div className="res-sticker">
            <TgsPlayer src={`/gifts/${winner.tgs}`} size={150} loop autoplay />
          </div>
        ) : (
          <span className="res-emoji bounce">{winner.emoji}</span>
        )}

        <span className={`res-rarity-badge r-badge-${rarityClass(winner.rarity)}`}>
          {winner.rarity}
        </span>
        <h2 className="res-title">{winner.name}</h2>
        {sellValue > 0 && (
          <p className="res-price">Стоимость: {sellValue} ⭐</p>
        )}

        <div className="btn-row">
          <button className="btn btn-w" onClick={onClaim}>Забрать</button>
          {sellValue > 0 && (
            <button className="btn btn-outline" onClick={onSell}>
              Продать {sellValue} ⭐
            </button>
          )}
        </div>
      </div>
    </div>
  </>
);
