import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { api, openExternalUrl, resolveApiBaseUrl } from "@/services/api"
import {
  Link2, RefreshCw, Copy, CheckCircle2, XCircle, Eye, ExternalLink, Loader2,
} from "lucide-react"
import { flowApi, globalApi, type FlowConnectionRead } from "@/services/pages-api"
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
  const [loading, setLoading] = useState(true)
  const [pairCode, setPairCode] = useState("")
  const [extensionId, setExtensionId] = useState("")
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
      const [c, global] = await Promise.all([flowApi.get(), globalApi.getSettings()])
      setConn(c)
      setExtensionId(c.extension_id || "")
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

  const doPair = async () => {
    if (!pairCode.trim() || !extensionId.trim()) {
      toast({ title: "Nhập mã ghép một lần do Extension cung cấp", variant: "destructive" })
      return
    }
    try {
      await flowApi.pair(pairCode.trim(), extensionId.trim())
      toast({ title: "Đã ghép nối Extension thành công" })
      load()
    } catch (e) {
      toast({ title: "Lỗi", description: String(e), variant: "destructive" })
    }
  }

  const genCode = async () => {
    try {
      const c = await flowApi.newPairingCode()
      setConn(c)
      toast({ title: "Đã tạo mã ghép mới" })
    } catch (e) {
      toast({ title: "Lỗi", description: String(e), variant: "destructive" })
    }
  }

  const sendHeartbeat = async () => {
    if (!extensionId.trim()) {
      toast({ title: "Nhập Extension ID (như trong flow-connector manifest)", variant: "destructive" })
      return
    }
    try {
      await flowApi.heartbeat({
        extension_id: extensionId.trim(),
        extension_name: "Flow Connector",
        profile_name: "Viu Auto Studio",
        google_account: "",
      })
      toast({ title: "Heartbeat OK — Extension đã được ghi nhận" })
      load()
    } catch (e) {
      toast({ title: "Lỗi", description: String(e), variant: "destructive" })
    }
  }

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
        if (scenes.some((scene) => Boolean(scene.visual_prompt) && !scene.media_path)) { selected = project; break }
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
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-400">Extension ID</span>
                <Input
                  value={extensionId}
                  onChange={(e) => setExtensionId(e.target.value)}
                  placeholder="extension_id…"
                  className="h-7 w-44 bg-[#0c1318] border-white/10 text-xs"
                />
                <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-500" onClick={sendHeartbeat}>
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Mã ghép cập</span>
                {paired ? (
                  <Badge className="bg-emerald-500/15 text-emerald-400">✓ Một lần</Badge>
                ) : (
                  <Badge variant="outline" className="border-amber-500/30 text-amber-400">Chưa cập</Badge>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Môi trường</span>
                <span className="text-slate-200">Production</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button variant="outline" size="sm" className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10" onClick={() => openExternalUrl("https://labs.google/fx/")}>
                Mở Google Flow
              </Button>
              <Button variant="outline" size="sm" className="border-white/10 text-slate-300" onClick={genCode}>
                Ghép lại Extension
              </Button>
            </div>
          </div>

          {/* Ghép lần đầu */}
          <div className="rounded-xl border border-amber-500/20 bg-[#141d22] p-5 space-y-3">
            <h2 className="text-sm font-semibold text-slate-200">Ghép lần đầu (pairing)</h2>
            <p className="text-xs text-slate-400">
              Mở Extension → nhập mã ghép một lần dưới đây, hoặc dán mã do Extension sinh và bấm "Ghép Extension".
            </p>
            {conn?.pairing_code ? (
              <div className="rounded-lg border border-white/10 bg-[#0c1318] p-3">
                <div className="text-[11px] text-slate-500">Mã ghép một lần (Extension nhập vào app)</div>
                <div className="flex items-center justify-between">
                  <code className="text-lg font-mono font-bold text-amber-400">{conn.pairing_code}</code>
                  <Copy className="h-4 w-4 cursor-pointer text-slate-500" onClick={() => copyText(conn.pairing_code || "")} />
                </div>
                {conn.pairing_expires_at && (
                  <div className="text-[11px] text-slate-500">Hết hạn: {conn.pairing_expires_at}</div>
                )}
              </div>
            ) : (
              <Input
                placeholder="Dán mã ghép do Extension cung cấp…"
                value={pairCode}
                onChange={(e) => setPairCode(e.target.value)}
                className="bg-[#0c1318] border-white/10"
              />
            )}
            <Button className="w-full bg-gradient-to-r from-[#d9940a] to-[#faaa02] text-white hover:opacity-90" onClick={conn?.pairing_code ? () => copyText(conn.pairing_code || "") : doPair}>
              {conn?.pairing_code ? <>Sao chép mã ghép <Copy className="ml-2 h-4 w-4" /></> : "Ghép Extension"}
            </Button>
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
                    <SelectItem value="1:1">1:1</SelectItem>
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
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-200">Tác vụ Flow gần đây</h2>
              <Button variant="outline" size="sm" className="h-7 border-white/10 text-xs text-slate-300" onClick={() => navigate("/queue")}>
                Xem hàng đợi <ExternalLink className="ml-1 h-3 w-3" />
              </Button>
            </div>
            <p className="text-xs text-slate-400">
              Tác vụ Flow xuất hiện trong Hàng đợi (menu Hàng đợi) khi backend tạo task per scene. Extension tự nhận task qua heartbeat/polling và cập nhật trạng thái.
            </p>
            <div className="rounded-lg border border-white/10 bg-[#0c1318] p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-200">Kiểm tra end-to-end</span>
                <Badge variant="outline" className={paired ? "border-emerald-500/30 text-emerald-400" : "border-amber-500/30 text-amber-400"}>
                  {paired ? "Sẵn sàng" : "Chưa ghép"}
                </Badge>
              </div>
              <p className="mt-1.5 text-[11px] text-slate-500">
                Tạo tác vụ E2E gồm 10 bước (Mở Flow → FFprobe xác minh). Khi Extension online, task tự thực hiện; nếu offline, task chờ và tiếp tục sau khi ghép lại.
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
              <li>• Heartbeat mỗi 3 giây giữ trạng thái ghép sau khi Chrome khởi động lại.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
