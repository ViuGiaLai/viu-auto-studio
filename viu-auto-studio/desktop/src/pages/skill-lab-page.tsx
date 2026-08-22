import { useEffect, useMemo, useState } from "react"
import { CheckCircle2, Clipboard, Loader2, Play, RefreshCw, Sparkles, XCircle } from "lucide-react"
import { api, type SkillCatalogItem, type SkillRun } from "@/services/api"
import { toast } from "@/hooks/use-toast"
import { Button, Card, CardContent, CardHeader, CardTitle, Input, ProjectHeader, StatusBadge } from "@/components/design-system"
import { Textarea } from "@/components/ui/textarea"

const EXAMPLES: Record<string, { prompt: string; input: string }> = {
  "video-generator": {
    prompt: "Tạo video recap ngắn về một phát hiện khảo cổ, giàu tính giải thích và phù hợp YouTube.",
    input: '{\n  "duration_seconds": 45,\n  "aspect_ratio": "16:9",\n  "visual_style": "cinematic documentary",\n  "language": "Vietnamese",\n  "purpose": "Giải thích phát hiện khảo cổ cho người xem phổ thông"\n}',
  },
  "tts-prompter": {
    prompt: "Xin chào, đây là bản tin công nghệ hôm nay.",
    input: '{\n  "language": "Vietnamese",\n  "accent": "standard Vietnamese accent",\n  "style": "clear, warm documentary narration",\n  "text": "Xin chào, đây là bản tin công nghệ hôm nay."\n}',
  },
  "music-prompter": {
    prompt: "Nhạc nền cho video giải thích khoa học, không lấn giọng đọc.",
    input: '{\n  "duration_seconds": 60,\n  "bpm": 88,\n  "genre": "cinematic ambient",\n  "mood": "curious, calm and lightly suspenseful",\n  "key": "D minor",\n  "instruments": "soft piano, warm strings, subtle synth pads",\n  "instrumental_only": true\n}',
  },
  "youtube-video-research": {
    prompt: "Nghiên cứu các video YouTube first-hand về cách dựng video recap bằng AI.",
    input: '{\n  "topic": "AI movie recap production workflow",\n  "themes": ["workflow", "tooling", "quality control"]\n}',
  },
  "youtube-transcript": {
    prompt: "https://www.youtube.com/watch?v=VIDEO_ID",
    input: '{\n  "url": "https://www.youtube.com/watch?v=VIDEO_ID",\n  "languages": ["vi", "en"]\n}',
  },
  "seo-audit": {
    prompt: "Audit SEO cho website của dự án. Chỉ dùng dữ liệu tôi cung cấp và ghi rõ dữ liệu còn thiếu.",
    input: '{\n  "domain": "example.com",\n  "data_note": "Chưa có GSC/Ahrefs export; cần nêu giới hạn dữ liệu"\n}',
  },
  "seo-competitor-analysis-will": {
    prompt: "Phân tích chiến lược SEO của một đối thủ trong lĩnh vực video AI.",
    input: '{\n  "target_domain": "example.com",\n  "competitor_context": "AI video tools",\n  "available_exports": []\n}',
  },
}

function prettyOutput(run: SkillRun | null): string {
  if (!run) return ""
  if (run.output_text.startsWith("{")) {
    try { return JSON.stringify(JSON.parse(run.output_text), null, 2) } catch { /* plain text */ }
  }
  return run.output_text || run.error_message
}

export default function SkillLabPage() {
  const [catalog, setCatalog] = useState<SkillCatalogItem[]>([])
  const [runs, setRuns] = useState<SkillRun[]>([])
  const [skillId, setSkillId] = useState("video-generator")
  const [prompt, setPrompt] = useState(EXAMPLES["video-generator"].prompt)
  const [inputText, setInputText] = useState(EXAMPLES["video-generator"].input)
  const [useManus, setUseManus] = useState(true)
  const [running, setRunning] = useState(false)
  const [selectedRun, setSelectedRun] = useState<SkillRun | null>(null)

  const selectedSkill = useMemo(() => catalog.find((item) => item.id === skillId), [catalog, skillId])

  const load = async () => {
    try {
      const [items, history] = await Promise.all([api.skillCatalog(), api.skillRuns()])
      setCatalog(items)
      setRuns(history)
    } catch (error) {
      toast({ title: "Không tải được Skill Lab", description: String(error), variant: "destructive" })
    }
  }

  useEffect(() => { void load() }, [])

  const chooseSkill = (id: string) => {
    setSkillId(id)
    const example = EXAMPLES[id]
    if (example) {
      setPrompt(example.prompt)
      setInputText(example.input)
    }
  }

  const refreshRun = async (runId: number) => {
    try {
      const result = await api.skillRunRefresh(runId)
      setSelectedRun(result)
      setRuns((current) => current.map((item) => item.id === result.id ? result : item))
      toast({ title: result.status === "pending" ? "Manus task vẫn đang chạy" : "Đã cập nhật kết quả", description: result.external_task_id || "" })
    } catch (error) {
      toast({ title: "Không cập nhật được Manus task", description: String(error), variant: "destructive" })
    }
  }

  const run = async () => {
    let input: Record<string, unknown> = {}
    try {
      input = inputText.trim() ? JSON.parse(inputText) as Record<string, unknown> : {}
    } catch (error) {
      toast({ title: "JSON đầu vào không hợp lệ", description: String(error), variant: "destructive" })
      return
    }
    setRunning(true)
    try {
      const result = await api.skillRun({ skill_id: skillId, prompt, input, use_manus: useManus })
      setSelectedRun(result)
      setRuns((current) => [result, ...current.filter((item) => item.id !== result.id)])
      if (result.status === "failed") toast({ title: "Skill chưa chạy được", description: result.error_message, variant: "destructive" })
      else toast({ title: result.mode === "local_prompt" ? "Đã tạo prompt thật" : result.mode === "local_action" ? "Đã chạy local action thật" : "Đã tạo Manus task", description: result.external_task_id || "Kết quả đã lưu vào lịch sử" })
    } catch (error) {
      toast({ title: "Chạy skill thất bại", description: String(error), variant: "destructive" })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="min-h-full bg-[#0B0F12]">
      <ProjectHeader
        title="Skill Lab"
        subtitle="Prompt builder và runner cho các skill đã được phân tích; không giả lập kết quả bên ngoài."
        actions={<Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="mr-2 h-3.5 w-3.5" /> Làm mới</Button>}
      />
      <div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="border-white/10 bg-[#10181D]">
          <CardHeader><CardTitle className="flex items-center gap-2 text-white"><Sparkles className="h-4 w-4 text-amber-300" /> Chạy skill</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1.5 text-xs text-slate-400">Skill
                <select value={skillId} onChange={(e) => chooseSkill(e.target.value)} className="h-10 w-full rounded-md border border-white/10 bg-white/[0.03] px-3 text-sm text-slate-200">
                  {catalog.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.category}</option>)}
                </select>
              </label>
              <label className="space-y-1.5 text-xs text-slate-400">Thực thi
                <div className="flex h-10 items-center justify-between rounded-md border border-white/10 bg-white/[0.03] px-3 text-sm text-slate-300">
                  <span>{selectedSkill?.execution === "local_prompt" ? "Local prompt builder" : selectedSkill?.execution === "local_action" ? "Local action thật" : selectedSkill?.execution === "advisory" ? "Chỉ hướng dẫn" : "Manus API task"}</span>
                  {selectedSkill?.requires_manus_api && <label className="flex items-center gap-2 text-[11px]"><input type="checkbox" checked={useManus} onChange={(e) => setUseManus(e.target.checked)} /> Dùng Manus</label>}
                </div>
              </label>
            </div>
            <p className="text-xs text-slate-500">{selectedSkill?.description || "Đang tải catalog…"}</p>
            <label className="block space-y-1.5 text-xs text-slate-400">Prompt / chủ đề
              <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} className="min-h-[100px] border-white/10 bg-white/[0.03] text-slate-200" placeholder="Nhập mục tiêu hoặc văn bản cần xử lý…" />
            </label>
            <label className="block space-y-1.5 text-xs text-slate-400">Input JSON có cấu trúc
              <Textarea value={inputText} onChange={(e) => setInputText(e.target.value)} className="min-h-[180px] font-mono text-xs border-white/10 bg-white/[0.03] text-slate-200" />
            </label>
            <Button onClick={() => void run()} disabled={running || !selectedSkill} className="bg-gradient-to-r from-[#d9940a] to-[#faaa02] text-white">
              {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />} {running ? "Đang chạy…" : "Chạy skill"}
            </Button>
            {selectedRun && <div className="rounded-lg border border-white/10 bg-black/20 p-4"><div className="mb-2 flex items-center justify-between"><div className="flex items-center gap-2 text-sm font-semibold text-white">Kết quả gần nhất <StatusBadge status={selectedRun.status}>{selectedRun.status}</StatusBadge></div><div className="flex items-center gap-1">{selectedRun.status === "pending" && selectedRun.external_task_id && <Button variant="ghost" size="sm" onClick={() => void refreshRun(selectedRun.id)}><RefreshCw className="mr-1 h-3.5 w-3.5" /> Cập nhật</Button>}<Button variant="ghost" size="sm" onClick={() => void navigator.clipboard?.writeText(prettyOutput(selectedRun))}><Clipboard className="mr-1 h-3.5 w-3.5" /> Copy</Button></div></div>
              <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap text-xs leading-5 text-slate-300">{prettyOutput(selectedRun)}</pre>{selectedRun.error_message && <div className="mt-3 flex items-start gap-2 text-xs text-red-300"><XCircle className="mt-0.5 h-4 w-4 shrink-0" />{selectedRun.error_message}</div>}</div>}
          </CardContent>
        </Card>
        <Card className="border-white/10 bg-[#10181D]"><CardHeader><CardTitle className="text-white">Lịch sử chạy</CardTitle></CardHeader><CardContent className="space-y-2">{runs.length === 0 && <div className="text-sm text-slate-500">Chưa có lần chạy nào.</div>}{runs.map((item) => <button key={item.id} type="button" onClick={() => setSelectedRun(item)} className="w-full rounded-lg border border-white/10 bg-white/[0.02] p-3 text-left hover:bg-white/[0.05]"><div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-medium text-slate-200">{item.skill_id}</span>{item.status === "completed" ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : item.status === "failed" ? <XCircle className="h-4 w-4 text-red-400" /> : <Loader2 className="h-4 w-4 text-amber-300" />}</div><div className="mt-1 text-[11px] text-slate-500">{item.mode} · {new Date(item.created_at).toLocaleString()}</div></button>)}</CardContent></Card>
      </div>
    </div>
  )
}
