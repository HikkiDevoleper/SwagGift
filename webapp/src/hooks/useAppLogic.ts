import { useState, useEffect, useCallback } from "react";
import { type BootstrapResponse, type ScreenKey } from "../types";
import { api, tg } from "../utils";

export function useAppLogic() {
  const [boot, setBoot] = useState<BootstrapResponse | null>(null);
  const [activeScreen, setActiveScreen] = useState<ScreenKey>("spin");
  const [liveConnected, setLiveConnected] = useState(false);
  const [toast, setToast] = useState("");
  
  const notify = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(""), 3000);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const data = await api<Pick<BootstrapResponse, "user" | "prizes" | "free_used" | "is_owner" | "config">>("user");
      setBoot((current) => current ? { ...current, ...data } : current);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    tg?.ready();
    tg?.expand();
    
    const load = async () => {
      try {
        const data = await api<BootstrapResponse>("bootstrap");
        setBoot(data);
      } catch (error) {
        notify("Ошибка загрузки данных");
      }
    };
    load();
  }, [notify]);

  return {
    boot,
    setBoot,
    activeScreen,
    setActiveScreen,
    liveConnected,
    setLiveConnected,
    toast,
    notify,
    refreshUser
  };
}
