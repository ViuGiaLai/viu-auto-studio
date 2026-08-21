import { useEffect, useMemo, useRef, useState } from "react"
import {
  AlignCenter, AlignLeft, AlignRight, Copy, Download, ImagePlus, Music,
  Pause, Play, Redo2, RefreshCw, Save, Scissors, Trash2, Type, Undo2,
  ZoomIn, ZoomOut,
} from "lucide-react"

import { api, mediaUrl, outputVideoUrl } from "@/services/api"
import { useEditorStore } from "@/stores/editor-store"
import type { Project, TimelineClip, TimelineProject } from "@/types"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/utils/cn"
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/design-system"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Textarea } from "@/components/ui/textarea"

const TRACKS = [
  { id: "visual", label: "Video / Ảnh", color: "bg-cyan-500/75" },
  { id: "overlay", label: "Overlay", color: "bg-violet-500/75" },
  { id: "voice", label: "Voice", color: "bg-emerald-500/75" },
  { id: "music", label: "Nhạc nền", color: "bg-amber-500/75" },
  { id: "subtitle", label: "Phụ đề", color: "bg-rose-500/75" },
] as const

const cloneTimeline = (value: TimelineProject): TimelineProject => JSON.parse(JSON.stringify(value)) as TimelineProject
const fileName = (path: string) => path.split(/[\\/]/).pop() || path
const isImage = (path: string) => /\.(png|jpe?g|webp|gif)$/i.test(path)
const isVideo = (path: string) => /\.(mp4|webm|mov|mkv)$/i.test(path)
const formatTime = (seconds: number) => {
  const safe = Math.max(0, seconds || 0)
  const minutes = Math.floor(safe / 60)
  return `${String(minutes).padStart(2, "0")}:${String(Math.floor(safe % 60)).padStart(2, "0")}.${String(Math.floor((safe % 1) * 10))}`
}

export function VideoEditor({ project, onExport }: { project: Project; onExport: () => void }) {
  const { subtitleConfig, setSubtitleConfig } = useEditorStore()
  const [timeline, setTimeline] = useState<TimelineProject | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [zoom, setZoom] = useState(44)
  const [playhead, setPlayhead] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [renderedPreview, setRenderedPreview] = useState(false)
  const past = useRef<TimelineProject[]>([])
  const future = useRef<TimelineProject[]>([])
  const mediaInput = useRef<HTMLInputElement>(null)
  const audioInput = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)

  const load = async () => {
    setLoading(true)
    try {
      const data = await api.getTimeline(project.id)
      setTimeline(data)
      const savedSubtitle = data.settings?.subtitle_config
      if (savedSubtitle && typeof savedSubtitle === "object") setSubtitleConfig(savedSubtitle)
      setSelectedId(data.clips.find((clip) => clip.track === "visual")?.id ?? data.clips[0]?.id ?? null)
      setPlayhead(0)
      setDirty(false)
      past.current = []
      future.current = []
    } catch (error) {
      toast({ title: "Không tải được editor", description: String(error), variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [project.id])

  const commit = (next: TimelineProject) => {
    if (!timeline) return
    past.current.push(cloneTimeline(timeline))
    if (past.current.length > 60) past.current.shift()
    future.current = []
    setTimeline(next)
    setDirty(true)
  }

  const patchClip = (id: number | undefined, patch: Partial<TimelineClip>) => {
    if (!timeline || id === undefined) return
    commit({ ...timeline, clips: timeline.clips.map((clip) => clip.id === id ? { ...clip, ...patch } : clip) })
  }

  const patchSettings = (patch: Record<string, unknown>) => {
    if (!timeline) return
    commit({ ...timeline, settings: { ...timeline.settings, ...patch } })
  }

  const undo = () => {
    if (!timeline || past.current.length === 0) return
    const previous = past.current.pop()!
    future.current.push(cloneTimeline(timeline))
    setTimeline(previous)
    setDirty(true)
  }

  const redo = () => {
    if (!timeline || future.current.length === 0) return
    const next = future.current.pop()!
    past.current.push(cloneTimeline(timeline))
    setTimeline(next)
    setDirty(true)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const editingText = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.getAttribute("role") === "textbox"
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault(); event.shiftKey ? redo() : undo()
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault(); redo()
      } else if (!editingText && event.code === "Space") {
        event.preventDefault(); setPlaying((value) => !value)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [timeline])

  useEffect(() => {
    if (!playing || !timeline) return
    let frame = 0
    let previous = performance.now()
    const tick = (now: number) => {
      const delta = (now - previous) / 1000
      previous = now
      setPlayhead((value) => {
        const next = value + delta
        if (next >= timeline.duration) {
          setPlaying(false)
          return timeline.duration
        }
        return next
      })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, timeline?.duration])

  const orderedClips = useMemo(() => [...(timeline?.clips || [])].sort((a, b) => a.clip_start - b.clip_start || a.order_index - b.order_index), [timeline])
  const selected = timeline?.clips.find((clip) => clip.id === selectedId) ?? null
  const activeVisual = orderedClips.find((clip) => clip.track === "visual" && playhead >= clip.clip_start && playhead < clip.clip_end)
    ?? (selected?.track === "visual" ? selected : orderedClips.find((clip) => clip.track === "visual"))
  const activeVoice = orderedClips.find((clip) => clip.track === "voice" && playhead >= clip.clip_start && playhead < clip.clip_end)
  const activeSubtitle = orderedClips.find((clip) => clip.track === "subtitle" && playhead >= clip.clip_start && playhead < clip.clip_end)
  const visualProgress = activeVisual ? Math.max(0, Math.min(1, (playhead - activeVisual.clip_start) / Math.max(0.1, activeVisual.clip_end - activeVisual.clip_start))) : 0

  useEffect(() => {
    const element = videoRef.current
    if (!element || !activeVisual || !isVideo(activeVisual.source_path)) return
    const wanted = activeVisual.in_point + Math.max(0, playhead - activeVisual.clip_start)
    if (Math.abs((element.currentTime || 0) - wanted) > 0.5) element.currentTime = wanted
    if (playing) void element.play().catch(() => undefined)
    else element.pause()
  }, [activeVisual?.id, playing])

  useEffect(() => {
    const element = audioRef.current
    if (!element || !activeVoice?.source_path) return
    element.volume = Math.max(0, Math.min(1, activeVoice.volume ?? 1))
    const wanted = activeVoice.in_point + Math.max(0, playhead - activeVoice.clip_start)
    if (Math.abs((element.currentTime || 0) - wanted) > 0.5) element.currentTime = wanted
    if (playing) void element.play().catch(() => undefined)
    else element.pause()
  }, [activeVoice?.id, playing])

  const save = async () => {
    if (!timeline) return
    setSaving(true)
    try {
      const subtitleUpdates = timeline.clips
        .filter((clip) => clip.track === "subtitle" && clip.scene_id && typeof clip.transform?.text === "string")
        .map((clip) => api.updateScene(project.id, clip.scene_id!, { subtitle_text: String(clip.transform.text) }))
      await Promise.all(subtitleUpdates)
      const saved = await api.saveTimeline(project.id, {
        duration: timeline.duration,
        settings: { ...timeline.settings, subtitle_config: subtitleConfig },
        expected_version: timeline.version,
        clips: timeline.clips.map(({ id: _id, timeline_id: _timelineId, created_at: _createdAt, ...clip }) => clip),
      })
      setTimeline(saved)
      setDirty(false)
      past.current = []
      future.current = []
      toast({ title: "Đã lưu bản dựng", description: `Timeline phiên bản ${saved.version}` })
    } catch (error) {
      toast({ title: "Lưu bản dựng thất bại", description: String(error), variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const removeSelected = () => {
    if (!timeline || !selected || selected.locked) return
    commit({ ...timeline, clips: timeline.clips.filter((clip) => clip.id !== selected.id) })
    setSelectedId(null)
  }

  const duplicateSelected = () => {
    if (!timeline || !selected) return
    const length = selected.clip_end - selected.clip_start
    const start = Math.min(Math.max(0, timeline.duration - length), selected.clip_end + 0.15)
    const duplicate: TimelineClip = {
      ...selected, id: -Date.now(), clip_start: start, clip_end: start + length,
      group_id: `${selected.group_id || "clip"}-copy`, order_index: timeline.clips.length,
    }
    commit({ ...timeline, clips: [...timeline.clips, duplicate] })
    setSelectedId(duplicate.id!)
  }

  const splitSelected = () => {
    if (!timeline || !selected || selected.locked) return
    const splitAt = playhead > selected.clip_start + 0.08 && playhead < selected.clip_end - 0.08
      ? playhead : selected.clip_start + (selected.clip_end - selected.clip_start) / 2
    const firstId = -Date.now()
    const first = { ...selected, id: firstId, clip_end: splitAt, out_point: selected.in_point + (splitAt - selected.clip_start) }
    const second = { ...selected, id: firstId - 1, clip_start: splitAt, in_point: first.out_point, order_index: selected.order_index + 1 }
    commit({ ...timeline, clips: [...timeline.clips.filter((clip) => clip.id !== selected.id), first, second] })
    setSelectedId(firstId)
  }

  const selectSubtitleTool = () => {
    if (!timeline) return
    const existing = orderedClips.find((clip) => clip.track === "subtitle" && playhead >= clip.clip_start && playhead < clip.clip_end)
      ?? orderedClips.find((clip) => clip.track === "subtitle")
    if (existing?.id !== undefined) { setSelectedId(existing.id); return }
    const clip: TimelineClip = {
      id: -Date.now(), track: "subtitle", source_path: "", clip_start: playhead,
      clip_end: Math.min(timeline.duration, playhead + 3), in_point: 0, out_point: 3,
      volume: 1, transform: { text: "Nhập phụ đề" }, group_id: "caption", locked: false,
      order_index: timeline.clips.length,
    }
    commit({ ...timeline, clips: [...timeline.clips, clip] })
    setSelectedId(clip.id!)
  }

  const uploadMedia = async (file: File) => {
    if (!timeline) return
    try {
      const uploaded = await api.uploadMedia(file)
      const mediaType = uploaded.media_type === "image" ? "image" : "video"
      if (selected?.track === "visual") {
        if (selected.scene_id) await api.setSceneMedia(project.id, selected.scene_id, uploaded.path, mediaType)
        patchClip(selected.id, { source_path: uploaded.path, asset_id: null })
      } else {
        const clip: TimelineClip = {
          id: -Date.now(), track: "visual", source_path: uploaded.path, clip_start: playhead,
          clip_end: Math.min(timeline.duration, playhead + 4), in_point: 0, out_point: 4,
          volume: 1, transform: { effect: "zoom_in", scale: 1, x: 0, y: 0 },
          group_id: "inserted-media", locked: false, order_index: timeline.clips.length,
        }
        commit({ ...timeline, clips: [...timeline.clips, clip] })
        setSelectedId(clip.id!)
      }
      toast({ title: "Đã đưa media vào timeline", description: file.name })
    } catch (error) {
      toast({ title: "Không thêm được media", description: String(error), variant: "destructive" })
    }
  }

  const uploadAudio = async (file: File) => {
    if (!timeline) return
    try {
      const uploaded = await api.uploadMedia(file)
      const info = await api.mediaInfo(uploaded.path).catch(() => null)
      const length = Math.max(0.5, Math.min(timeline.duration - playhead, Number(info?.duration || timeline.duration)))
      if (selected && (selected.track === "voice" || selected.track === "music")) {
        patchClip(selected.id, { source_path: uploaded.path, out_point: length, clip_end: Math.min(timeline.duration, selected.clip_start + length), asset_id: null })
      } else {
        const clip: TimelineClip = {
          id: -Date.now(), track: "music", source_path: uploaded.path, clip_start: playhead,
          clip_end: Math.min(timeline.duration, playhead + length), in_point: 0, out_point: length,
          volume: 0.25, transform: {}, group_id: "music", locked: false,
          order_index: timeline.clips.length,
        }
        commit({ ...timeline, clips: [...timeline.clips, clip] })
        setSelectedId(clip.id!)
      }
      toast({ title: "Đã thêm audio", description: file.name })
    } catch (error) {
      toast({ title: "Không thêm được audio", description: String(error), variant: "destructive" })
    }
  }

  if (loading) return <div className="vas-card p-6 text-sm text-slate-400">Đang mở trình dựng phim…</div>
  if (!timeline) return null

  const duration = Math.max(timeline.duration, 0.1)
  const effect = activeVisual?.transform?.effect || "none"
  const previewTransform = effect === "zoom_in" ? `scale(${1 + visualProgress * 0.08})`
    : effect === "zoom_out" ? `scale(${1.08 - visualProgress * 0.08})`
      : effect === "pan_left" ? `scale(1.08) translateX(${3 - visualProgress * 6}%)`
        : effect === "pan_right" ? `scale(1.08) translateX(${-3 + visualProgress * 6}%)`
          : "scale(1)"
  const subtitleText = String(activeSubtitle?.transform?.text || "")
  const subtitlePosition = subtitleConfig.position === "top" ? "top-8" : subtitleConfig.position === "center" ? "top-1/2 -translate-y-1/2" : "bottom-8"

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#090e12] shadow-2xl">
      <input ref={mediaInput} type="file" accept="image/*,video/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadMedia(file); event.currentTarget.value = "" }} />
      <input ref={audioInput} type="file" accept="audio/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAudio(file); event.currentTarget.value = "" }} />

      <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.08] bg-[#11181d] px-4 py-3">
        <div className="mr-auto min-w-0">
          <div className="flex items-center gap-2"><h3 className="truncate font-semibold text-slate-100">{project.name}</h3><Badge variant={dirty ? "warning" : "success"}>{dirty ? "Chưa lưu" : `Đã lưu v${timeline.version}`}</Badge></div>
          <p className="text-[11px] text-slate-500">Dựng phim · {formatTime(duration)} · {project.aspect_ratio}</p>
        </div>
        <Button size="sm" variant="outline" onClick={undo} disabled={past.current.length === 0} title="Undo (Ctrl+Z)"><Undo2 className="h-4 w-4" /></Button>
        <Button size="sm" variant="outline" onClick={redo} disabled={future.current.length === 0} title="Redo (Ctrl+Y)"><Redo2 className="h-4 w-4" /></Button>
        <Button size="sm" variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4" />Reset</Button>
        <Button size="sm" onClick={() => void save()} disabled={!dirty || saving}><Save className="h-4 w-4" />{saving ? "Đang lưu" : "Lưu"}</Button>
        <Button size="sm" variant={renderedPreview ? "default" : "outline"} onClick={() => setRenderedPreview((value) => !value)}><Play className="h-4 w-4" />Preview</Button>
        <Button size="sm" className="bg-gradient-to-r from-amber-500 to-amber-300 text-black" onClick={onExport}><Download className="h-4 w-4" />Export</Button>
      </div>

      <div className="grid min-h-[520px] grid-cols-[88px_minmax(0,1fr)_310px]">
        <aside className="border-r border-white/[0.08] bg-[#0d1419] p-2">
          <div className="space-y-1">
            <ToolButton icon={Type} label="Text" onClick={selectSubtitleTool} active={selected?.track === "subtitle"} />
            <ToolButton icon={ImagePlus} label="Media" onClick={() => mediaInput.current?.click()} active={selected?.track === "visual"} />
            <ToolButton icon={Music} label="Audio" onClick={() => audioInput.current?.click()} active={selected?.track === "music" || selected?.track === "voice"} />
            <ToolButton icon={Scissors} label="Tách" onClick={splitSelected} disabled={!selected || selected.locked} />
            <ToolButton icon={Copy} label="Nhân bản" onClick={duplicateSelected} disabled={!selected} />
            <ToolButton icon={Trash2} label="Xóa" onClick={removeSelected} disabled={!selected || selected.locked} danger />
          </div>
        </aside>

        <main className="flex min-w-0 flex-col bg-[#070b0e]">
          <div className="flex flex-1 items-center justify-center p-5">
            <div className={cn("relative overflow-hidden rounded-xl border border-white/10 bg-black shadow-2xl", project.aspect_ratio === "9:16" ? "aspect-[9/16] h-[430px]" : "aspect-video w-full max-w-[880px]") }>
              {renderedPreview ? (
                <video src={outputVideoUrl(project.id, "preview")} controls autoPlay className="h-full w-full object-contain" />
              ) : activeVisual?.source_path ? (
                <>
                  {isImage(activeVisual.source_path)
                    ? <img src={mediaUrl(activeVisual.source_path)} className="h-full w-full object-cover transition-transform duration-100" style={{ transform: previewTransform }} />
                    : <video key={activeVisual.source_path} ref={videoRef} src={mediaUrl(activeVisual.source_path)} muted playsInline className="h-full w-full object-cover" />}
                  {subtitleText && <div className={cn("pointer-events-none absolute left-6 right-6 text-center", subtitlePosition)} style={{ color: subtitleConfig.primary_color, fontFamily: subtitleConfig.font, fontSize: `${Math.max(14, subtitleConfig.font_size * 0.55)}px`, WebkitTextStroke: `${Math.max(0, subtitleConfig.border_width * 0.5)}px ${subtitleConfig.border_color}`, fontWeight: 700 }}>{subtitleText}</div>}
                </>
              ) : <div className="flex h-full items-center justify-center text-sm text-slate-600">Chưa có clip hình tại vị trí này</div>}
              {!renderedPreview && activeVoice?.source_path && <audio key={activeVoice.source_path} ref={audioRef} src={mediaUrl(activeVoice.source_path)} />}
            </div>
          </div>
          <div className="border-t border-white/[0.08] bg-[#11181d] px-5 py-3">
            <div className="flex items-center gap-3">
              <Button size="icon" variant="outline" onClick={() => { if (playhead >= duration) setPlayhead(0); setPlaying((value) => !value) }}>{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</Button>
              <span className="w-28 font-mono text-xs text-slate-300">{formatTime(playhead)} / {formatTime(duration)}</span>
              <input type="range" min={0} max={duration} step={0.01} value={playhead} onChange={(event) => { setPlaying(false); setPlayhead(Number(event.target.value)) }} className="h-1 flex-1 accent-amber-400" />
              <Button size="icon" variant="ghost" onClick={() => setZoom((value) => Math.max(20, value - 8))}><ZoomOut className="h-4 w-4" /></Button>
              <span className="text-[10px] text-slate-500">{zoom}px/s</span>
              <Button size="icon" variant="ghost" onClick={() => setZoom((value) => Math.min(120, value + 8))}><ZoomIn className="h-4 w-4" /></Button>
            </div>
          </div>
        </main>

        <aside className="overflow-y-auto border-l border-white/[0.08] bg-[#0d1419] p-4">
          <div className="mb-4 flex items-center justify-between"><h4 className="font-semibold text-slate-100">Thuộc tính</h4><Badge variant="secondary">{selected?.track || "—"}</Badge></div>
          {selected ? <ClipProperties clip={selected} patch={(patch) => patchClip(selected.id, patch)} subtitleConfig={subtitleConfig} setSubtitleConfig={setSubtitleConfig} /> : <p className="text-sm text-slate-500">Chọn clip trên timeline để chỉnh sửa.</p>}
          <div className="mt-5 border-t border-white/[0.08] pt-4">
            <Label className="text-xs">Thời lượng project</Label>
            <Input className="mt-1" type="number" min={0.1} step={0.1} value={timeline.duration} onChange={(event) => { const value = Math.max(0.1, Number(event.target.value)); commit({ ...timeline, duration: value }) }} />
            <Label className="mt-3 block text-xs">Màu nền canvas</Label>
            <Input className="mt-1 h-9 p-1" type="color" value={String(timeline.settings.background_color || "#000000")} onChange={(event) => patchSettings({ background_color: event.target.value })} />
          </div>
        </aside>
      </div>

      <div className="border-t border-white/[0.08] bg-[#0a1014] p-3">
        <div className="overflow-x-auto rounded-lg border border-white/[0.08] bg-[#070b0e]">
          <div className="min-w-[820px]" style={{ width: `${Math.max(820, duration * zoom + 124)}px` }}>
            <div className="relative ml-28 h-7 border-b border-white/[0.08] text-[10px] text-slate-600">
              {Array.from({ length: Math.ceil(duration) + 1 }, (_, second) => <span key={second} className="inline-block border-l border-white/[0.08] pl-1" style={{ width: `${zoom}px` }}>{second}s</span>)}
              <div className="absolute top-0 h-full w-px bg-amber-300" style={{ left: `${playhead * zoom}px` }} />
            </div>
            {TRACKS.map((track) => (
              <div key={track.id} className="flex min-h-[54px] border-b border-white/[0.06] last:border-0">
                <div className="flex w-28 shrink-0 items-center border-r border-white/[0.08] px-2 text-[11px] text-slate-400">{track.label}</div>
                <div className="relative flex-1" onDoubleClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setPlayhead(Math.max(0, Math.min(duration, (event.clientX - rect.left) / zoom))) }}>
                  {timeline.clips.filter((clip) => clip.track === track.id).map((clip, index) => {
                    const width = Math.max(30, (clip.clip_end - clip.clip_start) * zoom)
                    const left = clip.clip_start * zoom
                    const active = clip.id === selectedId
                    return <button key={clip.id ?? `${track.id}-${index}`} type="button" onClick={() => { setSelectedId(clip.id ?? null); setPlayhead(clip.clip_start) }} className={cn("absolute top-2 h-9 overflow-hidden rounded border px-2 text-left text-[10px] text-white", track.color, active ? "border-amber-200 ring-2 ring-amber-300/60" : "border-white/10 hover:border-white/40")} style={{ left, width }}><span className="block truncate">{clip.source_path ? fileName(clip.source_path) : String(clip.transform?.text || `${track.label} clip`)}</span><span className="text-[9px] text-white/70">{(clip.clip_end - clip.clip_start).toFixed(1)}s</span></button>
                  })}
                  <div className="pointer-events-none absolute top-0 h-full w-px bg-amber-300/80" style={{ left: `${playhead * zoom}px` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function ToolButton({ icon: Icon, label, onClick, active, disabled, danger }: { icon: typeof Type; label: string; onClick: () => void; active?: boolean; disabled?: boolean; danger?: boolean }) {
  return <button type="button" onClick={onClick} disabled={disabled} className={cn("flex w-full flex-col items-center gap-1 rounded-lg border border-transparent px-1 py-2 text-[10px] text-slate-400 hover:border-white/10 hover:bg-white/[0.05] hover:text-white disabled:cursor-not-allowed disabled:opacity-30", active && "border-cyan-500/30 bg-cyan-500/10 text-cyan-300", danger && "hover:text-red-400")}><Icon className="h-4 w-4" /><span>{label}</span></button>
}

function ClipProperties({ clip, patch, subtitleConfig, setSubtitleConfig }: { clip: TimelineClip; patch: (value: Partial<TimelineClip>) => void; subtitleConfig: any; setSubtitleConfig: (value: any) => void }) {
  const transform = clip.transform || {}
  return <div className="space-y-4">
    {clip.source_path && <div className="truncate rounded-md border border-white/[0.08] bg-black/20 px-2 py-1.5 text-[11px] text-slate-400" title={clip.source_path}>{fileName(clip.source_path)}</div>}
    {clip.track === "subtitle" && <>
      <div><Label className="text-xs">Nội dung phụ đề</Label><Textarea className="mt-1 min-h-24" value={String(transform.text || "")} onChange={(event) => patch({ transform: { ...transform, text: event.target.value } })} /></div>
      <div><Label className="text-xs">Font</Label><Input className="mt-1" value={subtitleConfig.font} onChange={(event) => setSubtitleConfig({ font: event.target.value })} /></div>
      <div><Label className="text-xs">Cỡ chữ: {subtitleConfig.font_size}px</Label><Slider value={[subtitleConfig.font_size]} min={16} max={120} step={2} onValueChange={(value) => setSubtitleConfig({ font_size: value[0] })} /></div>
      <div className="grid grid-cols-2 gap-2"><div><Label className="text-xs">Màu chữ</Label><Input type="color" className="mt-1 h-9 p-1" value={subtitleConfig.primary_color} onChange={(event) => setSubtitleConfig({ primary_color: event.target.value })} /></div><div><Label className="text-xs">Màu viền</Label><Input type="color" className="mt-1 h-9 p-1" value={subtitleConfig.border_color} onChange={(event) => setSubtitleConfig({ border_color: event.target.value })} /></div></div>
      <div><Label className="text-xs">Căn chữ</Label><div className="mt-1 grid grid-cols-3 gap-1"><Button size="sm" variant="outline" onClick={() => patch({ transform: { ...transform, align: "left" } })}><AlignLeft className="h-4 w-4" /></Button><Button size="sm" variant="outline" onClick={() => patch({ transform: { ...transform, align: "center" } })}><AlignCenter className="h-4 w-4" /></Button><Button size="sm" variant="outline" onClick={() => patch({ transform: { ...transform, align: "right" } })}><AlignRight className="h-4 w-4" /></Button></div></div>
    </>}
    {clip.track === "visual" && <>
      <div><Label className="text-xs">Chuyển động</Label><Select value={String(transform.effect || "zoom_in")} onValueChange={(effect) => patch({ transform: { ...transform, effect } })}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="zoom_in">Zoom vào nhẹ</SelectItem><SelectItem value="zoom_out">Zoom ra nhẹ</SelectItem><SelectItem value="pan_left">Pan sang trái</SelectItem><SelectItem value="pan_right">Pan sang phải</SelectItem><SelectItem value="none">Giữ khung</SelectItem></SelectContent></Select></div>
      <div><Label className="text-xs">Crop / Zoom: {Number(transform.scale || 1).toFixed(2)}×</Label><Slider value={[Number(transform.scale || 1)]} min={1} max={1.8} step={0.05} onValueChange={(value) => patch({ transform: { ...transform, scale: value[0] } })} /></div>
      <div><Label className="text-xs">Vị trí ngang: {Number(transform.x || 0).toFixed(2)}</Label><Slider value={[Number(transform.x || 0)]} min={-1} max={1} step={0.05} onValueChange={(value) => patch({ transform: { ...transform, x: value[0] } })} /></div>
      <div><Label className="text-xs">Vị trí dọc: {Number(transform.y || 0).toFixed(2)}</Label><Slider value={[Number(transform.y || 0)]} min={-1} max={1} step={0.05} onValueChange={(value) => patch({ transform: { ...transform, y: value[0] } })} /></div>
      <div><Label className="text-xs">Chuyển sang cảnh sau</Label><Select value={String(transform.transition || "auto")} onValueChange={(transition) => patch({ transform: { ...transform, transition } })}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="auto">Tự động theo nhịp</SelectItem><SelectItem value="fade">Fade</SelectItem><SelectItem value="dissolve">Dissolve</SelectItem><SelectItem value="smoothleft">Trượt trái</SelectItem><SelectItem value="smoothright">Trượt phải</SelectItem></SelectContent></Select></div>
    </>}
    <div className="grid grid-cols-2 gap-2"><div><Label className="text-xs">Bắt đầu</Label><Input type="number" step={0.1} value={clip.clip_start} disabled={clip.locked} onChange={(event) => { const start = Math.max(0, Number(event.target.value)); patch({ clip_start: start, clip_end: Math.max(start + 0.1, clip.clip_end) }) }} /></div><div><Label className="text-xs">Kết thúc</Label><Input type="number" step={0.1} value={clip.clip_end} disabled={clip.locked} onChange={(event) => patch({ clip_end: Math.max(clip.clip_start + 0.1, Number(event.target.value)) })} /></div></div>
    {(clip.track === "voice" || clip.track === "music") && <div><Label className="text-xs">Âm lượng: {Math.round((clip.volume || 0) * 100)}%</Label><Slider value={[clip.volume || 0]} min={0} max={2} step={0.05} onValueChange={(value) => patch({ volume: value[0] })} /></div>}
  </div>
}
