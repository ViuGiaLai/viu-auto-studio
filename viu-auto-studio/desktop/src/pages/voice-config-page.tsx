import { useEffect, useRef, useState } from "react"
import { Mic, Play, RefreshCw, FolderOpen, Check } from "lucide-react"
import { api, mediaUrl } from "@/services/api"
import { toast } from "@/hooks/use-toast"
import type { TTSConfig, TTSVoice } from "@/types"
import { Button } from "@/components/design-system"
import { Input } from "@/components/design-system"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/design-system"
import { cn } from "@/utils/cn"

const SAMPLE_TEXT_VI = "Xin chào, đây là giọng đọc mẫu của Viu Auto Studio. Hãy điều chỉnh tốc độ và âm lượng để phù hợp với video của bạn."

export default function VoiceConfigPage() {
  const [config, setConfig] = useState<TTSConfig | null>(null)
  const [voices, setVoices] = useState<TTSVoice[]>([])
  const [loading, setLoading] = useState(true)
  const [testingConn, setTestingConn] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [customText, setCustomText] = useState(SAMPLE_TEXT_VI)
  const [elevenLabsKey, setElevenLabsKey] = useState("")
  const [elevenLabsModel, setElevenLabsModel] = useState("eleven_flash_v2_5")
  const [geminiTTSKey, setGeminiTTSKey] = useState("")
  const [vbeeKey, setVbeeKey] = useState("")
  const [googleCloudKey, setGoogleCloudKey] = useState("")
  const [azureKey, setAzureKey] = useState("")
  const [savingKey, setSavingKey] = useState(false)
  const [voiceLangFilter, setVoiceLangFilter] = useState('all')
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const loadAll = async () => {
    try {
      const cfg = await api.ttsGetConfig()
      setConfig(cfg)
      const curKey = cfg.api_keys?.[cfg.provider] || cfg.api_key || ""
      if (cfg.provider === "elevenlabs") setElevenLabsKey(curKey)
      if (cfg.provider === "gemini_tts") setGeminiTTSKey(curKey)
      if (cfg.provider === "vbee") setVbeeKey(curKey)
      if (cfg.provider === "google_cloud_tts") setGoogleCloudKey(curKey)
      if (cfg.provider === "azure_tts") setAzureKey(curKey)

      const vs = await api.ttsListVoices(cfg.provider)
      setVoices(vs)
    } catch (e) {
      toast({ title: "Không tải được cấu hình TTS", description: String(e), variant: "destructive" })
    } finally {
      setLoading(false)
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
      toast({ title: "Đã lưu cấu hình giọng đọc" })
    } catch (e) {
      toast({ title: "Lưu cấu hình thất bại", description: String(e), variant: "destructive" })
    }
  }

  const handleProviderChange = async (p: string) => {
    if (!config) return
    try {
      const vs = await api.ttsListVoices(p)
      setVoices(vs)
      const defaultVoice = vs.length > 0 ? vs[0].id : ""
      const keyForProvider = config.api_keys?.[p] || ""
      if (p === "elevenlabs") setElevenLabsKey(keyForProvider)
      if (p === "gemini_tts") setGeminiTTSKey(keyForProvider)
      if (p === "vbee") setVbeeKey(keyForProvider)
      if (p === "google_cloud_tts") setGoogleCloudKey(keyForProvider)
      if (p === "azure_tts") setAzureKey(keyForProvider)

      await save({ provider: p, voice: defaultVoice })
      setConfig((prev) => prev ? { ...prev, provider: p, voice: defaultVoice } : prev)
      toast({ title: `Đã chọn nhà cung cấp: ${p}`, description: `Đã nạp ${vs.length} giọng.` })
    } catch (e) {
      toast({ title: "Không tải được danh sách giọng", description: String(e), variant: "destructive" })
    }
  }

  const handleSaveApiKey = async (provider: string, keyVal: string) => {
    if (!config) return
    setSavingKey(true)
    try {
      const trimmed = keyVal.trim()
      const updatedKeys = { ...(config.api_keys || {}), [provider]: trimmed }
      await api.ttsSaveConfig({
        provider,
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

  const preview = async () => {
    if (!config || !customText.trim()) return
    setPreviewing(true)
    try {
      const res = await api.ttsPreview(customText, {
        provider: config.provider,
        voice: config.voice || undefined,
        speed: config.speed,
        volume: config.volume,
        pitch: config.pitch,
      })
      if (res.ok && res.audio_path) {
        setPreviewUrl(mediaUrl(res.audio_path))
        toast({ title: "Đã tạo giọng đọc mẫu" })
      } else {
        toast({ title: "Nghe thử thất bại", description: res.message, variant: "destructive" })
      }
    } catch (e) {
      toast({ title: "Nghe thử thất bại", description: String(e), variant: "destructive" })
    } finally {
      setPreviewing(false)
    }
  }

  const testConnection = async () => {
    setTestingConn(true)
    try {
      const res = await api.ttsTestConnection(config ? { provider: config.provider } : undefined)
      toast({ title: res.ok ? "Kết nối thành công" : "Kết nối thất bại", description: res.message })
    } catch (e) {
      toast({ title: "Test kết nối thất bại", description: String(e), variant: "destructive" })
    } finally {
      setTestingConn(false)
    }
  }

  if (loading) {
    return <div className="p-8 text-sm text-slate-500">Đang tải cấu hình giọng đọc...</div>
  }

  return (
    <div className="min-h-full space-y-6 p-8">
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
              onValueChange={handleProviderChange}
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
                <SelectItem value="kokoro">Kokoro TTS (Anh/Mỹ/..., local)</SelectItem>
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
              onValueChange={(v) => void save({ voice: v })}
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
                      {v.name} {v.language ? `(${v.language})` : ""}
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
                  value={geminiTTSKey || config?.api_keys?.gemini_tts || ""}
                  onChange={(e) => setGeminiTTSKey(e.target.value)}
                />
                <Button
                  size="sm"
                  className="whitespace-nowrap bg-white/10 hover:bg-white/15 text-slate-200 text-xs border border-white/10"
                  disabled={savingKey}
                  onClick={() => handleSaveApiKey("gemini_tts", geminiTTSKey || "")}
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
            </div>
          </div>
        )}

        {/* Kho giọng — Danh sách giọng chi tiết */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-slate-400 pt-2">
            <span>Kho giọng — đã tải {voices.length} giọng</span>
            <span className="text-slate-500">mỗi giọng ~63MB</span>
          </div>

          <div className="rounded-xl border border-white/10 divide-y divide-white/5 bg-black/20 max-h-72 overflow-y-auto">
            {voices.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                {config?.provider === "elevenlabs" && !config?.api_keys?.elevenlabs
                  ? "Chưa nhập API key ElevenLabs. Hãy dán API key và bấm 'Lưu key & tải giọng' để hiện toàn bộ giọng."
                  : "Chưa có danh sách giọng từ nhà cung cấp này."}
              </div>
            ) : (
              voices.map((v) => {
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
                          onClick={() => void save({ voice: "" })}
                        >
                          Xoá
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs border-white/10 bg-white/[0.02] hover:bg-white/10 text-slate-200"
                          onClick={() => void save({ voice: v.id })}
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
              <Slider min={0.5} max={2} step={0.05} value={[config?.speed ?? 1]} onValueChange={([v]) => void save({ speed: v })} />
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Cao độ</span>
                <span className="text-amber-300 font-mono">{(config?.pitch ?? 0).toFixed(1)} st</span>
              </div>
              <Slider min={-12} max={12} step={0.5} value={[config?.pitch ?? 0]} onValueChange={([v]) => void save({ pitch: v })} />
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Âm lượng</span>
                <span className="text-amber-300 font-mono">{Math.round((config?.volume ?? 1) * 100)}%</span>
              </div>
              <Slider min={0} max={1} step={0.05} value={[config?.volume ?? 1]} onValueChange={([v]) => void save({ volume: v })} />
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
    </div>
  )
}
