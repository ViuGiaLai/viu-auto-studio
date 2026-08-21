$path = 'D:\all_my_project\viu-auto-studio\viu-auto-studio\desktop\src\pages\project-editor-page.tsx'
$text = [IO.File]::ReadAllText($path)
$start = $text.IndexOf("  useEffect(() => {`n    api.settingsGet().then((settings) => {")
$end = $text.IndexOf("  return (", $start)
if ($start -lt 0 -or $end -lt 0) { throw 'RenderPanel logic markers not found' }
$new = @'
  useEffect(() => {
    api.settingsGet().then((settings) => {
      const values = settings as unknown as Record<string, unknown>
      if (typeof values.output_preset === "string") setOutputPreset(values.output_preset)
      if (typeof values.voice_volume === "number") setVoiceVol(values.voice_volume)
      if (typeof values.music_volume === "number") setMusicVol(values.music_volume)
      if (typeof values.enable_ducking === "boolean") setDucking(values.enable_ducking)
      if (typeof values.normalize_audio === "boolean") setNormalize(values.normalize_audio)
      if (typeof values.subtitle_style === "string") setSubtitleStyle(values.subtitle_style)
      if (typeof values.subtitle_output_format === "string") setSubtitleFormat(values.subtitle_output_format)
    }).catch(() => undefined)
  }, [project.id])

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
      toast({ title: "Preflight failed", description: String(error), variant: "destructive" })
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
      toast({ title: "Render is not ready", description: "Resolve the failed preflight checks before rendering.", variant: "destructive" })
      return
    }
    setRendering(true)
    try {
      const res = await api.renderStart(project.id, renderConfig())
      if (res.ok && res.job_id) toast({ title: "Render queued", description: "Output will be verified with FFprobe before completion." })
      else toast({ title: "Cannot start render", description: res.message, variant: "destructive" })
    } catch (error) {
      toast({ title: "Render failed to start", description: String(error), variant: "destructive" })
    } finally {
      setRendering(false)
    }
  }

  const cancel = async () => {
    if (!job) return
    try {
      await api.cancelJob(job.id)
      toast({ title: "Render cancelled" })
    } catch (error) {
      toast({ title: "Cancel failed", description: String(error), variant: "destructive" })
    }
  }

  const retry = async () => {
    if (!job) return
    try {
      await api.retryJob(job.id, renderConfig())
      toast({ title: "Retry started", description: "Continuing from the failed step." })
    } catch (error) {
      toast({ title: "Retry failed", description: String(error), variant: "destructive" })
    }
  }

'@
[IO.File]::WriteAllText($path, $text.Substring(0, $start) + $new + $text.Substring($end), [Text.UTF8Encoding]::new($false))
Write-Output 'RenderPanel logic repaired'
