import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  Settings as SettingsIcon, Play, RefreshCw, AlertTriangle, CheckCircle2,
  KeyRound, Image, Zap, ExternalLink, FolderOpen, Folder, Send, ShieldCheck,
  Globe, Bot, Sparkles, MessageSquare, Eye, EyeOff, LogOut, Chrome, Check,
  Moon, Sun, ArrowRight
} from "lucide-react"
import { api, openExternalUrl, selectDirectory, openAiBrowser, getAiBrowserStatus, logoutAiBrowser, mediaUrl, startFlowBrowser, logoutFlowBrowser } from "@/services/api"

import { flowApi, globalApi, type FlowConnectionRead } from "@/services/pages-api"

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
  const navigate = useNavigate()
  const [config, setConfig] = useState<TTSConfig | null>(null)
  const [providers, setProviders] = useState<Array<{ id: string; name: string; available: boolean }>>([])
  const [voices, setVoices] = useState<TTSVoice[]>([])
  const [loading, setLoading] = useState(true)
  const [testingConn, setTestingConn] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [customText, setCustomText] = useState(SAMPLE_TEXT_VI)
  const [dirty, setDirty] = useState(false)

  // AI Dịch & SEO state
  const [aiTranslationProvider, setAiTranslationProvider] = useState<"deepseek" | "chatgpt" | "gemini">("chatgpt")
  const [chatgptStatus, setChatgptStatus] = useState<{ connected: boolean; email?: string; plan?: string; browserRunning?: boolean }>({ connected: false })
  const [geminiStatus, setGeminiStatus] = useState<{ connected: boolean; email?: string; model?: string; browserRunning?: boolean }>({ connected: false })
  const [geminiModelTier, setGeminiModelTier] = useState<string>("3.5 Flash")
  const [deepseekKey, setDeepseekKey] = useState<string>("")
  const [showDeepseekKey, setShowDeepseekKey] = useState(false)
  const [deepseekTesting, setDeepseekTesting] = useState(false)
  const [deepseekResult, setDeepseekResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [chatgptLoading, setChatgptLoading] = useState(false)
  const [geminiLoading, setGeminiLoading] = useState(false)

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
  const [flowConnection, setFlowConnection] = useState<FlowConnectionRead | null>(null)
  const [flowAccountLoading, setFlowAccountLoading] = useState(false)
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
  const pollingRef = useRef<Record<string, ReturnType<typeof setInterval>>>({})

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
      if (set) {
        if (set.ai_translation_provider) setAiTranslationProvider(set.ai_translation_provider as "deepseek" | "chatgpt" | "gemini")
        if (set.gemini_model) setGeminiModelTier(String(set.gemini_model))
        if (set.deepseek_api_key) setDeepseekKey(String(set.deepseek_api_key))
      }
      getAiBrowserStatus("chatgpt").then(setChatgptStatus).catch(() => {})
      getAiBrowserStatus("gemini").then(setGeminiStatus).catch(() => {})
      if (cfg && !cfg.voice && vs.length > 0) {
        saveTTS({ voice: vs[0].id } as Partial<TTSConfig>)
      }
    } catch (e) {
      toast({ title: "Không tải được cài đặt", description: String(e), variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

    const refreshFlowConnection = async () => {
    try {
      setFlowConnection(await flowApi.get())
    } catch {
      setFlowConnection(null)
    }
  }

  useEffect(() => {
    void refreshFlowConnection()
    const timer = window.setInterval(() => void refreshFlowConnection(), 2500)
    return () => window.clearInterval(timer)
  }, [])

  const openFlowAccount = async () => {
    setFlowAccountLoading(true)
    try {
      const result = await startFlowBrowser(0, "account-profile")
      if (!result.ok) throw new Error(result.message)
      toast({ title: "Đã mở Chrome Profile riêng", description: "Đăng nhập Google Flow trong cửa sổ vừa mở. App sẽ tự kiểm tra và cập nhật nút thành Đăng xuất." })
      await refreshFlowConnection()
    } catch (error) {
      toast({ title: "Không thể mở Chrome Flow", description: String(error), variant: "destructive" })
    } finally {
      setFlowAccountLoading(false)
    }
  }

  const logoutFlowAccount = async () => {
    if (!window.confirm("Đăng xuất Google Flow và xóa Chrome Profile riêng?")) return
    setFlowAccountLoading(true)
    try {
      const result = await logoutFlowBrowser()
      if (!result.ok) throw new Error(result.message)
      setFlowConnection(null)
      toast({ title: "Đã đăng xuất Google Flow", description: result.message })
    } catch (error) {
      toast({ title: "Không thể đăng xuất Google Flow", description: String(error), variant: "destructive" })
    } finally {
      setFlowAccountLoading(false)
      await refreshFlowConnection()
    }
  }

  const flowLoggedIn = flowConnection?.status === "paired" && Boolean(flowConnection.google_account || flowConnection.factory_state === "ready" || flowConnection.factory_state === "processing")

  const handleOpenAiBrowser = async (provider: "chatgpt" | "gemini") => {

    if (provider === "chatgpt") setChatgptLoading(true)
    else setGeminiLoading(true)

    try {
      const res = await openAiBrowser(provider)
      if (!res.ok) {
        if (provider === "chatgpt") setChatgptLoading(false)
        else setGeminiLoading(false)
        toast({
          title: "Không thể mở trình duyệt",
          description: res.message,
          variant: "destructive",
        })
        return
      }
      toast({
        title: "Đã mở Chrome/Edge profile riêng",
        description: res.message || "Vui lòng đăng nhập tài khoản trên cửa sổ vừa mở.",
      })
    } catch (e) {
      if (provider === "chatgpt") setChatgptLoading(false)
      else setGeminiLoading(false)
      toast({ title: "Lỗi mở trình duyệt", description: String(e), variant: "destructive" })
      return
    }

    // Keep loading state until either:
    // 1. User logs in (status.connected -> true)
    // 2. User closes Chrome without logging in (status.browserRunning -> false)
    // 3. Timeout (3 mins)
    if (pollingRef.current[provider]) {
      clearInterval(pollingRef.current[provider])
    }
    const deadline = Date.now() + 180_000
    pollingRef.current[provider] = setInterval(async () => {
      if (Date.now() > deadline) {
        if (pollingRef.current[provider]) {
          clearInterval(pollingRef.current[provider])
          delete pollingRef.current[provider]
        }
        if (provider === "chatgpt") setChatgptLoading(false)
        else setGeminiLoading(false)
        return
      }
      try {
        const status = await getAiBrowserStatus(provider)
        if (status.connected) {
          if (pollingRef.current[provider]) {
            clearInterval(pollingRef.current[provider])
            delete pollingRef.current[provider]
          }
          if (provider === "chatgpt") {
            setChatgptStatus(status)
            setChatgptLoading(false)
            toast({ title: "Đã kết nối ChatGPT", description: status.email ? `Tài khoản: ${status.email}` : "Đã đăng nhập thành công" })
          } else {
            setGeminiStatus(status)
            setGeminiLoading(false)
            toast({ title: "Đã kết nối Gemini (Google)", description: status.email ? `Tài khoản: ${status.email}` : "Đã đăng nhập thành công" })
          }
        } else if (status.browserRunning === false) {
          // Chrome profile window was closed by user without logging in
          if (pollingRef.current[provider]) {
            clearInterval(pollingRef.current[provider])
            delete pollingRef.current[provider]
          }
          if (provider === "chatgpt") setChatgptLoading(false)
          else setGeminiLoading(false)
        }
      } catch {
        // Polling error ignored
      }
    }, 1500)
  }

  const handleRefreshAiStatus = async (provider: "chatgpt" | "gemini") => {
    if (provider === "chatgpt") setChatgptLoading(true)
    else setGeminiLoading(true)
    try {
      const status = await getAiBrowserStatus(provider)
      if (provider === "chatgpt") {
        setChatgptStatus(status)
        toast({ title: status.connected ? "ChatGPT đã kết nối" : "Chưa phát hiện đăng nhập ChatGPT", description: status.email || status.message })
      } else {
        setGeminiStatus(status)
        toast({ title: status.connected ? "Gemini đã kết nối" : "Chưa phát hiện đăng nhập Gemini", description: status.email || status.message })
      }
    } catch (e) {
      toast({ title: "Lỗi kiểm tra", description: String(e), variant: "destructive" })
    } finally {
      if (provider === "chatgpt") setChatgptLoading(false)
      else setGeminiLoading(false)
    }
  }

  const handleLogoutAiBrowser = async (provider: "chatgpt" | "gemini") => {
    if (pollingRef.current[provider]) {
      clearInterval(pollingRef.current[provider])
      delete pollingRef.current[provider]
    }
    if (provider === "chatgpt") setChatgptLoading(false)
    else setGeminiLoading(false)
    try {
      const res = await logoutAiBrowser(provider)
      if (provider === "chatgpt") {
        setChatgptStatus({ connected: false, browserRunning: false })
      } else {
        setGeminiStatus({ connected: false, browserRunning: false })
      }
      toast({ title: "Đã đăng xuất", description: res.message })
    } catch (e) {
      toast({ title: "Lỗi đăng xuất", description: String(e), variant: "destructive" })
    }
  }

  const handleTestDeepSeek = async () => {
    setDeepseekTesting(true)
    setDeepseekResult(null)
    try {
      const res = await api.settingsDeepSeekTest({ api_key: deepseekKey })
      setDeepseekResult(res)
      toast({
        title: res.ok ? "Kết nối DeepSeek thành công" : "Kiểm tra thất bại",
        description: res.message,
        variant: res.ok ? "default" : "destructive",
      })
    } catch (e) {
      const msg = String(e)
      setDeepseekResult({ ok: false, message: msg })
      toast({ title: "Lỗi kết nối DeepSeek", description: msg, variant: "destructive" })
    } finally {
      setDeepseekTesting(false)
    }
  }

  const handleSaveDeepSeek = async () => {
    try {
      await api.settingsSave({ deepseek_api_key: deepseekKey })
      setDirty(false)
      toast({ title: "Đã lưu DeepSeek API key" })
    } catch (e) {
      toast({ title: "Lỗi khi lưu key", description: String(e), variant: "destructive" })
    }
  }

  const handleSelectAiTranslationProvider = async (provider: "deepseek" | "chatgpt" | "gemini") => {
    setAiTranslationProvider(provider)
    setSettingsDraft((s) => ({ ...s, ai_translation_provider: provider }))
    try {
      await api.settingsSave({ ai_translation_provider: provider })
      toast({ title: "Đã đổi nhà cung cấp Dịch / SEO", description: provider === "deepseek" ? "DeepSeek (API key)" : provider === "chatgpt" ? "ChatGPT (tài khoản)" : "Gemini (tài khoản)" })
    } catch {
      // Ignored
    }
  }

  const handleSelectGeminiModel = async (model: string) => {
    setGeminiModelTier(model)
    setSettingsDraft((s) => ({ ...s, gemini_model: model }))
    try {
      await api.settingsSave({ gemini_model: model })
      toast({ title: `Đã chọn model Gemini: ${model}` })
    } catch {
      // Ignored
    }
  }

  useEffect(() => {
    loadAll()
    const autoStatusInterval = setInterval(() => {
      getAiBrowserStatus("chatgpt")
        .then((s) => {
          setChatgptStatus(s)
        })
        .catch(() => {})
      getAiBrowserStatus("gemini")
        .then((s) => {
          setGeminiStatus(s)
        })
        .catch(() => {})
    }, 3000)

    return () => {
      clearInterval(autoStatusInterval)
      Object.values(pollingRef.current).forEach((timer) => clearInterval(timer))
    }
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
    toast({ title: "Đã chọn thư mục output", description: folder })
  }

  const openCurrentOutputFolder = async () => {
    const folder = String(settingsDraft.output_folder || "")
    if (!folder) {
      toast({ title: "Chưa cấu hình thư mục output", description: "Vui lòng chọn thư mục trước.", variant: "destructive" })
      return
    }
    try {
      const w = window as unknown as { electronAPI?: { openPath?: (target: string) => Promise<boolean> } }
      if (w.electronAPI?.openPath) {
        await w.electronAPI.openPath(folder)
      } else {
        openExternalUrl(`file:///${folder.replace(/\\/g, "/")}`)
      }
      toast({ title: "Đã mở thư mục", description: folder })
    } catch (e) {
      toast({ title: "Không thể mở thư mục", description: String(e), variant: "destructive" })
    }
  }

  const handleToggleDarkMode = (enabled: boolean) => {
    setDirty(true)
    setSettingsDraft((s) => ({ ...s, dark_mode: enabled }))
    if (enabled) {
      document.documentElement.classList.add("dark")
      localStorage.setItem("vas.theme", "dark")
    } else {
      document.documentElement.classList.remove("dark")
      localStorage.setItem("vas.theme", "light")
    }
    toast({
      title: enabled ? "Đã bật Chế độ tối" : "Đã tắt Chế độ tối (Chuyển sang Chế độ sáng)",
    })
  }

  const handleToggleAutoRefresh = (enabled: boolean) => {
    setDirty(true)
    setSettingsDraft((s) => ({ ...s, auto_refresh: enabled }))
    localStorage.setItem("vas.auto_refresh", enabled ? "1" : "0")
    toast({
      title: enabled ? "Đã bật tự động cập nhật hàng đợi" : "Đã tắt tự động cập nhật",
    })
  }

  const handleDisplayLanguage = (v: string) => {
    setDirty(true)
    setSettingsDraft((s) => ({ ...s, display_language: v }))
    localStorage.setItem("vas.lang", v)
    document.documentElement.lang = v
    toast({
      title: `Đã chọn ngôn ngữ giao diện: ${v === "vi" ? "Tiếng Việt" : "English"}`,
    })
  }

  const selectEngineMode = (mode: string) => {
    setDirty(true)
    setSettingsDraft((current) => ({ ...current, engine_mode: mode }))
    const labels: Record<string, string> = {
      basic: "Cơ bản (veryfast · CRF 24)",
      balanced: "Cân bằng (medium · CRF 21)",
      high: "Hiệu năng cao (slow · CRF 18)",
    }
    toast({ title: "Đã chọn cấu hình Engine", description: labels[mode] || mode })
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
      const res = await api.ttsPreview(customText, {
        provider: config.provider,
        voice: config.voice,
        speed: config.speed,
        volume: config.volume,
      })
      if (res.audio_path) {
        setPreviewUrl(mediaUrl(res.audio_path))
        setTimeout(() => audioRef.current?.play(), 100)
        toast({ title: "Đã tạo âm thanh mẫu thành công" })
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
      toast({ title: "Đã lưu cài đặt thành công" })
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
                  onValueChange={handleDisplayLanguage}
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
                  <div className="flex items-center gap-2">
                    {Boolean(settingsDraft.output_folder) && (
                      <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={openCurrentOutputFolder} title="Mở thư mục trên máy">
                        <Folder className="h-3.5 w-3.5" /> Mở thư mục
                      </Button>
                    )}
                    <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={chooseOutputFolder}>
                      <FolderOpen className="h-3.5 w-3.5" /> Chọn thư mục
                    </Button>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <div className="text-sm font-medium">Tự động cập nhật danh sách việc</div>
                  <div className="text-xs text-muted-foreground">Tự làm mới hàng đợi mỗi 5 giây</div>
                </div>
                <Switch
                  checked={Boolean(settingsDraft.auto_refresh)}
                  onCheckedChange={handleToggleAutoRefresh}
                />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div className="space-y-0.5">
                  <div className="text-sm font-medium flex items-center gap-1.5">
                    {Boolean(settingsDraft.dark_mode ?? true) ? <Moon className="h-4 w-4 text-amber-400" /> : <Sun className="h-4 w-4 text-amber-500" />}
                    Chế độ tối
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {Boolean(settingsDraft.dark_mode ?? true) ? "Luôn dùng giao diện tối" : "Đang dùng giao diện sáng"}
                  </div>
                </div>
                <Switch
                  checked={Boolean(settingsDraft.dark_mode ?? true)}
                  onCheckedChange={handleToggleDarkMode}
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
                <TabsContent value="ai" className="space-y-6">
          <div className="rounded-xl border border-indigo-400/20 bg-[#111a2d] p-5 shadow-xl">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-200">
                  <Chrome className="h-4 w-4 text-indigo-300" /> TÀI KHOẢN GOOGLE FLOW
                </div>
                <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-400">
                  {flowLoggedIn
                    ? `Đã đăng nhập${flowConnection?.google_account ? `: ${flowConnection.google_account}` : ""}. Chrome Profile riêng và Flow Connector đang sẵn sàng.`
                    : "Chưa thêm tài khoản nào. Bấm mở Chrome Profile riêng để đăng nhập Google Flow; app sẽ tự kiểm tra trạng thái."}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn("h-2 w-2 rounded-full", flowLoggedIn ? "bg-emerald-400" : "bg-amber-400")} />
                <span className="text-xs text-slate-400">{flowLoggedIn ? "Đã đăng nhập" : "Chưa đăng nhập"}</span>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button
                type="button"
                size="sm"
                disabled={flowAccountLoading}
                onClick={() => void (flowLoggedIn ? logoutFlowAccount() : openFlowAccount())}
                className={flowLoggedIn ? "gap-1.5 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25" : "gap-1.5 bg-indigo-500 text-white hover:bg-indigo-400"}
              >
                {flowLoggedIn ? <LogOut className="h-3.5 w-3.5" /> : <Chrome className="h-3.5 w-3.5" />}
                {flowAccountLoading ? "Đang xử lý…" : flowLoggedIn ? "Đăng xuất" : "Mở Chrome Profile riêng"}
              </Button>
              {flowConnection?.profile_name && <span className="text-[11px] text-slate-500">Profile: {flowConnection.profile_name}</span>}
            </div>
            <p className="mt-3 text-[11px] text-slate-500">Quản lý đầy đủ ở đây: bật/tắt, xóa, sắp thứ tự tài khoản trong Cấu hình → Tài khoản Google Flow.</p>
          </div>

          {/* Card 1: Dịch & SEO (AI) */}

          <div className="vas-card p-6 border border-white/10 bg-[#0d1527] rounded-xl shadow-xl space-y-6">
            <div>
              <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <Globe className="h-5 w-5 text-indigo-400" />
                Dịch & SEO (AI)
              </h3>
              <p className="mt-1 text-sm text-slate-400">
                Nhà cung cấp dịch / SEO
              </p>
            </div>

            {/* 3 Provider Options */}
            <div className="grid gap-3 sm:grid-cols-3">
              {/* Option 1: DeepSeek */}
              <button
                type="button"
                onClick={() => handleSelectAiTranslationProvider("deepseek")}
                className={cn(
                  "flex flex-col items-start p-4 rounded-xl border text-left transition-all relative",
                  aiTranslationProvider === "deepseek"
                    ? "border-purple-500 bg-purple-500/10 ring-1 ring-purple-500/40 shadow-sm"
                    : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
                )}
              >
                <div className="flex items-center justify-between w-full mb-1.5">
                  <div className="flex items-center gap-2 font-medium text-slate-100">
                    <Bot className="h-4 w-4 text-purple-400" />
                    <span>DeepSeek (API key)</span>
                  </div>
                  {aiTranslationProvider === "deepseek" && (
                    <div className="h-2 w-2 rounded-full bg-purple-400" />
                  )}
                </div>
                <p className="text-xs text-slate-400">
                  Ổn định, tính phí theo API key.
                </p>
              </button>

              {/* Option 2: ChatGPT */}
              <button
                type="button"
                onClick={() => handleSelectAiTranslationProvider("chatgpt")}
                className={cn(
                  "flex flex-col items-start p-4 rounded-xl border text-left transition-all relative",
                  aiTranslationProvider === "chatgpt"
                    ? "border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500/40 shadow-sm"
                    : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
                )}
              >
                <div className="flex items-center justify-between w-full mb-1.5">
                  <div className="flex items-center gap-2 font-medium text-slate-100">
                    <MessageSquare className="h-4 w-4 text-emerald-400" />
                    <span>ChatGPT (tài khoản)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {chatgptStatus.connected && (
                      <span className="flex h-2 w-2 rounded-full bg-emerald-400" title="Đã kết nối" />
                    )}
                    {aiTranslationProvider === "chatgpt" && (
                      <div className="h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-emerald-400/40" />
                    )}
                  </div>
                </div>
                <p className="text-xs text-slate-400">
                  Dùng gói đã đăng ký, không cần API key.
                </p>
              </button>

              {/* Option 3: Gemini */}
              <button
                type="button"
                onClick={() => handleSelectAiTranslationProvider("gemini")}
                className={cn(
                  "flex flex-col items-start p-4 rounded-xl border text-left transition-all relative",
                  aiTranslationProvider === "gemini"
                    ? "border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500/40 shadow-sm"
                    : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
                )}
              >
                <div className="flex items-center justify-between w-full mb-1.5">
                  <div className="flex items-center gap-2 font-medium text-slate-100">
                    <Sparkles className="h-4 w-4 text-indigo-400" />
                    <span>Gemini (tài khoản)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {geminiStatus.connected && (
                      <span className="flex h-2 w-2 rounded-full bg-emerald-400" title="Đã kết nối" />
                    )}
                    {aiTranslationProvider === "gemini" && (
                      <div className="h-2 w-2 rounded-full bg-indigo-400 ring-2 ring-indigo-400/40" />
                    )}
                  </div>
                </div>
                <p className="text-xs text-slate-400">
                  Đăng nhập Google, không cần API key.
                </p>
              </button>
            </div>

            {/* Section: Tài khoản ChatGPT */}
            <div className="rounded-xl border border-white/10 bg-black/20 p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-emerald-400" />
                    Tài khoản ChatGPT
                  </h4>
                  {chatgptStatus.connected ? (
                    <div className="flex items-center gap-2 text-xs text-emerald-300">
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      <span>Đã kết nối: <strong className="font-semibold text-slate-100">{chatgptStatus.email || "Tài khoản ChatGPT"}</strong></span>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400">
                      Chưa đăng nhập — mở Chrome/Edge để đăng nhập tài khoản OpenAI / ChatGPT.
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {chatgptStatus.connected ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenAiBrowser("chatgpt")}
                        disabled={chatgptLoading}
                        className="gap-1 text-xs border-white/15 hover:bg-white/10"
                      >
                        <Chrome className="h-3.5 w-3.5 text-slate-300" />
                        Mở trình duyệt
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleLogoutAiBrowser("chatgpt")}
                        className="gap-1 text-xs bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/30"
                      >
                        <LogOut className="h-3.5 w-3.5" />
                        Đăng xuất
                      </Button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => handleOpenAiBrowser("chatgpt")}
                        disabled={chatgptLoading}
                        className={cn(
                          "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-white shadow-md transition-all",
                          "bg-[#d9822b] hover:bg-[#c47220] active:scale-[0.98] cursor-pointer",
                          chatgptLoading && "opacity-80 cursor-wait"
                        )}
                      >
                        <Chrome className={cn("h-4 w-4 shrink-0", chatgptLoading && "animate-spin")} />
                        <span>{chatgptLoading ? "Đang chờ đăng nhập…" : "Đăng nhập bằng Chrome/Edge"}</span>
                      </button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRefreshAiStatus("chatgpt")}
                        disabled={chatgptLoading}
                        className="h-8 w-8 p-0 text-xs border-white/15 hover:bg-white/10"
                        title="Kiểm tra lại trạng thái đăng nhập"
                      >
                        <RefreshCw className={cn("h-3.5 w-3.5", chatgptLoading && "animate-spin")} />
                      </Button>
                    </>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200/90 leading-relaxed flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <span>
                  ⚠️ Dùng endpoint nội bộ không chính thức của ChatGPT: có thể gián đoạn khi OpenAI thay đổi, và có rủi ro với tài khoản. Gói Free bị giới hạn rất nặng — nên dùng gói trả phí (Plus/Pro).
                </span>
              </div>
            </div>

            {/* Section: Tài khoản Gemini (Google) */}
            <div className="rounded-xl border border-white/10 bg-black/20 p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-indigo-400" />
                    Tài khoản Gemini (Google)
                  </h4>
                  {geminiStatus.connected ? (
                    <div className="flex items-center gap-2 text-xs text-emerald-300">
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      <span>Đã kết nối: <strong className="font-semibold text-slate-100">{geminiStatus.email || "Tài khoản Google"}</strong></span>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400">
                      Chưa đăng nhập — mở Chrome/Edge để đăng nhập tài khoản Google.
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {geminiStatus.connected ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenAiBrowser("gemini")}
                        disabled={geminiLoading}
                        className="gap-1 text-xs border-white/15 hover:bg-white/10"
                      >
                        <Chrome className="h-3.5 w-3.5 text-slate-300" />
                        Mở trình duyệt
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleLogoutAiBrowser("gemini")}
                        className="gap-1 text-xs bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/30"
                      >
                        <LogOut className="h-3.5 w-3.5" />
                        Đăng xuất
                      </Button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => handleOpenAiBrowser("gemini")}
                        disabled={geminiLoading}
                        className={cn(
                          "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-white shadow-md transition-all",
                          "bg-[#d9822b] hover:bg-[#c47220] active:scale-[0.98] cursor-pointer",
                          geminiLoading && "opacity-80 cursor-wait"
                        )}
                      >
                        <Chrome className={cn("h-4 w-4 shrink-0", geminiLoading && "animate-spin")} />
                        <span>{geminiLoading ? "Đang chờ đăng nhập…" : "Đăng nhập bằng Chrome/Edge"}</span>
                      </button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRefreshAiStatus("gemini")}
                        disabled={geminiLoading}
                        className="h-8 w-8 p-0 text-xs border-white/15 hover:bg-white/10"
                        title="Kiểm tra lại trạng thái đăng nhập"
                      >
                        <RefreshCw className={cn("h-3.5 w-3.5", geminiLoading && "animate-spin")} />
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Model Gemini Selector */}
              <div className="space-y-2 pt-1 border-t border-white/5">
                <Label className="text-xs font-medium text-slate-300">Model Gemini</Label>
                <div className="grid gap-2.5 sm:grid-cols-3">
                  {[
                    { id: "3.1 Flash-Lite", label: "3.1 Flash-Lite", desc: "Nhanh nhất." },
                    { id: "3.5 Flash", label: "3.5 Flash", desc: "Mặc định, toàn diện." },
                    { id: "3.1 Pro", label: "3.1 Pro", desc: "Chất lượng cao, chậm hơn." },
                  ].map((m) => {
                    const isSelected = geminiModelTier === m.id || (!geminiModelTier && m.id === "3.5 Flash")
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => handleSelectGeminiModel(m.id)}
                        className={cn(
                          "flex flex-col items-start p-3 rounded-lg border text-left transition-all",
                          isSelected
                            ? "border-indigo-500/80 bg-indigo-500/15 ring-1 ring-indigo-500/40"
                            : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
                        )}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="text-xs font-semibold text-slate-100">{m.label}</span>
                          {isSelected && <Check className="h-3.5 w-3.5 text-indigo-400" />}
                        </div>
                        <span className="text-[11px] text-slate-400 mt-0.5">{m.desc}</span>
                      </button>
                    )
                  })}
                </div>
                <p className="text-[11px] text-slate-400 italic">
                  App dùng đúng model bạn đang chọn sẵn trên tài khoản gemini.google.com. Muốn đổi model, hãy chọn lại ở trình duyệt Gemini (lựa chọn ở đây chỉ để ghi nhớ).
                </p>
              </div>

              <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200/90 leading-relaxed flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <span>
                  ⚠️ Dùng endpoint nội bộ không chính thức của Gemini: có thể gián đoạn khi Google thay đổi, và có rủi ro với tài khoản. Phiên có thể hết hạn theo thời gian — khi đó đăng nhập lại.
                </span>
              </div>
            </div>

            {/* Section: DeepSeek API Key */}
            <div className="rounded-xl border border-white/10 bg-black/20 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-purple-400" />
                  DeepSeek API Key
                </Label>
                {Boolean(settings.deepseek_api_key_set) && (
                  <span className="text-xs text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Đã có key lưu trong máy
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[260px]">
                  <Input
                    type={showDeepseekKey ? "text" : "password"}
                    placeholder="sk-..."
                    value={deepseekKey}
                    onChange={(e) => {
                      setDeepseekKey(e.target.value)
                      setDirty(true)
                      setDeepseekResult(null)
                    }}
                    className="pr-16 bg-black/40 border-white/10 text-sm font-mono"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowDeepseekKey(!showDeepseekKey)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 px-2 text-xs text-slate-400 hover:text-slate-200"
                  >
                    {showDeepseekKey ? <EyeOff className="h-3.5 w-3.5 mr-1" /> : <Eye className="h-3.5 w-3.5 mr-1" />}
                    {showDeepseekKey ? "Ẩn" : "Hiện"}
                  </Button>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleTestDeepSeek}
                  disabled={deepseekTesting}
                  className="gap-1.5 text-xs border-white/15 hover:bg-white/10"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", deepseekTesting && "animate-spin")} />
                  {deepseekTesting ? "Đang test…" : "Test connection"}
                </Button>

                <Button
                  type="button"
                  size="sm"
                  onClick={handleSaveDeepSeek}
                  className="gap-1.5 text-xs bg-purple-600 hover:bg-purple-500 text-white"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Lưu key
                </Button>
              </div>

              {deepseekResult && (
                <p className={cn("text-xs flex items-center gap-1.5", deepseekResult.ok ? "text-emerald-400" : "text-rose-400")}>
                  {deepseekResult.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                  {deepseekResult.message}
                </p>
              )}

              <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                <span>Key được mã hoá bảo mật bằng safeStorage (Windows DPAPI), không lưu dưới dạng plaintext.</span>
              </p>
            </div>
          </div>

          {/* Card 2: Nguồn tạo ảnh AI cho từng cảnh */}
          <div className="vas-card p-6 border border-white/10 bg-[#0d1527] rounded-xl shadow-xl space-y-5">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                <Image className="h-4.5 w-4.5 text-amber-400" />
                Nguồn tạo ảnh AI cho từng cảnh
              </h3>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed">
              Nguồn tạo ảnh/video chính là <span className="font-semibold text-amber-300">UTO Flow (labs.google/fx — Nano Banana 2)</span>,
              tự động gửi prompt của từng cảnh sang Flow, theo dõi tiến trình và tải ảnh/video về đúng scene.
              Gemini chỉ phục vụ viết kịch bản, chia cảnh và tạo prompt. Pollinations.ai là bước cuối khi được bật cho phép.
            </p>

            {/* UTO Flow Block */}
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
              <div className="mb-3 flex items-center justify-between">
                <Label className="flex items-center gap-2 text-sm font-medium text-slate-100">
                  <Image className="h-4 w-4 text-emerald-400" /> UTO Flow tạo ảnh/video (nguồn chính)
                </Label>
                <div className="flex items-center gap-2">
                  <Switch checked={Boolean(labsEnabled)} onCheckedChange={toggleLabs} />
                  <span className="text-xs text-slate-400">Bật UTO Flow</span>
                </div>
              </div>
              <p className="mb-3 text-xs text-slate-300">
                Flow tự động nhận prompt từng cảnh → sinh ảnh/video (Nano Banana 2) → theo dõi trạng thái → tải file về đúng scene.
                Yêu cầu đăng nhập Google một lần trên máy này.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-amber-500/15 border border-amber-500/30 px-2.5 py-1 text-xs text-amber-200 font-medium">
                  Factory sẽ tự mở Chrome riêng khi chạy từ Storyboard
                </span>
                <Button variant="outline" size="sm" onClick={refreshLabsCheck} className="gap-1 text-xs border-white/15">
                  <RefreshCw className="h-3 w-3" /> Kiểm tra lại
                </Button>
                <span className={cn("rounded-md px-2.5 py-1 text-xs font-medium", labsCheckInfo.can_automate ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300")}>
                  {labsCheckInfo.can_automate ? "✔ UTO Flow sẵn sàng" : "⚠ Chưa đủ điều kiện"}
                </span>
              </div>
            </div>

            {/* Gemini API Key Block */}
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="mb-3 flex items-center justify-between">
                <Label className="flex items-center gap-2 text-sm font-medium text-slate-100">
                  <KeyRound className="h-4 w-4 text-amber-400" /> API key aistudio.google (Gemini — viết kịch bản, chia cảnh, tạo prompt)
                </Label>
                <div className="flex items-center gap-2">
                  <Switch checked={geminiEnabled} onCheckedChange={(v) => { setGeminiEnabled(v); setTimeout(saveGemini, 0) }} />
                  <span className="text-xs text-slate-400">Dùng Gemini cho phân tích & prompt</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="password"
                  className="min-w-[300px] flex-1 bg-black/40 border-white/10"
                  placeholder="Dán API key aistudio.google vào đây…"
                  value={geminiKey}
                  onChange={(e) => { setGeminiKey(e.target.value); setGeminiResult(null) }}
                />
                <Button variant="outline" size="sm" onClick={checkGeminiKey} disabled={geminiChecking} className="gap-1 text-xs border-white/15">
                  <RefreshCw className={cn("h-3 w-3", geminiChecking && "animate-spin")} />
                  {geminiChecking ? "Đang kiểm tra…" : "Kiểm tra key"}
                </Button>
                <Button size="sm" onClick={saveGemini} className="gap-1 text-xs bg-gradient-to-r from-[#d9940a] to-[#faaa02] text-white">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Lưu
                </Button>
              </div>
              {geminiResult && (
                <p className={cn("mt-2 text-xs", geminiResult.valid ? "text-emerald-400" : "text-rose-400")}>{geminiResult.note}</p>
              )}
              <p className="mt-2 text-xs text-slate-400">
                Lấy key miễn phí tại <a className="text-amber-400 underline hover:text-amber-300" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">aistudio.google.com/apikey</a> — key này chỉ dùng để Gemini viết kịch bản, phân tích chia cảnh và tạo prompt ảnh.
              </p>
            </div>

            {/* Flow Connector Block */}
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
              <div className="mb-3 flex items-center justify-between">
                <Label className="flex items-center gap-2 text-sm font-medium text-slate-100">
                  <Zap className="h-4 w-4 text-amber-400" /> Flow Connector — Extension Chrome (tự động mở Flow, tạo media, tải file)
                </Label>
                <div className="flex items-center gap-2">
                  <Switch checked={Boolean(connectorEnabled)} onCheckedChange={async (v) => { setConnectorEnabled(v); await saveGemini() }} />
                  <span className="text-xs text-slate-400">Bật Flow Connector</span>
                </div>
              </div>
              <p className="mb-3 text-xs text-slate-300">
                Extension Chrome tự mở Google Flow, tạo project, chọn Image/Video · tỷ lệ · model,
                nhập prompt, bấm tạo, theo dõi tile và tải file THẬT về dự án, gắn đúng từng scene.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("rounded-md px-2.5 py-1 text-xs font-medium", workerConnected ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300")}>
                  {workerConnected ? "✔ Factory Connector đang kết nối" : "○ Factory sẽ kết nối khi chạy từ Desktop"}
                </span>
                <span className="text-xs text-slate-400">Chrome profile riêng và extension bundled chỉ được khởi động khi bấm “Chạy Factory Mode (Flow)” trong Storyboard.</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-sm text-slate-300">
              <div className="flex items-center gap-2">
                <Switch checked={pollinationsFallback} onCheckedChange={async (v) => { setPollinationsFallback(v); await saveGemini() }} />
                <span>Cho phép Pollinations.ai làm bước cuối</span>
              </div>
            </div>

            <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200/90">
              💡 UTO Flow lỗi hoặc chưa đăng nhập Google → pipeline báo lỗi rõ ràng kèm nguyên nhân và cho phép bấm "Thử lại".
              Chỉ khi bật Pollinations làm bước cuối thì mới chuyển sang Pollinations.ai.
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
          <div className="vas-card p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-100">▶ Đăng bài & Lập lịch</h3>
                <p className="mt-1 text-sm text-slate-400">
                  Lên lịch tự động đăng video theo khung giờ vàng và cấu hình từng kênh YouTube / TikTok / Reels.
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30 w-fit">
                <AlertTriangle className="h-3.5 w-3.5" /> Bản xem trước
              </span>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-white/[0.06] bg-black/20 p-4 space-y-2">
                  <div className="font-semibold text-slate-200 text-sm">Quản lý Kênh & Khung giờ đăng</div>
                  <p className="text-xs text-slate-400">
                    Cấu hình tiêu chuẩn video, tỷ lệ khung hình và thông tin kênh xuất bản trực tiếp trên từng dự án.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-xs mt-2"
                    onClick={() => navigate("/projects")}
                  >
                    Quản lý Dự án & Kênh <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="rounded-lg border border-white/[0.06] bg-black/20 p-4 space-y-2">
                  <div className="font-semibold text-slate-200 text-sm">Hàng đợi xuất bản tự động</div>
                  <p className="text-xs text-slate-400">
                    Theo dõi tiến độ render, duyệt video và đẩy video lên kho lưu trữ sẵn sàng xuất bản.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-xs mt-2"
                    onClick={() => navigate("/queue")}
                  >
                    Mở Hàng đợi (Queue) <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
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
