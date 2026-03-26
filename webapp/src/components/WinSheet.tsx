import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { TgsPlayer } from './TgsPlayer';
import { rarityClass } from '../utils';
import { type Prize } from '../types';

interface Props {
  winner: Prize;
  sellValue: number;
  onClaim: () => void;
  onSell: () => void;
}

export const WinSheet: React.FC<Props> = ({ winner, sellValue, onClaim, onSell }) => {
  useEffect(() => {
    // Fire a burst on mount
    const yMap = { common: 0.6, rare: 0.55, epic: 0.5, legendary: 0.45, miss: 0.8 };
    const p = rarityClass(winner.rarity) as keyof typeof yMap;
    const yPos = yMap[p] || 0.5;

    confetti({
      particleCount: 120,
      spread: 70,
      origin: { y: yPos },
      colors: ['#fbbf24', '#c084fc', '#5b9cf6', '#4ade80', '#ffffff'],
      disableForReducedMotion: true,
      zIndex: 300,
    });
  }, [winner]);

  return (
    <>
      <div className="overlay" onClick={onClaim} />
      <div className="sheet win-sheet">
        <div className="sheet-bar" />

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
};
