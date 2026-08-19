import { create } from "zustand"

export interface Notification {
  id: number
  type: "info" | "success" | "error"
  title: string
  message?: string
}

interface AppState {
  backendOnline: boolean | null
  notifications: Notification[]
  onboarded: boolean
  setBackendOnline: (online: boolean) => void
  pushNotification: (n: Omit<Notification, "id">) => void
  removeNotification: (id: number) => void
  markOnboarded: () => void
}

let notifId = 0

export const useAppStore = create<AppState>((set) => ({
  backendOnline: null,
  notifications: [],
  onboarded: typeof localStorage !== "undefined" && localStorage.getItem("vas.onboarded") === "1",
  setBackendOnline: (online) => set({ backendOnline: online }),
  markOnboarded: () => {
    try {
      localStorage.setItem("vas.onboarded", "1")
    } catch {
      /* ignore */
    }
    set({ onboarded: true })
  },
  pushNotification: (n) =>
    set((state) => ({
      notifications: [
        ...state.notifications,
        { ...n, id: ++notifId },
      ].slice(-5),
    })),
  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),
}))
