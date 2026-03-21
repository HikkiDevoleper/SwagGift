import {
  startTransition,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import type { CSSProperties, ReactNode } from "react";

type TabKey = "play" | "inventory" | "live" | "top" | "admin";

type Prize = {
  key: string;
  name: string;
  emoji: string;
  rarity: string;
  weight: number;
  type: "gift" | "nothing";
  gift_id?: string | null;
};

type User = {
  user_id: number;
  username: string;
  first_name: string;
  spins: number;
  wins: number;
  stars_spent: number;
};

type InventoryItem = {
  key: string;
  name: string;
  rarity: string;
  demo: boolean;
  free: boolean;
  date: string;
};

type LeaderboardRow = {
  user_id: number;
  username: string;
  first_name: string;
  spins: number;
  wins: number;
  stars_spent: number;
};

type HistoryRow = {
  prize_key: string;
  prize_name: string;
  rarity: string;
  won_at: string;
  first_name: string;
  username: string;
};

type RuntimeFlags = {
  demo: boolean;
  gifts: boolean;
  maint: boolean;
  testpay: boolean;
};

type BootstrapResponse = {
  user: User;
  prizes: InventoryItem[];
  free_used: boolean;
  is_owner: boolean;
  config: {
    spin_cost: number;
    channel_url: string;
    channel_id: string;
  };
  prizes_catalog: Prize[];
  flags: RuntimeFlags;
  leaderboard: LeaderboardRow[];
  history: HistoryRow[];
};

const tg = window.Telegram?.WebApp;

const rarityTheme: Record<string, { glow: string; border: string }> = {
  "Обычный": { glow: "rgba(104, 211, 145, 0.45)", border: "#68d391" },
  "Редкий": { glow: "rgba(96, 165, 250, 0.45)", border: "#60a5fa" },
  "Эпический": { glow: "rgba(251, 146, 60, 0.45)", border: "#fb923c" },
  "Легендарный": { glow: "rgba(250, 204, 21, 0.45)", border: "#facc15" },
  "Промах": { glow: "rgba(148, 163, 184, 0.28)", border: "#94a3b8" },
};

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "play", label: "Play" },
  { key: "inventory", label: "Drops" },
  { key: "live", label: "Live" },
  { key: "top", label: "Top" },
  { key: "admin", label: "Control" },
];

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

function rankTitle(wins: number) {
  if (wins >= 50) return "Crystal Whale";
  if (wins >= 20) return "Cube Master";
  if (wins >= 10) return "Night Spinner";
  if (wins >= 3) return "Rising Collector";
  return "Fresh Arrival";
}

function initialsOf(user?: User | null) {
  const raw = user?.first_name || user?.username || "SG";
  return raw.slice(0, 2).toUpperCase();
}

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

async function api<T>(endpoint: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`/api/${endpoint}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Telegram-Init-Data": tg?.initData || "",
    },
    cache: "no-store",
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.detail || `HTTP ${response.status}`);
  }
  return data as T;
}

function makeReel(prizes: Prize[], winner?: Prize) {
  const reel: Prize[] = [];
  const stopIndex = 46;
  for (let index = 0; index < 64; index += 1) {
    const prize =
      winner && index === stopIndex
        ? winner
        : prizes[Math.floor(Math.random() * prizes.length)];
    reel.push(prize);
  }
  return { reel, stopIndex };
}

export function App() {
  const [boot, setBoot] = useState<BootstrapResponse | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("play");
  const [liveConnected, setLiveConnected] = useState(false);
  const [toast, setToast] = useState("");
  const [spinning, setSpinning] = useState(false);
  const [reelItems, setReelItems] = useState<Prize[]>([]);
  const [reelOffset, setReelOffset] = useState(0);
  const [reelDuration, setReelDuration] = useState("0ms");
  const [result, setResult] = useState<Prize | null>(null);
  const [resultNote, setResultNote] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);
  const pollingRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const notify = useEffectEvent((message: string) => {
    setToast(message);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast("");
    }, 2800);
  });

  const refreshUser = useEffectEvent(async () => {
    const data = await api<Pick<BootstrapResponse, "user" | "prizes" | "free_used" | "is_owner">>("user");
    startTransition(() => {
      setBoot((current) =>
        current
          ? {
              ...current,
              user: data.user,
              prizes: data.prizes,
              free_used: data.free_used,
              is_owner: data.is_owner,
            }
          : current
      );
      setRefreshTick((value) => value + 1);
    });
  });

  const applyLiveSnapshot = useEffectEvent((payload: {
    history?: HistoryRow[];
    leaderboard?: LeaderboardRow[];
  }) => {
    startTransition(() => {
      setBoot((current) =>
        current
          ? {
              ...current,
              history: payload.history ?? current.history,
              leaderboard: payload.leaderboard ?? current.leaderboard,
            }
          : current
      );
    });
  });

  useEffect(() => {
    tg?.ready();
    tg?.expand();
    tg?.enableClosingConfirmation();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const data = await api<BootstrapResponse>("bootstrap");
        if (cancelled) return;
        const initial = makeReel(data.prizes_catalog);
        setBoot(data);
        setReelItems(initial.reel);
      } catch (error) {
        notify(error instanceof Error ? error.message : "Не удалось загрузить приложение.");
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [notify]);

  useEffect(() => {
    if (!boot) return;

    const source = new EventSource("/api/live");
    let fallbackTimer: number | null = null;

    source.addEventListener("snapshot", (event) => {
      setLiveConnected(true);
      const payload = JSON.parse((event as MessageEvent).data);
      applyLiveSnapshot(payload);
    });

    source.addEventListener("ping", () => {
      setLiveConnected(true);
    });

    source.onerror = () => {
      setLiveConnected(false);
      if (fallbackTimer) return;
      fallbackTimer = window.setInterval(async () => {
        try {
          const [history, leaderboard] = await Promise.all([
            api<{ history: HistoryRow[] }>("history?limit=12"),
            api<{ rows: LeaderboardRow[] }>("leaderboard?limit=8"),
          ]);
          applyLiveSnapshot({ history: history.history, leaderboard: leaderboard.rows });
        } catch {
          //
        }
      }, 8000);
    };

    return () => {
      source.close();
      if (fallbackTimer) window.clearInterval(fallbackTimer);
    };
  }, [boot, applyLiveSnapshot]);

  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        window.clearInterval(pollingRef.current);
      }
    };
  }, []);

  const animateSpin = useEffectEvent(async (winner: Prize, isDemo: boolean) => {
    if (!boot) return;
    setSpinning(true);
    setResult(null);

    const generated = makeReel(boot.prizes_catalog, winner);
    setReelItems(generated.reel);
    setReelDuration("0ms");
    setReelOffset(0);

    await delay(30);

    const cardWidth = 148;
    const targetOffset = -1 * (generated.stopIndex * cardWidth - 180);
    setReelDuration("6200ms");
    setReelOffset(targetOffset);

    const hapticTimer = window.setInterval(() => tg?.HapticFeedback.impactOccurred("light"), 150);
    await delay(6600);
    window.clearInterval(hapticTimer);

    await refreshUser();
    setSpinning(false);

    if (winner.type === "nothing") {
      tg?.HapticFeedback.notificationOccurred("warning");
      notify("В этот раз пусто. Но следующий дроп может быть легендарным.");
      return;
    }

    tg?.HapticFeedback.notificationOccurred("success");
    setResult(winner);
    setResultNote(
      isDemo
        ? "Сейчас активен demo mode, поэтому предмет записан как тестовый выигрыш."
        : "Подарок уже добавлен в профиль и отображается в разделе Drops."
    );
    setActiveTab("inventory");
  });

  const runPaidSpin = useEffectEvent(async () => {
    if (spinning) return;
    try {
      const invoice = await api<{ invoice_link: string }>("create_invoice", "POST");
      tg?.openInvoice(invoice.invoice_link, (status) => {
        if (status === "paid") {
          tg?.MainButton.setText("Получаем дроп...").show();
          if (pollingRef.current) window.clearInterval(pollingRef.current);
          pollingRef.current = window.setInterval(async () => {
            try {
              const payload = await api<{ result: { winner: Prize; is_demo?: boolean } | null }>("spin_result");
              if (!payload.result) return;
              if (pollingRef.current) window.clearInterval(pollingRef.current);
              pollingRef.current = null;
              tg?.MainButton.hide();
              await animateSpin(payload.result.winner, payload.result.is_demo ?? false);
            } catch {
              //
            }
          }, 1200);
        }
      });
    } catch (error) {
      notify(error instanceof Error ? error.message : "Не удалось открыть оплату.");
    }
  });

  const runFreeSpin = useEffectEvent(async () => {
    if (!boot || spinning || boot.free_used) return;
    try {
      const payload = await api<{ winner?: Prize; error?: string; channel_url?: string }>("free_spin", "POST");
      if (payload.error === "already_used") {
        notify("Бесплатный шанс уже использован.");
        await refreshUser();
        return;
      }
      if (payload.error === "not_subscribed") {
        tg?.showConfirm("Для бесплатного спина нужна подписка на канал. Открыть канал?", (ok) => {
          if (ok) tg?.openLink(payload.channel_url || boot.config.channel_url);
        });
        return;
      }
      if (payload.winner) {
        await animateSpin(payload.winner, boot.flags.demo);
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : "Бесплатный спин не запустился.");
    }
  });

  const toggleAdminFlag = useEffectEvent(async (key: keyof RuntimeFlags) => {
    try {
      const response = await api<{ value: boolean }>("admin/toggle", "POST", { key });
      setBoot((current) =>
        current ? { ...current, flags: { ...current.flags, [key]: response.value } } : current
      );
      notify(`Флаг ${key} обновлён.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Не удалось переключить флаг.");
    }
  });

  if (!boot) {
    return (
      <div className="shell loading-shell">
        <div className="loading-grid" />
        <div className="loader-cube">
          <span />
          <span />
          <span />
        </div>
        <p className="loading-title">Launching cube engine</p>
        <p className="loading-copy">Поднимаем Telegram glass-интерфейс и синхронизируем ленту.</p>
      </div>
    );
  }

  const { user, prizes, leaderboard, history, flags } = boot;
  const visibleTabs = tabs.filter((tab) => boot.is_owner || tab.key !== "admin");
  const currentResultTheme = result ? rarityTheme[result.rarity] ?? rarityTheme["Промах"] : rarityTheme["Промах"];

  return (
    <div className="shell">
      <div className="backdrop-orb orb-one" />
      <div className="backdrop-orb orb-two" />
      <div className="grain" />

      <header className="hero glass">
        <div className="hero-copy">
          <div className="eyebrow-row">
            <span className="eyebrow-pill">Telegram Mini App</span>
            <span className={classNames("live-pill", liveConnected && "connected")}>
              {liveConnected ? "LIVE FEED" : "RECONNECTING"}
            </span>
          </div>

          <div className="identity-row">
            <div className="avatar-chip">{initialsOf(user)}</div>
            <div>
              <h1>{user.first_name || user.username || "Swag Player"}</h1>
              <p className="identity-rank">{rankTitle(user.wins)}</p>
            </div>
          </div>

          <div className="hero-stats">
            <Metric label="Wins" value={String(user.wins)} />
            <Metric label="Spins" value={String(user.spins)} />
            <Metric label="Spent" value={`${user.stars_spent}⭐`} />
          </div>

          <div className="hero-note glass-soft">
            <div>
              <p className="note-title">Cube + Dark + Glass</p>
              <p className="note-copy">
                Живая рулетка, стеклянные панели и Telegram-first поведение без старого статического фронта.
              </p>
            </div>
            <button className="ghost-button" type="button" onClick={() => refreshUser()}>
              Refresh
            </button>
          </div>
        </div>

        <CubeWidget wins={user.wins} refreshTick={refreshTick} />
      </header>

      <nav className="tabbar glass">
        {visibleTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={classNames("tabbar-button", activeTab === tab.key && "active")}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="layout-grid">
        <section className="play-column glass">
          <div className="section-head">
            <div>
              <p className="eyebrow-pill subtle">Night Spin Chamber</p>
              <h2>Crystal cube roulette</h2>
            </div>
            <div className="price-badge">{boot.config.spin_cost}⭐ / spin</div>
          </div>

          <div className="reel-stage">
            <div className="reel-marker" />
            <div
              className="reel-track"
              style={{ transform: `translateX(${reelOffset}px)`, transitionDuration: reelDuration }}
            >
              {reelItems.map((prize, index) => {
                const theme = rarityTheme[prize.rarity] ?? rarityTheme["Промах"];
                return (
                  <article
                    key={`${prize.key}-${index}`}
                    className="reel-card"
                    style={
                      {
                        "--card-glow": theme.glow,
                        "--card-border": theme.border,
                      } as CSSProperties
                    }
                  >
                    <span className="reel-emoji">{prize.emoji}</span>
                    <strong>{prize.name}</strong>
                    <span>{prize.rarity}</span>
                  </article>
                );
              })}
            </div>
          </div>

          <div className="action-row">
            <button type="button" className="primary-button" disabled={spinning} onClick={() => runPaidSpin()}>
              <span>Запустить премиум-спин</span>
              <small>Telegram Stars, плавная анимация, live результат</small>
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={spinning || boot.free_used}
              onClick={() => runFreeSpin()}
            >
              <span>{boot.free_used ? "Free spin уже взят" : "Взять free spin"}</span>
              <small>{boot.free_used ? "Остаётся платный спин" : "Нужна подписка на канал"}</small>
            </button>
          </div>

          <div className="quick-strip">
            {boot.prizes_catalog.slice(0, 6).map((prize) => (
              <div key={prize.key} className="quick-card glass-soft">
                <span>{prize.emoji}</span>
                <small>{prize.name}</small>
              </div>
            ))}
          </div>
        </section>

        <section className="content-column">
          {activeTab === "play" && (
            <Panel title="Tonight's board" subtitle="Собрали всё важное в одном стеклянном блоке.">
              <div className="board-grid">
                <InfoTile title="Free status" value={boot.free_used ? "USED" : "READY"} />
                <InfoTile title="Channel" value={boot.config.channel_id.replace("@", "")} />
                <InfoTile title="Demo" value={flags.demo ? "ON" : "OFF"} />
                <InfoTile title="Realtime" value={liveConnected ? "SYNCED" : "RETRY"} />
              </div>
            </Panel>
          )}

          {activeTab === "inventory" && (
            <Panel title="Your drops" subtitle="Твой личный dark inventory.">
              <div className="stack-list">
                {prizes.length ? (
                  prizes.map((item) => {
                    const theme = rarityTheme[item.rarity] ?? rarityTheme["Промах"];
                    const found = boot.prizes_catalog.find((prize) => prize.key === item.key || prize.name === item.name);
                    return (
                      <div
                        key={`${item.key}-${item.date}`}
                        className="stack-card"
                        style={{ borderColor: `${theme.border}55` }}
                      >
                        <div className="stack-icon">{found?.emoji ?? "🎁"}</div>
                        <div className="stack-copy">
                          <strong>{item.name}</strong>
                          <span>{formatDate(item.date)}</span>
                        </div>
                        <div className="badge-group">
                          {item.free && <span className="mini-badge accent">FREE</span>}
                          {item.demo && <span className="mini-badge">DEMO</span>}
                          <span className="mini-badge" style={{ color: theme.border }}>
                            {item.rarity}
                          </span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <EmptyState title="Ещё пусто" copy="Первый красивый дроп появится здесь после спина." />
                )}
              </div>
            </Panel>
          )}

          {activeTab === "live" && (
            <Panel title="Live tape" subtitle="Последние выигрыши всех игроков в реальном времени.">
              <div className="stack-list">
                {history.length ? (
                  history.map((item, index) => {
                    const theme = rarityTheme[item.rarity] ?? rarityTheme["Промах"];
                    const found = boot.prizes_catalog.find(
                      (prize) => prize.key === item.prize_key || prize.name === item.prize_name
                    );
                    return (
                      <div
                        key={`${item.prize_key}-${item.won_at}-${index}`}
                        className="stack-card live-stack"
                        style={{ borderColor: `${theme.border}55` }}
                      >
                        <div className="stack-icon">{found?.emoji ?? "🎁"}</div>
                        <div className="stack-copy">
                          <strong>{item.first_name || item.username || "Anonymous"}</strong>
                          <span>
                            {item.prize_name} • {formatDate(item.won_at)}
                          </span>
                        </div>
                        <span className="mini-badge" style={{ color: theme.border }}>
                          {item.rarity}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <EmptyState title="Лента прогревается" copy="Как только появятся победы, они начнут лететь сюда." />
                )}
              </div>
            </Panel>
          )}

          {activeTab === "top" && (
            <Panel title="Top collectors" subtitle="Лучшие игроки по победам и активности.">
              <div className="stack-list">
                {leaderboard.length ? (
                  leaderboard.map((item, index) => (
                    <div key={item.user_id} className="stack-card leaderboard-card">
                      <div className="leader-rank">{index + 1}</div>
                      <div className="stack-copy">
                        <strong>{item.first_name || item.username || "Player"}</strong>
                        <span>
                          {item.spins} spins • {item.stars_spent}⭐ spent
                        </span>
                      </div>
                      <div className="leader-wins">{item.wins} wins</div>
                    </div>
                  ))
                ) : (
                  <EmptyState title="Топ ещё пустой" copy="Нужна хотя бы пара игроков и несколько спинов." />
                )}
              </div>
            </Panel>
          )}

          {activeTab === "admin" && boot.is_owner && (
            <Panel title="Control center" subtitle="Быстрые runtime-флаги прямо из TSX-панели.">
              <div className="admin-grid">
                {(Object.keys(flags) as Array<keyof RuntimeFlags>).map((key) => (
                  <button key={key} type="button" className="admin-card glass-soft" onClick={() => toggleAdminFlag(key)}>
                    <div>
                      <strong>{key}</strong>
                      <span>{flags[key] ? "Enabled" : "Disabled"}</span>
                    </div>
                    <div className={classNames("admin-toggle", flags[key] && "on")} />
                  </button>
                ))}
              </div>
            </Panel>
          )}
        </section>
      </main>

      {result && (
        <div className="result-overlay" role="dialog" aria-modal="true">
          <div className="result-backdrop" onClick={() => setResult(null)} />
          <div className="result-card glass" style={{ borderColor: `${currentResultTheme.border}77` }}>
            <div className="result-aura" style={{ background: currentResultTheme.glow }} />
            <p className="eyebrow-pill subtle">Spin Result</p>
            <div className="result-emoji">{result.emoji}</div>
            <h3>{result.name}</h3>
            <p className="result-rarity" style={{ color: currentResultTheme.border }}>
              {result.rarity}
            </p>
            <p className="result-text">{resultNote}</p>
            <button type="button" className="primary-button" onClick={() => setResult(null)}>
              Забрать
            </button>
          </div>
        </div>
      )}

      {toast && <div className="toast glass-soft">{toast}</div>}
    </div>
  );
}

function CubeWidget({ wins, refreshTick }: { wins: number; refreshTick: number }) {
  return (
    <div className="cube-shell" data-refresh={refreshTick}>
      <div className="cube-meta glass-soft">
        <span>Dark cube engine</span>
        <strong>{wins} wins synced</strong>
      </div>
      <div className="cube-scene">
        <div className="cube">
          <div className="cube-face front">SG</div>
          <div className="cube-face back">TG</div>
          <div className="cube-face left">WIN</div>
          <div className="cube-face right">LIVE</div>
          <div className="cube-face top">STAR</div>
          <div className="cube-face bottom">DROP</div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric glass-soft">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className="panel glass">
      <div className="section-head">
        <div>
          <h2>{title}</h2>
          <p className="section-subtitle">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function InfoTile({ title, value }: { title: string; value: string }) {
  return (
    <article className="info-tile glass-soft">
      <span>{title}</span>
      <strong>{value}</strong>
    </article>
  );
}

function EmptyState({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="empty-state glass-soft">
      <strong>{title}</strong>
      <span>{copy}</span>
    </div>
  );
}
