export type ScreenKey = "spin" | "history" | "inventory" | "top";

export type Prize = {
  key: string;
  name: string;
  emoji: string;
  rarity: string;
  weight: number;
  type: "gift" | "nothing";
  gift_id?: string | null;
};

export type User = {
  user_id: number;
  username: string;
  first_name: string;
  spins: number;
  wins: number;
  stars_spent: number;
};

export type InventoryItem = {
  key: string;
  name: string;
  rarity: string;
  demo: boolean;
  free: boolean;
  date: string;
};

export type LeaderboardRow = {
  user_id: number;
  username: string;
  first_name: string;
  spins: number;
  wins: number;
  stars_spent: number;
};

export type HistoryRow = {
  prize_key: string;
  prize_name: string;
  rarity: string;
  won_at: string;
  first_name: string;
  username: string;
};

export type RuntimeFlags = {
  demo: boolean;
  gifts: boolean;
  maint: boolean;
  testpay: boolean;
};

export type BootstrapResponse = {
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

export type LiveData = {
  history?: HistoryRow[];
  leaderboard?: LeaderboardRow[];
  stats?: {
    users: number;
    spins: number;
    stars: number;
    wins_today: number;
  };
};
