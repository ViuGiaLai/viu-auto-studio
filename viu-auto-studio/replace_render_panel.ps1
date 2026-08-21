$path = 'D:\all_my_project\viu-auto-studio\viu-auto-studio\desktop\src\pages\project-editor-page.tsx'
$text = [IO.File]::ReadAllText($path)
$start = $text.IndexOf('function RenderPanel({ project }: { project: Project }) {')
$marker = "`r`n// ---------------------------------------------------------------------------`r`n// Main editor page"
$end = $text.IndexOf($marker, $start)
if ($start -lt 0 -or $end -lt 0) { throw 'RenderPanel markers not found' }
$new = @'
function RenderPanel({ project }: { project: Project }) {
  const { job, subtitleConfig, setSubtitleConfig } = useEditorStore()
  const [outputPreset, setOutputPreset] = useState<string>(project.aspect_ratio === "9:16" ? "shorts" : "youtube")
  const [profileId, setProfileId] = useState<string>("balanced")
  const [crf, setCrf] = useState(21)
  const [fps, setFps] = useState(30)
  const [preset, setPreset] = useState("medium")
  const [codec, setCodec] = useState("libx264")
  const [audioBitrate, setAudioBitrate] = useState("192k")
  const [enableSubs, setEnableSubs] = useState(true)
  const [subtitleStyle, setSubtitleStyle] = useState("highlight")
  const [subtitleFormat, setSubtitleFormat] = useState("embed")
  const [voiceVol, setVoiceVol] = useState(1)
  const [musicVol, setMusicVol] = useState(0.25)
  const [ducking, setDucking] = useState(true)
  const [normalize, setNormalize] = useState(true)
  const [transitionDuration, setTransitionDuration] = useState(0.35)
  const [rendering, setRendering] = useState(false)
  const [preflight, setPreflight] = useState<Awaited<ReturnType<typeof api.renderPreflight>> | null>(null)
  const [preflightLoading, setPreflightLoading] = useState(false)
  const [verifyResult, setVerifyResult] = useState<Awaited<ReturnType<typeof api.renderVerifyOutput>> | null>(null)

  const canRender = !job || job.status === "completed" || job.status === "failed" || job.status === "cancelled"
  const inProgress = ["generating_voice", "voice_ready", "preparing_media", "media_ready", "generating_subtitles", "rendering"].includes(job?.status || "")
  const selectedPreset = OUTPUT_PRESETS.find((item) => item.id === outputPreset) || OUTPUT_PRESETS[0]
  const selectedProfile = RENDER_PROFILES.find((item) => item.id === profileId) || RENDER_PROFILES[1]
  const invalidatePreflight = () => setPreflight(null)

  useEffect(() => {
    if (job?.status !== "completed" || !job.id) {
      setVerifyResult(null)
      return
    }
    api.renderVerifyOutput(job.id).then(setVerifyResult).catch((error) => {
      setVerifyResult({ ok: false, checks: [], duration: 0, resolution: "", fps: 0, file_size_mb: 0, message: String(error) })
    })
  }, [job?.id, job?.status])

  const applyProfile = (id: string) => {
    setProfileId(id)
    const values: Record<string, { crf: number; preset: string }> = {
      basic: { crf: 24, preset: "veryfast" },
      balanced: { crf: 21, preset: "medium" },
      high: { crf: 18, preset: "slow" },
    }
    const next = values[id]
    if (next) {
      setCrf(next.crf)
      setPreset(next.preset)
    }
    invalidatePreflight()
  }

  const runPreflight = async () => {
    setPreflightLoading(true)
    try {
      const result = await api.renderPreflight(project.id, !enableSubs)
      setPreflight(result)
      return result
    } catch (error) {
      toast({ title: "Không kiểm tra được trước khi xuất", description: String(error), variant: "destructive" })
      setPreflight(null)
      return null
    } finally {
      setPreflightLoading(false)
    }
  }

  const renderConfig = () => ({
    output_preset: outputPreset,
    voice_volume: voiceVol,
    enable_ducking: ducking,
    normalize_audio: normalize,
    subtitle_style: subtitleStyle,
    subtitle_output_format: subtitleFormat,
    crf,
    fps,
    preset,
    video_encoder: codec,
    audio_bitrate: audioBitrate,
    enable_subtitles: enableSubs,
    music_volume: musicVol,
    transition_duration: transitionDuration,
    subtitle_config: subtitleConfig,
  })

  const start = async () => {
    if (inProgress || rendering) return
    const check = await runPreflight()
    if (!check?.ok) {
      toast({ title: "Chưa thể xuất video", description: "Hãy xử lý các mục chưa đạt trong checklist trước khi render.", variant: "destructive" })
      return
    }
    setRendering(true)
    try {
      const res = await api.renderStart(project.id, renderConfig())
      if (res.ok && res.job_id) {
        toast({ title: "Đã thêm vào hàng đợi render", description: "Pipeline sẽ render và verify output bằng FFprobe." })
      } else {
        toast({ title: "Không thể bắt đầu", description: res.message, variant: "destructive" })
      }
    } catch (error) {
      toast({ title: "Bắt đầu render thất bại", description: String(error), variant: "destructive" })
    } finally {
      setRendering(false)
    }
  }

  const cancel = async () => {
    if (!job) return
    try {
      await api.cancelJob(job.id)
      toast({ title: "Đã hủy render" })
    } catch (error) {
      toast({ title: "Hủy render thất bại", description: String(error), variant: "destructive" })
    }
  }

  const retry = async () => {
    if (!job) return
    try {
      await api.retryJob(job.id, renderConfig())
      toast({ title: "Đang thử lại render", description: "Tiếp tục từ bước lỗi với cấu hình hiện tại." })
    } catch (error) {
      toast({ title: "Retry thất bại", description: String(error), variant: "destructive" })
    }
  }

  return (
    <div id="render-panel" className="space-y-5">
      <div className="vas-card p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-amber-300/80">Dựng & Xuất video</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-100">Cấu hình đầu ra</h3>
            <p className="mt-1 text-xs text-slate-500">Timeline vẫn là nơi chỉnh scene. Khu vực này chỉ chọn đầu ra và thực thi render.</p>
          </div>
          <Badge variant="outline">MP4 · H.264 + AAC</Badge>
        </div>

        <div className="space-y-5">
          <section>
            <div className="mb-2 flex items-center justify-between"><Label className="text-sm font-semibold">1. Output Preset</Label><span className="text-xs text-slate-500">Chọn trước, tinh chỉnh sau</span></div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {OUTPUT_PRESETS.map((item) => (
                <button key={item.id} type="button" onClick={() => { setOutputPreset(item.id); invalidatePreflight() }} className={cn("rounded-xl border p-3 text-left transition", outputPreset === item.id ? "border-amber-400/70 bg-amber-400/10" : "border-white/10 bg-white/[0.02] hover:border-white/25")}>
                  <div className="mb-2 text-2xl text-amber-300">{item.icon}</div>
                  <div className="text-sm font-medium text-slate-100">{item.title}</div>
                  <div className="mt-1 text-[11px] text-slate-500">{item.detail}</div>
                </button>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between"><Label className="text-sm font-semibold">2. Render Profile</Label><span className="text-xs text-slate-500">Thiết lập kỹ thuật được ẩn trong Nâng cao</span></div>
            <div className="grid gap-2 sm:grid-cols-3">
              {RENDER_PROFILES.map((item) => (
                <button key={item.id} type="button" onClick={() => applyProfile(item.id)} className={cn("rounded-xl border p-3 text-left transition", profileId === item.id ? "border-sky-400/70 bg-sky-400/10" : "border-white/10 bg-white/[0.02] hover:border-white/25")}>
                  <div className="text-sm font-medium text-slate-100">{item.title}</div>
                  <div className="mt-1 text-[11px] text-slate-500">{item.detail}</div>
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-500">Đang chọn: <span className="text-slate-300">{selectedProfile.title}</span>. Codec, CRF và FPS chỉ dành cho trường hợp cần tinh chỉnh.</p>
          </section>

          <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <Label className="text-sm font-semibold">3. Audio Mix</Label>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <div><div className="mb-1 flex justify-between text-xs"><span>Giọng đọc</span><span>{Math.round(voiceVol * 100)}%</span></div><Slider value={[voiceVol]} min={0} max={2} step={0.05} onValueChange={(v) => { setVoiceVol(v[0]); invalidatePreflight() }} /></div>
              <div><div className="mb-1 flex justify-between text-xs"><span>Nhạc nền</span><span>{Math.round(musicVol * 100)}%</span></div><Slider value={[musicVol]} min={0} max={1} step={0.05} onValueChange={(v) => { setMusicVol(v[0]); invalidatePreflight() }} /></div>
            </div>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3 text-xs">
              <label className="flex items-center gap-2"><Switch checked={ducking} onCheckedChange={(v) => { setDucking(v); invalidatePreflight() }} /> Tự giảm nhạc khi có giọng</label>
              <label className="flex items-center gap-2"><Switch checked={normalize} onCheckedChange={(v) => { setNormalize(v); invalidatePreflight() }} /> Chuẩn hóa âm lượng</label>
            </div>
          </section>

          <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex items-center justify-between"><Label className="text-sm font-semibold">4. Subtitle</Label><Switch checked={enableSubs} onCheckedChange={(v) => { setEnableSubs(v); invalidatePreflight() }} /></div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {[{ id: "highlight", title: "Nổi bật", detail: "Chữ lớn, tương phản cao", cfg: { font_size: 64, position: "center", primary_color: "#FFD700", border_width: 4, granularity: "phrase" } }, { id: "basic", title: "Cơ bản", detail: "Dễ đọc, gọn gàng", cfg: { font_size: 48, position: "bottom", primary_color: "#FFFFFF", border_width: 2, granularity: "sentence" } }, { id: "karaoke", title: "Karaoke", detail: "Bám theo từng nhịp câu", cfg: { font_size: 56, position: "bottom", primary_color: "#00E5FF", border_width: 3, granularity: "phrase" } }].map((item) => (
                <button key={item.id} type="button" disabled={!enableSubs} onClick={() => { setSubtitleStyle(item.id); setSubtitleConfig(item.cfg); invalidatePreflight() }} className={cn("rounded-lg border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50", subtitleStyle === item.id ? "border-fuchsia-400/70 bg-fuchsia-400/10" : "border-white/10 hover:border-white/25")}><div className="text-sm font-medium">{item.title}</div><div className="mt-1 text-[11px] text-slate-500">{item.detail}</div></button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {[{ id: "embed", label: "Nhúng vào video" }, { id: "srt", label: "Xuất file .SRT" }, { id: "ass", label: "Xuất file .ASS" }].map((item) => <label key={item.id} className={cn("flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs", subtitleFormat === item.id && enableSubs ? "border-fuchsia-400/60 bg-fuchsia-400/10" : "border-white/10", !enableSubs && "opacity-50")}><input type="radio" name="subtitle-format" value={item.id} checked={subtitleFormat === item.id} disabled={!enableSubs} onChange={() => { setSubtitleFormat(item.id); invalidatePreflight() }} />{item.label}</label>)}
            </div>
          </section>

          <details className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <summary className="cursor-pointer text-sm font-medium text-slate-300">Nâng cao · CRF, preset, FPS, codec, bitrate</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div><Label className="text-xs">CRF</Label><Input type="number" min={15} max={40} value={crf} onChange={(e) => { setCrf(Number(e.target.value)); invalidatePreflight() }} /></div>
              <div><Label className="text-xs">FPS</Label><Input type="number" min={15} max={60} value={fps} onChange={(e) => { setFps(Number(e.target.value)); invalidatePreflight() }} /></div>
              <div><Label className="text-xs">Preset</Label><Select value={preset} onValueChange={(v) => { setPreset(v); invalidatePreflight() }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["ultrafast", "veryfast", "fast", "medium", "slow"].map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></div>
              <div><Label className="text-xs">Codec</Label><Select value={codec} onValueChange={(v) => { setCodec(v); invalidatePreflight() }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="libx264">H.264 CPU</SelectItem><SelectItem value="h264_nvenc">H.264 NVENC</SelectItem></SelectContent></Select></div>
              <div><Label className="text-xs">Audio bitrate</Label><Select value={audioBitrate} onValueChange={(v) => { setAudioBitrate(v); invalidatePreflight() }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["128k", "192k", "256k", "320k"].map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></div>
            </div>
          </details>

          <div className="rounded-xl border border-amber-300/20 bg-amber-300/[0.05] p-4 text-xs text-slate-400">Output dự kiến: <span className="font-medium text-slate-200">{selectedPreset.title}</span> · {selectedPreset.detail}. Render thực tế sẽ dùng media/voice từ Timeline và chỉ được đánh dấu hoàn tất sau khi FFprobe xác minh.</div>
        </div>
      </div>

      <div className="vas-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-base font-semibold text-slate-100">Kiểm tra trước khi xuất</h3><p className="mt-1 text-xs text-slate-500">Không có checklist đạt thì không thể bắt đầu render.</p></div><Button variant="outline" onClick={runPreflight} disabled={preflightLoading || inProgress}><RefreshCw className={cn("h-4 w-4", preflightLoading && "animate-spin")} />{preflightLoading ? "Đang kiểm tra..." : "Kiểm tra lại"}</Button></div>
        {preflight ? <div className="mt-4 space-y-2">{preflight.checks.map((check) => <div key={check.label} className="flex items-start gap-2 rounded-lg border border-white/5 px-3 py-2 text-xs"><span className={cn("mt-0.5", check.ok ? "text-emerald-400" : "text-red-400")}>{check.ok ? "✓" : "×"}</span><div><div className="font-medium text-slate-200">{check.label}</div><div className="text-slate-500">{check.detail}</div></div></div>)}<div className="flex flex-wrap gap-4 pt-2 text-xs text-slate-400"><span>Dung lượng: {preflight.disk_free_gb.toFixed(2)} GB trống</span><span>Ước tính: ~{preflight.estimated_size_gb.toFixed(2)} GB</span></div>{preflight.missing_scenes.length > 0 && <div className="text-xs text-red-300">Scene cần xử lý: {preflight.missing_scenes.join(", ")}</div>}</div> : <div className="mt-4 rounded-lg border border-dashed border-white/10 p-4 text-center text-xs text-slate-500">Nhấn “Kiểm tra lại” để kiểm tra media, voice, subtitle, FFmpeg, FFprobe và dung lượng trống.</div>}
        <div className="mt-4 flex flex-wrap gap-2"><Button onClick={start} disabled={!canRender || rendering || inProgress || !preflight?.ok} className="bg-gradient-to-r from-amber-500 to-amber-300 text-slate-950 hover:from-amber-400 hover:to-amber-200"><Play className="h-4 w-4" />{inProgress ? "Đang xử lý..." : "Bắt đầu render"}</Button>{inProgress && <Button variant="destructive" onClick={cancel}><Square className="h-4 w-4" />Hủy</Button>}{(job?.status === "failed" || job?.status === "completed") && <Button variant="outline" onClick={retry}><RotateCcw className="h-4 w-4" />{job.status === "failed" ? "Thử lại từ bước lỗi" : "Xuất lại sau chỉnh sửa"}</Button>}</div>
      </div>

      {job && <div className="vas-card p-5"><div className="mb-3 flex items-center justify-between"><h3 className="text-base font-semibold text-slate-100">Hàng đợi render</h3><Badge variant={job.status === "completed" ? "success" : job.status === "failed" || job.status === "cancelled" ? "destructive" : "warning"}>{STATUS_LABELS[job.status] || job.status}</Badge></div><div className="space-y-3"><div className="flex justify-between text-sm"><span>Bước: <strong>{job.current_step || "—"}</strong></span><span>{job.progress}%</span></div><Progress value={job.progress} />{job.error_message && <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" /><span className="whitespace-pre-wrap">{job.error_message}</span></div>}{job.status === "completed" && job.output_path && <div className="space-y-3"><video src={outputVideoUrl(project.id, "output")} controls className="w-full max-h-[50vh] rounded-lg border" />{verifyResult && <div className={cn("rounded-lg border p-3 text-xs", verifyResult.ok ? "border-emerald-400/30 bg-emerald-400/5" : "border-red-400/30 bg-red-400/5")}><div className="font-medium">{verifyResult.ok ? "✓ Output đã verify bằng FFprobe" : "× Verify output thất bại"}</div><div className="mt-1 text-slate-500">{verifyResult.resolution || "—"} · {verifyResult.fps || 0} FPS · {verifyResult.duration.toFixed(2)} giây · {verifyResult.file_size_mb.toFixed(2)} MB</div></div>}<Button variant="outline" onClick={async () => { try { const result = await api.openProjectFolder(project.id); const opened = await openLocalPath(result.path); if (!opened.ok) throw new Error(opened.message) } catch (error) { toast({ title: "Không mở được thư mục đầu ra", description: String(error), variant: "destructive" }) } }}><FolderOpen className="h-4 w-4" />Mở thư mục đầu ra</Button></div>}</div></div>}
      {!job && <div className="vas-card p-5"><div className="flex flex-col items-center gap-3 py-8"><FileVideo className="h-10 w-10 text-slate-500/40" /><div className="text-sm text-slate-500">Chưa có job render. Hoàn thành checklist để bắt đầu.</div></div></div>}
    </div>
  )
}
'@
[IO.File]::WriteAllText($path, $text.Substring(0, $start) + $new + $text.Substring($end), [Text.UTF8Encoding]::new($false))
Write-Output 'RenderPanel replaced'
