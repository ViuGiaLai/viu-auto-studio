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
  searchOpen: boolean
  projectStatusFilter: string
  projectSort: "newest" | "oldest" | "size"
  readNotificationKeys: string[]
  operatorName: string
  operatorEmail: string
  setBackendOnline: (online: boolean) => void
  setOperatorProfile: (name: string, email: string) => void
  pushNotification: (n: Omit<Notification, "id">) => void
  removeNotification: (id: number) => void
  markOnboarded: () => void
  setSearchOpen: (open: boolean) => void
  setProjectStatusFilter: (filter: string) => void
  setProjectSort: (sort: "newest" | "oldest" | "size") => void
  markNotificationRead: (key: string) => void
  markAllNotificationsRead: () => void
}

let notifId = 0

function readKeys(): string[] {
  try {
    return JSON.parse(localStorage.getItem("vas.readNotifs") || "[]") as string[]
  } catch {
    return []
  }
}

export const useAppStore = create<AppState>((set) => ({
  backendOnline: null,
  notifications: [],
  searchOpen: false,
  projectStatusFilter: "all",
  projectSort: "newest",
  operatorName: "",
  operatorEmail: "",
  readNotificationKeys: typeof localStorage !== "undefined" ? readKeys() : [],
  onboarded: typeof localStorage !== "undefined" && localStorage.getItem("vas.onboarded") === "1",
  setBackendOnline: (online) => set({ backendOnline: online }),
  setSearchOpen: (open) => set({ searchOpen: open }),
  setProjectStatusFilter: (filter) => set({ projectStatusFilter: filter }),
  setProjectSort: (sort) => set({ projectSort: sort }),
  setOperatorProfile: (name, email) => set({ operatorName: name, operatorEmail: email }),
  markNotificationRead: (key) =>
    set((state) => {
      const next = Array.from(new Set([...state.readNotificationKeys, key]))
      try { localStorage.setItem("vas.readNotifs", JSON.stringify(next)) } catch { /* ignore */ }
      return { readNotificationKeys: next }
    }),
  markAllNotificationsRead: () =>
    set((state) => {
      const keys = state.notifications.map((n) => String(n.id))
      const next = Array.from(new Set([...state.readNotificationKeys, ...keys]))
      try { localStorage.setItem("vas.readNotifs", JSON.stringify(next)) } catch { /* ignore */ }
      return { readNotificationKeys: next }
    }),
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
