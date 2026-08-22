import type { SubtitleConfig } from "@/types"

export const OUTPUT_PRESETS = [
  { id: "youtube", title: "YouTube ngang", detail: "16:9 · 1920×1080 · 30 FPS", icon: "▰", aspect: "16:9", width: 1920, height: 1080 },
  { id: "shorts", title: "Shorts / TikTok", detail: "9:16 · 1080×1920 · 30 FPS", icon: "▯", aspect: "9:16", width: 1080, height: 1920 },
  { id: "square", title: "Video vuông", detail: "1:1 · 1080×1080 · 30 FPS", icon: "□", aspect: "1:1", width: 1080, height: 1080 },
  { id: "4k", title: "Chất lượng cao", detail: "16:9 · 3840×2160 · 30 FPS", icon: "◈", aspect: "16:9", width: 3840, height: 2160 },
] as const

export const RENDER_PROFILES = [
  { id: "fastest", title: "⚡ Nhanh nhất", detail: "Hardware GPU / Ultrafast (Mặc định)" },
  { id: "balanced", title: "⚖️ Cân bằng", detail: "Chất lượng tốt · 1080p 30 FPS" },
  { id: "high", title: "🎬 Chất lượng cao", detail: "Độ sắc nét tối đa · CRF 18" },
] as const

export const SUBTITLE_PRESETS: Array<{ name: string; cfg: Partial<SubtitleConfig> }> = [
  { name: "Mặc định", cfg: { font_size: 48, position: "bottom", primary_color: "#FFFFFF" } },
  { name: "Caption Shorts", cfg: { font_size: 64, position: "bottom", primary_color: "#FFD700" } },
  { name: "Thanh lịch", cfg: { font_size: 42, position: "bottom", primary_color: "#E8E8E8", border_width: 0 } },
]
