import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode, RefObject } from "react";

type ScreenKey = "spin" | "history" | "inventory" | "top";

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

const screens: Array<{ key: ScreenKey; label: string; icon: string }> = [
  { key: "spin", label: "Игра", icon: "◈" },
  { key: "history", label: "Лента", icon: "●" },
  { key: "inventory", label: "Профиль", icon: "◆" },
  { key: "top", label: "Топ", icon: "▲" },
];

const rarityTheme: Record<string, { glow: string; border: string }> = {
  "Обычный": { glow: "rgba(72, 196, 133, 0.22)", border: "#48c485" },
  "Редкий": { glow: "rgba(59, 141, 255, 0.24)", border: "#3b8dff" },
  "Эпический": { glow: "rgba(255, 164, 61, 0.26)", border: "#ffa43d" },
  "Легендарный": { glow: "rgba(247, 200, 87, 0.28)", border: "#f7c857" },
  "Промах": { glow: "rgba(126, 141, 160, 0.18)", border: "#7e8da0" },
};

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function initialsOf(user?: User | null) {
  const raw = user?.first_name || user?.username || "SG";
  return raw.slice(0, 2).toUpperCase();
}

function rankTitle(wins: number) {
  if (wins >= 50) return "Легенда";
  if (wins >= 20) return "Коллекционер";
  if (wins >= 10) return "Везунчик";
  if (wins >= 3) return "Игрок";
  return "Новичок";
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
  const stopIndex = 44;
  for (let index = 0; index < 60; index += 1) {
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
  const [activeScreen, setActiveScreen] = useState<ScreenKey>("spin");
  const [liveConnected, setLiveConnected] = useState(false);
  const [toast, setToast] = useState("");
  const [spinning, setSpinning] = useState(false);
  const [reelItems, setReelItems] = useState<Prize[]>([]);
  const [reelOffset, setReelOffset] = useState(0);
  const [reelDuration, setReelDuration] = useState("0ms");
  const [result, setResult] = useState<Prize | null>(null);
  const [resultNote, setResultNote] = useState("");
  const [ownerSheetOpen, setOwnerSheetOpen] = useState(false);
  const pollingRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const reelTrackRef = useRef<HTMLDivElement | null>(null);

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast("");
    }, 2600);
  }, []);

  const refreshUser = useCallback(async () => {
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
    });
  }, []);

  const applyLiveSnapshot = useCallback((payload: {
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
  }, []);

  const measureSpinOffset = useCallback((stopIndex: number) => {
    const track = reelTrackRef.current;
    if (!track) return 0;
    const firstCard = track.querySelector<HTMLElement>("[data-roulette-card='true']");
    const cardWidth = firstCard?.offsetWidth ?? 112;
    const styles = window.getComputedStyle(track);
    const gap = parseFloat(styles.columnGap || styles.gap || "12") || 12;
    return -1 * stopIndex * (cardWidth + gap);
  }, []);

  const animateSpin = useCallback(async (winner: Prize, isDemo: boolean) => {
    if (!boot) return;

    setSpinning(true);
    setResult(null);

    const generated = makeReel(boot.prizes_catalog, winner);
    setReelItems(generated.reel);
    setReelDuration("0ms");
    setReelOffset(0);

    await delay(40);

    const targetOffset = measureSpinOffset(generated.stopIndex);
    setReelDuration("6200ms");
    setReelOffset(targetOffset);

    const hapticTimer = window.setInterval(() => tg?.HapticFeedback.impactOccurred("light"), 140);
    await delay(6600);
    window.clearInterval(hapticTimer);

    await refreshUser();
    setSpinning(false);

    if (winner.type === "nothing") {
      tg?.HapticFeedback.notificationOccurred("warning");
      notify("В этот раз пусто. Попробуй ещё раз.");
      return;
    }

    tg?.HapticFeedback.notificationOccurred("success");
    setResult(winner);
    setResultNote(
      isDemo
        ? "Сейчас включён тестовый режим. Предмет записан как тестовый выигрыш."
        : "Предмет уже добавлен в профиль и появился в списке призов."
    );
    setActiveScreen("inventory");
  }, [boot, measureSpinOffset, refreshUser, notify]);

  const runPaidSpin = useCallback(async () => {
    if (spinning) return;
    try {
      const invoice = await api<{ invoice_link: string }>("create_invoice", "POST");
      tg?.openInvoice(invoice.invoice_link, (status) => {
        if (status !== "paid") return;
        tg?.MainButton.setText("Проверяем результат...").show();
        if (pollingRef.current) window.clearInterval(pollingRef.current);
        pollingRef.current = window.setInterval(async () => {
          try {
            const payload = await api<{ result: { winner: Prize; is_demo?: boolean } | null }>("spin_result");
            if (!payload.result) return;
            if (pollingRef.current) window.clearInterval(pollingRef.current);
            pollingRef.current = null;
            tg?.MainButton.hide();
            animateSpin(payload.result.winner, payload.result.is_demo ?? false);
          } catch {
            // polling continues
          }
        }, 1200);
      });
    } catch (error) {
      notify(error instanceof Error ? error.message : "Не удалось открыть оплату.");
    }
  }, [spinning, animateSpin, notify]);

  const runFreeSpin = useCallback(async () => {
    if (!boot || spinning || boot.free_used) return;
    try {
      const payload = await api<{ winner?: Prize; error?: string; channel_url?: string }>("free_spin", "POST");
      if (payload.error === "already_used") {
        notify("Бесплатный шанс уже использован.");
        await refreshUser();
        return;
      }
      if (payload.error === "not_subscribed") {
        tg?.showConfirm("Для бесплатного шанса нужна подписка на канал. Открыть канал?", (ok) => {
          if (ok) tg?.openLink(payload.channel_url || boot.config.channel_url);
        });
        return;
      }
      if (payload.winner) {
        await animateSpin(payload.winner, boot.flags.demo);
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : "Не удалось запустить бесплатный шанс.");
    }
  }, [boot, spinning, animateSpin, refreshUser, notify]);

  const toggleAdminFlag = useCallback(async (key: keyof RuntimeFlags) => {
    try {
      const response = await api<{ value: boolean }>("admin/toggle", "POST", { key });
      setBoot((current) =>
        current
          ? {
              ...current,
              flags: { ...current.flags, [key]: response.value },
            }
          : current
      );
      notify("Настройка обновлена.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Не удалось обновить настройку.");
    }
  }, [notify]);

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
        notify(error instanceof Error ? error.message : "Не удалось открыть мини-приложение.");
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
          // polling continues
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

  if (!boot) {
    return <LoadingState />;
  }

  const screenIndex = screens.findIndex((screen) => screen.key === activeScreen);
  const currentResultTheme = result ? rarityTheme[result.rarity] ?? rarityTheme["Промах"] : rarityTheme["Промах"];

  return (
    <div className="miniapp-shell">
      <div className="miniapp-backdrop" />

      <div className="miniapp">
        <HeaderSheet
          user={boot.user}
          freeUsed={boot.free_used}
          liveConnected={liveConnected}
          isOwner={boot.is_owner}
          onOwnerOpen={() => setOwnerSheetOpen(true)}
        />

        <div className="screens-shell">
          <div
            className="screens-track"
            style={{ transform: `translateX(calc(-${screenIndex} * 100%))` }}
          >
            <section className="screen">
              <SpinScreen
                boot={boot}
                spinning={spinning}
                reelItems={reelItems}
                reelOffset={reelOffset}
                reelDuration={reelDuration}
                reelTrackRef={reelTrackRef}
                onPaidSpin={() => runPaidSpin()}
                onFreeSpin={() => runFreeSpin()}
              />
            </section>

            <section className="screen">
              <HistoryScreen history={boot.history} catalog={boot.prizes_catalog} />
            </section>

            <section className="screen">
              <InventoryScreen user={boot.user} prizes={boot.prizes} catalog={boot.prizes_catalog} />
            </section>

            <section className="screen">
              <TopScreen leaderboard={boot.leaderboard} />
            </section>
          </div>
        </div>
      </div>

      <BottomNav activeScreen={activeScreen} onChange={setActiveScreen} />

      {boot.is_owner && ownerSheetOpen && (
        <OwnerSheet
          user={boot.user}
          flags={boot.flags}
          spinCost={boot.config.spin_cost}
          onToggle={toggleAdminFlag}
          onClose={() => setOwnerSheetOpen(false)}
        />
      )}

      {result && (
        <ResultSheet
          result={result}
          note={resultNote}
          theme={currentResultTheme}
          onClose={() => setResult(null)}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="miniapp-shell miniapp-shell--loading">
      <div className="loading-badge">◈</div>
      <p className="loading-title">Swag Gift</p>
      <p className="loading-text">Загружаем мини-приложение...</p>
    </div>
  );
}

function HeaderSheet({
  user,
  freeUsed,
  liveConnected,
  isOwner,
  onOwnerOpen,
}: {
  user: User;
  freeUsed: boolean;
  liveConnected: boolean;
  isOwner: boolean;
  onOwnerOpen: () => void;
}) {
  return (
    <header className="header-sheet facet-card">
      <div className="header-row">
        <div className="brand-row">
          <div className="avatar-mark">{initialsOf(user)}</div>
          <div>
            <h1 className="app-title">Swag Gift</h1>
            <p className="app-subtitle">{rankTitle(user.wins)}</p>
          </div>
        </div>
        {isOwner && (
          <button type="button" className="owner-button" onClick={onOwnerOpen}>
            Управление
          </button>
        )}
      </div>

      <div className="header-status">
        <StatusChip label={liveConnected ? "Лента в эфире" : "Лента переподключается"} active={liveConnected} />
        <StatusChip label={freeUsed ? "Шанс использован" : "Бесплатный шанс доступен"} active={!freeUsed} />
      </div>

      <div className="stats-grid">
        <MetricCard label="Побед" value={String(user.wins)} />
        <MetricCard label="Спинов" value={String(user.spins)} />
        <MetricCard label="Потрачено" value={`${user.stars_spent}⭐`} />
      </div>
    </header>
  );
}

function SpinScreen({
  boot,
  spinning,
  reelItems,
  reelOffset,
  reelDuration,
  reelTrackRef,
  onPaidSpin,
  onFreeSpin,
}: {
  boot: BootstrapResponse;
  spinning: boolean;
  reelItems: Prize[];
  reelOffset: number;
  reelDuration: string;
  reelTrackRef: RefObject<HTMLDivElement | null>;
  onPaidSpin: () => void;
  onFreeSpin: () => void;
}) {
  return (
    <div className="screen-stack">
      <section className="spin-sheet facet-card">
        <div className="section-top">
          <div>
            <p className="section-kicker">Главный экран</p>
            <h2 className="section-title">Крутить рулетку</h2>
          </div>
          <div className="price-chip">{boot.config.spin_cost}⭐</div>
        </div>

        <div className="roulette-shell">
          <div className="roulette-marker" />
          <div
            ref={reelTrackRef}
            className="roulette-track"
            style={{ transform: `translateX(${reelOffset}px)`, transitionDuration: reelDuration }}
          >
            {reelItems.map((prize, index) => {
              const theme = rarityTheme[prize.rarity] ?? rarityTheme["Промах"];
              return (
                <article
                  key={`${prize.key}-${index}`}
                  data-roulette-card="true"
                  className="roulette-card"
                  style={
                    {
                      "--roulette-border": theme.border,
                      "--roulette-glow": theme.glow,
                    } as CSSProperties
                  }
                >
                  <span className="roulette-card__emoji">{prize.emoji}</span>
                  <strong>{prize.name}</strong>
                  <span>{prize.rarity}</span>
                </article>
              );
            })}
          </div>
        </div>

        <div className="cta-column">
          <button type="button" className="primary-cta" disabled={spinning} onClick={onPaidSpin}>
            Крутить за {boot.config.spin_cost} ⭐
          </button>
          <button type="button" className="secondary-cta" disabled={spinning || boot.free_used} onClick={onFreeSpin}>
            {boot.free_used ? "Бесплатный шанс уже взят" : "Бесплатный шанс"}
          </button>
        </div>
      </section>

      <section className="preview-sheet facet-card facet-card--soft">
        <div className="section-top">
          <div>
            <p className="section-kicker">Сейчас в ленте</p>
            <h2 className="section-title section-title--small">Последние выигрыши</h2>
          </div>
        </div>

        <div className="compact-list">
          {boot.history.length ? (
            boot.history.slice(0, 3).map((item, index) => {
              const found = boot.prizes_catalog.find(
                (prize) => prize.key === item.prize_key || prize.name === item.prize_name
              );
              return (
                <div key={`${item.prize_key}-${item.won_at}-${index}`} className="compact-row">
                  <div className="compact-icon">{found?.emoji ?? "🎁"}</div>
                  <div className="compact-copy">
                    <strong>{item.first_name || item.username || "Игрок"}</strong>
                    <span>
                      {item.prize_name} • {formatDate(item.won_at)}
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="compact-row compact-row--empty">
              <div className="compact-copy">
                <strong>Лента скоро заполнится</strong>
                <span>Первые выигрыши появятся здесь автоматически.</span>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function HistoryScreen({ history, catalog }: { history: HistoryRow[]; catalog: Prize[] }) {
  return (
    <ScreenSection title="Лента" subtitle="Последние выигрыши игроков">
      <div className="list-stack">
        {history.length ? (
          history.map((item, index) => {
            const found = catalog.find((prize) => prize.key === item.prize_key || prize.name === item.prize_name);
            const theme = rarityTheme[item.rarity] ?? rarityTheme["Промах"];
            return (
              <ListCard
                key={`${item.prize_key}-${item.won_at}-${index}`}
                icon={found?.emoji ?? "🎁"}
                title={item.first_name || item.username || "Игрок"}
                subtitle={`${item.prize_name} • ${formatDate(item.won_at)}`}
                badge={item.rarity}
                badgeColor={theme.border}
              />
            );
          })
        ) : (
          <EmptyState title="Пока тихо" copy="Как только кто-то выиграет приз, запись появится здесь." />
        )}
      </div>
    </ScreenSection>
  );
}

function InventoryScreen({
  user,
  prizes,
  catalog,
}: {
  user: User;
  prizes: InventoryItem[];
  catalog: Prize[];
}) {
  return (
    <ScreenSection title="Профиль" subtitle={`${user.first_name || user.username || "Игрок"} • ${rankTitle(user.wins)}`}>
      <div className="profile-banner facet-card facet-card--soft">
        <div className="profile-banner__item">
          <span>Победы</span>
          <strong>{user.wins}</strong>
        </div>
        <div className="profile-banner__item">
          <span>Спины</span>
          <strong>{user.spins}</strong>
        </div>
        <div className="profile-banner__item">
          <span>Звёзды</span>
          <strong>{user.stars_spent}⭐</strong>
        </div>
      </div>

      <div className="list-stack">
        {prizes.length ? (
          prizes.map((item) => {
            const found = catalog.find((prize) => prize.key === item.key || prize.name === item.name);
            const theme = rarityTheme[item.rarity] ?? rarityTheme["Промах"];
            const badges = [
              item.free ? "БЕСПЛАТНО" : "",
              item.demo ? "ТЕСТ" : "",
            ].filter(Boolean);

            return (
              <ListCard
                key={`${item.key}-${item.date}`}
                icon={found?.emoji ?? "🎁"}
                title={item.name}
                subtitle={formatDate(item.date)}
                badge={item.rarity}
                badgeColor={theme.border}
                extraBadges={badges}
              />
            );
          })
        ) : (
          <EmptyState title="Пока пусто" copy="После первого выигрыша приз появится здесь." />
        )}
      </div>
    </ScreenSection>
  );
}

function TopScreen({ leaderboard }: { leaderboard: LeaderboardRow[] }) {
  return (
    <ScreenSection title="Топ" subtitle="Лидеры по победам">
      <div className="list-stack">
        {leaderboard.length ? (
          leaderboard.map((item, index) => (
            <div key={item.user_id} className="list-card facet-card facet-card--soft">
              <div className="list-card__rank">{index + 1}</div>
              <div className="list-card__copy">
                <strong>{item.first_name || item.username || "Игрок"}</strong>
                <span>
                  {item.spins} спинов • {item.stars_spent}⭐
                </span>
              </div>
              <div className="list-card__wins">{item.wins}</div>
            </div>
          ))
        ) : (
          <EmptyState title="Рейтинг пуст" copy="Топ заполнится, когда начнутся спины." />
        )}
      </div>
    </ScreenSection>
  );
}

function ScreenSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="screen-stack">
      <section className="section-sheet facet-card">
        <div className="section-top section-top--stack">
          <p className="section-kicker">{title}</p>
          <h2 className="section-title">{title}</h2>
          <p className="section-caption">{subtitle}</p>
        </div>
        {children}
      </section>
    </div>
  );
}

function ListCard({
  icon,
  title,
  subtitle,
  badge,
  badgeColor,
  extraBadges = [],
}: {
  icon: string;
  title: string;
  subtitle: string;
  badge: string;
  badgeColor: string;
  extraBadges?: string[];
}) {
  return (
    <div className="list-card facet-card facet-card--soft">
      <div className="list-card__icon">{icon}</div>
      <div className="list-card__copy">
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>
      <div className="list-card__badges">
        {extraBadges.map((extra) => (
          <span key={extra} className="text-badge text-badge--soft">
            {extra}
          </span>
        ))}
        <span className="text-badge" style={{ color: badgeColor }}>
          {badge}
        </span>
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card facet-card facet-card--soft">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusChip({ label, active }: { label: string; active: boolean }) {
  return (
    <div className={classNames("status-chip", active && "status-chip--active")}>
      {label}
    </div>
  );
}

function BottomNav({
  activeScreen,
  onChange,
}: {
  activeScreen: ScreenKey;
  onChange: (screen: ScreenKey) => void;
}) {
  return (
    <nav className="bottom-nav facet-card">
      {screens.map((screen) => (
        <button
          key={screen.key}
          type="button"
          className={classNames("bottom-nav__button", activeScreen === screen.key && "active")}
          onClick={() => onChange(screen.key)}
        >
          <span className="bottom-nav__icon">{screen.icon}</span>
          <span className="bottom-nav__label">{screen.label}</span>
        </button>
      ))}
    </nav>
  );
}

function OwnerSheet({
  user,
  flags,
  spinCost,
  onToggle,
  onClose,
}: {
  user: User;
  flags: RuntimeFlags;
  spinCost: number;
  onToggle: (key: keyof RuntimeFlags) => void;
  onClose: () => void;
}) {
  return (
    <div className="sheet-overlay">
      <div className="sheet-overlay__backdrop" onClick={onClose} />
      <section className="bottom-sheet facet-card">
        <div className="sheet-head">
          <div>
            <p className="section-kicker">Владелец</p>
            <h2 className="section-title section-title--small">Управление</h2>
          </div>
          <button type="button" className="sheet-close" onClick={onClose}>
            Закрыть
          </button>
        </div>

        <div className="owner-summary facet-card facet-card--soft">
          <span>Владелец {user.user_id}</span>
          <strong>{spinCost}⭐ за спин</strong>
        </div>

        <div className="owner-grid">
          {(Object.keys(flags) as Array<keyof RuntimeFlags>).map((key) => (
            <button key={key} type="button" className="owner-toggle facet-card facet-card--soft" onClick={() => onToggle(key)}>
              <div>
                <strong>{key}</strong>
                <span>{flags[key] ? "Включено" : "Выключено"}</span>
              </div>
              <span className={classNames("owner-toggle__dot", flags[key] && "active")} />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function ResultSheet({
  result,
  note,
  theme,
  onClose,
}: {
  result: Prize;
  note: string;
  theme: { glow: string; border: string };
  onClose: () => void;
}) {
  return (
    <div className="sheet-overlay">
      <div className="sheet-overlay__backdrop" onClick={onClose} />
      <section className="bottom-sheet bottom-sheet--result facet-card" style={{ borderColor: `${theme.border}70` }}>
        <div className="result-sheet__aura" style={{ background: theme.glow }} />
        <p className="section-kicker">Результат</p>
        <div className="result-sheet__emoji">{result.emoji}</div>
        <h2 className="section-title section-title--small">{result.name}</h2>
        <p className="result-sheet__rarity" style={{ color: theme.border }}>
          {result.rarity}
        </p>
        <p className="result-sheet__note">{note}</p>
        <button type="button" className="primary-cta" onClick={onClose}>
          Забрать
        </button>
      </section>
    </div>
  );
}

function EmptyState({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="empty-card facet-card facet-card--soft">
      <strong>{title}</strong>
      <span>{copy}</span>
    </div>
  );
}
