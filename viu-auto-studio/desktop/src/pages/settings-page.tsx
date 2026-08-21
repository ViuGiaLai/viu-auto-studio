import { useEffect, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"

import {
  Settings as SettingsIcon, Play, RefreshCw, AlertTriangle, CheckCircle2,
  KeyRound, Image, Zap, ExternalLink, FolderOpen, Folder, Send, ShieldCheck,
  Globe, Bot, Sparkles, MessageSquare, Eye, EyeOff, LogOut, Chrome, Check,
  Moon, Sun, ArrowRight, Mic
} from "lucide-react"
import { api, openExternalUrl, selectDirectory, openAiBrowser, getAiBrowserStatus, logoutAiBrowser, mediaUrl, startFlowBrowser, logoutFlowBrowser, flowGoogleStatus } from "@/services/api"

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
  { key: "quick", label: "⚡ Thiết lập nhanh" },
  { key: "content", label: "🧠 Nội dung & AI" },
  { key: "voice", label: "🎙 Giọng & Âm thanh" },
  { key: "visual", label: "🎨 Hình ảnh & Video" },
  { key: "edit", label: "🎬 Dựng & Xuất video" },
  { key: "connections", label: "🔗 Tài khoản & Kết nối" },
  { key: "performance", label: "⚡ Hiệu năng" },
  { key: "advanced", label: "🛠 Nâng cao" },
]

const VOICE_ENGINE_GROUPS = [
  { id: "edge", icon: "⭐", label: "Edge TTS", kind: "Cloud", badge: "Mặc định", provider: "edge", description: "Miễn phí · Không cần API key", cta: "Sử dụng" },
  { id: "kokoro_vi", icon: "🇻🇳", label: "Kokoro Việt Nam", kind: "Local", badge: "Local chính", provider: "kokoro_vi", description: "Local · Offline · Giọng Việt", cta: "Cài đặt" },
  { id: "gemini_tts", icon: "✨", label: "Gemini TTS", kind: "Cloud API", badge: "AI / Cloud", provider: "gemini_tts", description: "Cloud · API key", cta: "Cấu hình" },
  { id: "elevenlabs", icon: "🎙", label: "ElevenLabs", kind: "Cloud API", badge: "Cao cấp", provider: "elevenlabs", description: "Premium · API key", cta: "Cấu hình" },
  { id: "vbee", icon: "🇻🇳", label: "Vbee", kind: "Cloud API", badge: "Giọng Việt", provider: "vbee", description: "Cloud · Giọng Việt", cta: "Cấu hình" },
] as const

const ADVANCED_VOICE_ENGINES = [
  {
    category: "Cloud",
    engines: [
      { label: "Google Cloud TTS", provider: "google_cloud_tts", kind: "Cloud API · Studio 48kHz" },
      { label: "Azure TTS", provider: "azure_tts", kind: "Cloud API · Microsoft Speech" },
    ],
  },
  {
    category: "Local",
    engines: [
      { label: "Kokoro TTS", provider: "kokoro", kind: "Local · Đa ngữ (Anh, Nhật, Trung...)" },
      { label: "OmniVoice", provider: "omnivoice", kind: "Local · Clone giọng mẫu" },
      { label: "Piper / Local TTS", provider: "local", kind: "Local · Piper engine" },
    ],
  },
] as const

const DEFAULT_TTS_CONFIG: TTSConfig = {
  provider: "edge",
  voice: "",
  speed: 1,
  pitch: 0,
  volume: 1,
  model_dir: "",
  cloud_api_key_masked: "",
}

const EDGE_PROVIDER_FALLBACK = [{ id: "edge", name: "Edge TTS", available: true }]

export default function SettingsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTabRaw = searchParams.get("tab")
  const requestedTab = ({ chung: "quick", engine: "edit", ai: "content", telegram: "connections", publish: "connections" } as Record<string, string>)[requestedTabRaw || ""] || requestedTabRaw
  const [activeTab, setActiveTab] = useState(TABS.some((tab) => tab.key === requestedTab) ? requestedTab || "quick" : "quick")

  const [config, setConfig] = useState<TTSConfig | null>(DEFAULT_TTS_CONFIG)
  const [providers, setProviders] = useState<Array<{ id: string; name: string; available: boolean }>>(EDGE_PROVIDER_FALLBACK)
  const [voices, setVoices] = useState<TTSVoice[]>([])
  const [elevenLabsKey, setElevenLabsKey] = useState("")
  const [elevenLabsModel, setElevenLabsModel] = useState("eleven_flash_v2_5")
  const [geminiTTSKey, setGeminiTTSKey] = useState("")
  const [vbeeKey, setVbeeKey] = useState("")
  const [googleCloudKey, setGoogleCloudKey] = useState("")
  const [azureKey, setAzureKey] = useState("")
  const [savingKey, setSavingKey] = useState(false)
  const [voiceLangFilter, setVoiceLangFilter] = useState('all')
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
  const [flowGoogleOnDisk, setFlowGoogleOnDisk] = useState<{ loggedIn: boolean; email: string }>({ loggedIn: false, email: "" })
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
  const [capabilities, setCapabilities] = useState<Awaited<ReturnType<typeof api.systemCapabilities>> | null>(null)
  const [capabilitiesLoading, setCapabilitiesLoading] = useState(false)
  const [preflight, setPreflight] = useState<Awaited<ReturnType<typeof api.systemPreflight>> | null>(null)
  const [installingCapability, setInstallingCapability] = useState(false)
  const [ffmpegAction, setFfmpegAction] = useState<"install" | "upgrade" | null>(null)
  const [ffmpegBusy, setFfmpegBusy] = useState(false)
  const [ttsStorageStats, setTtsStorageStats] = useState<Awaited<ReturnType<typeof api.ttsStorage>> | null>(null)



    const setOperatorProfile = useAppStore((s) => s.setOperatorProfile)

  const refreshCapabilities = async () => {
    setCapabilitiesLoading(true)
    try {
      setCapabilities(await api.systemCapabilities())
    } catch (error) {
      toast({ title: "Không đọc được thành phần Viu Studio", description: String(error), variant: "destructive" })
    } finally {
      setCapabilitiesLoading(false)
    }
  }

  const prepareCapability = async (capabilityId: string) => {
    try {
      const result = await api.systemPreflight(capabilityId)
      if (result.ok) {
        toast({ title: "Môi trường đã sẵn sàng", description: `Có thể chạy ${result.capability.label}.` })
        return
      }
      setPreflight(result)
    } catch (error) {
      toast({ title: "Preflight thất bại", description: String(error), variant: "destructive" })
    }
  }

  const checkFfmpegUpdate = async () => {
    setFfmpegBusy(true)
    try {
      const result = await api.manageFfmpeg("check_update")
      toast({ title: result.update_available ? "Có phiên bản FFmpeg mới" : "FFmpeg đang ở phiên bản hiện tại", description: result.latest_version ? `Catalog: ${result.latest_version}` : "Không đọc được phiên bản catalog" })
    } catch (error) {
      toast({ title: "Không kiểm tra được cập nhật FFmpeg", description: String(error), variant: "destructive" })
    } finally {
      setFfmpegBusy(false)
    }
  }

  const checkFfmpegTools = async () => {
    setFfmpegBusy(true)
    try {
      await api.manageFfmpeg("check")
      const diagnosis = await api.systemDiagnose()
      setDiagnostics(diagnosis)
      setEngineStatus(diagnosis.ffmpeg_version && diagnosis.ffprobe_version ? "installed" : "missing")
      toast({ title: "Đã kiểm tra FFmpeg và FFprobe", description: diagnosis.ffmpeg_version || "Chưa tìm thấy FFmpeg" })
    } catch (error) {
      toast({ title: "Không kiểm tra được FFmpeg", description: String(error), variant: "destructive" })
    } finally {
      setFfmpegBusy(false)
    }
  }

  const applyFfmpegAction = async () => {
    if (!ffmpegAction) return
    setFfmpegBusy(true)
    try {
      const result = await api.manageFfmpeg(ffmpegAction)
      if (!result.ok) throw new Error("Tác vụ FFmpeg thất bại")
      const diagnosis = await api.systemDiagnose()
      setDiagnostics(diagnosis)
      setCapabilities(await api.systemCapabilities())
      setEngineStatus(diagnosis.ffmpeg_version && diagnosis.ffprobe_version ? "installed" : "missing")
      toast({ title: ffmpegAction === "install" ? "Đã cài FFmpeg" : "Đã yêu cầu nâng cấp FFmpeg", description: diagnosis.ffmpeg_version || "Đã cập nhật trạng thái công cụ" })
      setFfmpegAction(null)
    } catch (error) {
      toast({ title: "Không thể xử lý FFmpeg", description: String(error), variant: "destructive" })
    } finally {
      setFfmpegBusy(false)
    }
  }

  const installPreflightDependencies = async () => {
    if (!preflight || preflight.missing.length === 0) return
    setInstallingCapability(true)
    try {
      const result = await api.installCapability(preflight.missing.map((item) => item.id))
      if (!result.ok) throw new Error("Cài thành phần thất bại")
      toast({ title: "Đã cài thành phần", description: `Đã cài: ${result.installed.join(", ")}` })
      setPreflight(null)
      await refreshCapabilities()
    } catch (error) {
      toast({ title: "Không thể cài thành phần", description: String(error), variant: "destructive" })
    } finally {
      setInstallingCapability(false)
    }
  }


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
      api.ttsStorage()
        .then(setTtsStorageStats)
        .catch(() => {})
      void refreshCapabilities()



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
      setConfig((current) => current || DEFAULT_TTS_CONFIG)
      setProviders((current) => current.length > 0 ? current : EDGE_PROVIDER_FALLBACK)
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
    // Also check Google login on disk (independent of extension pairing)
    try {
      const gs = await flowGoogleStatus()
      setFlowGoogleOnDisk(gs)
    } catch {
      setFlowGoogleOnDisk({ loggedIn: false, email: "" })
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
      toast({ title: "Đã mở Chrome Profile riêng", description: result.message })
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
      setFlowGoogleOnDisk({ loggedIn: false, email: "" })
      toast({ title: "Đã đăng xuất Google Flow", description: result.message })
    } catch (error) {
      toast({ title: "Không thể đăng xuất Google Flow", description: String(error), variant: "destructive" })
    } finally {
      setFlowAccountLoading(false)
      await refreshFlowConnection()
    }
  }

  // Flow is "logged in" if either: backend extension is paired, OR Google cookies exist on disk
  const flowLoggedIn = (flowConnection?.status === "paired" && Boolean(flowConnection.google_account || flowConnection.factory_state === "ready" || flowConnection.factory_state === "processing")) || flowGoogleOnDisk.loggedIn
  const flowDisplayEmail = flowConnection?.google_account || flowGoogleOnDisk.email || ""

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

  const handleSaveApiKey = async (provider: string, keyVal: string) => {
    if (!config) return
    setSavingKey(true)
    try {
      const trimmed = keyVal.trim()
      const updatedKeys = { ...(config.api_keys || {}), [provider]: trimmed }
      await api.ttsSaveConfig({
        provider: config.provider,
        voice: config.voice,
        speed: config.speed,
        pitch: config.pitch,
        volume: config.volume,
        model_dir: config.model_dir,
        api_key: trimmed,
        api_keys: updatedKeys,
      })
      setConfig((prev) => prev ? { ...prev, api_key: trimmed, api_keys: updatedKeys } : prev)
      const fetchedVoices = await api.ttsListVoices(provider)
      setVoices(fetchedVoices)
      if (fetchedVoices.length > 0 && (!config.voice || !fetchedVoices.some((v) => v.id === config.voice))) {
        await api.ttsSaveConfig({
          provider,
          voice: fetchedVoices[0].id,
          speed: config.speed,
          pitch: config.pitch,
          volume: config.volume,
          model_dir: config.model_dir,
          api_key: trimmed,
          api_keys: updatedKeys,
        })
        setConfig((prev) => prev ? { ...prev, voice: fetchedVoices[0].id } : prev)
      }
      toast({
        title: `Đã lưu key và tải ${fetchedVoices.length} giọng`,
        description: `Danh sách giọng từ nhà cung cấp đã được cập nhật thành công.`,
      })
    } catch (err) {
      toast({ title: "Lỗi lưu key hoặc tải giọng", description: String(err), variant: "destructive" })
    } finally {
      setSavingKey(false)
    }
  }

  const saveTTS = async (patch: Partial<TTSConfig>) => {
    if (!config) return
    const next = { ...config, ...patch }
    try {
      await api.ttsSaveConfig({
        provider: next.provider,
        voice: next.voice,

        speed: next.speed,
        pitch: next.pitch,
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

    const clearTtsStorage = async () => {
    try {
      const result = await api.ttsStorageClear()
      const refreshed = await api.ttsStorage()
      setTtsStorageStats(refreshed)
      toast({ title: "Đã dọn dữ liệu tạm", description: `Đã xóa ${result.removed + result.preview_removed + result.generated_removed} file preview, audio tạm và cache.` })
    } catch (error) {
      toast({ title: "Không dọn được TTS cache", description: String(error), variant: "destructive" })
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
        api.ttsStorage().then(setTtsStorageStats).catch(() => {})
        toast({ title: res.cache_hit ? "Đã dùng lại TTS cache" : "Đã tạo âm thanh mẫu thành công", description: res.cache_hit ? "Nội dung và cấu hình giống lần trước nên không gọi TTS lại." : "Preview được lưu tạm và sẽ tự dọn." })

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

            <Tabs value={activeTab} onValueChange={(value) => { setActiveTab(value); setSearchParams({ tab: value }, { replace: true }) }}>

        <TabsList className="flex w-full justify-start overflow-x-auto bg-[#141d22] border border-white/8 p-1 rounded-lg">
          {TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key} className="whitespace-nowrap data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-300 data-[state=active]:border-amber-500/30 rounded-md border border-transparent">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Thiết lập nhanh */}
        <TabsContent value="quick">
          <div className="vas-card p-5">
            <h3 className="mb-4 text-base font-semibold text-slate-100">Cài đặt chung</h3>
                        <p className="mb-4 text-sm text-slate-500">Thư mục dữ liệu, người vận hành và hành vi hệ thống</p>
            <div className="mb-5 rounded-xl border border-emerald-400/20 bg-emerald-500/[0.05] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-sm font-semibold text-slate-100">Kiểm tra hệ thống</div><p className="mt-1 text-xs text-slate-400">Viu kiểm tra runtime và capability thật trước khi workflow chạy.</p></div><Button type="button" size="sm" variant="outline" onClick={() => void refreshCapabilities()} disabled={capabilitiesLoading}>{capabilitiesLoading ? "Đang kiểm tra…" : "Kiểm tra lại"}</Button></div><div className="mt-3 grid gap-2 sm:grid-cols-3">{(capabilities?.capabilities.filter((item) => ["factory", "movie_recap", "import_media"].includes(item.id)) ?? []).map((item) => <div key={item.id} className="rounded-lg border border-white/[0.06] bg-black/15 p-3"><div className="text-xs font-semibold text-slate-200">{item.label}</div><div className={cn("mt-1 text-xs", item.ready ? "text-emerald-300" : "text-amber-300")}>{item.ready ? "Sẵn sàng" : `Thiếu ${item.missing.length} thành phần`}</div></div>)}</div><Button type="button" size="sm" variant="ghost" className="mt-3 px-0 text-amber-300 hover:bg-transparent hover:text-amber-200" onClick={() => { setActiveTab("edit"); setSearchParams({ tab: "edit" }, { replace: true }) }}>Quản lý Công cụ hệ thống →</Button></div>
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

                {/* Hình ảnh & Video */}
        <TabsContent value="visual" className="space-y-6">
          <div className="vas-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div><h3 className="text-base font-semibold text-slate-100">🎨 Hình ảnh & Video</h3><p className="mt-1 text-sm text-slate-400">Cấu hình Flow, Chrome Profile và năng lực tạo media cho AI Video Factory.</p></div>
              <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", flowLoggedIn ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300")}>{flowLoggedIn ? "Flow sẵn sàng" : "Cần đăng nhập Flow"}</span>
            </div>
            <div className="mt-5 rounded-xl border border-indigo-400/20 bg-indigo-500/[0.06] p-4">
              <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2 text-sm font-semibold text-slate-100"><Chrome className="h-4 w-4 text-indigo-300" /> Google Flow & Chrome Profile</div><p className="mt-1 text-xs leading-5 text-slate-400">Viu tự mở Chrome Profile riêng, kết nối Flow Connector và tiếp tục queue sau khi đăng nhập.</p></div><span className="text-xs text-slate-400">{flowConnection?.profile_name ? `Profile: ${flowConnection.profile_name}` : "Chưa có profile"}</span></div>
              <div className="mt-4 flex flex-wrap gap-2"><Button type="button" size="sm" disabled={flowAccountLoading} onClick={() => void (flowLoggedIn ? logoutFlowAccount() : openFlowAccount())} className={flowLoggedIn ? "gap-1.5 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25" : "gap-1.5 bg-indigo-500 text-white hover:bg-indigo-400"}>{flowLoggedIn ? <LogOut className="h-3.5 w-3.5" /> : <Chrome className="h-3.5 w-3.5" />}{flowAccountLoading ? "Đang xử lý…" : flowLoggedIn ? "Đăng xuất" : "Mở Chrome Profile riêng"}</Button><Button type="button" size="sm" variant="outline" onClick={() => void prepareCapability("factory")}>Kiểm tra Factory</Button></div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"><div className="text-sm font-semibold text-slate-100">Image generation</div><p className="mt-1 text-xs text-slate-400">Prompt hình ảnh, style và media policy được lấy từ cấu hình project/kênh khi chạy Factory.</p></div><div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"><div className="text-sm font-semibold text-slate-100">Video generation</div><p className="mt-1 text-xs text-slate-400">Video được tạo theo queue Flow của project; không cần copy/paste prompt thủ công.</p></div></div>
          </div>
        </TabsContent>

        {/* Dựng & Xuất video / Engine & Công cụ */}

        <TabsContent value="edit">
                    <div className="space-y-6">
                      <div className="vas-card p-5">
            <div className="mb-4"><h3 className="text-base font-semibold text-slate-100">🎬 Cấu hình xuất mặc định</h3><p className="mt-1 text-sm text-slate-400">Các lựa chọn này được dùng làm mặc định cho những lần mở Project Editor tiếp theo. Bạn vẫn có thể đổi riêng từng video.</p></div>
            <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[{ id: "youtube", title: "YouTube ngang", detail: "16:9 · 1920×1080 · 30 FPS" }, { id: "shorts", title: "Shorts / TikTok", detail: "9:16 · 1080×1920 · 30 FPS" }, { id: "square", title: "Video vuông", detail: "1:1 · 1080×1080 · 30 FPS" }, { id: "4k", title: "Chất lượng cao", detail: "16:9 · 3840×2160 · 30 FPS" }].map((item) => { const selected = String(settingsDraft.output_preset || "youtube") === item.id; return <button key={item.id} type="button" aria-pressed={selected} onClick={() => { setDirty(true); setSettingsDraft((current) => ({ ...current, output_preset: item.id })) }} className={cn("rounded-xl border p-3 text-left transition", selected ? "border-amber-400/70 bg-amber-400/10" : "border-white/[0.08] bg-white/[0.02] hover:border-white/20")}><div className="text-sm font-semibold text-slate-100">{item.title}</div><div className="mt-1 text-[11px] text-slate-500">{item.detail}</div></button> })}
            </div>
            <div className="mb-5 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4"><div className="text-sm font-semibold text-slate-100">Audio Mix mặc định</div><div className="mt-3 grid gap-4 md:grid-cols-2"><div><div className="mb-1 flex justify-between text-xs"><span>Giọng đọc</span><span>{Math.round(Number(settingsDraft.voice_volume ?? 1) * 100)}%</span></div><Slider value={[Number(settingsDraft.voice_volume ?? 1)]} min={0} max={2} step={0.05} onValueChange={([value]) => { setDirty(true); setSettingsDraft((current) => ({ ...current, voice_volume: value })) }} /></div><div><div className="mb-1 flex justify-between text-xs"><span>Nhạc nền</span><span>{Math.round(Number(settingsDraft.music_volume ?? 0.25) * 100)}%</span></div><Slider value={[Number(settingsDraft.music_volume ?? 0.25)]} min={0} max={1} step={0.05} onValueChange={([value]) => { setDirty(true); setSettingsDraft((current) => ({ ...current, music_volume: value })) }} /></div></div><div className="mt-4 flex flex-wrap gap-x-6 gap-y-3 text-xs"><label className="flex items-center gap-2"><Switch checked={Boolean(settingsDraft.enable_ducking ?? true)} onCheckedChange={(value) => { setDirty(true); setSettingsDraft((current) => ({ ...current, enable_ducking: value })) }} /> Tự giảm nhạc khi có giọng</label><label className="flex items-center gap-2"><Switch checked={Boolean(settingsDraft.normalize_audio ?? true)} onCheckedChange={(value) => { setDirty(true); setSettingsDraft((current) => ({ ...current, normalize_audio: value })) }} /> Chuẩn hóa âm lượng</label></div></div>
            <div className="mb-5 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4"><div className="text-sm font-semibold text-slate-100">Subtitle mặc định</div><div className="mt-3 grid gap-2 sm:grid-cols-3">{[{ id: "highlight", title: "Nổi bật", detail: "Chữ lớn, tương phản cao" }, { id: "basic", title: "Cơ bản", detail: "Dễ đọc, gọn gàng" }, { id: "karaoke", title: "Karaoke", detail: "Bám theo từng nhịp câu" }].map((item) => { const selected = String(settingsDraft.subtitle_style || "highlight") === item.id; return <button key={item.id} type="button" aria-pressed={selected} onClick={() => { setDirty(true); setSettingsDraft((current) => ({ ...current, subtitle_style: item.id })) }} className={cn("rounded-lg border p-3 text-left", selected ? "border-fuchsia-400/70 bg-fuchsia-400/10" : "border-white/[0.08] hover:border-white/20")}><div className="text-sm font-medium text-slate-100">{item.title}</div><div className="mt-1 text-[11px] text-slate-500">{item.detail}</div></button> })}</div><div className="mt-3 flex flex-wrap gap-2">{[{ id: "embed", label: "Nhúng vào video" }, { id: "srt", label: "Xuất .SRT" }, { id: "ass", label: "Xuất .ASS" }].map((item) => <label key={item.id} className="flex items-center gap-2 text-xs"><input type="radio" name="settings-subtitle-format" checked={String(settingsDraft.subtitle_output_format || "embed") === item.id} onChange={() => { setDirty(true); setSettingsDraft((current) => ({ ...current, subtitle_output_format: item.id })) }} />{item.label}</label>)}</div></div>
          </div>
          <div className="vas-card overflow-hidden p-5">
              <div className="mb-5 flex flex-wrap items-start justify-between gap-3">

                <div>
                  <h3 className="text-base font-semibold text-slate-100">🧩 Thành phần Viu Studio</h3>
                  <p className="mt-1 text-sm text-slate-400">Cài theo capability: nền tảng luôn kiểm tra trước, thành phần nặng chỉ cài khi workflow cần.</p>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={refreshCapabilities} disabled={capabilitiesLoading}>
                  {capabilitiesLoading ? "Đang kiểm tra…" : "Kiểm tra lại"}
                </Button>
              </div>
              <div className="mb-5 grid gap-3 sm:grid-cols-3">
                {(capabilities?.capabilities.filter((item) => ["basic", "factory", "movie_recap"].includes(item.id)) ?? []).map((item) => (
                  <button key={item.id} type="button" onClick={() => prepareCapability(item.id)} className={cn("rounded-xl border p-4 text-left transition-colors", item.ready ? "border-emerald-500/30 bg-emerald-500/[0.06]" : "border-amber-500/30 bg-amber-500/[0.06] hover:border-amber-400/60")}>
                    <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold text-slate-100">{item.label === "AI Video Factory" ? "Factory" : item.label === "AI Movie Recap" ? "Movie Recap" : "Cơ bản"}</span><span className={cn("text-xs font-semibold", item.ready ? "text-emerald-400" : "text-amber-300")}>{item.ready ? "Sẵn sàng" : "Thiếu thành phần"}</span></div>
                    <p className="mt-2 text-xs text-slate-400">{item.ready ? "Workflow có thể chạy preflight." : `Thiếu ${item.missing.length} thành phần`}</p>
                  </button>
                ))}
                {!capabilities && <div className="col-span-full rounded-xl border border-white/[0.06] p-4 text-sm text-slate-400">Đang đọc trạng thái thành phần từ máy…</div>}
              </div>
              {preflight && (
                <div className="mb-5 rounded-xl border border-amber-500/40 bg-amber-500/[0.08] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><div className="font-semibold text-amber-200">Preflight: {preflight.capability.label}</div><p className="mt-1 text-sm text-slate-300">Thiếu: {preflight.missing.map((item) => item.label).join(", ")}. Dung lượng dự kiến: {preflight.estimated_size}.</p><p className="mt-1 text-xs text-slate-400">Viu Studio sẽ tự tải, xác minh và cài thành phần vào thư mục riêng của ứng dụng sau khi bạn xác nhận. Cần kết nối mạng trong quá trình tải.</p></div>
                    <div className="flex shrink-0 gap-2"><Button type="button" variant="ghost" size="sm" onClick={() => setPreflight(null)}>Huỷ</Button><Button type="button" size="sm" onClick={installPreflightDependencies} disabled={installingCapability}>{installingCapability ? "Đang cài…" : "Cài đặt & tiếp tục"}</Button></div>
                  </div>
                </div>
              )}
              <div className="mb-5"><div className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Nền tảng bắt buộc</div><div className="grid gap-3 sm:grid-cols-3">{(capabilities?.dependencies.filter((item) => item.tier === "platform") ?? []).map((item) => <div key={item.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3"><div className="flex items-center justify-between gap-2"><span className="text-sm text-slate-200">{item.label}</span><span className={cn("text-xs font-semibold", item.installed ? "text-emerald-400" : "text-red-400")}>{item.installed ? "● Sẵn sàng" : "● Thiếu"}</span></div><div className="mt-1 text-xs text-slate-500">{item.version || item.reason}</div>{!item.installed && (item.id === "ffmpeg" || item.id === "ffprobe") && <Button type="button" size="sm" className="mt-3 w-full" onClick={() => setFfmpegAction("install")} disabled={ffmpegBusy}>Tải & cài đặt trong Viu</Button>}</div>)}</div></div>
              <div className="grid gap-4 md:grid-cols-3">
                {["factory", "movie_recap", "import_media"].map((tier) => {
                  const item = capabilities?.capabilities.find((capability) => capability.id === tier)
                  const dependencies = capabilities?.dependencies.filter((dependency) => dependency.tier === tier) ?? []
                  if (!item) return null
                  return <div key={tier} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"><div className="flex items-center justify-between gap-2"><div className="text-sm font-semibold text-slate-100">{item.label}</div><span className={cn("text-xs font-semibold", item.ready ? "text-emerald-400" : "text-amber-300")}>{item.ready ? "Sẵn sàng" : "Theo nhu cầu"}</span></div><div className="mt-3 space-y-2">{dependencies.map((dependency) => <div key={dependency.id} className="flex items-center justify-between gap-2 text-xs"><span className="text-slate-300">{dependency.label}</span><span className={dependency.installed ? "text-emerald-400" : "text-amber-300"}>{dependency.installed ? "Đã cài" : "Chưa cài"}</span></div>)}</div>{!item.ready && <Button type="button" size="sm" variant="outline" className="mt-4 w-full" onClick={() => prepareCapability(item.id)}>Kiểm tra & cài khi cần</Button>}</div>
                })}
              </div>
            </div>
            <div className="vas-card p-5">

              <div className="mb-1 flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-100">⚙️ Render Profile</h3>
                <span className="text-xs text-slate-500">{engineStatus === "installed" ? "Đã cài đặt" : "Chưa cài đặt"}</span>
              </div>
              <p className="mb-5 text-sm text-slate-500">Cấu hình tốc độ/chất lượng render cho lần xuất video tiếp theo. Đây là cấu hình hiệu năng, không phải dependency.</p>

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
                    onClick={() => document.querySelector("[data-tool-management]")?.scrollIntoView({ behavior: "smooth", block: "center" })}
                  >
                    Quản lý công cụ
                  </Button>

                </div>
              </div>
            </div>
            
                        <div className="vas-card p-5" data-tool-management>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-base font-semibold text-slate-100">🧩 Công cụ xử lý</h3><p className="mt-1 text-sm text-slate-400">Quản lý các binary mà Viu Studio dùng thật để render, encode, subtitle và đọc metadata.</p></div><Button type="button" size="sm" variant="outline" onClick={() => void checkFfmpegTools()} disabled={ffmpegBusy}>{ffmpegBusy ? "Đang kiểm tra…" : "Kiểm tra tất cả"}</Button></div>
              {ffmpegAction && <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-400/30 bg-amber-500/[0.08] p-3"><div><div className="text-sm font-semibold text-amber-100">Xác nhận {ffmpegAction === "install" ? "cài đặt" : "nâng cấp"} FFmpeg</div><p className="mt-1 text-xs text-slate-400">Viu Studio sẽ tự tải gói FFmpeg có FFprobe, xác minh và cài vào thư mục runtime riêng của ứng dụng. Chỉ thực hiện sau khi bạn xác nhận.</p></div><div className="flex gap-2"><Button type="button" size="sm" variant="ghost" onClick={() => setFfmpegAction(null)}>Huỷ</Button><Button type="button" size="sm" onClick={() => void applyFfmpegAction()} disabled={ffmpegBusy}>{ffmpegBusy ? "Đang xử lý…" : "Xác nhận"}</Button></div></div>}
              <div className="grid gap-4 md:grid-cols-2">
                {[{ id: "ffmpeg", label: "FFmpeg", version: diagnostics?.ffmpeg_version, description: "Render · encode · subtitle · audio" }, { id: "ffprobe", label: "FFprobe", version: diagnostics?.ffprobe_version, description: "Đọc thông tin và metadata video" }].map((tool) => { const installed = Boolean(tool.version); return <div key={tool.id} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4"><div className="flex items-center justify-between gap-3"><div className="text-sm font-semibold text-slate-100">{tool.label}</div><span className={cn("text-xs font-semibold", installed ? "text-emerald-400" : "text-amber-300")}>{installed ? "● Đã cài đặt" : "○ Chưa cài đặt"}</span></div><div className="mt-2 text-xs text-slate-400">{installed ? tool.version : `Viu Studio cần ${tool.label} để hoạt động.`}</div><div className="mt-1 text-xs text-slate-500">{tool.description}</div><div className="mt-4 flex flex-wrap gap-2">{installed ? <><Button type="button" size="sm" variant="outline" onClick={() => void checkFfmpegUpdate()} disabled={ffmpegBusy}>Kiểm tra cập nhật</Button><Button type="button" size="sm" variant="outline" onClick={() => setFfmpegAction("upgrade")} disabled={ffmpegBusy}>Nâng cấp</Button></> : <Button type="button" size="sm" onClick={() => setFfmpegAction("install")} disabled={ffmpegBusy}>Tải & cài đặt</Button>}</div></div> })}
              </div>
            </div>
            <div className="vas-card p-5">
              <h3 className="mb-4 text-base font-semibold text-slate-100">Chẩn đoán hệ thống</h3>
              {diagnostics && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><DiagnosticItem label="Viu Runtime" value={diagnostics.python_runtime} ok /><DiagnosticItem label="Ổ đĩa trống" value={`${diagnostics.disk_free_gb} GB`} ok={diagnostics.disk_free_gb > 2} /><DiagnosticItem label="Thư mục dự án" value={diagnostics.write_permission_projects ? "Có quyền ghi" : "Không ghi được"} ok={diagnostics.write_permission_projects} /><DiagnosticItem label="App data" value={diagnostics.write_permission_app_data ? "Có quyền ghi" : "Không ghi được"} ok={diagnostics.write_permission_app_data} /><DiagnosticItem label="Demucs" value={diagnostics.demucs_available ? "Sẵn sàng" : "Chưa cài"} ok={diagnostics.demucs_available} /><DiagnosticItem label="yt-dlp" value={diagnostics.yt_dlp_available ? "Sẵn sàng" : "Chưa cài"} ok={diagnostics.yt_dlp_available} /></div>}
              <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-slate-300">FFmpeg và FFprobe được dùng thật cho toàn bộ pipeline; cài/nâng cấp chỉ chạy sau xác nhận của bạn.</div>
            </div>

          </div>
        </TabsContent>

        {/* Nội dung & AI */}
                <TabsContent value="content" className="space-y-6">
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
          </div>
        </TabsContent>

        <TabsContent value="voice">
          <div className="vas-card space-y-5 p-6">
            {/* Header: Chuyển văn bản thành giọng nói */}
            <div className="flex items-center gap-2.5 text-base font-semibold text-slate-100">
              <Mic className="h-5 w-5 text-amber-400" />
              <span>Chuyển văn bản thành giọng nói</span>
            </div>

            {/* Top Row: 4 Controls Side by Side */}
            <div className="grid gap-4 sm:grid-cols-12 items-end">
              {/* 1. Nhà cung cấp mặc định */}
              <div className="sm:col-span-4 space-y-1.5">
                <Label className="text-xs font-medium text-slate-400">Nhà cung cấp mặc định</Label>
                <Select
                  value={config?.provider || "edge"}
                  onValueChange={async (p) => {
                    if (!config) return
                    try {
                      const vs = await api.ttsListVoices(p)
                      setVoices(vs)
                      const defaultVoice = vs.length > 0 ? vs[0].id : ""
                      const keyForProvider = config.api_keys?.[p] || ""
                      setElevenLabsKey(keyForProvider)
                      setGeminiTTSKey(keyForProvider)
                      setVbeeKey(keyForProvider)
                      await saveTTS({ provider: p, voice: defaultVoice })
                    } catch {
                      void saveTTS({ provider: p, voice: "" })
                    }
                  }}
                >
                  <SelectTrigger className="w-full bg-black/30 border-white/10 text-xs">
                    <SelectValue placeholder="Chọn nhà cung cấp" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="edge">Edge TTS (miễn phí, cloud)</SelectItem>
                    <SelectItem value="elevenlabs">ElevenLabs (cao cấp, AI)</SelectItem>
                    <SelectItem value="kokoro_vi">Kokoro Việt Nam (local offline)</SelectItem>
                    <SelectItem value="gemini_tts">Gemini TTS (Google AI Studio)</SelectItem>
                    <SelectItem value="vbee">Vbee (giọng Việt đa vùng miền)</SelectItem>
                    <SelectItem value="google_cloud_tts">Google Cloud TTS</SelectItem>
                    <SelectItem value="azure_tts">Azure TTS</SelectItem>
                    <SelectItem value="omnivoice">OmniVoice (Voice Clone)</SelectItem>
                    <SelectItem value="local">Piper / Local TTS</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* 2. Giọng mặc định */}
              <div className="sm:col-span-4 space-y-1.5">
                <Label className="text-xs font-medium text-slate-400">Giọng mặc định</Label>
                <Select
                  value={config?.voice}
                  onValueChange={(v) => void saveTTS({ voice: v })}
                >
                  <SelectTrigger className="w-full bg-black/30 border-white/10 text-xs">
                    <SelectValue placeholder={voices.length === 0 ? (config?.provider === "elevenlabs" && !config?.api_keys?.elevenlabs ? "Lỗi tải giọng — kiểm tra API key" : "— Chọn giọng —") : "— Chọn giọng —"} />
                  </SelectTrigger>
                  <SelectContent>
                    {voices.length === 0 ? (
                      <SelectItem value="__none__" disabled>
                        {config?.provider === "elevenlabs" && !config?.api_keys?.elevenlabs
                          ? "Lỗi tải giọng — kiểm tra API key"
                          : config?.provider === "kokoro_vi"
                          ? "⚠️ Chưa cài đặt — bấm 'Tải & Cài đặt...'"
                          : "Chưa có danh sách giọng"}
                      </SelectItem>
                    ) : (
                      voices.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.name}
                          {v.language ? ` (${v.language})` : ""}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* 3. Nút Nghe thử */}
              <div className="sm:col-span-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-9 gap-1.5 text-xs border-white/10 bg-black/20 hover:bg-white/5"
                  disabled={previewing}
                  onClick={preview}
                >
                  {previewing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5 fill-current" />}
                  {previewing ? "Đang tạo..." : "▶ Nghe thử"}
                </Button>
              </div>

              {/* 4. Nút Test kết nối */}
              <div className="sm:col-span-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-9 gap-1.5 text-xs border-white/10 bg-black/20 hover:bg-white/5"
                  disabled={testingConn}
                  onClick={testConnection}
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", testingConn && "animate-spin")} />
                  {testingConn ? "Đang test..." : "Test kết nối"}
                </Button>
              </div>
            </div>

            {/* Provider Configuration & Status Card */}
            {/* 1. ELEVENLABS */}
            {config?.provider === "elevenlabs" && (
              <div className="rounded-xl border border-white/10 bg-black/20 p-5 space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-300">ElevenLabs API key</Label>
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      className="bg-black/40 border-white/10 text-xs font-mono"
                      placeholder="Nhập ElevenLabs API key (xi-api-key)..."
                      value={elevenLabsKey || config?.api_keys?.elevenlabs || ""}
                      onChange={(e) => setElevenLabsKey(e.target.value)}
                    />
                    <Button
                      size="sm"
                      className="whitespace-nowrap bg-white/10 hover:bg-white/15 text-slate-200 text-xs border border-white/10"
                      disabled={savingKey}
                      onClick={() => handleSaveApiKey("elevenlabs", elevenLabsKey || config?.api_keys?.elevenlabs || "")}
                    >
                      {savingKey ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : null}
                      Lưu key & tải giọng
                    </Button>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Lấy API key tại <a className="text-amber-400 underline hover:text-amber-300" href="https://elevenlabs.io/app/settings/api-keys" target="_blank" rel="noreferrer">elevenlabs.io/app/settings/api-keys</a> — Miễn phí 10.000 ký tự/tháng để tạo giọng đọc AI biểu cảm cao cấp.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-300">Model</Label>
                  <Select
                    value={elevenLabsModel}
                    onValueChange={(m) => setElevenLabsModel(m)}
                  >
                    <SelectTrigger className="w-full bg-black/40 border-white/10 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="eleven_flash_v2_5">eleven_flash_v2_5 — Nhanh, độ trễ thấp</SelectItem>
                      <SelectItem value="eleven_multilingual_v2">eleven_multilingual_v2 — Đa ngôn ngữ, ổn định</SelectItem>
                      <SelectItem value="eleven_turbo_v2_5">eleven_turbo_v2_5 — Chất lượng cao & tốc độ</SelectItem>
                      <SelectItem value="eleven_v3">eleven_v3 — Biểu cảm & Audio Tags Hot Trend</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-slate-400">
                    Chọn <strong className="text-amber-300">eleven_v3</strong> để các audio tag biểu cảm ([shouting], [whispering], [crying]...) của mode <strong>Adam Hot Trend</strong> hoạt động. Nếu tài khoản chưa được cấp quyền v3 qua API, hãy dùng <strong>eleven_multilingual_v2</strong>.
                  </p>
                </div>

                <div className="rounded-lg bg-amber-400/[0.06] border border-amber-400/20 p-3 text-xs text-amber-200/90 leading-relaxed">
                  💡 Danh sách giọng tự lấy từ tài khoản của bạn và các giọng HOT 🔥 từ Voice Library (trending). Chọn giọng 🔥 thì app tự thêm vào tài khoản bạn khi tổng hợp — không cần nhập voice ID. Bấm <strong>"Lưu key & tải giọng"</strong> sau khi nhập key để hiện danh sách.
                </div>
              </div>
            )}

            {/* 2. KOKORO VIỆT NAM */}
            {(config?.provider === "kokoro_vi" || config?.provider === "kokoro") && (
              <div className="rounded-xl border border-white/10 bg-black/20 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-slate-100">Kokoro Việt Nam (local)</h4>
                  <span className="flex items-center gap-1.5 text-xs text-slate-400">
                    <span className="h-2 w-2 rounded-full bg-slate-500"></span> Chưa cài đặt
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Công cụ đọc tiếng Việt local chất lượng cao (StyleTTS2 fine-tuned), chạy hoàn toàn trên máy bạn, không cần Internet. Lần đầu cần tải thư viện AI + model (~700MB). Hỗ trợ 14 giọng đọc tiếng Việt cực kỳ tự nhiên.
                </p>
                <Button
                  className="w-full bg-[#5b52e0] hover:bg-[#4d44cb] text-white font-medium text-xs py-2.5 h-auto shadow-md"
                  onClick={() => toast({ title: "Đang tải và chuẩn bị Kokoro Việt Nam...", description: "Quá trình tải thư viện AI đang diễn ra ngầm." })}
                >
                  Tải & Cài đặt Kokoro Việt Nam
                </Button>
              </div>
            )}

            {/* 3. GEMINI TTS */}
            {config?.provider === "gemini_tts" && (
              <div className="rounded-xl border border-white/10 bg-black/20 p-5 space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-300">Gemini / Google AI Studio API key</Label>
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      className="bg-black/40 border-white/10 text-xs font-mono"
                      placeholder="Nhập Google AI Studio API key (AIzaSy...)..."
                      value={geminiTTSKey || config?.api_keys?.gemini_tts || geminiKey || ""}
                      onChange={(e) => setGeminiTTSKey(e.target.value)}
                    />
                    <Button
                      size="sm"
                      className="whitespace-nowrap bg-white/10 hover:bg-white/15 text-slate-200 text-xs border border-white/10"
                      disabled={savingKey}
                      onClick={() => handleSaveApiKey("gemini_tts", geminiTTSKey || geminiKey || "")}
                    >
                      {savingKey ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : null}
                      Lưu key & tải giọng
                    </Button>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Lấy key miễn phí tại <a className="text-amber-400 underline hover:text-amber-300" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">aistudio.google.com/apikey</a> — Hỗ trợ 8 giọng AI thế hệ mới (Puck, Charon, Kore, Fenrir, Aoede, Leda, Orus, Zephyr).
                  </p>
                </div>
              </div>
            )}

            {/* 4. VBEE */}
            {config?.provider === "vbee" && (
              <div className="rounded-xl border border-white/10 bg-black/20 p-5 space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-300">Vbee API Token / App ID</Label>
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      className="bg-black/40 border-white/10 text-xs font-mono"
                      placeholder="Nhập Vbee API Token..."
                      value={vbeeKey || config?.api_keys?.vbee || ""}
                      onChange={(e) => setVbeeKey(e.target.value)}
                    />
                    <Button
                      size="sm"
                      className="whitespace-nowrap bg-white/10 hover:bg-white/15 text-slate-200 text-xs border border-white/10"
                      disabled={savingKey}
                      onClick={() => handleSaveApiKey("vbee", vbeeKey || config?.api_keys?.vbee || "")}
                    >
                      {savingKey ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : null}
                      Lưu key & tải giọng
                    </Button>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Lấy API Token tại <a className="text-amber-400 underline hover:text-amber-300" href="https://vbee.vn" target="_blank" rel="noreferrer">vbee.vn</a> — Nền tảng giọng đọc AI tiếng Việt chuẩn truyền hình với đa dạng vùng miền Bắc - Trung - Nam.
                  </p>
                </div>
              </div>
            )}

            {/* 5. EDGE TTS (MẶC ĐỊNH) */}
            {config?.provider === "edge" && (
              <div className="rounded-xl border border-white/10 bg-black/20 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-slate-100">Edge TTS (giọng Việt & Quốc tế có sẵn)</h4>
                  <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                    <span className="h-2 w-2 rounded-full bg-emerald-400"></span> Sẵn sàng
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Bộ giọng đọc Microsoft Edge: Chạy trực tiếp qua Cloud, không cần API key, không cần GPU, tốc độ nhanh. Hỗ trợ Hoài My (Nữ), Nam Minh (Nam) và hơn 300+ giọng quốc tế.
                </p>
                <Button
                  variant="outline"
                  className="w-full border-white/10 bg-white/[0.02] hover:bg-white/5 text-xs py-2 h-auto"
                  onClick={() => {
                    api.ttsListVoices("edge").then(setVoices).catch(() => {})
                    toast({ title: "Đã làm mới danh sách giọng Edge TTS" })
                  }}
                >
                  Cài lại / Cập nhật
                </Button>
              </div>
            )}

            {/* 6. GOOGLE CLOUD & AZURE */}
            {(config?.provider === "google_cloud_tts" || config?.provider === "azure_tts") && (
              <div className="rounded-xl border border-white/10 bg-black/20 p-5 space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-300">
                    {config?.provider === "google_cloud_tts" ? "Google Cloud TTS API Key" : "Azure Speech Key"}
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      className="bg-black/40 border-white/10 text-xs font-mono"
                      placeholder="Dán API key vào đây..."
                      value={config?.provider === "google_cloud_tts" ? googleCloudKey : azureKey}
                      onChange={(e) => config?.provider === "google_cloud_tts" ? setGoogleCloudKey(e.target.value) : setAzureKey(e.target.value)}
                    />
                    <Button
                      size="sm"
                      className="whitespace-nowrap bg-white/10 hover:bg-white/15 text-slate-200 text-xs border border-white/10"
                      disabled={savingKey}
                      onClick={() => handleSaveApiKey(config.provider, config.provider === "google_cloud_tts" ? googleCloudKey : azureKey)}
                    >
                      {savingKey ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : null}
                      Lưu key & tải giọng
                    </Button>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    {config?.provider === "google_cloud_tts" ? (
                      <>Lấy API key tại <a className="text-amber-400 underline hover:text-amber-300" href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">console.cloud.google.com</a> — Bật dịch vụ Cloud Text-to-Speech API.</>
                    ) : (
                      <>Lấy Speech Key tại <a className="text-amber-400 underline hover:text-amber-300" href="https://portal.azure.com" target="_blank" rel="noreferrer">portal.azure.com</a> — Tạo tài nguyên Azure AI Speech (miễn phí 500.000 ký tự/tháng).</>
                    )}
                  </p>
                </div>
              </div>
            )}

            {/* Kho giọng — Danh sách giọng chi tiết */}
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-slate-400 pt-2">
                <span>Kho giọng — {voices.length} giọng tuyển chọn</span>
                {/* Bộ lọc quốc gia gọn gàng */}
                <div className="flex flex-wrap items-center gap-1">
                  {[
                    { id: "all", label: "⭐ Tất cả" },
                    { id: "vi", label: "🇻🇳 Tiếng Việt" },
                    { id: "en", label: "🇺🇸 Tiếng Anh" },
                    { id: "ja", label: "🇯🇵 Tiếng Nhật" },
                    { id: "ko", label: "🇰🇷 Tiếng Hàn" },
                    { id: "zh", label: "🇨🇳 Tiếng Trung" },
                    { id: "th", label: "🇹🇭 Tiếng Thái" },
                    { id: "other", label: "🌍 Khác" },
                  ].map((filter) => (
                    <button
                      key={filter.id}
                      type="button"
                      onClick={() => setVoiceLangFilter(filter.id)}
                      className={cn(
                        "rounded-md px-2 py-0.5 text-[11px] font-medium transition border",
                        voiceLangFilter === filter.id
                          ? "border-amber-400/40 bg-amber-400/15 text-amber-300"
                          : "border-white/5 bg-white/[0.02] text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]"
                      )}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 divide-y divide-white/5 bg-black/20 max-h-80 overflow-y-auto">
                {voices.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500">
                    {config?.provider === "elevenlabs" && !config?.api_keys?.elevenlabs
                      ? "Chưa nhập API key ElevenLabs. Hãy dán API key và bấm 'Lưu key & tải giọng' để hiện toàn bộ giọng."
                      : "Chưa có danh sách giọng từ nhà cung cấp này."}
                  </div>
                ) : (
                  voices
                    .filter((v) => {
                      if (voiceLangFilter === "all") return true
                      if (voiceLangFilter === "vi") return v.language.startsWith("vi") || v.id.startsWith("vi") || v.id.startsWith("kokoro_vi") || v.id.startsWith("hn_") || v.id.startsWith("sg_") || v.id.startsWith("hue_")
                      if (voiceLangFilter === "en") return v.language.startsWith("en") || v.id.startsWith("en") || v.id.startsWith("kokoro_a")
                      if (voiceLangFilter === "ja") return v.language.startsWith("ja") || v.id.startsWith("ja")
                      if (voiceLangFilter === "ko") return v.language.startsWith("ko") || v.id.startsWith("ko")
                      if (voiceLangFilter === "zh") return v.language.startsWith("zh") || v.id.startsWith("zh")
                      if (voiceLangFilter === "th") return v.language.startsWith("th") || v.id.startsWith("th")
                      if (voiceLangFilter === "other") return !["vi", "en", "ja", "ko", "zh", "th"].some((code) => v.language.startsWith(code) || v.id.startsWith(code))
                      return true
                    })
                    .map((v) => {
                    const isSelected = config?.voice === v.id
                    return (
                      <div
                        key={v.id}
                        className={cn(
                          "flex items-center justify-between p-3.5 transition",
                          isSelected ? "bg-amber-400/[0.06]" : "hover:bg-white/[0.02]"
                        )}
                      >
                        <div className="min-w-0 pr-4">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-slate-100">{v.name}</span>
                            {isSelected && (
                              <span className="rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-1.5 py-0.2 text-[10px] font-bold">
                                MẶC ĐỊNH ✓
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-[11px] text-slate-400">
                            {v.description || [v.gender === "female" ? "Nữ" : v.gender === "male" ? "Nam" : null, v.language].filter(Boolean).join(" · ")}
                          </p>
                        </div>

                        <div>
                          {isSelected ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-slate-400 hover:text-red-400 hover:bg-transparent"
                              onClick={() => void saveTTS({ voice: "" })}
                            >
                              Xoá
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs border-white/10 bg-white/[0.02] hover:bg-white/10 text-slate-200"
                              onClick={() => void saveTTS({ voice: v.id })}
                            >
                              Chọn giọng này
                            </Button>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            {/* Fine Tuning: Tốc độ, Cao độ, Âm lượng & Player */}
            <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Tốc độ</span>
                    <span className="text-amber-300 font-mono">{config?.speed.toFixed(2)}x</span>
                  </div>
                  <Slider min={0.5} max={2} step={0.05} value={[config?.speed ?? 1]} onValueChange={([v]) => void saveTTS({ speed: v })} />
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Cao độ</span>
                    <span className="text-amber-300 font-mono">{(config?.pitch ?? 0).toFixed(1)} st</span>
                  </div>
                  <Slider min={-12} max={12} step={0.5} value={[config?.pitch ?? 0]} onValueChange={([v]) => void saveTTS({ pitch: v })} />
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Âm lượng</span>
                    <span className="text-amber-300 font-mono">{Math.round((config?.volume ?? 1) * 100)}%</span>
                  </div>
                  <Slider min={0} max={1} step={0.05} value={[config?.volume ?? 1]} onValueChange={([v]) => void saveTTS({ volume: v })} />
                </div>
              </div>

              {/* Text Input for Custom Preview */}
              <div className="relative">
                <Textarea
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value)}
                  rows={2}
                  className="pr-24 text-xs bg-black/40 border-white/10"
                  placeholder="Nhập câu bạn muốn nghe thử..."
                />
                <Button
                  size="sm"
                  className="absolute bottom-2 right-2 h-7 gap-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs"
                  disabled={previewing}
                  onClick={preview}
                >
                  {previewing ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3 fill-current" />}
                  {previewing ? "Tạo..." : "Nghe thử"}
                </Button>
              </div>

              {previewUrl && (
                <div className="pt-2">
                  <audio ref={audioRef} src={previewUrl} controls className="h-8 w-full rounded" autoPlay />
                </div>
              )}
            </div>

            {/* Footer Note */}
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Provider mặc định áp dụng cho video mới. Mỗi video có thể chọn provider/giọng riêng trong Workspace. Kokoro TTS chạy local, cần cài đặt trước khi dùng. Lưu key xong bấm "Test kết nối" để kiểm tra.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="connections">
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

        {/* Tài khoản & Kết nối - Xuất bản */}
        <TabsContent value="connections">
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

        {/* Nâng cao */}
        <TabsContent value="advanced" className="space-y-6">
          <div className="vas-card p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="text-base font-semibold text-slate-100">🛠 Nâng cao</h3><p className="mt-1 text-sm text-slate-400">Các cấu hình kỹ thuật chỉ dành cho người cần chẩn đoán hoặc thử nghiệm.</p></div><span className="rounded-full bg-slate-500/15 px-2.5 py-1 text-xs text-slate-300">Advanced</span></div><div className="mt-5 space-y-3"><details className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4"><summary className="cursor-pointer text-sm font-semibold text-slate-200">Runtime & thư mục dữ liệu</summary><div className="mt-3 grid gap-3 sm:grid-cols-2"><DiagnosticItem label="Viu Runtime" value={diagnostics?.python_runtime || "Đang kiểm tra"} ok={Boolean(diagnostics)} /><DiagnosticItem label="App data" value={diagnostics?.write_permission_app_data ? "Có quyền ghi" : "Chưa kiểm tra"} ok={Boolean(diagnostics?.write_permission_app_data)} /><DiagnosticItem label="Thư mục project" value={diagnostics?.write_permission_projects ? "Có quyền ghi" : "Chưa kiểm tra"} ok={Boolean(diagnostics?.write_permission_projects)} /></div></details><details className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4" open><summary className="cursor-pointer text-sm font-semibold text-slate-200">💾 TTS Cache & Bộ nhớ tạm</summary><div className="mt-3 grid gap-3 sm:grid-cols-3"><DiagnosticItem label="TTS Preview" value={ttsStorageStats ? `${(ttsStorageStats.preview_bytes / 1024 / 1024).toFixed(1)} MB` : "Đang tải"} ok={true} /><DiagnosticItem label="TTS Cache" value={ttsStorageStats ? `${(ttsStorageStats.cache_bytes / 1024 / 1024).toFixed(1)} MB` : "Đang tải"} ok={true} /><DiagnosticItem label="Giới hạn cache" value={ttsStorageStats ? `${(ttsStorageStats.cache_limit_bytes / 1024 / 1024 / 1024).toFixed(1)} GB` : "1.0 GB"} ok={true} /></div><p className="mt-3 text-xs text-slate-400">Preview nằm trong thư mục tạm và tự dọn sau 30 phút. Cache TTS tự dọn sau 7 ngày và bị giới hạn dung lượng.</p><div className="mt-3 flex flex-wrap items-center gap-2"><Button type="button" size="sm" variant="outline" onClick={() => void api.ttsStorage().then(setTtsStorageStats)}>Kiểm tra bộ nhớ</Button><Button type="button" size="sm" variant="outline" onClick={() => void clearTtsStorage()}>Dọn cache ngay</Button></div></details><details className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4"><summary className="cursor-pointer text-sm font-semibold text-slate-200">Logs & Debug</summary><p className="mt-3 text-xs text-slate-400">Log backend được lưu trong App data. Dùng Chẩn đoán hệ thống và Nhật ký job để kiểm tra lỗi theo workflow.</p><Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => navigate("/queue")}>Mở hàng đợi và nhật ký</Button></details><details className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4"><summary className="cursor-pointer text-sm font-semibold text-slate-200">Experimental</summary><p className="mt-3 text-xs text-slate-400">Các provider hoặc engine thử nghiệm chỉ hiển thị trong khu vực này khi backend đã có capability tương ứng.</p></details></div></div>
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
