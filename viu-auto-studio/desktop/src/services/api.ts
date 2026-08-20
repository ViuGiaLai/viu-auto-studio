import type {
  Channel, DashboardStats, FFmpegCheck, MediaInfo, Project, RenderConfig,
  RenderJob, ScriptData, ScriptPayload, Scene, SubtitleConfig, TTSConfig, TTSVoice,
    Character, PipelineState, StudioSettings, TimelineProject,

} from "@/types"

export type SkillCatalogItem = {
  id: string
  name: string
  category: string
  execution: string
  description: string
  requires_manus_api: boolean
}

export type SkillRun = {
  id: number
  project_id: number | null
  skill_id: string
  mode: string
  status: string
  input_json: string
  output_text: string
  external_task_id: string
  error_message: string
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------

// API base URL — động, không hardcode localhost/port.
// Thứ tự ưu tiên:
//  1. window.electronAPI.getRuntimeConfig() (app Electron đã khởi động backend)
//  2. Biến env VITE_API_BASE (dev/prod build tùy chỉnh)
//  3. /api tương đối (chỉ hoạt động khi vite proxy dev)
// ---------------------------------------------------------------------------
interface ElectronRuntimeAPI {
  getRuntimeConfig(): Promise<{ apiBaseUrl?: string } | null>
  getUserDataDir?: () => Promise<string>
}

async function resolveApiBase(): Promise<string> {
  const w = window as unknown as { electronAPI?: ElectronRuntimeAPI }
  if (w.electronAPI?.getRuntimeConfig) {
    // Electron khởi động backend bất đồng bộ: nếu chưa ghi runtime.json thì
    // thử lại nhiều lần (~10s) trước khi bỏ qua.
    for (let i = 0; i < 20; i += 1) {
      try {
        const cfg = await w.electronAPI.getRuntimeConfig()
        if (cfg?.apiBaseUrl) return cfg.apiBaseUrl.replace(/\/+$/, "")
      } catch {
        /* fall through */
      }
      await new Promise((r) => setTimeout(r, 500))
    }
  }
  const envBase = (import.meta as unknown as { env?: { VITE_API_BASE?: string } }).env?.VITE_API_BASE
  if (envBase) return envBase.replace(/\/+$/, "")
  return "/api"
}

let API_BASE = "/api"
export function getApiBase(): string { return API_BASE }
export async function resolveApiBaseUrl(): Promise<string> {
  await API_BASE_RESOLVED
  return API_BASE
}

export function openExternalUrl(url: string): void {
  const w = window as unknown as { electronAPI?: { openExternal?: (target: string) => Promise<void> } }
  if (w.electronAPI?.openExternal) {
    void w.electronAPI.openExternal(url)
    return
  }
  window.open(url, "_blank", "noopener,noreferrer")
}

export async function selectDirectory(): Promise<string | null> {
  const w = window as unknown as { electronAPI?: { selectDirectory?: () => Promise<string | null> } }
  if (!w.electronAPI?.selectDirectory) return null
  return w.electronAPI.selectDirectory()
}

export async function startFlowBrowser(projectId: number, factorySessionId: string): Promise<{ ok: boolean; status: string; message: string; profilePath?: string }> {
  const w = window as unknown as { electronAPI?: { startFlow?: (input: { projectId: number; factorySessionId: string }) => Promise<{ ok: boolean; status: string; message: string; profilePath?: string }> } }
  if (!w.electronAPI?.startFlow) {
    return { ok: false, status: "unavailable", message: "Factory browser bootstrap chỉ có trong Electron Desktop." }
  }
  return w.electronAPI.startFlow({ projectId, factorySessionId })
}

export async function openLocalPath(target: string): Promise<{ ok: boolean; message: string }> {
  const w = window as unknown as { electronAPI?: { openPath?: (path: string) => Promise<{ ok: boolean; message: string }> } }
  if (!w.electronAPI?.openPath) return { ok: false, message: "Thao tác này chỉ khả dụng trong Electron Desktop." }
  return w.electronAPI.openPath(target)
}

export async function openAiBrowser(provider: "chatgpt" | "gemini"): Promise<{ ok: boolean; status: string; message: string; profilePath?: string; browserName?: string }> {
  const w = window as unknown as { electronAPI?: { openAiBrowser?: (input: { provider: "chatgpt" | "gemini" }) => Promise<{ ok: boolean; status: string; message: string; profilePath?: string; browserName?: string }> } }
  if (!w.electronAPI?.openAiBrowser) {
    const url = provider === "chatgpt" ? "https://chatgpt.com/" : "https://gemini.google.com/app"
    window.open(url, "_blank", "noopener,noreferrer")
    return { ok: true, status: "web_opened", message: `Đã mở trang đăng nhập ${provider === "chatgpt" ? "ChatGPT" : "Gemini"}.` }
  }
  return w.electronAPI.openAiBrowser({ provider })
}

export async function getAiBrowserStatus(provider: "chatgpt" | "gemini"): Promise<{ connected: boolean; email?: string; model?: string; plan?: string; browserRunning?: boolean; message?: string }> {
  const w = window as unknown as { electronAPI?: { getAiBrowserStatus?: (input: { provider: "chatgpt" | "gemini" }) => Promise<{ connected: boolean; email?: string; model?: string; plan?: string; browserRunning?: boolean; message?: string }> } }
  if (!w.electronAPI?.getAiBrowserStatus) {
    return { connected: false }
  }
  return w.electronAPI.getAiBrowserStatus({ provider })
}

export async function logoutAiBrowser(provider: "chatgpt" | "gemini"): Promise<{ ok: boolean; message: string }> {
  const w = window as unknown as { electronAPI?: { logoutAiBrowser?: (input: { provider: "chatgpt" | "gemini" }) => Promise<{ ok: boolean; message: string }> } }
  if (!w.electronAPI?.logoutAiBrowser) {
    return { ok: true, message: "Đã đăng xuất" }
  }
  return w.electronAPI.logoutAiBrowser({ provider })
}

export function formatApiUrl(path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`
  if (API_BASE.startsWith("http")) {
    return clean.startsWith("/api") ? `${API_BASE}${clean}` : `${API_BASE}/api${clean}`
  }
  return clean.startsWith("/api") ? clean : `/api${clean}`
}



export async function buildApiUrl(path: string): Promise<string> {
  const base = await resolveApiBaseUrl()
  if (base.startsWith("http")) {
    return path.startsWith("/api") ? `${base}${path}` : `${base}/api${path}`
  }
  const cleanPath = path.startsWith("/api/") ? path.slice(4) : path
  return `${base}${cleanPath}`
}
let API_BASE_RESOLVED: Promise<void> | null = null
function ensureApiBaseResolved(): void {
  if (API_BASE_RESOLVED) return
  API_BASE_RESOLVED = resolveApiBase().then((b) => {
    API_BASE = b
  })
}
ensureApiBaseResolved()

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const isFormData = options?.body instanceof FormData
  const url = await buildApiUrl(path)
  const res = await fetch(url, {
    headers: isFormData ? {} : { "Content-Type": "application/json" },
    ...options,
  })
  if (!res.ok) {
    const text = await res.text()
    let message = text
    try {
      const json = JSON.parse(text)
      message = json.detail || text
    } catch {
      /* keep raw text */
    }
    throw new Error(message)
  }
  return res.json()
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) })
}

// ---------------------------------------------------------------------------
// Health & dashboard
// ---------------------------------------------------------------------------
export const api = {
  health: () => request<{ status: string }>(`/health`),
  dashboard: () => request<DashboardStats>(`/dashboard`),
  ffmpegCheck: () => request<FFmpegCheck>(`/ffmpeg/check`),

  // Channels
  listChannels: () => request<Channel[]>(`/channels`),
  createChannel: (data: Partial<Channel>) => post<Channel>(`/channels`, data),
  updateChannel: (id: number, data: Partial<Channel>) =>
    request<Channel>(`/channels/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteChannel: (id: number) => request<void>(`/channels/${id}`, { method: "DELETE" }),

  // Projects
    listProjects: (search?: string, status?: string, includeSizes = false) => {
    const params = new URLSearchParams()
    if (search) params.set("search", search)
    if (status) params.set("status", status)
    if (includeSizes) params.set("include_sizes", "true")

    const qs = params.toString()
    return request<Project[]>(`/projects${qs ? `?${qs}` : ""}`)
  },
  getProject: (id: number) => request<Project>(`/projects/${id}`),
  createProject: (data: {
    name: string
    channel_id?: number | null
    topic?: string
    video_type?: string
    aspect_ratio?: string
    language?: string
        target_duration?: number
    project_type?: string
    output_folder?: string
  }) => post<Project>(`/projects`, data),

  updateProject: (id: number, data: Partial<Project>) =>
    request<Project>(`/projects/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  updateProjectConfig: (id: number, config: Record<string, unknown>) =>
    request<Project>(`/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ config_json: JSON.stringify(config) }),
    }),
  getProjectConfig: (id: number) =>
    request<{ config_json?: string }>(`/projects/${id}`),
  deleteProject: (id: number) => request<void>(`/projects/${id}`, { method: "DELETE" }),
  duplicateProject: (id: number, name: string) =>
    post<Project>(`/projects/${id}/duplicate`, { name }),
  openProjectFolder: (id: number) => post<{ path: string }>(`/projects/${id}/open-folder`),

  // Script / AI
  aiGenerateScript: (payload: {
    topic: string
    video_type: string
    aspect_ratio: string
    language: string
    target_duration: number
    hook?: string
    angle?: string
    outline?: string[]
    writing_style?: string
    audience?: string
    niche?: string
    thumbnail_concept?: string
    thumbnail_prompt_en?: string
  }) => post<ScriptPayload>(`/ai/generate-script`, payload),
  aiTestConnection: (provider?: string) =>
    request<Record<string, unknown>>(`/ai/test-connection${provider ? `?provider_name=${provider}` : ""}`),
  getScript: (projectId: number) => request<ScriptData>(`/projects/${projectId}/script`),
  saveScript: (projectId: number, payload: ScriptPayload) =>
    post<{ ok: boolean; script_id: number }>(`/projects/${projectId}/script`, payload),
    approveScript: (projectId: number) =>
    post<{ ok: boolean; approved: boolean; needs_scene_analysis?: boolean }>(`/projects/${projectId}/script/approve`),

  generateSeo: (projectId: number) =>
    post<{ ok: boolean; seo: { youtube_title: string; description: string; hashtags: string[]; tags: string[] } }>(
      `/projects/${projectId}/generate-seo`,
    ),
  exportSubtitles: (projectId: number) =>
    `${API_BASE}/projects/${projectId}/export-subtitles?format=srt`,
  splitScript: (projectId: number, full_script: string, max_chars_per_line = 60) =>
    post<{ sentences: string[] }>(`/projects/${projectId}/script/split`, {
      full_script,
      max_chars_per_line,
    }),
  buildScenes: (projectId: number, body?: Record<string, unknown>) =>
    post<{ ok: boolean; scene_count: number }>(`/projects/${projectId}/build-scenes`, body ?? {}),

  // Scenes
  listScenes: (projectId: number) => request<Scene[]>(`/projects/${projectId}/scenes`),
  createScene: (projectId: number, data: Partial<Scene>) =>
    post<Scene>(`/projects/${projectId}/scenes`, data),
  updateScene: (projectId: number, sceneId: number, data: Partial<Scene>) =>
    request<Scene>(`/projects/${projectId}/scenes/${sceneId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteScene: (projectId: number, sceneId: number) =>
    request<void>(`/projects/${projectId}/scenes/${sceneId}`, { method: "DELETE" }),
  reorderScenes: (projectId: number, scene_ids: number[]) =>
    post<{ ok: boolean }>(`/projects/${projectId}/scenes/reorder`, { scene_ids }),
  mergeScenes: (projectId: number, sceneId: number, otherId: number) =>
    post<{ ok: boolean }>(`/projects/${projectId}/scenes/${sceneId}/merge?other_id=${otherId}`),
  splitScene: (projectId: number, sceneId: number, splitAt?: number) =>
    post<{ ok: boolean; new_scene_id: number }>(
      `/projects/${projectId}/scenes/${sceneId}/split`,
      { split_at: splitAt ?? null },
    ),
  setSceneMedia: (projectId: number, sceneId: number, media_path: string, media_type: string) =>
    post<Scene>(`/projects/${projectId}/scenes/${sceneId}/media`, { media_path, media_type }),
  regenerateVoice: (projectId: number, sceneId: number, data: { voice?: string; speed?: number; volume?: number; provider?: string }) =>
    post<{ ok: boolean; audio_path: string }>(
      `/projects/${projectId}/scenes/${sceneId}/regenerate-voice`,
      data,
    ),
  regeneratePrompt: (projectId: number, sceneId: number, data?: { style_memory?: string }) =>
    post<{ ok: boolean; visual_prompt: string }>(
      `/projects/${projectId}/scenes/${sceneId}/regenerate-prompt`,
      data ?? {},
    ),
    getTimeline: (projectId: number) => request<TimelineProject>(`/projects/${projectId}/timeline`),
  saveTimeline: (projectId: number, timeline: {
    duration: number
    settings: Record<string, unknown>
    expected_version?: number
    clips: Array<Record<string, unknown>>
  }) =>
    request<TimelineProject>(`/projects/${projectId}/timeline`, {
      method: "PUT",
      body: JSON.stringify(timeline),
    }),

  // Channel config (Cấu hình kênh modal)

  channelGetConfig: (id: number) => request<{ ok: boolean; config: Record<string, unknown> }>(`/channels/${id}/config`),
  channelUpdateConfig: (id: number, config: Record<string, unknown>) =>
    request<{ ok: boolean; config: Record<string, unknown> }>(`/channels/${id}/config`, {
      method: "PATCH",
      body: JSON.stringify(config),
    }),

  // Video styles (Kiểu video — FREE / BASIC)
  videoStyles: () => request<Array<{ key: string; name: string; desc: string; tier: string }>>(`/ai/video-styles`),

  // App settings (Cài đặt)
  settingsGet: () => request<StudioSettings>(`/settings`),
    settingsSave: (data: Partial<StudioSettings>) =>
    request<{ ok: boolean; updated?: string[] }>(`/settings`, { method: "PATCH", body: JSON.stringify(data) }),
  settingsTelegramTest: (data: { bot_token: string; chat_id: string; send_message?: boolean; message?: string }) =>
    post<{ ok: boolean; bot?: { username?: string; name?: string }; message_sent?: boolean }>(`/settings/telegram/test`, data),
  settingsDeepSeekTest: (data: { api_key: string }) =>
    post<{ ok: boolean; message: string }>(`/settings/deepseek/test`, data),
  systemDiagnose: () =>
    request<{
      backend: string
      ffmpeg_version: string
      ffprobe_version: string
      python_runtime: string
      os: string
      cpu: string
      ram_gb: number
      write_permission_app_data: boolean
      write_permission_projects: boolean
      demucs_available: boolean
      yt_dlp_available: boolean
      disk_free_gb: number
    }>(`/system/diagnose`),

  // Media library (Thư viện)

  libraryList: (search?: string) =>
    request<{ ok: boolean; items: Array<{ path: string; name: string; media_type: string; size_kb: number; updated_at: string }> }>(
      `/library${search ? `?search=${encodeURIComponent(search)}` : ""}`,
    ),
  libraryDelete: (path: string) =>
    request<{ ok: boolean; path: string }>(`/library?path=${encodeURIComponent(path)}`, { method: "DELETE" }),

  // Pipeline step status (Tiến độ sản xuất — Workspace)
  pipelineStatus: (projectId: number) =>
    request<PipelineState>(`/projects/${projectId}/pipeline`),
  pipelineStartAuto: (projectId: number) =>
    post<{ ok: boolean }>(`/workspace/approve`, { project_id: projectId }),
  pipelineStop: (projectId: number) =>
    post<{ ok: boolean }>(`/workspace/stop/${projectId}`),

  // Characters
  listCharacters: (projectId?: number, channelId?: number) => {
    if (projectId) return request<Character[]>(`/projects/${projectId}/characters`)
    if (channelId) return request<Character[]>(`/channels/${channelId}/characters`)
    return Promise.resolve([])
  },
  createCharacter: (data: Partial<Character>) => post<Character>(`/characters`, data),
  updateCharacter: (id: number, data: Partial<Character>) =>
    request<Character>(`/characters/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteCharacter: (id: number) => request<void>(`/characters/${id}`, { method: "DELETE" }),

  // Google Flow
  flowGetProjectUrl: (projectId: number) => request<{ url: string }>(`/flow/project-url?project_id=${projectId}`),
  flowLogin: () => post<{ ok: boolean }>(`/flow/login`),

  // Workspace Ideas
  workspaceIdeaCreate: (channelId: number, videoType: string) =>
    post<ScriptPayload>(`/workspace/idea`, { channel_id: channelId, video_type: videoType }),
  workspaceIdeaApprove: (projectId: number, customScript?: string) =>
    post<{ ok: boolean }>(`/workspace/approve`, { project_id: projectId, custom_script: customScript }),
  workspaceSceneUpload: (sceneId: number, file: File) => {
    const form = new FormData()
    form.append("file", file)
    return request<{ ok: boolean; media_path: string }>(`/workspace/scene-upload/${sceneId}`, {
      method: "POST",
      body: form,
    })
  },

  mediaInfo: (path: string) => post<MediaInfo>(`/media/info`, { path }),
  uploadMedia: (file: File) => {
    const form = new FormData()
    form.append("file", file)
    return request<{ ok: boolean; path: string; media_type: string }>(`/upload/library`, {
      method: "POST",
      headers: {},
      body: form,
    })
  },


  // Subtitles
  subtitlePreview: (projectId: number, text: string, audio_path: string, config: Partial<SubtitleConfig>, width = 1920, height = 1080) =>
    post<{ ok: boolean; ass_path: string; entry_count: number; entries: Array<{ start: number; end: number; text: string }> }>(
      `/projects/${projectId}/subtitle-preview`,
      { text, audio_path, config, width, height },
    ),

  // TTS
  ttsGetConfig: () => request<TTSConfig>(`/tts/config`),
    ttsSaveConfig: (data: Partial<TTSConfig> & {
    provider: string
    voice: string
    speed: number
    volume: number
    model_dir: string
  }) => post<TTSConfig>(`/tts/config`, data),

  ttsListProviders: () => request<Array<{ id: string; name: string; available: boolean }>>(`/tts/providers`),
  ttsListVoices: (provider?: string) =>
    request<TTSVoice[]>(`/tts/voices${provider ? `?provider=${encodeURIComponent(provider)}` : ""}`),
  ttsTestConnection: (data?: { provider?: string }) =>
    post<{ ok: boolean; message: string }>(`/tts/test-connection`, data ?? {}),
  ttsPreview: (text: string, overrides?: Partial<TTSConfig>) =>
    post<{ ok: boolean; audio_path?: string; message?: string }>(`/tts/preview`, { text, ...overrides }),

  // Google Labs image provider
  labsGetConfig: () =>
    request<{
      enabled: boolean
      gemini_key: string
      gemini_enabled: boolean
      labs_enabled: boolean
      pollinations_fallback: boolean
      connector_enabled: boolean
      labs_model_image: string
      labs_model_video: string
      labs_aspect: string
      labs_media_type: string
      prompt_delay: number
    }>(`/labs/config`),
  labsSaveConfig: (data: {
    enabled?: boolean
    gemini_key?: string
    gemini_enabled?: boolean
    labs_enabled?: boolean
    pollinations_fallback?: boolean
    connector_enabled?: boolean
    labs_model_image?: string
    labs_model_video?: string
    labs_aspect?: string
    labs_media_type?: string
    prompt_delay?: number
  }) =>
    post<{
      enabled: boolean
      gemini_key: string
      gemini_enabled: boolean
      labs_enabled: boolean
      pollinations_fallback: boolean
      connector_enabled: boolean
      labs_model_image: string
      labs_model_video: string
      labs_aspect: string
      labs_media_type: string
      prompt_delay: number
    }>(`/labs/config`, data),
  labsCheck: () =>
    request<{ ok: boolean; can_automate: boolean; has_chromium: boolean; has_playwright: boolean; note: string }>(
      `/labs/check`,
    ),

  // Gemini (aistudio.google) image source
  geminiCheckKey: (key: string) =>
    post<{ valid: boolean; models: string[]; image_ok: boolean; note: string }>(`/ai-media/check-key`, { key }),

  // Phân cảnh AI theo ngữ nghĩa (không 1-1 câu-ảnh)
  semanticAnalyze: (project_id: number, data: { full_script?: string; existing_narrations?: string[] }) =>
    post<{
      scenes: Array<{ narration: string; visual_prompt: string; style_prompt: string; reason: string }>
      common_style: string
      note: string
    }>(`/projects/${project_id}/script/semantic-scenes`, data),
  regenerateScenePrompt: (project_id: number, scene_id: number, data?: { style_memory?: string }) =>
    post<Scene>(`/projects/${project_id}/scenes/${scene_id}/regenerate-prompt`, data ?? {}),
  semanticSplitScene: (project_id: number, scene_id: number) =>
    post<{ ok: boolean; new_scene_ids: number[] }>(`/projects/${project_id}/scenes/${scene_id}/semantic-split`, {}),
  regenerateMedia: (project_id: number, scene_id: number) =>
    post<Scene>(`/projects/${project_id}/scenes/${scene_id}/regenerate-media`),

    // Flow Connector (Chrome Extension) — Factory session + media queue Google Flow
  factoryStart: (projectId: number, options: { media_type?: string; aspect?: string; model?: string; factory_mode?: boolean; include_video?: boolean } = {}) =>
    post<{ ok: boolean; project_id: number; factory_session_id: string; factory_state: string; requires_login: boolean; created: number; skipped: number; missing_prompts: number }>(
      `/flow-connection/factory/start`, { project_id: projectId, ...options },
    ),
  flowConnection: () => request<{ status: string; factory_state: string; factory_project_id?: number | null; factory_session_id?: string; last_error?: string; heartbeat_at?: string | null }>(`/flow-connection`),
  createMediaTasks: (projectId: number, options: { media_type?: string; aspect?: string; model?: string } = {}) =>

    post<{ created: number; skipped_existing: number; total_scenes: number; instruction?: string }>(
      `/connector/projects/${projectId}/media-tasks`, options,
    ),
  listMediaTasks: (projectId: number) =>
    request<Array<{
      task_id: string
      scene_id: number
      scene_order: number
      status: string
      attempts: number
      phase: string
      progress: number
      progress_message: string
      prompt: string
      media_type: string
      aspect: string
      model: string
      file_path: string
      error: string
      updated_at: string | null
    }>>(`/connector/projects/${projectId}/media-tasks`),
  connectorWorkerStatus: () =>
    request<{ registered: boolean; worker_count: number; latest_version: string | null }>("/connector/worker/status"),
  mediaTasksPause: (projectId: number) =>
    post<{ ok: boolean; paused: boolean }>(`/connector/projects/${projectId}/media-tasks/pause`, {}),
  mediaTasksResume: (projectId: number) =>
    post<{ ok: boolean; paused: boolean }>(`/connector/projects/${projectId}/media-tasks/resume`, {}),
  mediaTasksCancel: (projectId: number) =>
    post<{ ok: boolean; cancelled: number }>(`/connector/projects/${projectId}/media-tasks/cancel`, {}),
  mediaTasksState: (projectId: number) =>
    request<{ state: string; paused: boolean; counts: Record<string, number>; total: number; completed: number; cancelled: number; failed: number }>(
      `/connector/projects/${projectId}/media-tasks/state`,
    ),

  // Render / pipeline
  renderStart: (project_id: number, config: Partial<RenderConfig> = {}) =>
    post<{ ok: boolean; job_id?: number; message: string }>(`/render/start`, {
      project_id,
      config: {
        fps: 30,
        crf: 21,
        preset: "medium",
        enable_subtitles: true,
        music_volume: 0.25,
        transition_duration: 0.5,
        subtitle_config: {
          font: "DejaVuSans",
          font_size: 48,
          primary_color: "#FFFFFF",
          border_color: "#000000",
          border_width: 2,
          position: "bottom",
          bottom_margin: 50,
          max_chars_per_line: 60,
          granularity: "sentence",
        },
        ...config,
      },
    }),
  listJobs: () => request<RenderJob[]>(`/render/jobs`),
  getJob: (jobId: number) => request<{ ok: boolean; job?: RenderJob }>(`/render/jobs/${jobId}`),
  cancelJob: (jobId: number) => post<{ ok: boolean }>(`/render/jobs/${jobId}/cancel`),
  retryJob: (jobId: number, config: Partial<RenderConfig> = {}) =>
    post<{ ok: boolean; message: string }>(`/render/jobs/${jobId}/retry`, { config }),
  getJobLog: (jobId: number, lines = 100) =>
    request<{ ok: boolean; lines: string[] }>(`/render/jobs/${jobId}/log?lines=${lines}`),

    // Skill Lab
  skillCatalog: () => request<SkillCatalogItem[]>(`/skills/catalog`),
  skillRuns: (projectId?: number) => request<SkillRun[]>(`/skills/runs${projectId ? `?project_id=${projectId}` : ""}`),
  skillRun: (data: { skill_id: string; prompt?: string; project_id?: number; input?: Record<string, unknown>; use_manus?: boolean }) =>
    post<SkillRun>(`/skills/runs`, data),
  skillRunRefresh: (runId: number) => post<SkillRun>(`/skills/runs/${runId}/refresh`, {}),

  // System stats

  systemStats: () =>
    request<{
      cpu_percent: number
      ram_total_gb: number
      ram_percent: number
      disk_free_gb: number
      active_jobs: number
      ffmpeg_ok: boolean
    }>(`/system/stats`),
}

export const mediaUrl = (path: string) => `${API_BASE}/media/file?path=${encodeURIComponent(path)}`
export const outputVideoUrl = (projectId: number, kind: "output" | "preview" = "output") =>
  `${API_BASE}/render/output/${projectId}?kind=${kind}`
