import type { Project } from "@/types"

export const PRODUCING_STATUSES = [
  "generating_voice",
  "voice_ready",
  "preparing_media",
  "media_ready",
  "generating_subtitles",
  "subtitle_ready",
  "rendering",
  "processing",
  "running",
]

export const WAITING_STATUSES = [
  "waiting_for_review",
  "pending",
  "queued",
  "draft",
  "script_ready",
  "script_approved",
  "idle",
]

export type OverviewBucket = "producing" | "waiting" | "completed" | "failed" | "other"

export function overviewBucket(status: string): OverviewBucket {
  if (PRODUCING_STATUSES.includes(status)) return "producing"
  if (WAITING_STATUSES.includes(status)) return "waiting"
  if (status === "completed") return "completed"
  if (status === "failed") return "failed"
  return "other"
}

export function overviewLabel(status: string): string {
  const bucket = overviewBucket(status)
  if (bucket === "producing") return "Đang sản xuất"
  if (bucket === "waiting") return "Chờ duyệt"
  if (bucket === "completed") return "Đã hoàn thành"
  if (bucket === "failed") return "Lỗi"
  return status
}

export function overviewTone(status: string) {
  const bucket = overviewBucket(status)
  if (bucket === "producing") {
    return {
      badge: "bg-blue-500 text-white",
      bar: "bg-blue-500",
      barSoft: "bg-blue-500/20",
    }
  }
  if (bucket === "waiting") {
    return {
      badge: "bg-orange-500 text-white",
      bar: "bg-orange-400",
      barSoft: "bg-orange-500/20",
    }
  }
  if (bucket === "completed") {
    return {
      badge: "bg-emerald-500 text-white",
      bar: "bg-emerald-500",
      barSoft: "bg-emerald-500/20",
    }
  }
  if (bucket === "failed") {
    return {
      badge: "bg-red-500 text-white",
      bar: "bg-red-500",
      barSoft: "bg-red-500/20",
    }
  }
  return {
    badge: "bg-slate-600 text-white",
    bar: "bg-slate-500",
    barSoft: "bg-slate-500/20",
  }
}

export function initialsFromName(name: string): string {
  const parts = name
    .split(/\s+/)
    .map((part) => part.replace(/[^A-Za-zÀ-ỹ0-9]/g, ""))
    .filter(Boolean)
  if (parts.length === 0) return "P"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
}

export function relativeTimeVi(iso?: string | null): string {
  if (!iso) return "Chưa cập nhật"
  const ts = new Date(iso).getTime()
  if (Number.isNaN(ts)) return "Chưa cập nhật"
  const diff = Date.now() - ts
  const minutes = Math.max(0, Math.round(diff / 60000))
  if (minutes < 1) return "Cập nhật vừa xong"
  if (minutes < 60) return `Cập nhật ${minutes} phút trước`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `Cập nhật ${hours} giờ trước`
  const days = Math.round(hours / 24)
  return `Cập nhật ${days} ngày trước`
}

export function countUpdatedLast24h(items: Project[], predicate: (project: Project) => boolean): number {
  const now = Date.now()
  const day = 24 * 60 * 60 * 1000
  return items.filter((item) => {
    const ts = new Date(item.updated_at).getTime()
    return predicate(item) && !Number.isNaN(ts) && now - ts <= day
  }).length
}

export function formatDelta(value: number, hasBaseline: boolean): string {
  if (!hasBaseline) return "Chưa có mốc ngày trước"
  if (value > 0) return `+${value} so với hôm qua`
  if (value < 0) return `${value} so với hôm qua`
  return "Không đổi so với hôm qua"
}
