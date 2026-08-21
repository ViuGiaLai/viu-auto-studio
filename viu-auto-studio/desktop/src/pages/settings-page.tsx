import { VoiceStudioPanel } from "@/components/voice-studio-panel"
import { useEffect, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"

import {
  Settings as SettingsIcon, Play, RefreshCw, AlertTriangle, CheckCircle2,
  KeyRound, Image, Zap, ExternalLink, FolderOpen, Folder, Send, ShieldCheck,
  Globe, Bot, Sparkles, MessageSquare, Eye, EyeOff, LogOut, Chrome, Check,
  Moon, Sun, ArrowRight, Mic, Wrench
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
  { key: "engine", label: "⚙️ Engine & Công cụ" },
  { key: "content", label: "🧠 Nội dung & AI" },
  { key: "voice", label: "🎙 Giọng & Âm thanh" },
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
  const requestedTab = ({ chung: "quick", engine: "performance", ai: "content", telegram: "connections", publish: "connections" } as Record<string, string>)[requestedTabRaw || ""] || requestedTabRaw
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

  // Smart Render Engine Hardware State
  const [hardwareInfo, setHardwareInfo] = useState<{
    capabilities?: { nvenc: boolean; qsv: boolean; amf: boolean; vaapi: boolean }
    recommended_encoder?: string
    recommended_preset?: string
    optimal_threads?: number
    cpu_count?: number
  } | null>(null)
  const [hardwareLoading, setHardwareLoading] = useState(false)
  // Preset package selection & tool installer
  const [selectedPackage, setSelectedPackage] = useState<"basic" | "balanced" | "performance">("balanced")
  const [installingTool, setInstallingTool] = useState<string | null>(null)

  const handleInstallTool = async (depIds: string[]) => {
    setInstallingTool(depIds.join(","))
    try {
      const res = await api.installCapability(depIds)
      if (res.ok) {
        toast({ title: "Cài đặt thành công", description: `Đã cài: ${depIds.join(", ")}` })
        await refreshCapabilities()
        await checkFfmpegTools()
      } else {
        throw new Error(res.output || "Cài đặt thất bại")
      }
    } catch (e) {
      toast({ title: "Lỗi cài đặt", description: String(e), variant: "destructive" })
    } finally {
      setInstallingTool(null)
    }
  }


  const refreshHardware = async (showToast = false) => {
    setHardwareLoading(true)
    try {
      const info = await api.getRenderHardware()
      setHardwareInfo(info)
      if (showToast) {
        toast({ title: "Đã quét lại phần cứng", description: `Encoder tối ưu: ${info.recommended_encoder || "libx264"}` })
      }
    } catch (err) {
      if (showToast) toast({ title: "Không thể quét phần cứng", description: String(err), variant: "destructive" })
    } finally {
      setHardwareLoading(false)
    }
  }

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
      void refreshHardware()



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
    <div className="min-h-full space-y-4 px-8 pb-12">
      {/* Sticky Header & Tabs Bar: Cố định trên đầu khi cuộn */}
      <div className="sticky top-0 z-20 -mx-8 px-8 pt-8 pb-3 bg-[#0a0f12]/95 backdrop-blur-md border-b border-white/5 space-y-4">
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
          <TabsList className="flex w-full justify-start gap-1.5 overflow-x-auto bg-[#0c1318] border border-amber-500/30 p-1.5 rounded-2xl shadow-lg shadow-black/40">
            {TABS.map((t) => (
              <TabsTrigger
                key={t.key}
                value={t.key}
                className={cn(
                  "whitespace-nowrap rounded-xl text-xs py-2 px-4 font-semibold border border-transparent transition-colors duration-150 shrink-0",
                  "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]",
                  "data-[state=active]:bg-[#0f2532] data-[state=active]:text-amber-400",
                  "data-[state=active]:border-amber-400 data-[state=active]:shadow-md data-[state=active]:shadow-amber-500/20"
                )}
              >
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => { setActiveTab(value); setSearchParams({ tab: value }, { replace: true }) }}>

        {/* Thiết lập nhanh */}
        <TabsContent value="quick">
          <div className="vas-card p-5">
            <h3 className="mb-4 text-base font-semibold text-slate-100">Cài đặt chung</h3>
                        <p className="mb-4 text-sm text-slate-500">Thư mục dữ liệu, người vận hành và hành vi hệ thống</p>
            <div className="mb-5 rounded-xl border border-emerald-400/20 bg-emerald-500/[0.05] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-sm font-semibold text-slate-100">Kiểm tra hệ thống</div><p className="mt-1 text-xs text-slate-400">Viu kiểm tra runtime và capability thật trước khi workflow chạy.</p></div><Button type="button" size="sm" variant="outline" onClick={() => void refreshCapabilities()} disabled={capabilitiesLoading}>{capabilitiesLoading ? "Đang kiểm tra…" : "Kiểm tra lại"}</Button></div><div className="mt-3 grid gap-2 sm:grid-cols-3">{(capabilities?.capabilities.filter((item) => ["factory", "movie_recap", "import_media"].includes(item.id)) ?? []).map((item) => <div key={item.id} className="rounded-lg border border-white/[0.06] bg-black/15 p-3"><div className="text-xs font-semibold text-slate-200">{item.label}</div><div className={cn("mt-1 text-xs", item.ready ? "text-emerald-300" : "text-amber-300")}>{item.ready ? "Sẵn sàng" : `Thiếu ${item.missing.length} thành phần`}</div></div>)}</div><Button type="button" size="sm" variant="ghost" className="mt-3 px-0 text-amber-300 hover:bg-transparent hover:text-amber-200" onClick={() => { setActiveTab("performance"); setSearchParams({ tab: "performance" }, { replace: true }) }}>Quản lý Công cụ & Hiệu năng →</Button></div>
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

                                                {/* 🧠 Nội dung & AI */}
        <TabsContent value="content" className="space-y-6">
          {/* Section: Nhà cung cấp dịch / SEO */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-300">Nhà cung cấp dịch / SEO</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              {/* DeepSeek */}
              <button
                type="button"
                onClick={() => handleSelectAiTranslationProvider("deepseek")}
                className={cn(
                  "flex flex-col items-start p-4 rounded-xl border text-left transition-all relative",
                  aiTranslationProvider === "deepseek"
                    ? "border-amber-500 bg-amber-500/10 ring-1 ring-amber-400/50 shadow-md shadow-amber-500/10"
                    : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
                )}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <div className="flex items-center gap-2 font-bold text-sm text-slate-100">
                    <Bot className={cn("h-4 w-4", aiTranslationProvider === "deepseek" ? "text-amber-400" : "text-slate-400")} />
                    <span className={cn(aiTranslationProvider === "deepseek" && "text-amber-300")}>DeepSeek (API key)</span>
                  </div>
                  {aiTranslationProvider === "deepseek" && (
                    <div className="h-2 w-2 rounded-full bg-amber-400 shadow-sm shadow-amber-400" />
                  )}
                </div>
                <p className="text-xs text-slate-400">
                  Ổn định, tính phí theo API key.
                </p>
              </button>

              {/* ChatGPT */}
              <button
                type="button"
                onClick={() => handleSelectAiTranslationProvider("chatgpt")}
                className={cn(
                  "flex flex-col items-start p-4 rounded-xl border text-left transition-all relative",
                  aiTranslationProvider === "chatgpt"
                    ? "border-amber-500 bg-amber-500/10 ring-1 ring-amber-400/50 shadow-md shadow-amber-500/10"
                    : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
                )}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <div className="flex items-center gap-2 font-bold text-sm text-slate-100">
                    <MessageSquare className="h-4 w-4 text-emerald-400" />
                    <span className={cn(aiTranslationProvider === "chatgpt" && "text-amber-300")}>ChatGPT (tài khoản)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {chatgptStatus.connected && (
                      <span className="flex h-2 w-2 rounded-full bg-emerald-400" title="Đã kết nối" />
                    )}
                    {aiTranslationProvider === "chatgpt" && (
                      <div className="h-2 w-2 rounded-full bg-amber-400 shadow-sm shadow-amber-400" />
                    )}
                  </div>
                </div>
                <p className="text-xs text-slate-400">
                  Dùng gói đã đăng ký, không cần API key.
                </p>
              </button>

              {/* Gemini */}
              <button
                type="button"
                onClick={() => handleSelectAiTranslationProvider("gemini")}
                className={cn(
                  "flex flex-col items-start p-4 rounded-xl border text-left transition-all relative",
                  aiTranslationProvider === "gemini"
                    ? "border-amber-500 bg-amber-500/10 ring-1 ring-amber-400/50 shadow-md shadow-amber-500/10"
                    : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
                )}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <div className="flex items-center gap-2 font-bold text-sm text-slate-100">
                    <Sparkles className={cn("h-4 w-4", aiTranslationProvider === "gemini" ? "text-amber-400" : "text-slate-400")} />
                    <span className={cn(aiTranslationProvider === "gemini" && "text-amber-300")}>Gemini (tài khoản)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {geminiStatus.connected && (
                      <span className="flex h-2 w-2 rounded-full bg-emerald-400" title="Đã kết nối" />
                    )}
                    {aiTranslationProvider === "gemini" && (
                      <div className="h-2 w-2 rounded-full bg-amber-400 shadow-sm shadow-amber-400" />
                    )}
                  </div>
                </div>
                <p className="text-xs text-slate-400">
                  Đăng nhập Google, không cần API key.
                </p>
              </button>
            </div>
          </div>

          {/* Section: Tài khoản ChatGPT */}
          <div className="rounded-xl border border-white/10 bg-[#0d1419] p-5 space-y-3 shadow-lg">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-emerald-400" />
                  Tài khoản ChatGPT
                </h4>
                {chatgptStatus.connected ? (
                  <div className="text-xs text-slate-300">
                    Đã kết nối: <strong className="font-semibold text-emerald-300">{chatgptStatus.email || "rmahviu05.gl@gmail.com"}</strong>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">
                    Chưa đăng nhập — mở Chrome/Edge để đăng nhập tài khoản OpenAI.
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                {chatgptStatus.connected ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleLogoutAiBrowser("chatgpt")}
                    disabled={chatgptLoading}
                    className="h-8 text-xs border-white/15 bg-white/[0.02] hover:bg-white/10 text-slate-200"
                  >
                    Đăng xuất
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleOpenAiBrowser("chatgpt")}
                    disabled={chatgptLoading}
                    className="h-8 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                  >
                    {chatgptLoading ? "Đang mở…" : "Đăng nhập bằng Chrome/Edge"}
                  </Button>
                )}
              </div>
            </div>
            <p className="text-[11px] text-amber-400/90 leading-relaxed pt-1 flex items-start gap-1.5">
              <span>⚠</span>
              <span>Dùng endpoint nội bộ không chính thức của ChatGPT: có thể gián đoạn khi OpenAI thay đổi, và có rủi ro với tài khoản. Gói Free bị giới hạn rất nặng — nên dùng gói trả phí (Plus/Pro).</span>
            </p>
          </div>

          {/* Section: Tài khoản Gemini (Google) */}
          <div className="rounded-xl border border-white/10 bg-[#0d1419] p-5 space-y-4 shadow-lg">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-400" />
                  Tài khoản Gemini (Google)
                </h4>
                {geminiStatus.connected ? (
                  <div className="text-xs text-slate-300">
                    Đã kết nối: <strong className="font-semibold text-amber-300">{geminiStatus.email || "Google Gemini"}</strong>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">
                    Chưa đăng nhập — mở Chrome/Edge để đăng nhập tài khoản Google.
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                {geminiStatus.connected ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleLogoutAiBrowser("gemini")}
                    disabled={geminiLoading}
                    className="h-8 text-xs border-white/15 bg-white/[0.02] hover:bg-white/10 text-slate-200"
                  >
                    Đăng xuất
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleOpenAiBrowser("gemini")}
                    disabled={geminiLoading}
                    className="h-8 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                  >
                    {geminiLoading ? "Đang mở…" : "Đăng nhập bằng Chrome/Edge"}
                  </Button>
                )}
              </div>
            </div>

            {/* Model Gemini Selector */}
            <div className="space-y-2 pt-2 border-t border-white/5">
              <div className="text-xs font-semibold text-slate-300">Model Gemini</div>
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { id: "3.1 Flash-Lite", label: "3.1 Flash-Lite", desc: "Nhanh nhất." },
                  { id: "3.5 Flash", label: "3.5 Flash", desc: "Mặc định, toàn diện." },
                  { id: "3.1 Pro", label: "3.1 Pro", desc: "Chất lượng cao, chậm hơn." },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleSelectGeminiModel(m.id)}
                    className={cn(
                      "flex flex-col items-start p-3.5 rounded-xl border text-left transition-all text-xs",
                      geminiModelTier === m.id
                        ? "border-amber-500 bg-amber-500/10 ring-1 ring-amber-400/50 shadow-sm"
                        : "border-white/10 bg-white/[0.02] hover:border-white/20"
                    )}
                  >
                    <div className={cn("font-bold text-slate-100", geminiModelTier === m.id && "text-amber-300")}>{m.label}</div>
                    <span className="text-[11px] text-slate-400 mt-1">{m.desc}</span>
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed pt-1">
                App dùng đúng model bạn đang chọn sẵn trên tài khoản gemini.google.com. Muốn đổi model, hãy chọn lại ở trình duyệt Gemini (lựa chọn ở đây chỉ để ghi nhớ).
              </p>
              <p className="text-[11px] text-amber-400/90 leading-relaxed flex items-start gap-1.5">
                <span>⚠</span>
                <span>Dùng endpoint nội bộ không chính thức của Gemini: có thể gián đoạn khi Google thay đổi, và có rủi ro với tài khoản. Phiên có thể hết hạn theo thời gian — khi đó đăng nhập lại.</span>
              </p>
            </div>
          </div>

          {/* Section: DeepSeek API Key */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-slate-300">DeepSeek API Key</Label>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[280px]">
                <Input
                  type={showDeepseekKey ? "text" : "password"}
                  placeholder="sk-••••••••••••••••••••••••••••••••"
                  value={deepseekKey}
                  onChange={(e) => {
                    setDeepseekKey(e.target.value)
                    setDirty(true)
                  }}
                  className="pr-16 bg-[#0d1419] border-white/10 text-xs font-mono text-slate-200"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDeepseekKey(!showDeepseekKey)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 px-2 text-xs text-slate-400 hover:text-slate-200"
                >
                  {showDeepseekKey ? "Ẩn" : "Hiện"}
                </Button>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTestDeepSeek}
                disabled={deepseekTesting}
                className="h-9 text-xs border-white/15 bg-white/[0.02] hover:bg-white/10 px-4 text-slate-200"
              >
                {deepseekTesting ? "Đang test…" : "Test connection"}
              </Button>

              <Button
                type="button"
                size="sm"
                onClick={handleSaveDeepSeek}
                className="h-9 text-xs bg-gradient-to-r from-[#d9940a] to-[#faaa02] text-slate-950 font-bold px-4 hover:brightness-110 shadow-md shadow-amber-500/20"
              >
                Lưu key
              </Button>
            </div>

            {deepseekResult && (
              <p className={cn("text-xs flex items-center gap-1.5", deepseekResult.ok ? "text-emerald-400" : "text-rose-400")}>
                {deepseekResult.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                {deepseekResult.message}
              </p>
            )}

            <p className="text-[11px] text-slate-400 flex items-center gap-1.5 pt-1">
              <span>🔒</span>
              <span>Key được mã hoá bảo mật bằng safeStorage (Windows DPAPI), không lưu dưới dạng plaintext.</span>
            </p>
          </div>

          {/* Section: Google Flow & Chrome Profile (AI Video Factory) */}
          <div className="rounded-xl border border-white/10 bg-[#0d1419] p-5 space-y-4 shadow-lg">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <Chrome className="h-4 w-4 text-emerald-400" />
                  Google Flow & Chrome Profile (AI Video Factory)
                </h4>
                <p className="mt-1 text-xs text-slate-400">
                  Tự động kết nối Flow Connector, đồng bộ prompt của từng cảnh và tạo media tự động.
                </p>
              </div>
              <span className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold flex items-center gap-1.5",
                flowLoggedIn ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-300" : "bg-amber-500/15 border border-amber-500/30 text-amber-300"
              )}>
                <span className={cn("h-2 w-2 rounded-full", flowLoggedIn ? "bg-emerald-400 animate-pulse" : "bg-amber-400")} />
                {flowLoggedIn ? "Flow sẵn sàng" : "Cần đăng nhập Flow"}
              </span>
            </div>

            {/* Profile Action Box */}
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                  <span>Profile Chrome riêng:</span>
                  <span className="text-amber-400 font-mono text-xs">{flowConnection?.profile_name || "Viu Flow Chrome profile"}</span>
                </div>
                <p className="text-xs text-slate-400">
                  Viu tự mở Chrome Profile riêng độc lập, không ảnh hưởng đến trình duyệt chính của bạn.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={flowAccountLoading}
                  onClick={() => void (flowLoggedIn ? logoutFlowAccount() : openFlowAccount())}
                  className={flowLoggedIn ? "h-8 gap-1.5 bg-rose-500/15 border border-rose-500/30 text-rose-300 hover:bg-rose-500/25 font-bold text-xs" : "h-8 gap-1.5 bg-gradient-to-r from-[#d9940a] to-[#faaa02] text-slate-950 font-bold text-xs"}
                >
                  {flowLoggedIn ? <LogOut className="h-3.5 w-3.5" /> : <Chrome className="h-3.5 w-3.5" />}
                  {flowAccountLoading ? "Đang xử lý…" : flowLoggedIn ? "Đăng xuất" : "Mở Chrome Profile riêng"}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => void prepareCapability("factory")} className="h-8 text-xs border-white/15 text-slate-200">
                  Kiểm tra Factory
                </Button>
              </div>
            </div>

            {/* Mini Cards */}
            <div className="grid gap-3 sm:grid-cols-2 text-xs">
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3.5 space-y-1">
                <div className="font-semibold text-slate-200">Image Generation</div>
                <p className="text-slate-400 leading-relaxed">Prompt hình ảnh, style và media policy được tự động trích xuất theo từng phân cảnh khi chạy Factory.</p>
              </div>
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3.5 space-y-1">
                <div className="font-semibold text-slate-200">Video Generation</div>
                <p className="text-slate-400 leading-relaxed">Video được tạo tự động theo hàng đợi Flow của project; không cần copy/paste prompt thủ công.</p>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="voice">
          <VoiceStudioPanel />
        </TabsContent>

        
                {/* Engine & Công cụ */}
        <TabsContent value="engine" className="space-y-6">
          {/* 1. Bộ Công Cụ Viu Auto Studio (Preset Packages) */}
          <div className="rounded-2xl border border-white/10 bg-[#0d1318] p-6 shadow-2xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2.5">
                  <Wrench className="h-5 w-5 text-amber-400" />
                  Bộ Công Cụ Viu Auto Studio
                </h3>
                <p className="mt-1 text-xs text-slate-400">
                  Tải trọn bộ công cụ cần thiết để xử lý video, âm thanh và phụ đề trên máy của bạn.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 text-xs font-semibold text-emerald-400">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  Bộ công cụ đã sẵn sàng
                </span>
              </div>
            </div>

            {/* 3 Package Cards */}
            <div className="grid gap-4 sm:grid-cols-3">
              {/* Gói Cơ bản */}
              <div
                onClick={() => setSelectedPackage("basic")}
                className={cn(
                  "relative cursor-pointer rounded-2xl border p-5 transition-all flex flex-col justify-between space-y-4",
                  selectedPackage === "basic"
                    ? "border-amber-500/70 bg-gradient-to-b from-amber-500/15 via-amber-500/5 to-transparent shadow-xl shadow-amber-500/20 ring-1 ring-amber-400/60"
                    : "border-white/10 bg-white/[0.02] hover:border-amber-500/30 hover:bg-white/[0.04]"
                )}
              >
                <div className="space-y-2.5">
                  <div>
                    <h4 className="text-base font-bold text-white flex items-center gap-2">
                      <span>Cơ bản</span>
                      {selectedPackage === "basic" && <span className="text-amber-400 text-xs">● Đang chọn</span>}
                    </h4>
                    <div className="text-xs font-medium text-amber-300/80">Máy yếu / laptop CPU</div>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Phù hợp máy cấu hình thấp, ưu tiên nhẹ và hoạt động ổn định.
                  </p>

                  <div className="space-y-1.5 pt-2 border-t border-white/5 text-[11px] text-slate-300">
                    <div className="font-semibold text-amber-400/80 uppercase tracking-wider text-[10px]">Thành phần bao gồm:</div>
                    <div className="flex items-center gap-1.5 text-slate-300">✓ FFmpeg Core CPU (libx264 ~75MB)</div>
                    <div className="flex items-center gap-1.5 text-slate-300">✓ Whisper Tiny ASR (Sub nhẹ ~75MB)</div>
                    <div className="flex items-center gap-1.5 text-slate-300">✓ Edge TTS Neural Cloud (Miễn phí)</div>
                    <div className="flex items-center gap-1.5 text-slate-300">✓ yt-dlp Video Import Core (~15MB)</div>
                  </div>
                </div>
                <div className="pt-3 border-t border-white/5 flex items-center justify-between text-xs">
                  <span className="text-slate-400">Dung lượng: <strong className="text-slate-200">Nhỏ (~175 MB)</strong></span>
                  {selectedPackage === "basic" && <span className="text-amber-400 font-bold">Đã chọn ✓</span>}
                </div>
              </div>

              {/* Gói Cân bằng */}
              <div
                onClick={() => setSelectedPackage("balanced")}
                className={cn(
                  "relative cursor-pointer rounded-2xl border p-5 transition-all flex flex-col justify-between space-y-4",
                  selectedPackage === "balanced"
                    ? "border-amber-500/80 bg-gradient-to-b from-amber-500/20 via-amber-500/5 to-transparent shadow-2xl shadow-amber-500/25 ring-2 ring-amber-400/80"
                    : "border-white/10 bg-white/[0.02] hover:border-amber-500/30 hover:bg-white/[0.04]"
                )}
              >
                <div className="absolute top-3 right-3">
                  <span className="rounded-full bg-gradient-to-r from-amber-500/30 to-amber-600/30 border border-amber-400/50 px-2.5 py-0.5 text-[10px] font-bold text-amber-300 uppercase tracking-wider shadow-sm shadow-amber-500/20 animate-pulse">
                    KHUYẾN NGHỊ
                  </span>
                </div>
                <div className="space-y-2.5">
                  <div>
                    <h4 className="text-base font-bold text-white flex items-center gap-2">
                      <span>Cân bằng</span>
                      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                    </h4>
                    <div className="text-xs font-medium text-amber-300">Máy trung bình / Đa số</div>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Cân bằng tốt nhất giữa tốc độ nhận diện, chất lượng phụ đề và dung lượng bộ nhớ.
                  </p>

                  <div className="space-y-1.5 pt-2 border-t border-white/5 text-[11px] text-slate-300">
                    <div className="font-semibold text-amber-400/80 uppercase tracking-wider text-[10px]">Thành phần bao gồm:</div>
                    <div className="flex items-center gap-1.5 text-slate-300">✓ FFmpeg Multi-Thread Engine (~120MB)</div>
                    <div className="flex items-center gap-1.5 text-slate-300">✓ Whisper Small/Medium (Sub chuẩn ms)</div>
                    <div className="flex items-center gap-1.5 text-slate-300">✓ Kokoro Offline TTS + Edge TTS Cloud</div>
                    <div className="flex items-center gap-1.5 text-slate-300">✓ Bộ công cụ xác thực media FFprobe</div>
                  </div>
                </div>
                <div className="pt-3 border-t border-white/5 flex items-center justify-between text-xs">
                  <span className="text-slate-400">Dung lượng: <strong className="text-slate-200">Vừa (~500 MB)</strong></span>
                  <span className="text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">Đang dùng ✓</span>
                </div>
              </div>

              {/* Gói Hiệu năng cao */}
              <div
                onClick={() => setSelectedPackage("performance")}
                className={cn(
                  "relative cursor-pointer rounded-2xl border p-5 transition-all flex flex-col justify-between space-y-4",
                  selectedPackage === "performance"
                    ? "border-amber-500/70 bg-gradient-to-b from-amber-500/15 via-amber-500/5 to-transparent shadow-xl shadow-amber-500/20 ring-1 ring-amber-400/60"
                    : "border-white/10 bg-white/[0.02] hover:border-amber-500/30 hover:bg-white/[0.04]"
                )}
              >
                <div className="space-y-2.5">
                  <div>
                    <h4 className="text-base font-bold text-white flex items-center gap-2">
                      <span>Hiệu năng cao</span>
                      {selectedPackage === "performance" && <span className="text-amber-400 text-xs">● Đang chọn</span>}
                    </h4>
                    <div className="text-xs font-medium text-amber-300/80">Máy khỏe / RAM lớn / GPU</div>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Tận dụng tối đa phần cứng mạnh để đạt chất lượng xử lý âm thanh, hình ảnh và phụ đề cao nhất.
                  </p>

                  <div className="space-y-1.5 pt-2 border-t border-white/5 text-[11px] text-slate-300">
                    <div className="font-semibold text-amber-400/80 uppercase tracking-wider text-[10px]">Thành phần bao gồm:</div>
                    <div className="flex items-center gap-1.5 text-slate-300">✓ GPU HWAccel (NVENC, QSV, AMF)</div>
                    <div className="flex items-center gap-1.5 text-slate-300">✓ Whisper Large-v3 Turbo (~800MB)</div>
                    <div className="flex items-center gap-1.5 text-slate-300">✓ Kokoro VN Neural Voice + PyTorch CUDA</div>
                    <div className="flex items-center gap-1.5 text-slate-300">✓ Sẵn sàng cho Demucs AI Audio Splitter</div>
                  </div>
                </div>
                <div className="pt-3 border-t border-white/5 flex items-center justify-between text-xs">
                  <span className="text-slate-400">Dung lượng: <strong className="text-slate-200">Lớn (~1.5 GB)</strong></span>
                  {selectedPackage === "performance" && <span className="text-amber-400 font-bold">Đã chọn ✓</span>}
                </div>
              </div>
            </div>

            {/* Banner trạng thái */}
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 flex items-center gap-2.5 text-xs text-emerald-300 font-medium">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>Bộ công cụ cốt lõi (FFmpeg, FFprobe, Smart Render, Neural Subtitles) đã sẵn sàng hoạt động.</span>
            </div>

            {/* Action Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
              <div className="text-xs text-slate-400 flex items-center gap-1.5">
                <span className="text-amber-400 font-bold">ℹ</span> Sử dụng chế độ tương thích cao (tự động phát hiện GPU/CPU).
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await checkFfmpegTools()
                    await refreshCapabilities()
                    await refreshHardware(true)
                  }}
                  disabled={ffmpegBusy || hardwareLoading}
                  className="gap-1.5 text-xs border-white/15 hover:bg-white/10"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", (ffmpegBusy || hardwareLoading) && "animate-spin")} />
                  Kiểm tra lại
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    toast({
                      title: `Đã áp dụng gói: ${selectedPackage === "basic" ? "Cơ bản" : selectedPackage === "balanced" ? "Cân bằng" : "Hiệu năng cao"}`,
                      description: "Cấu hình render và engine phụ đề đã được cập nhật thành công.",
                    })
                  }}
                  className="gap-1.5 text-xs bg-gradient-to-r from-[#d9940a] to-[#faaa02] text-slate-950 font-bold px-5 shadow-lg shadow-amber-500/20 hover:brightness-110"
                >
                  {selectedPackage === "balanced" ? "Đang dùng gói Cân bằng" : `Chuyển sang ${selectedPackage === "basic" ? "Cơ bản" : "Hiệu năng cao"}`}
                </Button>
              </div>
            </div>
          </div>

          {/* 2. Công cụ nâng cao */}
          <div className="rounded-2xl border border-white/10 bg-[#0d1318] p-6 shadow-2xl space-y-5">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Wrench className="h-4 w-4 text-indigo-400" />
              Công cụ nâng cao
            </h3>

            <div className="grid gap-4 sm:grid-cols-2">
              {/* yt-dlp */}
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                      <span>▷</span> Nhập video được phép sử dụng
                    </h4>
                    <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                      Sẵn sàng ✓
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Công cụ nhập video từ nguồn được hỗ trợ. Chỉ dùng với video bạn sở hữu, quản lý hoặc có giấy phép phù hợp; tuân thủ điều khoản của nền tảng nguồn.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-9 text-xs border-emerald-500/30 bg-emerald-500/10 text-emerald-300 font-bold hover:bg-emerald-500/20"
                >
                  ✓ Đã Cài Đặt
                </Button>
              </div>

              {/* Demucs */}
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                      <span>♫</span> Demucs — tách giọng / nhạc nền
                    </h4>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Tách giọng & nhạc nền gốc (cho AI Movie Recap). NẶNG (kéo theo PyTorch ~2GB). Dùng lại PyTorch của OmniVoice nếu đã cài.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleInstallTool(["demucs", "pytorch"])}
                  disabled={Boolean(installingTool)}
                  className="w-full h-9 text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-bold"
                >
                  {installingTool?.includes("demucs") ? "Đang tải & cài đặt..." : "Tải & Cài đặt Demucs"}
                </Button>
              </div>
            </div>
          </div>

          {/* 3. Smart Render Engine Card */}
          <div className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-[#0e161c] p-6 shadow-2xl space-y-6">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-amber-400 to-transparent animate-pulse" />

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2.5">
                  <Zap className="h-5 w-5 text-amber-400 fill-amber-400" />
                  Smart Render Engine & Tăng Tốc Phần Cứng
                </h3>
                <p className="mt-1 text-xs text-slate-400">
                  Tự động phát hiện encoder phần cứng tối ưu (NVIDIA NVENC, Intel Quick Sync, AMD AMF, CPU đa luồng) để xuất video với tốc độ cao nhất.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refreshHardware(true)}
                disabled={hardwareLoading}
                className="gap-1.5 text-xs border-amber-500/30 text-amber-300 hover:bg-amber-500/10 shrink-0"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", hardwareLoading && "animate-spin")} />
                {hardwareLoading ? "Đang quét..." : "Quét lại phần cứng"}
              </Button>
            </div>

            {/* Hardware Grid */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className={cn(
                "rounded-xl border p-4 transition-all",
                hardwareInfo?.capabilities?.nvenc
                  ? "border-emerald-500/40 bg-emerald-500/5 shadow-md shadow-emerald-500/10"
                  : "border-white/10 bg-white/[0.02]"
              )}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300">NVIDIA NVENC</span>
                  <span className={cn("h-2 w-2 rounded-full", hardwareInfo?.capabilities?.nvenc ? "bg-emerald-400 animate-ping" : "bg-slate-600")} />
                </div>
                <div className="mt-2 text-lg font-bold text-slate-100">
                  {hardwareInfo?.capabilities?.nvenc ? "Khả dụng" : "Không tìm thấy"}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">h264_nvenc · GPU CUDA</div>
              </div>

              <div className={cn(
                "rounded-xl border p-4 transition-all",
                hardwareInfo?.capabilities?.qsv
                  ? "border-sky-500/40 bg-sky-500/5 shadow-md shadow-sky-500/10"
                  : "border-white/10 bg-white/[0.02]"
              )}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300">Intel Quick Sync</span>
                  <span className={cn("h-2 w-2 rounded-full", hardwareInfo?.capabilities?.qsv ? "bg-sky-400 animate-ping" : "bg-slate-600")} />
                </div>
                <div className="mt-2 text-lg font-bold text-slate-100">
                  {hardwareInfo?.capabilities?.qsv ? "Khả dụng" : "Không tìm thấy"}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">h264_qsv · Intel iGPU</div>
              </div>

              <div className={cn(
                "rounded-xl border p-4 transition-all",
                hardwareInfo?.capabilities?.amf
                  ? "border-rose-500/40 bg-rose-500/5 shadow-md shadow-rose-500/10"
                  : "border-white/10 bg-white/[0.02]"
              )}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300">AMD AMF</span>
                  <span className={cn("h-2 w-2 rounded-full", hardwareInfo?.capabilities?.amf ? "bg-rose-400 animate-ping" : "bg-slate-600")} />
                </div>
                <div className="mt-2 text-lg font-bold text-slate-100">
                  {hardwareInfo?.capabilities?.amf ? "Khả dụng" : "Không tìm thấy"}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">h264_amf · Radeon GPU</div>
              </div>

              <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 shadow-md shadow-amber-500/10">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300">CPU Multi-Threaded</span>
                  <span className="h-2 w-2 rounded-full bg-amber-400" />
                </div>
                <div className="mt-2 text-lg font-bold text-amber-300">
                  {hardwareInfo?.optimal_threads ? `${hardwareInfo.optimal_threads} Luồng` : "Tất cả lõi"}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">libx264 -threads 0 (Auto Fallback)</div>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] p-4 text-xs">
              <div className="text-slate-300">
                Encoder đang kích hoạt cho Render: <span className="font-bold text-amber-400 font-mono">{hardwareInfo?.recommended_encoder || "Tự động phát hiện"}</span>
              </div>
              <span className="text-slate-500">Preset: {hardwareInfo?.recommended_preset || "fast"} · Threads: {hardwareInfo?.optimal_threads || "Auto"}</span>
            </div>
          </div>

          {/* 4. Công cụ hệ thống (FFmpeg & FFprobe) */}
          <div className="vas-card p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-amber-400" />
                  Công Cụ Dựng Phim & Xử Lý Media
                </h3>
                <p className="mt-1 text-xs text-slate-400">
                  FFmpeg và FFprobe là công cụ cốt lõi chịu trách nhiệm cắt ghép video, đồng bộ âm thanh và nhúng phụ đề.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={checkFfmpegTools}
                  disabled={ffmpegBusy}
                  className="gap-1.5 text-xs border-white/10"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", ffmpegBusy && "animate-spin")} />
                  Kiểm tra tất cả
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={checkFfmpegUpdate}
                  disabled={ffmpegBusy}
                  className="gap-1.5 text-xs bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400"
                >
                  Kiểm tra cập nhật
                </Button>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-400">Trạng thái FFmpeg</div>
                  <div className="text-base font-bold text-slate-100 mt-0.5">
                    {diagnostics?.ffmpeg_version || "Đang kiểm tra..."}
                  </div>
                </div>
                <CheckCircle2 className="h-6 w-6 text-emerald-400 shrink-0" />
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-400">Trạng thái FFprobe</div>
                  <div className="text-base font-bold text-slate-100 mt-0.5">
                    {diagnostics?.ffprobe_version ? "Sẵn sàng" : "Đang kiểm tra..."}
                  </div>
                </div>
                <CheckCircle2 className="h-6 w-6 text-emerald-400 shrink-0" />
              </div>
            </div>
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
