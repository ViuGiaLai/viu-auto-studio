import { useEffect, useState } from "react"
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
  DialogFooter,
} from "@/components/design-system"
import { Input } from "@/components/design-system"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/design-system"
import { Badge } from "@/components/ui/badge"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/design-system"
import { api } from "@/services/api"
import { toast } from "@/hooks/use-toast"

const STYLE_CHIPS = ["Kể chuyện tâm tình", "Sắc gọn kiểu tin tức", "Hài hước đời thường", "Tài liệu căng thẳng"]

const VOICE_STYLE_5AXES = [
  {
    title: "1. Xưng hô",
    bad: "✗ 'Thân thiện'",
    good: "✓ Xưng 'mình', gọi người xem là 'bạn'",
  },
  {
    title: "2. Nhịp câu",
    bad: "✗ 'Nhịp cuốn hút'",
    good: "✓ Câu 6–12 từ, xen câu ngắn",
  },
  {
    title: "3. Vào đề",
    bad: "✗ 'Mở bài hấp dẫn'",
    good: "✓ Mở ngay giữa câu chuyện",
  },
  {
    title: "4. Cấm gì",
    bad: "✗ 'Đừng nhàm chán'",
    good: "✓ Cấm giảng đạo, cấm số liệu khô khan",
  },
  {
    title: "5. Kết",
    bad: "✗ 'Kết ấn tượng'",
    good: "✓ Kết bằng một hình ảnh/câu ngắn",
  },
]

type Config = Record<string, unknown>

const DEFAULT_CONFIG: Config = {
  image_source: "ai",
  video_style: "",
  niche: "",
  series_type: "anthology",
  description: "",
  direction: "",
  script_style: "",
  hook: "",
  long_video_duration: "3 - 5 phút",
  short_video_duration: "90 - 120 giây",
  ai_provider: "default",
  tts_provider: "",
  voice: "",
  character_sync: "channel",
  image_generator: "google_flow",
  image_mode: "mix",
  static_image_seconds: 5,
  video_model: "omni_flash",
  review_mode: "script_first",
  suggested_time: "07:00",
  language: "vi",
}

export function ChannelConfigDialog({
  channelId,
  channelName,
  open,
  onOpenChange,
  onSaved,
}: {
  channelId: number
  channelName: string
  open: boolean
  onOpenChange: (v: boolean) => void
  onSaved?: (config: Config) => void
}) {
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [styles, setStyles] = useState<Array<{ key: string; name: string; desc: string; tier: string }>>([])

  useEffect(() => {
    if (!open || !channelId) return
    setLoading(true)
    Promise.all([api.channelGetConfig(channelId), api.videoStyles()])
      .then(([cfg, st]) => {
        setStyles(st)
        setConfig({ ...DEFAULT_CONFIG, ...cfg.config })
      })
      .catch(() => toast({ title: "Không thể tải cấu hình kênh", variant: "destructive" }))
      .finally(() => setLoading(false))
  }, [open, channelId])

  const set = (key: string, value: unknown) => setConfig((c) => ({ ...c, [key]: value }))

  const save = async () => {
    setSaving(true)
    try {
      await api.channelUpdateConfig(channelId, config)
      toast({ title: "Đã lưu cấu hình kênh" })
      onSaved?.(config)
      onOpenChange(false)
    } catch (e) {
      toast({ title: "Không thể lưu", description: String(e), variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            ⚙️ Cấu hình kênh
            {channelName && <span className="text-sm font-normal text-muted-foreground">— {channelName}</span>}
          </DialogTitle>
          <DialogDescription>bộ não AI, giọng, lịch tự đề xuất</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-2 py-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            {/* 🧠 Nội dung & Bộ não */}
            <section>
              <h3 className="mb-3 text-sm font-bold">🧠 Nội dung & Bộ não — quyết định chủ đề & chất riêng của kênh</h3>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Nguồn hình</Label>
                  <Select value={String(config.image_source)} onValueChange={(v) => set("image_source", v)}>
                    <SelectTrigger className="w-full text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ai">🤖 AI tạo hình (Flow/Meta)</SelectItem>
                      <SelectItem value="stock">📦 Kho ảnh/video có sẵn</SelectItem>
                      <SelectItem value="mixed">🔀 Kết hợp</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Kiểu video (bộ não AI)</Label>
                  <Select value={String(config.video_style)} onValueChange={(v) => set("video_style", v)}>
                    <SelectTrigger className="w-full text-sm">
                      <SelectValue placeholder="— Chọn kiểu —" />
                    </SelectTrigger>
                    <SelectContent>
                      {styles.map((s) => (
                        <SelectItem key={s.key} value={s.key}>
                          <span className="flex w-full items-center justify-between">
                            {s.name}
                            <Badge
                              variant={s.tier === "FREE" ? "secondary" : "outline"}
                              className="ml-2 text-[9px]"
                            >
                              {s.tier}
                            </Badge>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Ngách của kênh (gõ cụ thể để khác biệt)</Label>
                  <Input
                    placeholder="Vd: Sinh tồn của thợ săn voi mùa đông vùng Siberia"
                    value={String(config.niche || "")}
                    onChange={(e) => set("niche", e.target.value)}
                  />
                </div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Kiểu chuỗi tập (chống trùng chủ đề)</Label>
                  <Select value={String(config.series_type)} onValueChange={(v) => set("series_type", v)}>
                    <SelectTrigger className="w-full text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="anthology">Tuyển tập — mỗi tập một chủ đề MỚI (khuyên dùng)</SelectItem>
                      <SelectItem value="series">Chuỗi — các tập liên quan nhau</SelectItem>
                      <SelectItem value="random">Ngẫu nhiên</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {!config.description && !config.direction && (
                <p className="mt-3 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                  ⚠ Bạn chưa nhập Mô tả & Định hướng — ý tưởng sẽ dễ chung chung và trùng với kênh khác. Nên điền 2 ô dưới.
                </p>
              )}

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Mô tả chi tiết kênh (nói cụ thể về gì)</Label>
                  <Textarea
                    placeholder="Vd: Kênh kể chuyện sinh tồn của người tiền sử ở vùng băng giá..."
                    value={String(config.description || "")}
                    onChange={(e) => set("description", e.target.value)}
                    rows={3}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Định hướng kênh (thiên về điều gì hơn)</Label>
                  <Textarea
                    placeholder="Vd: Nghiêng về cảm xúc & kịch tính sinh tồn hơn là số liệu khoa học; khán giả phổ thông yêu thích lịch sử."
                    value={String(config.direction || "")}
                    onChange={(e) => set("direction", e.target.value)}
                    rows={3}
                  />
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Label className="text-xs">Phong cách viết kịch bản (giọng riêng của kênh)</Label>
                  <Button size="sm" variant="outline" className="h-7 text-xs" type="button">
                    🎓 Học từ kênh đối thủ...
                  </Button>
                </div>
                <Textarea
                  placeholder="Viết thành quy tắc cụ thể. Tránh các tính từ chung chung như 'hấp dẫn, chuyên nghiệp, cuốn hút'."
                  value={String(config.script_style || "")}
                  onChange={(e) => set("script_style", e.target.value)}
                  rows={5}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">Mẫu nhanh — bấm để điền rồi sửa tiếp:</span>
                  {STYLE_CHIPS.map((chip) => (
                    <Button variant="ghost"
                      key={chip}
                      type="button"
                      onClick={() => set("script_style", chip)}
                      className="rounded-full border px-3 py-1 text-xs transition-colors hover:bg-primary/15 hover:text-primary"
                    >
                      {chip}
                    </Button>
                  ))}
                </div>
              </div>
            </section>

            <hr className="border-border/60" />

            {/* 📝 5 trục + Hook */}
            <section>
              <h3 className="mb-3 text-sm font-bold">📝 Cách viết để AI thật sự rõ giọng — 5 trục</h3>
              <div className="grid gap-2 sm:grid-cols-5">
                {VOICE_STYLE_5AXES.map((a) => (
                  <div key={a.title} className="rounded-md border bg-background p-3 text-xs">
                    <div className="font-bold">{a.title}</div>
                    <div className="mt-1 text-muted-foreground">{a.bad}</div>
                    <div className="mt-0.5 text-emerald-300">{a.good}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 space-y-1.5">
                <Label className="text-xs">Hook của kênh (câu chốt thương hiệu — AI lồng sau đoạn mở đầu)</Label>
                <Textarea
                  placeholder="Vd: Mình là recap — kể cho bạn nghe chuyện thật mà không cần xem hết cả bộ phim."
                  value={String(config.hook || "")}
                  onChange={(e) => set("hook", e.target.value)}
                  rows={2}
                />
              </div>
            </section>

            <hr className="border-border/60" />

            {/* Độ dài */}
            <section className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Độ dài Video dài mục tiêu</Label>
                <Select value={String(config.long_video_duration)} onValueChange={(v) => set("long_video_duration", v)}>
                  <SelectTrigger className="w-full text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3 - 5 phút">3 - 5 phút</SelectItem>
                    <SelectItem value="5 - 10 phút">5 - 10 phút</SelectItem>
                    <SelectItem value="10 - 20 phút">10 - 20 phút</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Độ dài Shorts mục tiêu</Label>
                <Select value={String(config.short_video_duration)} onValueChange={(v) => set("short_video_duration", v)}>
                  <SelectTrigger className="w-full text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30 - 60 giây">30 - 60 giây</SelectItem>
                    <SelectItem value="90 - 120 giây">90 - 120 giây (Mặc định)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </section>

            <hr className="border-border/60" />

            {/* 🎙 Giọng & Hình */}
            <section>
              <h3 className="mb-3 text-sm font-bold">🎙 Giọng & Hình</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">AI provider (văn bản)</Label>
                  <Select value={String(config.ai_provider)} onValueChange={(v) => set("ai_provider", v)}>
                    <SelectTrigger className="w-full text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Mặc định (theo Cài đặt chung)</SelectItem>
                      <SelectItem value="openrouter">OpenRouter</SelectItem>
                      <SelectItem value="gemini">Gemini</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Giọng đọc (TTS)</Label>
                  <Select value={String(config.tts_provider)} onValueChange={(v) => set("tts_provider", v)}>
                    <SelectTrigger className="w-full text-sm">
                      <SelectValue placeholder="Theo mặc định hệ thống" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="edge">Edge TTS (giọng thật)</SelectItem>
                      <SelectItem value="local">Kokoro TTS (local)</SelectItem>
                      <SelectItem value="cloud">Cloud TTS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Giọng cụ thể</Label>
                  <Input
                    placeholder={String(config.voice || "Mặc định hệ thống")}
                    value={String(config.voice || "")}
                    onChange={(e) => set("voice", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Đồng bộ nhân vật</Label>
                  <Select value={String(config.character_sync)} onValueChange={(v) => set("character_sync", v)}>
                    <SelectTrigger className="w-full text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="channel">Cả kênh (dùng lại mọi video)</SelectItem>
                      <SelectItem value="video">Từng video</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Tạo ảnh/video bằng</Label>
                  <Select value={String(config.image_generator)} onValueChange={(v) => set("image_generator", v)}>
                    <SelectTrigger className="w-full text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="google_flow">Google Flow (Veo/Imagen)</SelectItem>
                      <SelectItem value="meta">Meta AI</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Chế độ hình</Label>
                  <Select value={String(config.image_mode)} onValueChange={(v) => set("image_mode", v)}>
                    <SelectTrigger className="w-full text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mix">Trộn ảnh + video</SelectItem>
                      <SelectItem value="image_only">Chỉ ảnh</SelectItem>
                      <SelectItem value="video_only">Chỉ video</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Thời gian ảnh tĩnh (giây)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={String(config.static_image_seconds ?? 5)}
                    onChange={(e) => set("static_image_seconds", Number(e.target.value) || 5)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Model video</Label>
                  <Select value={String(config.video_model)} onValueChange={(v) => set("video_model", v)}>
                    <SelectTrigger className="w-full text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="omni_flash">Omni Flash (mặc định)</SelectItem>
                      <SelectItem value="veo">Veo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>

            <hr className="border-border/60" />

            {/* ⏰ Tự động & Lịch */}
            <section>
              <h3 className="mb-3 text-sm font-bold">⏰ Tự động & Lịch</h3>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Chế độ duyệt</Label>
                  <Select value={String(config.review_mode)} onValueChange={(v) => set("review_mode", v)}>
                    <SelectTrigger className="w-full text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="script_first">📄 Duyệt kịch bản trước (Mặc định)</SelectItem>
                      <SelectItem value="auto">🤖 Tự động hoàn toàn</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Giờ đề xuất</Label>
                  <Input
                    type="time"
                    value={String(config.suggested_time || "07:00")}
                    onChange={(e) => set("suggested_time", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Ngôn ngữ sản xuất</Label>
                  <Select value={String(config.language)} onValueChange={(v) => set("language", v)}>
                    <SelectTrigger className="w-full text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="vi">Tiếng Việt (vi)</SelectItem>
                      <SelectItem value="en">English (en)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="mt-3 rounded border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-muted-foreground">
                💡 Chế độ duyệt đang chọn: dùng chờ bạn đọc & sửa kịch bản trước khi lồng tiếng và sinh ảnh.
              </p>
            </section>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
          <Button onClick={save} disabled={saving} className="bg-gradient-to-r from-amber-500 to-pink-500 hover:opacity-90">
            {saving ? "Đang lưu..." : "💾 Lưu cấu hình"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
