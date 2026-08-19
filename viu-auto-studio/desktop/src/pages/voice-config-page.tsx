import { useEffect, useState } from "react"
import { Mic, Play, RefreshCw, FolderOpen, AlertTriangle, Pause, Loader2 } from "lucide-react"
import { api, mediaUrl, selectDirectory } from "@/services/api"
import { toast } from "@/hooks/use-toast"
import type { TTSConfig, TTSVoice } from "@/types"
import { Button } from "@/components/design-system"
import { Input } from "@/components/design-system"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/design-system"
import { Switch } from "@/components/ui/switch"

const SAMPLE_TEXT_VI = "Xin chào, đây là giọng đọc mẫu của Viu Auto Studio. Hãy điều chỉnh tốc độ và âm lượng để phù hợp với video của bạn."

export default function VoiceConfigPage() {
  const [config, setConfig] = useState<TTSConfig | null>(null)
  const [providers, setProviders] = useState<Array<{ id: string; name: string; available: boolean }>>([])
  const [voices, setVoices] = useState<TTSVoice[]>([])
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState(false)
  const [testingConn, setTestingConn] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [customText, setCustomText] = useState(SAMPLE_TEXT_VI)
  const [playingVoice, setPlayingVoice] = useState<string | null>(null)
  const [voiceSearch, setVoiceSearch] = useState("")


  const loadAll = async () => {
    try {
      const [cfg, provs] = await Promise.all([
        api.ttsGetConfig(),
        api.ttsListProviders(),
      ])
      setConfig(cfg)
      setProviders(provs)
      setVoices(await api.ttsListVoices(cfg?.provider))
    } catch (e) {
      toast({ title: "Không tải được cấu hình TTS", description: String(e), variant: "destructive" })
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

  const save = async (patch: Partial<TTSConfig>) => {
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
      toast({ title: "Đã lưu cấu hình giọng đọc" })
    } catch (e) {
      toast({ title: "Lưu cấu hình thất bại", description: String(e), variant: "destructive" })
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
      })
      if (res.ok && res.audio_path) {
        setPreviewUrl(res.audio_path + "?t=" + Date.now())
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

  const regenerateAllVoices = async () => {
    try {
      const projects = await api.listProjects()
      const approved = projects.filter((p) =>
        ["script_ready", "script_approved", "voice_ready", "media_ready", "subtitle_ready", "completed", "failed"].includes(p.status),
      )
      for (const p of approved) {
        try {
          await api.buildScenes(p.id)
          toast({ title: `Đã tạo lại giọng cho "${p.name}"` })
        } catch {
          toast({ title: `Bỏ qua "${p.name}" (chưa có kịch bản)`, variant: "destructive" })
        }
      }
    } catch (e) {
      toast({ title: "Tạo lại voice thất bại", description: String(e), variant: "destructive" })
    }
  }

  if (loading) {
    return <div className="p-8 text-sm text-slate-500">Đang tải cấu hình giọng đọc...</div>
  }

  return (
    <div className="min-h-full space-y-6 p-8">
      <div className="flex items-center gap-4">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-white">
          <Mic className="h-6 w-6 text-amber-400" />
          TTS
        </h1>
        <p className="text-sm text-slate-400">
          Giọng Việt offline · Đọc đoạn văn · Tải MP3/WAV
        </p>
      </div>
      <p className="-mt-2 text-xs text-slate-500">
        Chọn nhà cung cấp → mỗi video có thể dùng provider riêng ở trang dự án · Giọng nghe thử là giọng thật do provider tạo ra.
      </p>

      {/* Provider notice */}
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div className="text-xs text-slate-400">
            <strong className="text-slate-200">Edge TTS</strong> tạo giọng nói thật; cần kết nối mạng trong lần tổng hợp.
            <strong className="text-slate-200"> LocalTTS</strong> (khung Piper) và <strong className="text-slate-200">CloudTTS</strong> (khung API online) là khung tích hợp
            — khi bạn chọn chúng, hệ thống sẽ báo lỗi rõ ràng cho đến khi provider tương ứng được tích hợp đầy đủ.
            Chúng tôi không tự nhận đã hỗ trợ model chưa tích hợp thật.
          </div>
        </div>
      </div>

      {/* Provider tabs */}
      <div className="flex flex-wrap gap-1 rounded-lg border border-white/8 bg-[#141d22] p-1">
        {providers.map((p) => (
          <Button variant="ghost"
            key={p.id}
            onClick={() => void save({ provider: p.id })}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
              config?.provider === p.id
                ? "bg-gradient-to-r from-[#d9940a] to-[#faaa02] text-white"
                : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
            }`}
          >
            {p.name.split(" (")[0]}
            {!p.available && <span className="ml-1 text-[9px] opacity-70">(chưa)</span>}
          </Button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="vas-card p-5">
          <h3 className="mb-4 text-base font-semibold text-slate-100">Nhà cung cấp & Giọng</h3>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm text-slate-300">Provider</Label>
              <Select
                value={config?.provider || "edge"}
                onValueChange={(v) => void save({ provider: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {providers.map((p) => (
                    <SelectItem key={p.id} value={p.id} disabled={!p.available}>
                      {p.name}{p.available ? "" : " (chưa sẵn sàng)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm text-slate-300">Giọng đọc</Label>
              <Select
                value={config?.voice || (voices[0]?.id ?? "")}
                onValueChange={(v) => void save({ voice: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {voices.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name} ({v.language.toUpperCase()})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm text-slate-300">Thư mục model local (cho LocalTTS)</Label>
              <div className="flex gap-2">
                <Input
                  value={config?.model_dir || ""}
                  onChange={(e) => void save({ model_dir: e.target.value })}
                  placeholder="VD: C:\\Models\\Piper"
                />
                <Button variant="outline" size="icon" title="Chọn thư mục" onClick={async () => { const folder = await selectDirectory(); if (folder) await save({ model_dir: folder }) }}>
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <Button variant="outline" onClick={testConnection} disabled={testingConn} className="w-full">
              <RefreshCw className={testingConn ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              {testingConn ? "Đang kiểm tra..." : "Test kết nối"}
            </Button>
          </div>
        </div>

        <div className="vas-card p-5">
          <h3 className="mb-4 text-base font-semibold text-slate-100">Tốc độ & Âm lượng</h3>
          <div className="space-y-5">
            <div className="space-y-1.5">
              <Label className="text-sm text-slate-300">Tốc độ: {config?.speed ?? 1}</Label>
              <Slider
                value={[config?.speed ?? 1]}
                min={0.5}
                max={2}
                step={0.1}
                onValueChange={(v) => void save({ speed: v[0] })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm text-slate-300">Âm lượng: {((config?.volume ?? 1) * 100).toFixed(0)}%</Label>
              <Slider
                value={[config?.volume ?? 1]}
                min={0}
                max={2}
                step={0.1}
                onValueChange={(v) => void save({ volume: v[0] })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm text-slate-300">Nghe thử</Label>
              <Textarea value={customText} onChange={(e) => setCustomText(e.target.value)} rows={3} />
            </div>
            <Button onClick={preview} disabled={previewing} className="w-full">
              <Play className={previewing ? "h-4 w-4 animate-pulse" : "h-4 w-4"} />
              {previewing ? "Đang tạo..." : "Nghe thử"}
            </Button>
            {previewUrl && (
              <audio controls src={previewUrl} className="w-full" autoPlay />
            )}
          </div>
        </div>
      </div>

      <div className="vas-card p-5">
        <h3 className="mb-4 text-base font-semibold text-slate-100">Tạo lại audio cho các dự án</h3>
        <p className="mb-4 text-sm text-slate-500">
          Áp dụng cấu hình giọng hiện tại và tạo lại giọng đọc cho mọi cảnh đã duyệt
        </p>
        <Button variant="outline" onClick={regenerateAllVoices}>
          <Mic className="h-4 w-4" />
          Tạo lại audio toàn bộ dự án
        </Button>
      </div>

      {/* Voice catalog */}
      <div className="vas-card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-slate-100">
            Kho giọng — đã tải {voices.filter((v) => v.id === (config?.voice || "")).length}/{voices.length}
          </h3>
          <p className="text-xs text-slate-500">
            Bấm ▶ để nghe thử · Bấm <span className="text-amber-300">Dùng giọng này</span> để đặt làm giọng mặc định
          </p>
          <Input
            value={voiceSearch}
            onChange={(e) => setVoiceSearch(e.target.value)}
            placeholder="Tìm giọng..."
            className="w-48"
          />
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {voices.length === 0 ? (
            <div className="col-span-2 py-4 text-center text-sm text-slate-500">Chưa có giọng nào.</div>
          ) : (
            voices
              .filter((v) => v.name.toLowerCase().includes(voiceSearch.toLowerCase()))
              .map((v) => {
                const isDefault = v.id === (config?.voice || "")
                return (
                  <div
                    key={v.id}
                    className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-2.5 transition-colors hover:border-amber-500/20"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-slate-200">{v.name}</span>
                      {isDefault && (
                        <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-amber-300">
                          MẶC ĐỊNH
                        </span>
                      )}
                    </div>
                    <p className="hidden text-xs text-slate-500 xl:block">
                      {v.gender === "female" ? "Nữ" : "Nam"}
                    </p>
                    <div className="flex items-center gap-2">
                      {playingVoice === v.id ? (
                        <Button variant="ghost"
                          onClick={() => setPlayingVoice(null)}
                          className="rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-slate-300 transition-colors hover:bg-white/[0.08]"
                        >
                          <Pause className="inline h-3 w-3" />
                        </Button>
                      ) : (
                        <Button variant="ghost"
                          onClick={async () => {
                            setPlayingVoice(v.id)
                            try {
                              const res = await api.ttsPreview(customText, {
                                voice: v.id,
                                provider: config?.provider || "edge",
                              })
                              if (res.ok && res.audio_path) {
                                const audio = new Audio(mediaUrl(res.audio_path))
                                audio.onended = () => setPlayingVoice(null)
                                audio.play()
                                setTimeout(() => setPlayingVoice(null), 10000)
                              } else {
                                setPlayingVoice(null)
                              }
                            } catch {
                              setPlayingVoice(null)
                            }
                          }}
                          className="rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-slate-300 transition-colors hover:bg-white/[0.08]"
                        >
                          <Play className="inline h-3 w-3" />
                        </Button>
                      )}
                      <Button variant="ghost"
                        onClick={() => void save({ voice: v.id })}
                        className="rounded-md border border-amber-500/30 px-2.5 py-1.5 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-500/10"
                      >
                        Dùng giọng này
                      </Button>
                    </div>
                  </div>
                )
              })
          )}
        </div>
      </div>
    </div>
  )
}
