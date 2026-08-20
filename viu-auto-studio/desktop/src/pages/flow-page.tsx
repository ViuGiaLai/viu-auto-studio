import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { api, resolveApiBaseUrl } from "@/services/api"
import {
  Link2, RefreshCw, Copy, CheckCircle2, XCircle, Eye, ExternalLink, Loader2,
} from "lucide-react"
import { flowApi, globalApi, type FlowConnectionRead, type FlowTaskRead } from "@/services/pages-api"

import { toast } from "@/hooks/use-toast"
import { Button } from "@/components/design-system"
import { Input } from "@/components/design-system"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/design-system"

function useRuntimeApiBase() {
  const [base, setBase] = useState("")
  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const b = await resolveApiBaseUrl()
        if (active) setBase(b)
      } catch {
        /* không xác định */
      }
    })()
    return () => {
      active = false
    }
  }, [])
  return base
}

export default function FlowPage() {
  const navigate = useNavigate()
  const runtimeBase = useRuntimeApiBase()
  const [conn, setConn] = useState<FlowConnectionRead | null>(null)
  const [recentTasks, setRecentTasks] = useState<FlowTaskRead[]>([])
  const [loading, setLoading] = useState(true)

  
  const [mode, setMode] = useState("image")
  const [ratio, setRatio] = useState("16:9")
  const [imageModel, setImageModel] = useState("Nano Banana 2")
  const [videoModel, setVideoModel] = useState("Veo 3.1")
  const [concurrency, setConcurrency] = useState("2")
  const [outputCount, setOutputCount] = useState("1")
  const [savingDefaults, setSavingDefaults] = useState(false)
  const [attachRef, setAttachRef] = useState(true)
  const [autoDownload, setAutoDownload] = useState(true)
  const [verifyOutput, setVerifyOutput] = useState(true)
  const [testLoading, setTestLoading] = useState(false)

  const load = async () => {
    try {
      setLoading(true)
      const [c, global, tasks] = await Promise.all([
        flowApi.get(),
        globalApi.getSettings(),
        flowApi.recentTasks().catch(() => [] as FlowTaskRead[]),
      ])
      setConn(c)
      setRecentTasks(tasks)

      
      const saved = global.settings || {}
      setMode(String(saved.flow_mode || "image"))
      setRatio(String(saved.flow_ratio || "16:9"))
      setImageModel(String(saved.flow_image_model || "Nano Banana 2"))
      setVideoModel(String(saved.flow_video_model || "Veo 3.1"))
      setConcurrency(String(saved.flow_concurrency || "2"))
      setOutputCount(String(saved.flow_output_count || "1"))
      setAttachRef(saved.flow_attach_ref !== false)
      setAutoDownload(saved.flow_auto_download !== false)
      setVerifyOutput(saved.flow_verify_output !== false)
    } catch (e) {
      toast({ title: "Lỗi", description: String(e), variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const copyText = (t: string) => {
    navigator.clipboard?.writeText(t).then(() => toast({ title: "Đã sao chép" }))
  }

  const masked = (s: string) => (s.length > 8 ? s.slice(0, 4) + "••••" + s.slice(-4) : "••••")


  const saveFlowDefaults = async () => {
    setSavingDefaults(true)
    try {
      const current = await globalApi.getSettings()
      await globalApi.updateSettings({ ...current.settings, flow_mode: mode, flow_ratio: ratio, flow_image_model: imageModel, flow_video_model: videoModel, flow_concurrency: Number(concurrency), flow_output_count: Number(outputCount), flow_attach_ref: attachRef, flow_auto_download: autoDownload, flow_verify_output: verifyOutput })
      toast({ title: "Đã lưu cấu hình Flow" })
    } catch (error) { toast({ title: "Không lưu được cấu hình Flow", description: String(error), variant: "destructive" }) }
    finally { setSavingDefaults(false) }
  }

  const runE2ETest = async () => {
    if (!conn || conn.status !== "paired") {
      toast({ title: "Chưa ghép nối Extension — hãy ghép trước", variant: "destructive" })
      return
    }
    setTestLoading(true)
    try {
      const projects = await api.listProjects()
      let selected: { id: number } | null = null
      for (const project of projects) {
        const scenes = await api.listScenes(project.id)
        const needsMedia = (scene: typeof scenes[number]) => mode === "video"
          ? !(scene.video_path || scene.media_path)
          : !(scene.image_path || scene.media_path)
        if (scenes.some((scene) => Boolean(scene.visual_prompt) && needsMedia(scene))) { selected = project; break }
      }
      if (!selected) throw new Error("Không có cảnh thật đang thiếu media. Hãy tạo phân cảnh có visual prompt trước.")
      const result = await api.createMediaTasks(selected.id, { media_type: mode, aspect: ratio, model: mode === "video" ? videoModel : imageModel })
      if (!result.created) throw new Error("Không tạo được task Flow mới cho dự án đã chọn.")
      toast({ title: `Đã tạo ${result.created} task Flow thật cho dự án #${selected.id}` })
      navigate("/queue")
    } catch (e) {
      toast({ title: "Lỗi", description: String(e), variant: "destructive" })
    } finally {
      setTestLoading(false)
    }
  }

  const paired = conn?.status === "paired"

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-slate-100">
          Flow Connector — Điều khiển Google Flow tự động qua Chrome Extension
        </h1>
        <div className="ml-auto flex items-center gap-2">
          <Badge className={paired ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-amber-500/15 text-amber-400 border-amber-500/30"}>
            {paired ? (
              <>
                <Link2 className="mr-1.5 h-3 w-3" /> Extension v1.1.8 ✓ Đã kết nối
              </>
            ) : (
              <>
                <XCircle className="mr-1.5 h-3 w-3" /> Chưa ghép nối
              </>
            )}
          </Badge>
          <Badge className={paired ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-white/5 text-slate-400 border-white/10"}>
            {paired ? "FastAPI ✓ Đã ghép cặp" : "FastAPI ○ Chờ ghép"}
          </Badge>
          <Badge variant="outline" className="text-slate-400 border-white/10">
            Heartbeat {paired && conn?.heartbeat_at ? "● Vừa rồi" : "● Không có"}
          </Badge>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Trái: trạng thái kết nối */}
        <div className="space-y-4">
          <div className="rounded-xl border border-white/5 bg-[#141d22] p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-200">Trạng thái kết nối</h2>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Tài khoản Google</span>
                <span className="text-slate-200">{conn?.google_account || "Chưa đăng nhập"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Hồ sơ trình duyệt</span>
                <span className="text-slate-200">{conn?.profile_name || "—"}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-400">Backend URL (runtime)</span>
                <span className="flex items-center gap-1 text-xs text-slate-200">
                  <Eye className="h-3 w-3" /> {runtimeBase ? masked(runtimeBase) : "—"}
                  {runtimeBase && (
                    <Copy className="h-3 w-3 cursor-pointer text-slate-500 hover:text-slate-200" onClick={() => copyText(runtimeBase)} />
                  )}
                </span>
              </div>
                            <div className="flex items-center justify-between">
                <span className="text-slate-400">Flow runtime</span>
                <span className="text-right text-xs text-slate-200">Chrome profile riêng + Extension bundled</span>
              </div>

                            <div className="flex items-center justify-between">
                <span className="text-slate-400">Factory state</span>
                <Badge variant="outline" className={conn?.factory_state === "failed" ? "border-red-500/30 text-red-400" : "border-blue-500/30 text-blue-300"}>
                  {conn?.factory_state || "waiting_login"}
                </Badge>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400">Môi trường</span>
                <span className="text-slate-200">Production</span>
              </div>
            </div>
                        <p className="pt-2 text-xs leading-relaxed text-slate-500">
              Không cần cài Extension, copy prompt hoặc mở Labs thủ công. Hãy chạy Factory Mode trong Project Editor; Chrome sẽ tự mở/reuse và tiếp tục sau khi đăng nhập một lần.
            </p>

          </div>

                    <div className="rounded-xl border border-blue-500/20 bg-[#141d22] p-5 space-y-2">
            <h2 className="text-sm font-semibold text-slate-200">Factory connection</h2>
            <p className="text-xs leading-relaxed text-slate-400">
              Session được khởi tạo an toàn trong Electron với bootstrap token theo từng phiên. Extension chỉ nhận task của Factory project đang chạy và heartbeat tự động báo login/readiness về backend.
            </p>
          </div>

        </div>

        {/* Giữa: cấu hình mặc định */}
        <div className="space-y-4">
          <div className="rounded-xl border border-white/5 bg-[#141d22] p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-200">Cấu hình mặc định cho Flow</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1.5 block text-xs text-slate-400">Chế độ</Label>
                <Select value={mode} onValueChange={setMode}>
                  <SelectTrigger className="bg-[#0c1318] border-white/10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="image">Image</SelectItem>
                    <SelectItem value="video">Video</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1.5 block text-xs text-slate-400">Tỷ lệ khung hình</Label>
                <Select value={ratio} onValueChange={setRatio}>
                  <SelectTrigger className="bg-[#0c1318] border-white/10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="16:9">16:9</SelectItem>
                    <SelectItem value="9:16">9:16</SelectItem>
                    
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1.5 block text-xs text-slate-400">Model ảnh</Label>
                <Select value={imageModel} onValueChange={setImageModel}>
                  <SelectTrigger className="bg-[#0c1318] border-white/10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Nano Banana 2">Nano Banana 2</SelectItem>
                    <SelectItem value="Nano Banana">Nano Banana</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1.5 block text-xs text-slate-400">Model video</Label>
                <Select value={videoModel} onValueChange={setVideoModel}>
                  <SelectTrigger className="bg-[#0c1318] border-white/10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Veo 3.1">Veo 3.1</SelectItem>
                    <SelectItem value="Veo 3">Veo 3</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1.5 block text-xs text-slate-400">Số lượng đầu ra / cảnh</Label>
                <Select value={outputCount} onValueChange={setOutputCount}>
                  <SelectTrigger className="bg-[#0c1318] border-white/10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1</SelectItem>
                    <SelectItem value="2">2</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1.5 block text-xs text-slate-400">Độ đồng thời</Label>
                <Select value={concurrency} onValueChange={setConcurrency}>
                  <SelectTrigger className="bg-[#0c1318] border-white/10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1</SelectItem>
                    <SelectItem value="2">2</SelectItem>
                    <SelectItem value="4">4</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2.5 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Gắn ảnh tham chiếu nhân vật</span>
                <Switch checked={attachRef} onCheckedChange={setAttachRef} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Tự động tải file về</span>
                <Switch checked={autoDownload} onCheckedChange={setAutoDownload} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Xác minh đầu ra (FFprobe)</span>
                <Switch checked={verifyOutput} onCheckedChange={setVerifyOutput} />
              </div>
            </div>
            <Button className="w-full bg-[#FAAA02] text-[#11161A] hover:bg-[#FFB81F]" disabled={savingDefaults} onClick={saveFlowDefaults}>{savingDefaults ? "Đang lưu…" : "Lưu cấu hình Flow"}</Button>
            <div className="rounded-lg border border-white/10 bg-[#0c1318] p-3">
              <h3 className="mb-2 text-xs font-semibold text-slate-300">Chuỗi tự động hóa (end-to-end) · 11 bước</h3>
              <ol className="space-y-1 text-[11px] text-slate-400">
                {["Mở Flow", "Chọn project", "Chế độ & model", "Tỷ lệ", "Đính kèm tham chiếu", "Nhập prompt", "Generate", "Theo dõi tiến trình", "Tải video", "Upload FastAPI", "FFprobe xác minh"].map((s, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <CheckCircle2 className="h-3 w-3 text-emerald-400" /> {i + 1}. {s}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>

        {/* Phải: tác vụ gần đây + E2E test */}
        <div className="space-y-4">
          <div className="rounded-xl border border-white/5 bg-[#141d22] p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-200">Tác vụ Flow gần đây</h2>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400" title="Tải lại task" onClick={() => void load()}>
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
                <Button variant="outline" size="sm" className="h-7 border-white/10 text-xs text-slate-300" onClick={() => navigate("/queue")}>
                  Xem hàng đợi <ExternalLink className="ml-1 h-3 w-3" />
                </Button>
              </div>
            </div>
            {recentTasks.length === 0 ? (
              <p className="rounded-lg border border-white/10 bg-[#0c1318] p-4 text-xs text-slate-500">
                Chưa có ConnectorTask. Hãy chạy Auto Production hoặc kiểm tra end-to-end để tạo task thật.
              </p>
            ) : (
              <div className="space-y-2">
                {recentTasks.map((task) => (
                  <div key={task.task_id} className="rounded-lg border border-white/10 bg-[#0c1318] p-3 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-slate-300">{task.task_id.slice(0, 10)}…</span>
                      <Badge variant="outline" className="border-white/10 text-slate-300">{task.status}</Badge>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                      <span>Project #{task.project_id} · Cảnh #{(task.scene_order ?? 0) + 1}</span>
                      <span>{task.progress ?? 0}%</span>
                    </div>
                    {task.progress_message && <p className="mt-1 truncate text-[11px] text-slate-500">{task.progress_message}</p>}
                    {task.error && <p className="mt-1 truncate text-[11px] text-rose-300" title={task.error}>{task.error}</p>}
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-lg border border-white/10 bg-[#0c1318] p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-200">Kiểm tra end-to-end</span>
                <Badge variant="outline" className={paired ? "border-emerald-500/30 text-emerald-400" : "border-amber-500/30 text-amber-400"}>
                  {paired ? "Sẵn sàng" : "Chưa ghép"}
                </Badge>
              </div>
              <p className="mt-1.5 text-[11px] text-slate-500">
                                Tạo một queue test thật để kiểm tra task assignment, DOM automation và xác minh media. Factory runtime sẽ tự xử lý khi Chrome/Extension online; không cần pairing thủ công.

              </p>
              <Button
                size="sm"
                className="mt-3 w-full bg-gradient-to-r from-[#d9940a] to-[#faaa02] text-white hover:opacity-90"
                onClick={runE2ETest}
                disabled={testLoading || !paired}
              >
                {testLoading && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                Run test end-to-end
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-white/5 bg-[#141d22] p-5 space-y-2">
            <h2 className="text-sm font-semibold text-slate-200">Ghi chú</h2>
            <ul className="space-y-1.5 text-[11px] text-slate-400">
              <li>• Extension thực hiện hoàn toàn DOM automation trên labs.google/fx — app không điều khiển Flow từ backend.</li>
              <li>• File media tải về được Extension gửi kèm file/path về FastAPI, FFprobe xác minh rồi gắn đúng scene_id.</li>
              <li>• Scene lỗi được retry riêng, không chạy lại scene đã hoàn thành (idempotency).</li>
                            <li>• Heartbeat tự động báo trạng thái đăng nhập/readiness; Chrome profile riêng được reuse sau lần đăng nhập đầu tiên.</li>

            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
