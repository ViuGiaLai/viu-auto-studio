import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { CheckCircle2, ExternalLink, Loader2, RefreshCw, Save } from "lucide-react"
import { flowApi, globalApi, type FlowConnectionRead, type FlowTaskRead } from "@/services/pages-api"
import { toast } from "@/hooks/use-toast"
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/design-system"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

const MODES = [
  { id: "scriptToImage", icon: "📝 → ✏️ → 🖼", title: "SCRIPT → PROMPT → IMAGE", desc: "AI tạo prompt và ảnh từ kịch bản / tối đa 1 giờ" },
  { id: "textToImage", icon: "✏️ → 🖼", title: "PROMPT → IMAGE", desc: "Tạo ảnh song song từ các prompt bằng Flow" },
  { id: "textToVideo", icon: "✏️ → 🎬", title: "PROMPT → VIDEO", desc: "Tạo video trực tiếp từ prompt" },
  { id: "imageToVideo", icon: "🖼 → 🎬", title: "IMAGE → VIDEO", desc: "Tạo video từ ảnh của bạn" },
  { id: "factory", icon: "📝 → ✏️ → 🖼 → ✏️ → 🎬", title: "FACTORY MODE", desc: "SCRIPT → IMAGE PROMPTS → IMAGES → VIDEO PROMPTS → VIDEOS / ONE-CLICK AUTOMATION" },
] as const

const STYLE_NAMES = [
  "Asian Live Photo", "Western Live Photo", "Southeast Asian Live Photo", "Black Live Photo",
  "Asian Romantic 2D", "Western Romantic 2D", "Asian 3D Disney", "Western 3D Disney",
  "Korean Traditional 2D", "Korean Traditional 3D", "Korean Historical Drama", "Japanese Anime",
  "Japanese Traditional", "Chinese Traditional", "Western", "Southeast Asian Traditional",
  "Indian Traditional", "Latin American Traditional", "Arabian Traditional", "Asian Watercolor",
  "Western Watercolor", "Colored Ink Wash", "Asian Cyberpunk", "Western Cyberpunk",
  "Asian Fantasy", "Western Fantasy", "Stick Man", "Stick Woman", "Chibi", "Pixel Art",
  "Minecraft", "Rough 3D", "Retro Cartoon", "Horror", "Skeleton", "X-Ray Body",
]

const STYLE_ASSETS = import.meta.glob("/src/assets/flow-styles/*.jpg", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>

const styleImage = (index: number) => {
  const number = String(index + 1).padStart(2, "0")
  return STYLE_ASSETS[`/src/assets/flow-styles/style_${number}.jpg`] || ""
}

type FactorySettings = {
  flow_mode: string
  flow_gemini_api_key: string
  flow_nationality: string
  flow_base_folder: string
  flow_auto_download_image_prompts: boolean
  flow_auto_download_video_prompts: boolean
  flow_ratio: string
  flow_image_model: string
  flow_output_count: number
  flow_video_model: string
  flow_video_resolution: string
  flow_prompt_delay: number
  flow_default_video_prompt: string
  flow_style_id: string
  flow_special_directions: string
  flow_split_mode: string
  flow_prompt_count: number
}

const DEFAULTS: FactorySettings = {
  flow_mode: "factory",
  flow_gemini_api_key: "",
  flow_nationality: "korean",
  flow_base_folder: "FlowFactory",
  flow_auto_download_image_prompts: true,
  flow_auto_download_video_prompts: true,
  flow_ratio: "16:9",
  flow_image_model: "Nano Banana 2",
  flow_output_count: 1,
  flow_video_model: "Veo 3.1 Lite",
  flow_video_resolution: "1K",
  flow_prompt_delay: 4,
  flow_default_video_prompt: "Dynamic action, Active camera angle",
  flow_style_id: "1",
  flow_special_directions: "",
  flow_split_mode: "giseungjeongyeol",
  flow_prompt_count: 4,
}

export default function FlowPage() {
  const navigate = useNavigate()
  const [conn, setConn] = useState<FlowConnectionRead | null>(null)
  const [tasks, setTasks] = useState<FlowTaskRead[]>([])
  const [settings, setSettings] = useState<FactorySettings>(DEFAULTS)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  const set = <K extends keyof FactorySettings>(key: K, value: FactorySettings[K]) =>
    setSettings((current) => ({ ...current, [key]: value }))

  const load = async () => {
    setLoading(true)
    try {
      const [connection, recent, global] = await Promise.all([
        flowApi.get(),
        flowApi.recentTasks(10).catch(() => []),
        globalApi.getSettings(),
      ])
      setConn(connection)
      setTasks(recent)
      const stored = global.settings || {}
      setSettings({ ...DEFAULTS, ...Object.fromEntries(Object.keys(DEFAULTS).map((key) => [key, stored[key] ?? DEFAULTS[key as keyof FactorySettings]])) } as FactorySettings)
    } catch (error) {
      toast({ title: "Không tải được Flow Factory", description: String(error), variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const saveSettings = async () => {
    setSaving(true)
    try {
      const current = await globalApi.getSettings()
      const next: Record<string, unknown> = { ...current.settings, ...settings }
      // Project name and script always come from the selected Viu project.
      // Remove the legacy global override so one project cannot leak into another.
      delete next.flow_project_name
      await globalApi.updateSettings(next)
      toast({ title: "Đã lưu toàn bộ Flow Factory 1.1.8" })
    } catch (error) {
      toast({ title: "Không lưu được settings", description: String(error), variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const paired = conn?.status === "paired"
  return (
    <div className="space-y-6 p-6 text-slate-100">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold">Flow Connector — Flow Factory 1.1.8</h1>
          <p className="mt-1 text-sm text-slate-400">Điều khiển Google Flow hoàn toàn trong Viu · không thao tác extension thủ công</p>
        </div>
        <Badge className={`ml-auto ${paired ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300" : "border-amber-500/30 bg-amber-500/15 text-amber-300"}`}>
          {paired ? "Extension 1.1.8 ✓ Đã kết nối" : "Đang chờ Flow runtime"}
        </Badge>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className="h-4 w-4" /> Làm mới</Button>
      </div>

      <section className="rounded-2xl border border-cyan-400/20 bg-[#111b21] p-5 text-center">
        <div className="text-2xl">{MODES[4].icon}</div><div className="mt-2 font-black">FACTORY MODE 1.1.8 · RUNTIME DÙNG CHUNG</div>
        <p className="mt-2 text-sm text-slate-400">Tên dự án, kịch bản, storyboard và hàng đợi chỉ được tạo trong từng dự án Viu. Trang này không tạo dự án Flow riêng.</p>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_1fr]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-white/10 bg-[#111b21] p-5">
            <h2 className="mb-4 font-semibold">IMAGE STYLE · STYLE GALLERY</h2>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {STYLE_NAMES.map((name, index) => {
                const id = String(index + 1)
                return <button key={id} onClick={() => set("flow_style_id", id)} className={`overflow-hidden rounded-lg border text-left ${settings.flow_style_id === id ? "border-amber-400 ring-2 ring-amber-400/30" : "border-white/10"}`}><img src={styleImage(index)} alt={name} className="aspect-square w-full object-cover" /><span className="block p-2 text-[10px] leading-tight">{String(index + 1).padStart(2, "0")}. {name}</span></button>
              })}
            </div>
            <div className="mt-4 rounded-lg border border-dashed border-white/20 p-4 text-center text-sm text-slate-400">CUSTOM STYLE IMAGES (0/6) · <button className="text-cyan-300">+ ADD STYLE</button></div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl border border-white/10 bg-[#111b21] p-5 space-y-4">
            <h2 className="font-semibold">⚙️ SETTINGS</h2>
            <div><Label>Gemini API Key</Label><Input type="password" className="mt-1 bg-[#0b1318]" value={settings.flow_gemini_api_key} onChange={(event) => set("flow_gemini_api_key", event.target.value)} placeholder="AIza..." /></div>
            <div><Label>SPECIAL DIRECTIONS (Optional)</Label><textarea className="mt-1 min-h-20 w-full rounded-lg border border-white/10 bg-[#0b1318] p-3 text-sm" value={settings.flow_special_directions} onChange={(event) => set("flow_special_directions", event.target.value)} /></div>
            <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/5 p-3 text-xs text-emerald-200">SCRIPT SPLIT và NUMBER OF PROMPTS được khóa tự động theo storyboard của từng dự án, giống pipeline Revo.</div>
            <div><Label>CHARACTER NATIONALITY</Label><Select value={settings.flow_nationality} onValueChange={(value) => set("flow_nationality", value)}><SelectTrigger className="mt-1 bg-[#0b1318]"><SelectValue /></SelectTrigger><SelectContent>{[["korean", "Korean"], ["japanese", "Japanese"], ["chinese", "Chinese"], ["southeast_asian", "Southeast Asian"], ["western", "Western"], ["indian", "Indian"], ["latin", "Latin American"], ["arab", "Arab"], ["black", "Black"]].map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>BASE FOLDER NAME (Inside Downloads)</Label><Input className="mt-1 bg-[#0b1318]" value={settings.flow_base_folder} onChange={(event) => set("flow_base_folder", event.target.value)} /></div>
            <Toggle label="AUTO-DOWNLOAD IMAGE PROMPTS" value={settings.flow_auto_download_image_prompts} onChange={(value) => set("flow_auto_download_image_prompts", value)} />
            <Toggle label="AUTO-DOWNLOAD VIDEO PROMPTS" value={settings.flow_auto_download_video_prompts} onChange={(value) => set("flow_auto_download_video_prompts", value)} />
            <FieldSelect label="ASPECT RATIO" value={settings.flow_ratio} values={["16:9", "9:16"]} onChange={(value) => set("flow_ratio", value)} />
            <FieldSelect label="IMAGE MODEL" value={settings.flow_image_model} values={["Nano Banana Pro", "Nano Banana 2"]} onChange={(value) => set("flow_image_model", value)} />
            <FieldSelect label="IMAGES PER PROMPT" value={String(settings.flow_output_count)} values={["1", "2"]} onChange={(value) => set("flow_output_count", Number(value))} />
            <FieldSelect label="VIDEO MODEL" value={settings.flow_video_model} values={["Veo 3.1 Lite", "Veo 3.1 Fast", "Veo 3.1 Quality"]} onChange={(value) => set("flow_video_model", value)} />
            <FieldSelect label="VIDEO RESOLUTION" value={settings.flow_video_resolution} values={["1K", "2K", "4K"]} onChange={(value) => set("flow_video_resolution", value)} />
            <div><Label>DELAY BETWEEN PROMPTS (sec)</Label><Input type="number" min={0} max={120} className="mt-1 bg-[#0b1318]" value={settings.flow_prompt_delay} onChange={(event) => set("flow_prompt_delay", Number(event.target.value))} /></div>
            <div><Label>DEFAULT VIDEO PROMPT</Label><textarea className="mt-1 min-h-24 w-full rounded-lg border border-white/10 bg-[#0b1318] p-3 text-sm" value={settings.flow_default_video_prompt} onChange={(event) => set("flow_default_video_prompt", event.target.value)} /></div>
            <Button className="w-full bg-[#FAAA02] text-[#11161A] hover:bg-[#FFB81F]" onClick={saveSettings} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} LƯU SETTINGS</Button>
            <p className="text-xs text-slate-500">Download path: Downloads/{settings.flow_base_folder}/</p>
          </section>

          <section className="rounded-2xl border border-white/10 bg-[#111b21] p-5">
            <div className="flex items-center justify-between"><h2 className="font-semibold">Tác vụ gần đây</h2><Button size="sm" variant="outline" onClick={() => navigate("/queue")}>Hàng đợi <ExternalLink className="h-3 w-3" /></Button></div>
            <div className="mt-3 space-y-2">{tasks.length ? tasks.map((task) => <div key={task.task_id} className="rounded-lg border border-white/10 bg-[#0b1318] p-3 text-xs"><div className="flex justify-between"><span>Cảnh {(task.scene_order ?? 0) + 1}</span><Badge variant="outline">{task.status}</Badge></div><div className="mt-2 flex items-center gap-2 text-slate-500"><CheckCircle2 className="h-3 w-3" /> {task.progress ?? 0}% · {task.progress_message || task.phase}</div></div>) : <p className="text-xs text-slate-500">Chưa có tác vụ.</p>}</div>
          </section>
        </div>
      </div>
    </div>
  )
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return <div className="flex items-center justify-between rounded-lg border border-white/10 bg-[#0b1318] p-3"><span className="text-xs text-slate-300">{label}</span><Switch checked={value} onCheckedChange={onChange} /></div>
}

function FieldSelect({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }) {
  return <div><Label>{label}</Label><Select value={value} onValueChange={onChange}><SelectTrigger className="mt-1 bg-[#0b1318]"><SelectValue /></SelectTrigger><SelectContent>{values.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
}
