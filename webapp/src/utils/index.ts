import { type Prize } from "../types";

export const tg = (window as any).Telegram?.WebApp;

export async function api<T>(endpoint: string, method = "GET", body?: unknown): Promise<T> {
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

const RARITY_MAP: Record<string, string> = {
  "Обычный": "common",
  "Редкий": "rare",
  "Эпический": "epic",
  "Легендарный": "legendary",
  "Промах": "miss",
  // English fallbacks
  "common": "common",
  "rare": "rare",
  "epic": "epic",
  "legendary": "legendary",
  "miss": "miss",
};

export function rarityClass(rarity: string): string {
  return RARITY_MAP[rarity] || "common";
}

export function makeReel(prizes: Prize[], winner?: Prize) {
  if (!prizes.length) return { reel: [], stopIndex: 0 };

  const reel: Prize[] = [];
  const stopIndex = 42;
  for (let i = 0; i < 55; i++) {
    if (winner && i === stopIndex) {
      reel.push(winner);
    } else {
      reel.push(prizes[Math.floor(Math.random() * prizes.length)]);
    }
  }
  return { reel, stopIndex };
}

export function initialsOf(user?: { first_name?: string; username?: string }) {
  const raw = user?.first_name || user?.username || "SG";
  return raw.slice(0, 2).toUpperCase();
}

export function rankTitle(wins: number) {
  if (wins >= 50) return "Легенда";
  if (wins >= 20) return "Коллекционер";
  if (wins >= 10) return "Везунчик";
  if (wins >= 3) return "Игрок";
  return "Новичок";
}

export function formatDate(value: string) {
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

export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}
