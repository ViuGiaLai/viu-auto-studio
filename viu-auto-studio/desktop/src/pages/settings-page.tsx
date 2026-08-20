import { useEffect, useRef, useState } from "react"
import { Settings as SettingsIcon, Play, RefreshCw, AlertTriangle, CheckCircle2, KeyRound, Image, Zap, ExternalLink, FolderOpen, Send, ShieldCheck } from "lucide-react"
import { api, openExternalUrl, selectDirectory } from "@/services/api"

import { globalApi } from "@/services/pages-api"
import { toast } from "@/hooks/use-toast"
import type { TTSConfig, TTSVoice } from "@/types"
import { Button } from "@/components/design-system"
import { Input } from "@/components/design-system"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { useAppStore } from "@/stores/app-store"

import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/design-system"
import { cn } from "@/utils/cn"
import { mediaUrl } from "@/services/api"

const SAMPLE_TEXT_VI = "Xin chào, đây là giọng đọc mẫu của Viu Auto Studio. Hãy điều chỉnh tốc độ và âm lượng để phù hợp với video của bạn."

const TABS = [
  { key: "chung", label: "📁 Chung" },
  { key: "engine", label: "🔧 Engine & Công cụ" },
  { key: "ai", label: "✨ AI Dịch & Ảnh" },
  { key: "voice", label: "🎙 Giọng nói" },
  { key: "telegram", label: "✈ Telegram" },
  { key: "publish", label: "▶ Đăng bài & Lập lịch (Đang phát triển)" },
  { key: "performance", label: "⚡ Hiệu năng" },
]

export default function SettingsPage() {
  const [config, setConfig] = useState<TTSConfig | null>(null)
  const [providers, setProviders] = useState<Array<{ id: string; name: string; available: boolean }>>([])
  const [voices, setVoices] = useState<TTSVoice[]>([])
  const [loading, setLoading] = useState(true)
  const [testingConn, setTestingConn] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [customText, setCustomText] = useState(SAMPLE_TEXT_VI)
  const [dirty, setDirty] = useState(false)

  // Google Labs image provider
  const [labsEnabled, setLabsEnabled] = useState(false)
  const [pollinationsFallback, setPollinationsFallback] = useState(true)
  const [labsCheckInfo, setLabsCheckInfo] = useState<{ can_automate: boolean; has_chromium: boolean; has_playwright: boolean; note: string }>({
    can_automate: false,
    has_chromium: false,
    has_playwright: false,
    note: "",
  })

  // Gemini (aistudio.google) image source
  const [geminiKey, setGeminiKey] = useState("")

  // Flow Connector (Chrome Extension)
  const [connectorEnabled, setConnectorEnabled] = useState(false)
  const [workerConnected, setWorkerConnected] = useState(false)
  const [geminiEnabled, setGeminiEnabled] = useState(false)
  const [geminiChecking, setGeminiChecking] = useState(false)
  const [geminiResult, setGeminiResult] = useState<{ valid: boolean; image_ok: boolean; note: string } | null>(null)

  // General & AI settings
  const [settings, setSettings] = useState<Record<string, unknown>>({})
  const [settingsDraft, setSettingsDraft] = useState<Record<string, unknown>>({})
  const [settingsSaved, setSettingsSaved] = useState(false)
  const [engineStatus, setEngineStatus] = useState<"installed" | "missing">("installed")
  const [diagnostics, setDiagnostics] = useState<Awaited<ReturnType<typeof api.systemDiagnose>> | null>(null)
  const [telegramTesting, setTelegramTesting] = useState(false)
  const [telegramSending, setTelegramSending] = useState(false)
  const [sysStats, setSysStats] = useState<{

    cpu_percent: number
    ram_total_gb: number
    ram_percent: number
    disk_free_gb: number
    active_jobs: number
    ffmpeg_ok: boolean
  } | null>(null)

  const setOperatorProfile = useAppStore((s) => s.setOperatorProfile)
  const [globalSettings, setGlobalSettings] = useState<Record<string, unknown>>({})
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const loadAll = async () => {
    setLoading(true)
    try {
      const [cfg, provs, set] = await Promise.all([
        api.ttsGetConfig(),
        api.ttsListProviders(),
        (async () => {
          const s = await api.settingsGet()
          return s as unknown as Record<string, unknown>
        })(),
      ])
      const vs = await api.ttsListVoices(cfg?.provider)
      const global = await globalApi.getSettings().catch(() => ({ settings: {} as Record<string, unknown> }))
      setGlobalSettings(global.settings || {})

      api.ffmpegCheck()
        .then((c) => setEngineStatus(c.ffmpeg && c.ffprobe ? "installed" : "missing"))
        .catch(() => setEngineStatus("missing"))
      api.systemDiagnose()
        .then(setDiagnostics)
        .catch(() => setDiagnostics(null))
      api.systemStats()
        .then(setSysStats)
        .catch(() => {})

      api.labsGetConfig()
        .then((c) => {
          setLabsEnabled(Boolean(c.labs_enabled ?? c.enabled))
          setGeminiKey(c.gemini_key ?? "")
          setGeminiEnabled(Boolean(c.gemini_enabled))
          setPollinationsFallback(Boolean(c.pollinations_fallback))
          setConnectorEnabled(Boolean(c.connector_enabled))
        })
        .catch(() => {})
      api.connectorWorkerStatus()
        .then((s) => setWorkerConnected(Boolean(s?.registered && (s.worker_count || 0) > 0)))
        .catch(() => {})
      api.labsCheck()
        .then(setLabsCheckInfo)
        .catch(() => {})
      setConfig(cfg)
      setSettings(set)
      setSettingsDraft(set)
      setProviders(provs)
      setVoices(vs)
      if (cfg && !cfg.voice && vs.length > 0) {
        saveTTS({ voice: vs[0].id } as Partial<TTSConfig>)
      }
    } catch (e) {
      toast({ title: "Không tải được cài đặt", description: String(e), variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  // Refresh voice list whenever the selected provider changes
  useEffect(() => {
    if (!config?.provider) return
    api.ttsListVoices(config.provider).then(setVoices).catch(() => {})
  }, [config?.provider])

  const saveTTS = async (patch: Partial<TTSConfig>) => {
    if (!config) return
    const next = { ...config, ...patch }
    try {
      await api.ttsSaveConfig({
        provider: next.provider,
        voice: next.voice,
        speed: next.speed,
        volume: next.volume,
        model_dir: next.model_dir,
      })
      setConfig(next)
      setDirty(true)
      toast({ title: "Cấu hình giọng đã cập nhật" })
    } catch (e) {
      toast({ title: "Không thể lưu", description: String(e), variant: "destructive" })
    }
  }

  const toggleLabs = async (enabled: boolean) => {
    try {
      await api.labsSaveConfig({
        enabled,
        labs_enabled: enabled,
        gemini_enabled: geminiEnabled,
        pollinations_fallback: pollinationsFallback,
      })
      setLabsEnabled(enabled)
      toast({ title: enabled ? "Đã bật Google Labs làm nguồn ảnh AI" : "Đã tắt Google Labs" })
    } catch (e) {
      toast({ title: "Không thể lưu", description: String(e), variant: "destructive" })
    }
  }

  const saveGemini = async () => {
    try {
      await api.labsSaveConfig({
        labs_enabled: labsEnabled,
        gemini_key: geminiKey.trim(),
        gemini_enabled: geminiEnabled,
        pollinations_fallback: pollinationsFallback,
        connector_enabled: connectorEnabled,
      })
      toast({ title: "Đã lưu cấu hình nguồn ảnh AI" })
    } catch (e) {
      toast({ title: "Không thể lưu", description: String(e), variant: "destructive" })
    }
  }

  const checkGeminiKey = async () => {
    if (!geminiKey.trim()) {
      toast({ title: "Hãy nhập API key trước", variant: "destructive" })
      return
    }
    setGeminiChecking(true)
    try {
      const res = await api.geminiCheckKey(geminiKey.trim())
      setGeminiResult(res)
      toast({
        title: res.valid ? "API key hợp lệ" : "API key không hợp lệ",
        description: res.note,
        variant: res.valid ? undefined : "destructive",
      })
    } catch (e) {
      toast({ title: "Không kiểm tra được key", description: String(e), variant: "destructive" })
    } finally {
      setGeminiChecking(false)
    }
  }

  const openLabsLogin = () => {
    openExternalUrl("https://labs.google/fx/vi/tools/flow")
  }

  const openExtGuide = () => {
    openExternalUrl("https://labs.google/fx/vi/tools/flow")
  }

  const refreshLabsCheck = () => {
    api.labsCheck().then(setLabsCheckInfo).catch(() => {})
  }

  const testConnection = async () => {
    if (!config) return
    setTestingConn(true)
    try {
      const res = await api.ttsTestConnection({ provider: config.provider })
      toast({
        title: res.ok ? "Kết nối thành công" : "Kết nối thất bại",
        description: res.message,
        variant: res.ok ? undefined : "destructive",
      })
    } catch (e) {
      toast({ title: "Kết nối thất bại", description: String(e), variant: "destructive" })
    } finally {
      setTestingConn(false)
    }
  }

  const chooseOutputFolder = async () => {
    const folder = await selectDirectory()
    if (!folder) return
    setDirty(true)
    setSettingsDraft((current) => ({ ...current, output_folder: folder }))
  }

  const selectEngineMode = (mode: string) => {
    setDirty(true)
    setSettingsDraft((current) => ({ ...current, engine_mode: mode }))
  }

  const testTelegram = async (sendMessage: boolean) => {
    const botToken = String(settingsDraft.telegram_bot_token ?? "").trim()
    const chatId = String(settingsDraft.telegram_chat_id ?? "").trim()
    if (!botToken || !chatId) {
      toast({ title: "Thiếu thông tin Telegram", description: "Cần nhập Bot Token và Chat ID trước.", variant: "destructive" })
      return
    }
    if (sendMessage) setTelegramSending(true)
    else setTelegramTesting(true)
    try {
      const res = await api.settingsTelegramTest({
        bot_token: botToken,
        chat_id: chatId,
        send_message: sendMessage,
        message: "Viu Auto Studio: kết nối Telegram hoạt động.",
      })
      toast({
        title: sendMessage ? "Đã gửi tin nhắn thử" : "Bot Telegram hợp lệ",
        description: res.bot?.username ? `@${res.bot.username}` : "Kết nối Telegram đã được xác nhận.",
      })
    } catch (e) {
      toast({ title: "Telegram chưa sẵn sàng", description: String(e), variant: "destructive" })
    } finally {
      setTelegramTesting(false)
      setTelegramSending(false)
    }
  }

  const preview = async () => {
    if (!config) return

    setPreviewing(true)
    try {
      const res = await api.ttsPreview(customText, { speed: config.speed, volume: config.volume })
      if (res.audio_path) {
        setPreviewUrl(mediaUrl(res.audio_path))
        setTimeout(() => audioRef.current?.play(), 100)
        toast({ title: "Đã tạo âm thanh mẫu" })
      } else {
        toast({ title: res.message || "Không thể tạo mẫu", variant: "destructive" })
      }
    } catch (e) {
      toast({ title: "Lỗi tạo mẫu", description: String(e), variant: "destructive" })
    } finally {
      setPreviewing(false)
    }
  }

  const saveSettings = async () => {
    try {
      await api.settingsSave(settingsDraft)
      const mergedGlobal = {
        ...globalSettings,
        operator_name: String(globalSettings.operator_name || ""),
        operator_email: String(globalSettings.operator_email || ""),
        language: settingsDraft.display_language ?? settingsDraft.language,
        production_language: settingsDraft.production_language,
        auto_refresh: settingsDraft.auto_refresh,


        dark_mode: settingsDraft.dark_mode,
      }

      await globalApi.updateSettings(mergedGlobal)
      setGlobalSettings(mergedGlobal)
      setOperatorProfile(String(mergedGlobal.operator_name || ""), String(mergedGlobal.operator_email || ""))
      setSettings(settingsDraft)
      setSettingsSaved(true)
      setDirty(false)
      toast({ title: "Đã lưu cài đặt" })
      setTimeout(() => setSettingsSaved(false), 3000)
    } catch (e) {
      toast({ title: "Không thể lưu", description: String(e), variant: "destructive" })
    }
  }

  const discard = () => {
    void loadAll()
    setDirty(false)
    toast({ title: "Đã tải lại cấu hình đã lưu" })
  }

  if (loading) {
    return (
      <div className="space-y-4 p-8">
        <div className="h-8 w-56 animate-pulse rounded bg-muted" />
        <div className="h-12 w-full animate-pulse rounded bg-muted" />
        <div className="h-40 w-full animate-pulse rounded bg-muted" />
      </div>
    )
  }

  return (
    <div className="min-h-full space-y-4 p-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-white">
            <SettingsIcon className="h-6 w-6 text-amber-400" />
            Cài đặt
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Cấu hình công cụ xử lý & API
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={discard} className="border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]">
            Huỷ
          </Button>
          <Button onClick={saveSettings} className="gap-1.5 bg-gradient-to-r from-[#d9940a] to-[#faaa02] text-white shadow-lg shadow-amber-500/20 hover:brightness-110">
            <CheckCircle2 className="h-4 w-4" />
            Lưu cài đặt
          </Button>
        </div>
      </div>

      <Tabs defaultValue="voice">
        <TabsList className="flex w-full justify-start overflow-x-auto bg-[#141d22] border border-white/8 p-1 rounded-lg">
          {TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key} className="whitespace-nowrap data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-300 data-[state=active]:border-amber-500/30 rounded-md border border-transparent">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Chung */}
        <TabsContent value="chung">
          <div className="vas-card p-5">
            <h3 className="mb-4 text-base font-semibold text-slate-100">Cài đặt chung</h3>
            <p className="mb-4 text-sm text-slate-500">Thư mục dữ liệu, người vận hành và hành vi hệ thống</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Tên người vận hành</Label>
                <Input
                  value={String(globalSettings.operator_name ?? globalSettings.operator_name_suggested ?? "")}
                  onChange={(e) => {
                    setDirty(true)
                    setGlobalSettings((s) => ({ ...s, operator_name: e.target.value }))
                  }}
                  placeholder="Tên hiển thị trên sidebar"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Email người vận hành</Label>
                <Input
                  value={String(globalSettings.operator_email ?? "")}
                  onChange={(e) => {
                    setDirty(true)
                    setGlobalSettings((s) => ({ ...s, operator_email: e.target.value }))
                  }}
                  placeholder="Để trống nếu chưa có"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Ngôn ngữ giao diện</Label>
                <Select
                  value={String(settingsDraft.display_language ?? "vi")}
                  onValueChange={(v) => { setDirty(true); setSettingsDraft((s) => ({ ...s, display_language: v })) }}

                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vi">Tiếng Việt</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Ngôn ngữ sản xuất mặc định</Label>
                <Select
                  value={String(settingsDraft.production_language ?? "vi")}
                  onValueChange={(v) => { setDirty(true); setSettingsDraft((s) => ({ ...s, production_language: v })) }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vi">Tiếng Việt (vi)</SelectItem>
                    <SelectItem value="en">English (en)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 rounded-md border p-3 sm:col-span-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">Thư mục dữ liệu/output</div>
                    <div className="truncate text-xs text-muted-foreground">{String(settingsDraft.output_folder ?? "Chưa chọn thư mục")}</div>
                  </div>
                  <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={chooseOutputFolder}>
                    <FolderOpen className="h-3.5 w-3.5" /> Chọn thư mục
                  </Button>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <div className="text-sm font-medium">Tự động cập nhật danh sách việc</div>

                  <div className="text-xs text-muted-foreground">Tự làm mới hàng đợi mỗi 5 giây</div>
                </div>
                <Switch
                  checked={Boolean(settingsDraft.auto_refresh)}
                  onCheckedChange={(v) => { setDirty(true); setSettingsDraft((s) => ({ ...s, auto_refresh: v })) }}
                />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <div className="text-sm font-medium">Chế độ tối</div>
                  <div className="text-xs text-muted-foreground">Luôn dùng giao diện tối</div>
                </div>
                <Switch
                  checked={Boolean(settingsDraft.dark_mode ?? true)}
                  onCheckedChange={(v) => { setDirty(true); setSettingsDraft((s) => ({ ...s, dark_mode: v })) }}
                />
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Engine & Công cụ */}
        <TabsContent value="engine">
          <div className="space-y-6">
            <div className="vas-card p-5">
              <div className="mb-1 flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-100">🔧 Bộ Công cụ Viu Studio</h3>
                <span className="text-xs text-slate-500">{engineStatus === "installed" ? "Đã cài đặt" : "Chưa cài đặt"}</span>
              </div>
              <p className="mb-5 text-sm text-slate-500">Chọn profile FFmpeg thật cho các lần render tiếp theo. Công cụ được kiểm tra tại máy; ứng dụng không tải gói hệ thống ngầm.</p>

              <div className="grid gap-4 sm:grid-cols-3">
                <div
                  role="button"
                  tabIndex={0}
                  aria-pressed={String(settingsDraft.engine_mode ?? "balanced") === "basic"}
                  onClick={() => selectEngineMode("basic")}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") selectEngineMode("basic") }}
                  className={cn("cursor-pointer rounded-xl border p-4 transition-colors", String(settingsDraft.engine_mode ?? "balanced") === "basic" ? "border-amber-500/50 bg-amber-500/[0.08]" : "border-white/[0.06] bg-white/[0.02] hover:border-white/20")}
                >
                  <div className="flex items-center justify-between gap-2"><div className="text-sm font-semibold text-slate-100">Cơ bản</div>{String(settingsDraft.engine_mode ?? "balanced") === "basic" && <span className="text-[10px] font-semibold text-amber-300">Đang chọn</span>}</div>

                  <div className="mb-2 text-xs text-amber-400">Máy yếu / laptop CPU</div>
                  <p className="mb-4 text-xs text-slate-400">Phù hợp máy cấu hình thấp, ưu tiên nhẹ và hoạt động ổn định.</p>
                  <div className="text-xs text-slate-500">FFmpeg: <span className="font-semibold text-slate-300">veryfast · CRF 24</span></div>

                </div>
                <div
                  role="button"
                  tabIndex={0}
                  aria-pressed={String(settingsDraft.engine_mode ?? "balanced") === "balanced"}
                  onClick={() => selectEngineMode("balanced")}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") selectEngineMode("balanced") }}
                  className={cn("relative cursor-pointer rounded-xl border p-4 transition-colors", String(settingsDraft.engine_mode ?? "balanced") === "balanced" ? "border-amber-500/50 bg-amber-500/[0.08]" : "border-white/[0.06] bg-white/[0.02] hover:border-white/20")}
                >
                  <span className="absolute right-3 top-3 rounded-md bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold tracking-wider text-amber-300">KHUYẾN NGHỊ</span>
                  <div className="flex items-center justify-between gap-2"><div className="text-sm font-semibold text-slate-100">Cân bằng</div>{String(settingsDraft.engine_mode ?? "balanced") === "balanced" && <span className="mr-24 text-[10px] font-semibold text-amber-300">Đang chọn</span>}</div>

                  <div className="mb-2 text-xs text-amber-400">Máy trung bình / Đa số</div>
                  <p className="mb-4 text-xs text-slate-400">Cân bằng tốt nhất giữa tốc độ nhận diện, chất lượng phụ đề và dung lượng bộ nhớ.</p>
                  <div className="text-xs text-slate-500">FFmpeg: <span className="font-semibold text-slate-300">medium · CRF 21</span></div>

                </div>
                <div
                  role="button"
                  tabIndex={0}
                  aria-pressed={String(settingsDraft.engine_mode ?? "balanced") === "high"}
                  onClick={() => selectEngineMode("high")}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") selectEngineMode("high") }}
                  className={cn("cursor-pointer rounded-xl border p-4 transition-colors", String(settingsDraft.engine_mode ?? "balanced") === "high" ? "border-amber-500/50 bg-amber-500/[0.08]" : "border-white/[0.06] bg-white/[0.02] hover:border-white/20")}
                >
                  <div className="flex items-center justify-between gap-2"><div className="text-sm font-semibold text-slate-100">Hiệu năng cao</div>{String(settingsDraft.engine_mode ?? "balanced") === "high" && <span className="text-[10px] font-semibold text-amber-300">Đang chọn</span>}</div>

                  <div className="mb-2 text-xs text-amber-400">Máy khỏe / RAM lớn</div>
                  <p className="mb-4 text-xs text-slate-400">Tận dụng tối đa phần cứng mạnh để đạt chất lượng xử lý âm thanh và phụ đề cao nhất.</p>
                  <div className="text-xs text-slate-500">FFmpeg: <span className="font-semibold text-slate-300">slow · CRF 18</span></div>

                </div>
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-slate-400">ℹ {diagnostics ? `${diagnostics.cpu} · ${diagnostics.ram_gb} GB RAM` : "Đang đọc thông số máy…"}</div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      const [res] = await Promise.all([
                        api.ffmpegCheck().catch(() => null),
                        api.systemDiagnose().then(setDiagnostics).catch(() => null),
                      ])
                      if (res?.ffmpeg && res?.ffprobe) {

                        setEngineStatus("installed")
                        toast({ title: "FFmpeg và FFprobe đã sẵn sàng", description: res.version || "" })

                      } else {
                        setEngineStatus("missing")
                        toast({ title: "FFmpeg chưa tìm thấy", variant: "destructive" })
                      }
                    }}
                  >
                    Kiểm tra lại
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => openExternalUrl("https://ffmpeg.org/download.html")}
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Hướng dẫn FFmpeg
                  </Button>

                </div>
              </div>
            </div>
            <div className="vas-card p-5">
              <h3 className="mb-4 text-base font-semibold text-slate-100">🔧 Công cụ nâng cao</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <div className="mb-1 flex items-center justify-between">
                    <div className="text-sm font-semibold text-slate-100">Nhập video từ nguồn được hỗ trợ</div>
                    <span className={cn("text-xs font-semibold", diagnostics?.yt_dlp_available ? "text-emerald-400" : "text-amber-400")}>
                      {diagnostics ? (diagnostics.yt_dlp_available ? "Sẵn sàng" : "Chưa cài") : "Đang kiểm tra"}
                    </span>

                  </div>
                  <p className="mb-4 text-xs text-slate-400">Công cụ nhập video từ nguồn được hỗ trợ. Chỉ dùng với video bạn sở hữu, quản lý hoặc có giấy phép phù hợp; tuân thủ điều khoản của nền tảng nguồn.</p>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full gap-1.5 text-sm"
                    onClick={() => openExternalUrl("https://github.com/yt-dlp/yt-dlp#installation")}
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Hướng dẫn yt-dlp
                  </Button>

                </div>
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-slate-100">♫ Demucs — tách giọng / nhạc nền</div>
                    <span className={cn("text-xs font-semibold", diagnostics?.demucs_available ? "text-emerald-400" : "text-amber-400")}>
                      {diagnostics ? (diagnostics.demucs_available ? "Sẵn sàng" : "Chưa cài") : "Đang kiểm tra"}
                    </span>
                  </div>
                  <p className="mb-4 text-xs text-slate-400">Tách giọng và nhạc nền thật bằng Demucs. Công cụ cần PyTorch và có thể chiếm nhiều dung lượng.</p>
                  <Button type="button" variant="outline" className="w-full gap-1.5 text-sm" onClick={() => openExternalUrl("https://github.com/facebookresearch/demucs#installation")}>
                    <ExternalLink className="h-3.5 w-3.5" /> Hướng dẫn cài Demucs
                  </Button>

                </div>
              </div>
            </div>
            <div className="vas-card p-5">
              <h3 className="mb-4 text-base font-semibold text-slate-100">Trạng thái công cụ hiện tại</h3>
              <EngineCheckRow />
              {diagnostics && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <DiagnosticItem label="Python" value={diagnostics.python_runtime} ok />
                  <DiagnosticItem label="FFmpeg" value={diagnostics.ffmpeg_version || "Chưa có"} ok={Boolean(diagnostics.ffmpeg_version)} />
                  <DiagnosticItem label="FFprobe" value={diagnostics.ffprobe_version || "Chưa có"} ok={Boolean(diagnostics.ffprobe_version)} />
                  <DiagnosticItem label="Ổ đĩa trống" value={`${diagnostics.disk_free_gb} GB`} ok={diagnostics.disk_free_gb > 2} />
                  <DiagnosticItem label="Thư mục dự án" value={diagnostics.write_permission_projects ? "Có quyền ghi" : "Không ghi được"} ok={diagnostics.write_permission_projects} />
                  <DiagnosticItem label="App data" value={diagnostics.write_permission_app_data ? "Có quyền ghi" : "Không ghi được"} ok={diagnostics.write_permission_app_data} />
                  <DiagnosticItem label="Demucs" value={diagnostics.demucs_available ? "Sẵn sàng" : "Chưa cài"} ok={diagnostics.demucs_available} />
                  <DiagnosticItem label="yt-dlp" value={diagnostics.yt_dlp_available ? "Sẵn sàng" : "Chưa cài"} ok={diagnostics.yt_dlp_available} />
                </div>
              )}
              <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-slate-300">

                💡 FFmpeg được dùng thật cho toàn bộ pipeline: dựng video, lồng tiếng, nhúng phụ đề ASS và xuất H.264/AAC.
              </div>
            </div>
          </div>
        </TabsContent>

        {/* AI Dịch & Ảnh */}
        <TabsContent value="ai">
          <div className="vas-card p-5">
            <h3 className="mb-4 text-base font-semibold text-slate-100">AI Dịch & Ảnh</h3>
<p className="mb-4 text-sm text-slate-500">Nhà cung cấp AI cho kịch bản, dịch thuật và tạo ảnh</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Nhà cung cấp AI (văn bản)</Label>
                <Select
                  value={String(settingsDraft.ai_provider ?? "default")}
                  onValueChange={(v) => { setDirty(true); setSettingsDraft((s) => ({ ...s, ai_provider: v })) }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openrouter">OpenRouter</SelectItem>
                    <SelectItem value="gemini">Gemini</SelectItem>
                    <SelectItem value="default">Mặc định</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Model</Label>
                <Input
                  placeholder="Vd: google/gemini-2.0-flash"
                  value={String(settingsDraft.ai_model ?? "")}
                  onChange={(e) => { setDirty(true); setSettingsDraft((s) => ({ ...s, ai_model: e.target.value })) }}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                                <div className="flex items-center justify-between gap-2">
                  <Label>API Key</Label>
                  <span className={cn("text-xs", Boolean(settings.ai_api_key_set) ? "text-emerald-400" : "text-slate-500")}>
                    {Boolean(settings.ai_api_key_set) ? "Đã có key đã lưu" : "Chưa cấu hình"}
                  </span>
                </div>
                <Input

                  type="password"
                  placeholder="Nhập API key mới (để trống nếu giữ nguyên)"
                  value={String(settingsDraft.ai_api_key ?? "")}
                  onChange={(e) => { setDirty(true); setSettingsDraft((s) => ({ ...s, ai_api_key: e.target.value })) }}
                />
                                <p className="text-xs text-muted-foreground">Key đã lưu không được trả về frontend. Nhập key mới chỉ khi muốn thay thế.</p>

              </div>
            </div>
          </div>
          <div className="mt-6 vas-card p-5">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-100">🖼 Nguồn tạo ảnh AI cho từng cảnh</h3>
            </div>
            <p className="mb-4 text-sm text-slate-500">
              Nguồn tạo ảnh/video chính là <span className="font-medium text-amber-300">UTO Flow (labs.google/fx — Nano Banana 2)</span>,
              tự động gửi prompt của từng cảnh sang Flow, theo dõi tiến trình và tải ảnh/video về đúng scene.
              Gemini chỉ phục vụ viết kịch bản, chia cảnh và tạo prompt. Pollinations.ai là bước cuối khi được bật cho phép.
              Prompt của mỗi ảnh được AI viết theo nội dung TOÀN cảnh (phân cảnh ngữ nghĩa). Khi mọi nguồn thất bại,
              pipeline báo lỗi rõ ràng kèm nguyên nhân — không tự dùng ảnh nền màu.
            </p>
            <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
              <div className="mb-3 flex items-center justify-between">
                <Label className="flex items-center gap-2 text-sm font-medium text-slate-100">
                  <Image className="h-4 w-4 text-emerald-400" /> UTO Flow tạo ảnh/video (nguồn chính)
                </Label>
                <div className="flex items-center gap-2">
                  <Switch checked={Boolean(labsEnabled)} onCheckedChange={toggleLabs} />
                  <span className="text-xs text-slate-500">Bật UTO Flow</span>
                </div>
              </div>
              <p className="mb-3 text-xs text-slate-400">
                Flow tự động nhận prompt từng cảnh → sinh ảnh/video (Nano Banana 2) → theo dõi trạng thái → tải file về đúng scene.
                Yêu cầu đăng nhập Google một lần trên máy này.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={openLabsLogin}>Mở UTO Flow để đăng nhập</Button>
                <Button variant="outline" size="sm" onClick={refreshLabsCheck} className="gap-1">
                  <RefreshCw className="h-3 w-3" /> Kiểm tra lại
                </Button>
                <span className={cn("rounded-md px-2 py-1 text-xs font-medium", labsCheckInfo.can_automate ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300")}>
                  {labsCheckInfo.can_automate ? "✔ UTO Flow sẵn sàng" : "⚠ Chưa đủ điều kiện"}
                </span>
              </div>
            </div>
            <div className="mb-4 rounded-lg border border-white/8 bg-white/[0.02] p-4">
              <div className="mb-3 flex items-center justify-between">
                <Label className="flex items-center gap-2 text-sm font-medium text-slate-100">
                  <KeyRound className="h-4 w-4 text-amber-400" /> API key aistudio.google (Gemini — viết kịch bản, chia cảnh, tạo prompt)
                </Label>
                <div className="flex items-center gap-2">
                  <Switch checked={geminiEnabled} onCheckedChange={(v) => { setGeminiEnabled(v); setTimeout(saveGemini, 0) }} />
                  <span className="text-xs text-slate-500">Dùng Gemini cho phân tích & prompt</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="password"
                  className="min-w-[300px] flex-1"
                  placeholder="Dán API key aistudio.google vào đây…"
                  value={geminiKey}
                  onChange={(e) => { setGeminiKey(e.target.value); setGeminiResult(null) }}
                />
                <Button variant="outline" size="sm" onClick={checkGeminiKey} disabled={geminiChecking} className="gap-1">
                  <RefreshCw className={cn("h-3 w-3", geminiChecking && "animate-spin")} />
                  {geminiChecking ? "Đang kiểm tra…" : "Kiểm tra key"}
                </Button>
                <Button size="sm" onClick={saveGemini} className="gap-1 bg-gradient-to-r from-[#d9940a] to-[#faaa02] text-white">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Lưu
                </Button>
              </div>
              {geminiResult && (
                <p className={cn("mt-2 text-xs", geminiResult.valid ? "text-emerald-400" : "text-rose-400")}>{geminiResult.note}</p>
              )}
              <p className="mt-2 text-xs text-slate-500">
                Lấy key miễn phí tại <a className="text-amber-400 underline" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">aistudio.google.com/apikey</a> — key này chỉ dùng để Gemini viết kịch bản, phân tích chia cảnh và tạo prompt ảnh. Gemini KHÔNG dùng để sinh ảnh/video (nguồn ảnh/video chính là UTO Flow).
              </p>
            </div>
            <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
              <div className="mb-3 flex items-center justify-between">
                <Label className="flex items-center gap-2 text-sm font-medium text-slate-100">
                  <Zap className="h-4 w-4 text-amber-400" /> Flow Connector — Extension Chrome (tự động mở Flow, tạo media, tải file)
                </Label>
                <div className="flex items-center gap-2">
                  <Switch checked={Boolean(connectorEnabled)} onCheckedChange={async (v) => { setConnectorEnabled(v); await saveGemini() }} />
                  <span className="text-xs text-slate-500">Bật Flow Connector</span>
                </div>
              </div>
              <p className="mb-3 text-xs text-slate-400">
                Extension Chrome tự mở Google Flow, tạo project, chọn Image/Video · tỷ lệ · model,
                nhập prompt, bấm tạo, theo dõi tile và tải file THẬT về dự án, gắn đúng từng scene.
                File được xác minh bằng FFprobe trước khi hoàn thành. Cảnh lỗi tự retry riêng, không chạy lại cảnh đã xong.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={openExtGuide} className="gap-1">
                  <ExternalLink className="h-3 w-3" /> Hướng dẫn cài Extension
                </Button>
                <span className={cn("rounded-md px-2 py-1 text-xs font-medium", workerConnected ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300")}>
                  {workerConnected ? "✔ Extension đang kết nối" : "⚠ Chưa thấy Extension"}
                </span>
                <span className="text-xs text-slate-500">Khi bật + extension hoạt động, bấm “Sinh media tự động (Flow Connector)” trong Storyboard</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm text-slate-300">
              <div className="flex items-center gap-2">
                <Switch checked={pollinationsFallback} onCheckedChange={async (v) => { setPollinationsFallback(v); await saveGemini() }} />
                <span>Cho phép Pollinations.ai làm bước cuối</span>
              </div>
            </div>
            <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-slate-300">
              💡 UTO Flow lỗi hoặc chưa đăng nhập Google → pipeline báo lỗi rõ ràng kèm nguyên nhân và cho phép bấm "Thử lại".
              Chỉ khi bật Pollinations làm bước cuối thì mới chuyển sang Pollinations.ai.
            </div>
            <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-slate-300">
              💡 Điều kiện để dùng UTO Flow: (1) Máy có cài Chromium/Chrome, (2) Bạn đã đăng nhập tài khoản Google trên máy này.
              Nút “Mở UTO Flow để đăng nhập” bên trên sẽ mở sẵn trang để bạn đăng nhập một lần.
            </div>
          </div>
        </TabsContent>

        {/* Giọng nói */}
        <TabsContent value="voice">
          <div className="vas-card p-5">
            <h3 className="mb-4 text-base font-semibold text-slate-100">🎙 Chuyển văn bản thành giọng nói</h3>
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Nhà cung cấp mặc định</Label>
                  <Select
                    value={config?.provider}
                    onValueChange={(v) => saveTTS({ provider: v } as Partial<TTSConfig>)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {providers.map((p) => (
                        <SelectItem key={p.id} value={p.id} disabled={!p.available}>
                          {p.name}
                          {!p.available && " (chưa cài)"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Giọng mặc định</Label>
                  <Select
                    value={config?.voice}
                    onValueChange={(v) => saveTTS({ voice: v } as Partial<TTSConfig>)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="— Chọn giọng —" />
                    </SelectTrigger>
                    <SelectContent>
                      {voices.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.name}
                          {v.language ? ` (${v.language})` : ""}
                          {v.gender ? ` · ${v.gender === "female" ? "Nữ" : "Nam"}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Trạng thái</Label>
                  <div className="flex h-9 items-center gap-2 rounded-md border bg-card px-3 text-xs">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <span>● Sẵn sàng</span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="ml-auto h-7 gap-1 text-xs"
                      disabled={testingConn}
                      onClick={testConnection}
                    >
                      <RefreshCw className={cn("h-3 w-3", testingConn && "animate-spin")} />
                      Test kết nối
                    </Button>
                  </div>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Provider mặc định áp dụng cho video mới. Mỗi video có thể chọn provider riêng ở trang dự án.
              </p>

              <div className="rounded-md border bg-background p-4">
                <div className="mb-3 flex items-center justify-between">
                  <Label className="text-sm font-bold">Nghe thử</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={previewing}
                    onClick={preview}
                  >
                    <Play className="h-3.5 w-3.5" />
                    {previewing ? "Đang tạo..." : "▶ Nghe thử"}
                  </Button>
                </div>
                <Textarea
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value)}
                  rows={3}
                  className="mb-3"
                />
                {previewUrl && (
                  <div className="space-y-2">
                    <audio ref={audioRef} src={previewUrl} controls className="w-full" />
                  </div>
                )}
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <Label>Tốc độ</Label>
                      <span className="text-muted-foreground">{config?.speed.toFixed(2)}x</span>
                    </div>
                    <Slider
                      min={0.5}
                      max={2}
                      step={0.05}
                      value={[config?.speed ?? 1]}
                      onValueChange={([v]) => saveTTS({ speed: v } as Partial<TTSConfig>)}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <Label>Âm lượng</Label>
                      <span className="text-muted-foreground">{Math.round((config?.volume ?? 1) * 100)}%</span>
                    </div>
                    <Slider
                      min={0}
                      max={1}
                      step={0.05}
                      value={[config?.volume ?? 1]}
                      onValueChange={([v]) => saveTTS({ volume: v } as Partial<TTSConfig>)}
                    />
                  </div>
                </div>
              </div>

              {/* Voice list */}
              <div>
                <h3 className="mb-2 text-sm font-bold">Danh sách giọng</h3>
                <div className="space-y-1.5">
                  {voices.length === 0 ? (
                    <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                      Chưa tải được danh sách giọng từ provider.
                    </div>
                  ) : (
                    voices.map((v) => (
                      <div
                        key={v.id}
                        className={cn(
                          "flex items-center justify-between rounded-md border px-3 py-2",
                          config?.voice === v.id && "border-primary/60 bg-primary/10",
                        )}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            {v.name}
                            {config?.voice === v.id && (
                              <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                                MẶC ĐỊNH ✓
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {[v.language, v.gender === "female" ? "Nữ" : v.gender === "male" ? "Nam" : null]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs"
                          onClick={() => saveTTS({ voice: v.id } as Partial<TTSConfig>)}
                        >
                          Dùng giọng này
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Telegram */}
        <TabsContent value="telegram">
          <div className="vas-card p-5">
            <h3 className="mb-4 text-base font-semibold text-slate-100">✈ Telegram</h3>
<p className="mb-4 text-sm text-slate-500">Nhận thông báo và duyệt video qua Telegram</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Bot Token</Label>
                <Input
                  type="password"
                  placeholder="123456789:ABCDEF..."
                  value={String(settingsDraft.telegram_bot_token ?? "")}
                  onChange={(e) => { setDirty(true); setSettingsDraft((s) => ({ ...s, telegram_bot_token: e.target.value })) }}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Chat ID</Label>
                <Input
                  placeholder="123456789"
                  value={String(settingsDraft.telegram_chat_id ?? "")}
                  onChange={(e) => { setDirty(true); setSettingsDraft((s) => ({ ...s, telegram_chat_id: e.target.value })) }}
                />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3 sm:col-span-2">
                <div>
                  <div className="text-sm font-medium">Bật thông báo Telegram</div>
                  <div className="text-xs text-muted-foreground">Gửi trạng thái render và yêu cầu duyệt qua bot</div>
                </div>
                <Switch
                  checked={Boolean(settingsDraft.telegram_enabled)}
                  onCheckedChange={(v) => { setDirty(true); setSettingsDraft((s) => ({ ...s, telegram_enabled: v })) }}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
                <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={telegramTesting || telegramSending} onClick={() => void testTelegram(false)}>
                  <ShieldCheck className={cn("h-3.5 w-3.5", telegramTesting && "animate-pulse")} />
                  {telegramTesting ? "Đang kiểm tra…" : "Kiểm tra bot"}
                </Button>
                <Button type="button" size="sm" className="gap-1.5 bg-gradient-to-r from-[#d9940a] to-[#faaa02] text-white" disabled={telegramTesting || telegramSending} onClick={() => void testTelegram(true)}>
                  <Send className={cn("h-3.5 w-3.5", telegramSending && "animate-pulse")} />
                  {telegramSending ? "Đang gửi…" : "Gửi tin nhắn thử"}
                </Button>
                <span className={cn("text-xs", Boolean(settings.telegram_configured) ? "text-emerald-400" : "text-slate-500")}>
                  {Boolean(settings.telegram_configured) ? "Đã lưu cấu hình Telegram" : "Chưa có cấu hình đã lưu"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-2">Kiểm tra bot chỉ gọi Telegram getMe; nút gửi tin nhắn thử là thao tác gửi thật đến Chat ID đã nhập.</p>
            </div>
          </div>

        </TabsContent>

        {/* Đăng bài & Lập lịch */}
        <TabsContent value="publish">
          <div className="vas-card p-5">
            <h3 className="mb-4 text-base font-semibold text-slate-100">▶ Đăng bài & Lập lịch</h3>
            <p className="mb-4 flex items-center gap-1 text-sm text-slate-500">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
              Đang phát triển — tính năng sẽ có trong bản cập nhật tới
            </p>
            <div>
              <div className="rounded-lg border border-white/[0.06] border-dashed p-8 text-center text-sm text-slate-500">
                Lên lịch tự động đăng video theo giờ đề xuất của từng kênh.
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Hiệu năng */}
        <TabsContent value="performance">
          <div className="vas-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-100">⚡ Hiệu năng hệ thống</h3>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-slate-400 hover:text-slate-200"
                onClick={() => api.systemStats().then(setSysStats).catch(() => {})}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Làm mới
              </Button>
            </div>
            <p className="mb-4 text-sm text-slate-500">Trạng thái tài nguyên máy tính (cập nhật thực tế)</p>
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-md border p-4">
                  <div className="text-xs text-muted-foreground">CPU</div>
                  <div className="text-2xl font-bold">
                    {sysStats ? `${sysStats.cpu_percent.toFixed(1)}%` : "—"}
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-primary transition-all"
                      style={{ width: sysStats ? `${Math.min(sysStats.cpu_percent, 100)}%` : "0%" }}
                    />
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {sysStats ? `${sysStats.cpu_percent.toFixed(1)}% sử dụng` : "Đang tải..."}
                  </div>
                </div>
                {/* RAM */}
                <div className="rounded-md border p-4">
                  <div className="text-xs text-muted-foreground">RAM</div>
                  <div className="text-2xl font-bold">
                    {sysStats ? `${sysStats.ram_total_gb} GB` : "—"}
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-primary transition-all"
                      style={{ width: sysStats ? `${Math.min(sysStats.ram_percent, 100)}%` : "0%" }}
                    />
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {sysStats ? `${sysStats.ram_percent.toFixed(1)}% sử dụng` : "Đang tải..."}
                  </div>
                </div>
                {/* Disk */}
                <div className="rounded-md border p-4">
                  <div className="text-xs text-muted-foreground">Disk trống</div>
                  <div className="text-2xl font-bold">
                    {sysStats ? `${sysStats.disk_free_gb} GB` : "—"}
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {sysStats
                      ? sysStats.ffmpeg_ok
                        ? "✔ FFmpeg sẵn sàng"
                        : "⚠ FFmpeg chưa cài"
                      : ""}
                  </div>
                </div>
              </div>
              <div className="vas-card p-5">
                <h3 className="mb-4 text-base font-semibold text-slate-100">Trạng thái dịch vụ</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span>Sidecar Engine</span>
                    <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-400">Đang chạy (OK)</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Tăng tốc GPU</span>
                    <span className="rounded bg-amber-500/20 px-2 py-0.5 text-xs text-amber-400">Chỉ dùng CPU</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Hàng đợi</span>
                    <span className={cn(
                      "rounded px-2 py-0.5 text-xs",
                      sysStats && sysStats.active_jobs > 0
                        ? "bg-amber-500/20 text-amber-400"
                        : "bg-blue-500/20 text-blue-400",
                    )}>
                      {sysStats
                        ? sysStats.active_jobs > 0
                          ? `Đang xử lý ${sysStats.active_jobs} job`
                          : "Đang rảnh"
                        : "Đang tải..."}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>FFmpeg</span>
                    <span className={cn(
                      "rounded px-2 py-0.5 text-xs",
                      sysStats?.ffmpeg_ok
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-rose-500/20 text-rose-400",
                    )}>
                      {sysStats ? (sysStats.ffmpeg_ok ? "Đã cài" : "Chưa cài") : "—"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}



function EngineCheckRow() {
  const [check, setCheck] = useState<{ ffmpeg: boolean; ffprobe: boolean; guide?: string } | null>(null)

  useEffect(() => {
    api.ffmpegCheck().then(setCheck).catch(() => {})
  }, [])

  if (!check) return <div className="animate-pulse rounded-md bg-muted p-4" />

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <ToolStatus name="FFmpeg" ok={check.ffmpeg} />
      <ToolStatus name="FFprobe" ok={check.ffprobe} />
      {check.guide && !check.ffmpeg && (
        <p className="text-xs text-muted-foreground sm:col-span-2">{check.guide}</p>
      )}
      {check.ffmpeg && (
        <p className="text-xs text-slate-400 sm:col-span-2">💡 FFmpeg được dùng thật cho toàn bộ pipeline: dựng video, lồng tiếng, nhúng phụ đề ASS và xuất H.264/AAC.</p>
      )}
    </div>
  )
}

function DiagnosticItem({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="rounded-md border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 flex items-center gap-1.5 text-xs font-medium text-slate-200">
        <span className={cn("h-1.5 w-1.5 rounded-full", ok ? "bg-emerald-400" : "bg-amber-400")} />
        <span className="truncate" title={value}>{value}</span>
      </div>
    </div>
  )
}

function ToolStatus({ name, ok }: { name: string; ok: boolean }) {

  return (
    <div className="flex items-center gap-3 rounded-md border p-3">
      {ok ? (
        <CheckCircle2 className="h-5 w-5 text-emerald-400" />
      ) : (
        <AlertTriangle className="h-5 w-5 text-destructive" />
      )}
      <div>
        <div className="text-sm font-medium">{name}</div>
        <div className={ok ? "text-xs text-emerald-300" : "text-xs text-destructive"}>
          {ok ? "● Đã cài đặt" : "● Chưa cài đặt"}
        </div>
      </div>
    </div>
  )
}
