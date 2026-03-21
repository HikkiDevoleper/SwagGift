/// <reference types="vite/client" />

interface TelegramWebAppThemeParams {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
}

interface TelegramHapticFeedback {
  impactOccurred(style: "light" | "medium" | "heavy"): void;
  notificationOccurred(type: "error" | "success" | "warning"): void;
}

interface TelegramMainButton {
  setText(text: string): TelegramMainButton;
  show(): TelegramMainButton;
  hide(): TelegramMainButton;
}

interface TelegramWebApp {
  initData: string;
  colorScheme?: "light" | "dark";
  themeParams?: TelegramWebAppThemeParams;
  HapticFeedback: TelegramHapticFeedback;
  MainButton: TelegramMainButton;
  ready(): void;
  expand(): void;
  enableClosingConfirmation(): void;
  showAlert(message: string): void;
  showConfirm(message: string, callback: (ok: boolean) => void): void;
  openLink(url: string): void;
  openInvoice(url: string, callback: (status: "paid" | "cancelled" | "failed" | "pending") => void): void;
}

declare global {
  interface Window {
    Telegram: {
      WebApp: TelegramWebApp;
    };
  }
}

export {};
