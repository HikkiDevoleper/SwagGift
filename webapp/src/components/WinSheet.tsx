import React from 'react';
import { type Prize } from '../types';

interface Props {
  winner: Prize;
  sellValue: number;
  onClaim: () => void;
  onSell: () => void;
}

export const WinSheet: React.FC<Props> = ({ winner, sellValue, onClaim, onSell }) => (
  <>
    <div className="overlay" onClick={onClaim} />
    <div className="sheet win-sheet">
      <div className="sheet-bar" />
      <div className="res">
        <div className="res-glow" />
        <span className="res-emoji bounce">{winner.emoji}</span>
        <h2 className="res-title">{winner.name}</h2>
        <p className="res-sub">{winner.rarity}</p>
        <div className="btn-row">
          <button className="btn btn-w" onClick={onClaim}>Забрать</button>
          <button className="btn btn-outline" onClick={onSell}>Продать {sellValue} ⭐</button>
        </div>
      </div>
    </div>
  </>
);
