import React from 'react';
import { initialsOf } from '../utils';
import { type LeaderboardRow } from '../types';

interface Props {
  rows: LeaderboardRow[];
}

export const LeaderboardPage: React.FC<Props> = ({ rows }) => (
  <div className="page fade-in" key="top">
    <div className="pg-header">
      <h1 className="pg-title">Топ игроков</h1>
      <span className="pg-sub">все времена</span>
    </div>

    {rows.length === 0 ? (
      <div className="empty">
        <span className="empty-icon">🏆</span>
        <p>Рейтинг пуст — будь первым</p>
      </div>
    ) : (
      <>
        {/* ── Podium: top 3 ── */}
        <div className="podium">
          {/* 2nd — only if exists */}
          {rows[1] ? (
            <div className="podium-slot podium-2 pod-delay-1">
              <div className="pod-ava">
                {rows[1].photo_url
                  ? <img src={rows[1].photo_url} alt="" />
                  : initialsOf(rows[1])
                }
              </div>
              <div className="pod-medal">🥈</div>
              <div className="pod-name">{rows[1].first_name || rows[1].username || 'Игрок'}</div>
              <div className="pod-wins">{rows[1].wins} 🎁</div>
            </div>
          ) : <div className="podium-slot podium-2 pod-empty" />}

          {/* 1st */}
          <div className="podium-slot podium-1 pod-delay-0">
            <div className="pod-crown">👑</div>
            <div className="pod-ava pod-ava-1">
              {rows[0].photo_url
                ? <img src={rows[0].photo_url} alt="" />
                : initialsOf(rows[0])
              }
            </div>
            <div className="pod-medal">🥇</div>
            <div className="pod-name">{rows[0].first_name || rows[0].username || 'Игрок'}</div>
            <div className="pod-wins">{rows[0].wins} 🎁</div>
          </div>

          {/* 3rd */}
          {rows[2] ? (
            <div className="podium-slot podium-3 pod-delay-2">
              <div className="pod-ava">
                {rows[2].photo_url
                  ? <img src={rows[2].photo_url} alt="" />
                  : initialsOf(rows[2])
                }
              </div>
              <div className="pod-medal">🥉</div>
              <div className="pod-name">{rows[2].first_name || rows[2].username || 'Игрок'}</div>
              <div className="pod-wins">{rows[2].wins} 🎁</div>
            </div>
          ) : <div className="podium-slot podium-3 pod-empty" />}
        </div>

        {/* ── Rest (4+) ── */}
        {rows.length > 3 && (
          <>
            <div className="lb-section-lbl">Остальные участники</div>
            <div className="lb-list">
              {rows.slice(3).map((r, i) => (
                <div
                  key={r.user_id || i}
                  className={`lb-row lb-row-delay-${Math.min(i, 6)}`}
                >
                  <span className="lb-rank">{i + 4}</span>
                  <div className="lb-ava">
                    {r.photo_url
                      ? <img src={r.photo_url} alt="" />
                      : initialsOf(r)
                    }
                  </div>
                  <div className="lb-info">
                    <div className="lb-name">{r.first_name || r.username || 'Игрок'}</div>
                    <div className="lb-sub">{r.spins} спинов · {r.stars_spent}⭐</div>
                  </div>
                  <div className="lb-wins-pill">{r.wins} 🎁</div>
                </div>
              ))}
            </div>
          </>
        )}
      </>
    )}
  </div>
);
