import { useEffect, useRef, useState } from "react"
import {
  Mic, Play, Pause, RefreshCw, Check, Download, Globe, Search,
  Sliders, Volume2, Sparkles, KeyRound, ArrowRight, ShieldCheck,
  FileText, Copy, Trash2, Zap, AudioLines
} from "lucide-react"
import { api, mediaUrl } from "@/services/api"
import { toast } from "@/hooks/use-toast"
import type { TTSConfig, TTSVoice } from "@/types"
import { Button } from "@/components/design-system"
import { Input } from "@/components/design-system"
import { Textarea } from "@/components/ui/textarea"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/utils/cn"

export const SAMPLE_SCRIPTS = [
  {
    label: "🎬 Review Phim",
    text: "Bộ phim bắt đầu bằng một khung cảnh hoang tàn và u ám, nơi nhân vật chính thức tỉnh mà không hề nhớ mình là ai giữa vùng đất lạ lùng này...",
  },
  {
    label: "📰 Bản Tin Thời Sự",
    text: "Kính chào quý vị và các bạn, đây là bản tin cập nhật công nghệ tự động hóa video với công nghệ AI mới nhất hôm nay.",
  },
  {
    label: "📖 Tóm Tắt Truyện",
    text: "Tại một vương quốc xa xôi ngày xưa, có một người thợ rèn trẻ tuổi nắm giữ bí mật về ngọn lửa vĩnh cửu có thể rèn nên những lưỡi gươm huyền thoại.",
  },
  {
    label: "🔥 Video Ngắn / TikTok",
    text: "3 mẹo cực đỉnh giúp bạn x2 năng suất làm video mỗi ngày mà 99% creator chưa từng biết tới, xem ngay nhé!",
  },
]

export const COUNTRY_FILTERS = [
  { id: "all", label: "⭐ Tất cả" },
  { id: "vi", label: "🇻🇳 Tiếng Việt" },
  { id: "en", label: "🇺🇸 Tiếng Anh" },
  { id: "ja", label: "🇯🇵 Tiếng Nhật" },
  { id: "ko", label: "🇰🇷 Tiếng Hàn" },
  { id: "zh", label: "🇨🇳 Tiếng Trung" },
  { id: "th", label: "🇹🇭 Tiếng Thái" },
  { id: "other", label: "🌍 Quốc tế" },
]

export const PROVIDERS = [
  { id: "edge", label: "Edge TTS", badge: "Miễn phí · Cloud", icon: "⭐", desc: "Không cần API key · Tốc độ cao" },
  { id: "kokoro_vi", label: "Kokoro VN", badge: "Local Offline", icon: "🇻🇳", desc: "AI Offline tiếng Việt tự nhiên" },
  { id: "elevenlabs", label: "ElevenLabs", badge: "Cao cấp AI", icon: "🎙", desc: "Giọng AI siêu thực & cảm xúc", needsKey: true },
  { id: "gemini_tts", label: "Gemini TTS", badge: "Google Cloud", icon: "✨", desc: "Google AI Studio Cloud Audio", needsKey: true },
  { id: "vbee", label: "Vbee", badge: "Giọng Việt", icon: "🇻🇳", desc: "Giọng đọc truyền cảm đa vùng miền", needsKey: true },
]

export function getSampleTextForVoice(voice?: TTSVoice | null, langCode?: string): string {
  const code = (voice?.language || voice?.id || langCode || "").toLowerCase()
  if (code.startsWith("vi") || voice?.id?.startsWith("kokoro_vi") || voice?.id?.startsWith("hn_") || voice?.id?.startsWith("sg_") || voice?.id?.startsWith("hue_")) {
    return "Xin chào, đây là giọng đọc mẫu của Viu Auto Studio. Hãy điều chỉnh tốc độ và âm lượng để phù hợp với video của bạn."
  }
  if (code.startsWith("ja") || voice?.id?.startsWith("ja")) {
    return "こんにちは！これは Viu Auto Studio の音声サンプルです。動画に合わせてスピードや音量を調整してください。"
  }
  if (code.startsWith("ko") || voice?.id?.startsWith("ko")) {
    return "안녕하세요! Viu Auto Studio의 샘플 음성입니다. 비디오에 맞게 속도와 음량을 조절해 보세요."
  }
  if (code.startsWith("zh") || voice?.id?.startsWith("zh")) {
    return "你好！这是 Viu Auto Studio 的语音示例。请根据您的视频调整语速和音量。"
  }
  if (code.startsWith("th") || voice?.id?.startsWith("th")) {
    return "สวัสดีครับ! นี่คือตัวอย่างเสียงจาก Viu Auto Studio ปรับความเร็วและระดับเสียงให้เหมาะกับวิดีโอของคุณได้เลย"
  }
  if (code.startsWith("en") || voice?.id?.startsWith("en") || voice?.id?.startsWith("kokoro_a")) {
    return "Hello! This is a voice sample from Viu Auto Studio. Adjust the speed and volume to fit your video perfectly."
  }
  return "Xin chào, đây là giọng đọc mẫu của Viu Auto Studio. Hãy điều chỉnh tốc độ và âm lượng để phù hợp với video của bạn."
}

export function getCountryBadge(lang: string, id: string) {
  const code = (lang || id || "").toLowerCase()
  if (code.startsWith("vi") || id.startsWith("kokoro_vi") || id.startsWith("hn_") || id.startsWith("sg_") || id.startsWith("hue_")) return { flag: "🇻🇳", label: "VI" }
  if (code.startsWith("en-us") || id.startsWith("en-us")) return { flag: "🇺🇸", label: "US" }
  if (code.startsWith("en-gb") || id.startsWith("en-gb")) return { flag: "🇬🇧", label: "GB" }
  if (code.startsWith("en")) return { flag: "🇺🇸", label: "EN" }
  if (code.startsWith("ja")) return { flag: "🇯🇵", label: "JP" }
  if (code.startsWith("ko")) return { flag: "🇰🇷", label: "KR" }
  if (code.startsWith("zh")) return { flag: "🇨🇳", label: "CN" }
  if (code.startsWith("th")) return { flag: "🇹🇭", label: "TH" }
  if (code.startsWith("id")) return { flag: "🇮🇩", label: "ID" }
  if (code.startsWith("es")) return { flag: "🇪🇸", label: "ES" }
  if (code.startsWith("fr")) return { flag: "🇫🇷", label: "FR" }
  if (code.startsWith("de")) return { flag: "🇩🇪", label: "DE" }
  if (code.startsWith("pt")) return { flag: "🇧🇷", label: "BR" }
  return { flag: "🌍", label: "AI" }
}

export function VoiceStudioPanel() {
  const [config, setConfig] = useState<TTSConfig | null>(null)
  const [voices, setVoices] = useState<TTSVoice[]>([])
  const [previewing, setPreviewing] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isPlayingAudio, setIsPlayingAudio] = useState(false)
  const [customText, setCustomText] = useState(SAMPLE_SCRIPTS[0].text)
  const [voiceLangFilter, setVoiceLangFilter] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")

  // Quick Card Preview Player
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null)

  // API Key inputs
  const [apiKeyInput, setApiKeyInput] = useState("")
  const [showApiKeyDrawer, setShowApiKeyDrawer] = useState(false)
  const [testingConn, setTestingConn] = useState(false)

  const audioRef = useRef<HTMLAudioElement | null>(null)

  const loadAll = async () => {
    try {
      const cfg = await api.ttsGetConfig()
      setConfig(cfg)
      const curKey = cfg.api_keys?.[cfg.provider] || cfg.api_key || ""
      setApiKeyInput(curKey)

      const vs = await api.ttsListVoices(cfg.provider)
      setVoices(vs)
    } catch (e) {
      toast({ title: "Không tải được cấu hình TTS", description: String(e), variant: "destructive" })
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  const save = async (patch: Partial<TTSConfig>) => {
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
        api_key: next.api_key,
        api_keys: next.api_keys,
      })
      setConfig(next)
    } catch (e) {
      toast({ title: "Không thể lưu", description: String(e), variant: "destructive" })
    }
  }

  const handleProviderChange = async (providerId: string) => {
    if (!config || config.provider === providerId) return
    try {
      const vs = await api.ttsListVoices(providerId)
      setVoices(vs)
      const defaultVoice = vs.length > 0 ? vs[0].id : ""
      const keyForProvider = config.api_keys?.[providerId] || ""
      setApiKeyInput(keyForProvider)

      await save({ provider: providerId, voice: defaultVoice })
      setConfig((prev) => prev ? { ...prev, provider: providerId, voice: defaultVoice } : prev)
    } catch (e) {
      toast({ title: "Lỗi chuyển nhà cung cấp", description: String(e), variant: "destructive" })
    }
  }

  const handleSelectVoice = async (voiceId: string) => {
    if (!config) return
    try {
      await save({ voice: voiceId })
      setConfig((prev) => prev ? { ...prev, voice: voiceId } : prev)
    } catch (e) {
      toast({ title: "Lỗi chọn giọng", description: String(e), variant: "destructive" })
    }
  }

  const handleGeneratePreview = async (specificVoiceId?: string) => {
    if (!config) return
    const voiceToUse = specificVoiceId || config.voice || (voices.length > 0 ? voices[0].id : "")
    if (!voiceToUse) {
      toast({ title: "Chưa chọn giọng đọc", description: "Vui lòng chọn một giọng trong danh sách trước khi tạo.", variant: "destructive" })
      return
    }

    const textToRead = customText.trim() || SAMPLE_SCRIPTS[0].text
    setPreviewing(true)
    if (specificVoiceId) setPreviewingVoiceId(specificVoiceId)

    try {
      const res = await api.ttsTestPreview({
        provider: config.provider,
        voice: voiceToUse,
        text: textToRead,
        speed: config.speed || 1.0,
        pitch: config.pitch || 0,
        volume: config.volume || 1.0,
      })

      if (res.ok && res.audio_url) {
        const fullUrl = mediaUrl(res.audio_url)
        setPreviewUrl(fullUrl)
        if (audioRef.current) {
          audioRef.current.src = fullUrl
          audioRef.current.play().catch(() => {})
          setIsPlayingAudio(true)
        }
      } else {
        toast({ title: "Tạo giọng đọc thất bại", description: res.message || "Kiểm tra lại kết nối mạng hoặc API key.", variant: "destructive" })
      }
    } catch (e) {
      toast({ title: "Lỗi tạo giọng đọc", description: String(e), variant: "destructive" })
    } finally {
      setPreviewing(false)
      setPreviewingVoiceId(null)
    }
  }

  const handleSaveApiKey = async () => {
    if (!config) return
    try {
      const trimmed = apiKeyInput.trim()
      const updatedKeys = { ...(config.api_keys || {}), [config.provider]: trimmed }
      await save({ api_key: trimmed, api_keys: updatedKeys })
      toast({ title: "Đã lưu API Key", description: `Đã áp dụng cho ${config.provider}` })
      // Refresh voices with new key
      const vs = await api.ttsListVoices(config.provider)
      setVoices(vs)
    } catch (e) {
      toast({ title: "Lỗi lưu key", description: String(e), variant: "destructive" })
    }
  }

  const handleTestConnection = async () => {
    if (!config) return
    setTestingConn(true)
    try {
      const res = await api.ttsTestConnection({
        provider: config.provider,
        api_key: apiKeyInput.trim(),
      })
      toast({
        title: res.ok ? "Kết nối thành công ✓" : "Kết nối thất bại",
        description: res.message,
        variant: res.ok ? "default" : "destructive"
      })
    } catch (e) {
      toast({ title: "Kiểm tra kết nối thất bại", description: String(e), variant: "destructive" })
    } finally {
      setTestingConn(false)
    }
  }

  const filteredVoices = voices.filter((v) => {
    // Language filter
    if (voiceLangFilter !== "all") {
      const lang = (v.language || v.id || "").toLowerCase()
      if (voiceLangFilter === "vi" && !(lang.startsWith("vi") || v.id.startsWith("vi") || v.id.startsWith("kokoro_vi") || v.id.startsWith("hn_") || v.id.startsWith("sg_") || v.id.startsWith("hue_"))) return false
      if (voiceLangFilter === "en" && !(lang.startsWith("en") || v.id.startsWith("en") || v.id.startsWith("kokoro_a"))) return false
      if (voiceLangFilter === "ja" && !(lang.startsWith("ja") || v.id.startsWith("ja"))) return false
      if (voiceLangFilter === "ko" && !(lang.startsWith("ko") || v.id.startsWith("ko"))) return false
      if (voiceLangFilter === "zh" && !(lang.startsWith("zh") || v.id.startsWith("zh"))) return false
      if (voiceLangFilter === "th" && !(lang.startsWith("th") || v.id.startsWith("th"))) return false
      if (voiceLangFilter === "other" && ["vi", "en", "ja", "ko", "zh", "th"].some((code) => lang.startsWith(code) || v.id.startsWith(code))) return false
    }
    // Search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      return v.name.toLowerCase().includes(query) || v.id.toLowerCase().includes(query) || (v.description || "").toLowerCase().includes(query)
    }
    return true
  })

  const currentVoiceObj = voices.find((v) => v.id === config?.voice) || (voices.length > 0 ? voices[0] : null)
  const currentProviderMeta = PROVIDERS.find((p) => p.id === config?.provider) || PROVIDERS[0]
  const charCount = customText.length
  const estimatedSeconds = (charCount / 18).toFixed(1)

  return (
    <div className="space-y-6">
      {/* Audio element */}
      <audio
        ref={audioRef}
        onEnded={() => setIsPlayingAudio(false)}
        onPause={() => setIsPlayingAudio(false)}
        onPlay={() => setIsPlayingAudio(true)}
      />

      {/* 1. Header & Provider Pills */}
      <div className="rounded-2xl border border-white/10 bg-[#0d1318] p-6 shadow-2xl space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2.5">
              <Mic className="h-6 w-6 text-amber-400" />
              Viu Voice Studio — Text To Speech & Đọc Kịch Bản AI
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Soạn thảo kịch bản, lựa chọn giọng đọc truyền cảm, tinh chỉnh tốc độ và tạo file âm thanh chất lượng phòng thu.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 text-xs font-semibold text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Engine: {currentProviderMeta.label} ({voices.length} giọng sẵn sàng)
            </span>
          </div>
        </div>

        {/* Provider Selector Tabs */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/5">
          <span className="text-xs font-semibold text-slate-400 mr-1">Nhà cung cấp:</span>
          {PROVIDERS.map((p) => {
            const isActive = config?.provider === p.id
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => handleProviderChange(p.id)}
                className={cn(
                  "flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer border",
                  isActive
                    ? "bg-[#0f2532] text-amber-400 border-amber-400/80 shadow-lg shadow-amber-500/20 ring-1 ring-amber-400/40"
                    : "bg-white/[0.02] text-slate-400 border-white/10 hover:border-amber-500/30 hover:text-slate-200 hover:bg-white/[0.04]"
                )}
              >
                <span>{p.icon}</span>
                <span>{p.label}</span>
                <span className={cn("text-[10px] px-1.5 py-0.2 rounded-full font-medium", isActive ? "bg-amber-400/20 text-amber-300" : "bg-white/5 text-slate-400")}>
                  {p.badge}
                </span>
              </button>
            )
          })}

          {currentProviderMeta.needsKey && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowApiKeyDrawer(!showApiKeyDrawer)}
              className="gap-1.5 text-xs ml-auto border-amber-500/30 text-amber-300 hover:bg-amber-500/10"
            >
              <KeyRound className="h-3.5 w-3.5" />
              {showApiKeyDrawer ? "Ẩn cài đặt API Key" : "Cấu hình API Key"}
            </Button>
          )}
        </div>

        {/* Collapsible API Key Drawer */}
        {currentProviderMeta.needsKey && showApiKeyDrawer && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.03] p-4 space-y-3 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-amber-300 flex items-center gap-2">
                <KeyRound className="h-4 w-4" /> API Key cho {currentProviderMeta.label}
              </div>
              <div className="text-[11px] text-slate-400">{currentProviderMeta.desc}</div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                type="password"
                placeholder={`Nhập ${currentProviderMeta.label} API Key...`}
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                className="bg-black/40 border-white/15 text-xs flex-1"
              />
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleTestConnection}
                  disabled={testingConn || !apiKeyInput.trim()}
                  className="text-xs border-white/15 gap-1.5"
                >
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                  {testingConn ? "Đang kiểm tra..." : "Test kết nối"}
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveApiKey}
                  className="text-xs bg-gradient-to-r from-[#d9940a] to-[#faaa02] text-slate-950 font-bold hover:brightness-110"
                >
                  Lưu Key
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. Main 2-Column Studio Grid */}
      <div className="grid gap-6 lg:grid-cols-12 items-start">
        {/* LEFT COLUMN: Text-to-Speech Editor & Generation Studio (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          {/* Active Voice Spotlight Card */}
          <div className="rounded-2xl border border-amber-500/30 bg-[#0e171e] p-5 shadow-xl space-y-3 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-amber-400 to-transparent" />
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-400/40 flex items-center justify-center text-xl shadow-inner shadow-amber-500/20">
                  {currentVoiceObj ? getCountryBadge(currentVoiceObj.language || "", currentVoiceObj.id).flag : "🎙"}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold text-white">
                      {currentVoiceObj?.name || "Chưa chọn giọng"}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 uppercase">
                      Đang chọn
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {currentVoiceObj?.description || `${currentVoiceObj?.gender || "Giọng AI"} · Chuẩn phát âm cao`}
                  </div>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Engine</span>
                <span className="text-xs font-bold text-amber-400">{currentProviderMeta.label}</span>
              </div>
            </div>
          </div>

          {/* Script Textarea Workspace */}
          <div className="rounded-2xl border border-white/10 bg-[#0d1318] p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-200">
                <FileText className="h-4 w-4 text-amber-400" />
                <span>Nội dung kịch bản cần đọc</span>
              </div>
              <div className="text-xs text-slate-400">
                <strong className="text-amber-400 font-bold">{charCount}</strong> ký tự · Ước tính: <strong className="text-slate-200 font-semibold">~{estimatedSeconds}s</strong>
              </div>
            </div>

            <Textarea
              rows={6}
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="Nhập hoặc dán đoạn văn bản kịch bản bạn muốn chuyển thành giọng nói tại đây..."
              className="w-full resize-y bg-black/40 border-white/10 text-slate-100 text-sm leading-relaxed focus:border-amber-400/80 rounded-xl p-4 placeholder:text-slate-500"
            />

            {/* Quick Sample Script Chips */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-[11px] font-medium text-slate-500">Mẫu kịch bản:</span>
              {SAMPLE_SCRIPTS.map((sample, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setCustomText(sample.text)}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium bg-white/[0.03] border border-white/5 text-slate-300 hover:text-amber-300 hover:border-amber-500/30 hover:bg-white/[0.06] transition-all cursor-pointer"
                >
                  {sample.label}
                </button>
              ))}
              {customText && (
                <button
                  type="button"
                  onClick={() => setCustomText("")}
                  className="text-xs text-slate-500 hover:text-rose-400 ml-auto flex items-center gap-1 transition-colors"
                >
                  <Trash2 className="h-3 w-3" /> Xóa
                </button>
              )}
            </div>
          </div>

          {/* Voice Fine-Tuning Controls (Sliders) */}
          <div className="rounded-2xl border border-white/10 bg-[#0d1318] p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-200">
                <Sliders className="h-4 w-4 text-amber-400" />
                <span>Tinh chỉnh âm thanh</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => save({ speed: 1.0, pitch: 0, volume: 1.0 })}
                className="h-7 text-xs text-slate-400 hover:text-amber-300 px-2"
              >
                Đặt lại mặc định
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-3 pt-2">
              {/* Tốc độ (Speed) */}
              <div className="space-y-2 rounded-xl border border-white/5 bg-white/[0.02] p-3.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-300">Tốc độ (Speed)</span>
                  <span className="font-bold text-amber-400 font-mono">{(config?.speed || 1.0).toFixed(2)}x</span>
                </div>
                <Slider
                  min={0.5}
                  max={2.0}
                  step={0.05}
                  value={[config?.speed || 1.0]}
                  onValueChange={([val]) => save({ speed: val })}
                />
                <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1">
                  <span>0.5x</span>
                  <span>1.0x (Chuẩn)</span>
                  <span>2.0x</span>
                </div>
              </div>

              {/* Cao độ (Pitch) */}
              <div className="space-y-2 rounded-xl border border-white/5 bg-white/[0.02] p-3.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-300">Cao độ (Pitch)</span>
                  <span className="font-bold text-amber-400 font-mono">{(config?.pitch || 0) > 0 ? `+${config?.pitch}` : config?.pitch || 0} st</span>
                </div>
                <Slider
                  min={-10}
                  max={10}
                  step={1}
                  value={[config?.pitch || 0]}
                  onValueChange={([val]) => save({ pitch: val })}
                />
                <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1">
                  <span>Trầm (-10)</span>
                  <span>0 (Gốc)</span>
                  <span>Bổng (+10)</span>
                </div>
              </div>

              {/* Âm lượng (Volume) */}
              <div className="space-y-2 rounded-xl border border-white/5 bg-white/[0.02] p-3.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-300">Âm lượng (Volume)</span>
                  <span className="font-bold text-amber-400 font-mono">{Math.round((config?.volume || 1.0) * 100)}%</span>
                </div>
                <Slider
                  min={0.1}
                  max={2.0}
                  step={0.05}
                  value={[config?.volume || 1.0]}
                  onValueChange={([val]) => save({ volume: val })}
                />
                <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1">
                  <span>10%</span>
                  <span>100%</span>
                  <span>200%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Action & Audio Player Bar */}
          <div className="rounded-2xl border border-amber-500/40 bg-gradient-to-r from-[#0d1720] via-[#0e1c26] to-[#0d1720] p-5 shadow-2xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <Button
                size="lg"
                onClick={() => handleGeneratePreview()}
                disabled={previewing}
                className="w-full sm:w-auto flex-1 gap-2 bg-gradient-to-r from-[#d9940a] via-[#faaa02] to-[#d9940a] text-slate-950 font-bold shadow-lg shadow-amber-500/25 hover:brightness-110 h-12 text-sm"
              >
                {previewing ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Đang tạo giọng nói AI...</span>
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 fill-current" />
                    <span>Tạo Giọng Nói & Nghe Thử</span>
                  </>
                )}
              </Button>

              {previewUrl && (
                <a
                  href={previewUrl}
                  download="viu_voice_preview.mp3"
                  className="inline-flex items-center justify-center gap-1.5 px-4 h-12 rounded-xl text-xs font-bold border border-white/15 bg-white/[0.04] text-slate-200 hover:bg-white/10 transition-colors"
                >
                  <Download className="h-4 w-4" /> Tải file MP3
                </a>
              )}
            </div>

            {/* Custom Audio Player when ready */}
            {previewUrl && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 flex items-center justify-between gap-4 text-xs animate-in fade-in duration-300">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (audioRef.current) {
                        if (isPlayingAudio) audioRef.current.pause()
                        else audioRef.current.play()
                      }
                    }}
                    className="h-10 w-10 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center shadow-lg shadow-emerald-500/30 hover:scale-105 transition-all cursor-pointer shrink-0"
                  >
                    {isPlayingAudio ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current ml-0.5" />}
                  </button>
                  <div>
                    <div className="font-bold text-slate-100 flex items-center gap-2">
                      <AudioLines className="h-4 w-4 text-emerald-400 animate-pulse" />
                      Âm thanh đã tạo thành công
                    </div>
                    <div className="text-slate-400 text-[11px] mt-0.5">
                      Giọng: <span className="text-emerald-300 font-semibold">{currentVoiceObj?.name}</span> · Engine: {currentProviderMeta.label}
                    </div>
                  </div>
                </div>

                <span className="text-emerald-400 font-mono font-bold bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-full text-[11px]">
                  Sẵn sàng xuất video ✓
                </span>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Voice Library & Selection (5 cols) */}
        <div className="lg:col-span-5 rounded-2xl border border-white/10 bg-[#0d1318] p-5 shadow-2xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Globe className="h-4 w-4 text-amber-400" />
              Kho Giọng Đọc ({filteredVoices.length}/{voices.length})
            </h3>
            <span className="text-[11px] text-slate-400">Bấm nghe thử trước khi chọn</span>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm theo tên giọng, phong cách..."
              className="bg-black/40 border-white/10 text-xs pl-8 h-9"
            />
          </div>

          {/* Language Filter Pills */}
          <div className="flex flex-wrap gap-1.5">
            {COUNTRY_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setVoiceLangFilter(f.id)}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer border",
                  voiceLangFilter === f.id
                    ? "bg-[#0f2532] text-amber-400 border-amber-400/80 shadow-sm"
                    : "bg-white/[0.02] text-slate-400 border-white/5 hover:bg-white/5 hover:text-slate-200"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Voice Cards List (Scrollable) */}
          <div className="space-y-2.5 max-h-[580px] overflow-y-auto pr-1">
            {filteredVoices.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs">
                Không tìm thấy giọng đọc nào phù hợp với bộ lọc.
              </div>
            ) : (
              filteredVoices.map((v) => {
                const isSelected = config?.voice === v.id
                const isPreviewingThis = previewingVoiceId === v.id
                const badge = getCountryBadge(v.language || "", v.id)

                return (
                  <div
                    key={v.id}
                    className={cn(
                      "rounded-xl border p-3.5 transition-all flex items-center justify-between gap-3",
                      isSelected
                        ? "border-amber-500/80 bg-gradient-to-b from-amber-500/15 via-amber-500/5 to-transparent shadow-md shadow-amber-500/10 ring-1 ring-amber-400/60"
                        : "border-white/5 bg-white/[0.02] hover:border-amber-500/30 hover:bg-white/[0.04]"
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center text-base shrink-0">
                        {badge.flag}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-slate-100 truncate">{v.name}</span>
                          {isSelected && (
                            <span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 border border-amber-400/30 px-1.5 py-0.2 rounded-full shrink-0">
                              Mặc định ✓
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">
                          {v.description || `${v.gender || "AI"} · ${badge.label}`}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Mini Preview Button */}
                      <button
                        type="button"
                        onClick={() => handleGeneratePreview(v.id)}
                        disabled={previewing}
                        title="Nghe thử giọng này"
                        className={cn(
                          "h-8 w-8 rounded-lg border flex items-center justify-center transition-all cursor-pointer",
                          isPreviewingThis
                            ? "bg-amber-400 text-slate-950 border-amber-400"
                            : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-amber-500/20 hover:text-amber-300 hover:border-amber-500/30"
                        )}
                      >
                        {isPreviewingThis ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5 fill-current ml-0.5" />}
                      </button>

                      {/* Select Button */}
                      <button
                        type="button"
                        onClick={() => handleSelectVoice(v.id)}
                        className={cn(
                          "px-3 h-8 rounded-lg text-xs font-bold transition-all cursor-pointer border",
                          isSelected
                            ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                            : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-amber-500/40 hover:bg-amber-500/10 hover:text-amber-300"
                        )}
                      >
                        {isSelected ? "Đang chọn" : "Chọn giọng"}
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
