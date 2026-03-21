import { useState, useEffect, useCallback, useRef } from "react";
import { type BootstrapResponse, type RuntimeFlags, type User, type InventoryItem } from "../types";
import { api, tg } from "../utils";

export function useAppLogic() {
  const [boot, setBoot] = useState<BootstrapResponse | null>(null);
  const [activeScreen, setActiveScreen] = useState<string>("spin");
  const [liveConnected, setLiveConnected] = useState(false);
  const [toast, setToast] = useState("");
  const [toastType, setToastType] = useState<"info" | "success" | "error">("info");
  const toastTimeoutRef = useRef<NodeJS.Timeout>();
  
  const notify = useCallback((message: string, type: "info" | "success" | "error" = "info") => {
    setToastType(type);
    setToast(message);
    
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    
    toastTimeoutRef.current = setTimeout(() => setToast(""), 3500);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const data = await api<Pick<BootstrapResponse, "user" | "prizes" | "free_used" | "is_owner">>("user");
      setBoot((current) => current ? { ...current, ...data } : current);
    } catch (e) {
      console.error("Refresh user error:", e);
      notify("Ошибка обновления профиля", "error");
    }
  }, [notify]);

  useEffect(() => {
    tg?.ready();
    tg?.expand();
    
    const load = async () => {
      try {
        const data = await api<BootstrapResponse>("bootstrap");
        setBoot(data);
        notify("Добро пожаловать!", "success");
      } catch (error) {
        console.error("Bootstrap error:", error);
        notify("Ошибка загрузки данных", "error");
      }
    };
    load();

    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, [notify]);

  return {
    boot,
    setBoot,
    activeScreen,
    setActiveScreen,
    liveConnected,
    setLiveConnected,
    toast,
    toastType,
    notify,
    refreshUser
  };
}
