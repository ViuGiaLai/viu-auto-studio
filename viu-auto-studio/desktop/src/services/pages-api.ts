/**
 * API helpers cho các trang tham chiếu mới (Trang tổng quan 10 menu):
 * Ý tưởng, Media assets, Hàng đợi server-side, Timeline, Xuất bản,
 * Nhân vật toàn cục, Flow Connection, Cài đặt toàn cục, Phân tích, Chẩn đoán.
 */
import { buildApiUrl } from "./api"

async function req<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(await buildApiUrl(path), init)
  if (!res.ok) {
    const msg = await res.text().catch(() => "Lỗi không xác định")
    throw new Error(msg || `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

// ---------------------------------------------------------------------------
// Ý tưởng (Studio — Ý tưởng)
// ---------------------------------------------------------------------------
export const ideasApi = {
  list: (projectId: number) => req<IdeaRead[]>(`/projects/${projectId}/ideas`),
  generate: (projectId: number, topic?: string) =>
    req<{ batch: number; idea_ids: number[] }>(
      `/projects/${projectId}/ideas/generate`,
      { method: "POST", body: JSON.stringify({ topic }) },
    ),
  select: (projectId: number, ideaId: number) =>
    req(`/projects/${projectId}/ideas/${ideaId}/select`, { method: "POST" }),
  reject: (projectId: number, ideaId: number) =>
    req(`/projects/${projectId}/ideas/${ideaId}/reject`, { method: "POST" }),
  approveBatch: (projectId: number, ideaIds: number[]) =>
    req(`/projects/${projectId}/ideas/approve-batch`, {
      method: "POST",
      body: JSON.stringify({ idea_ids: ideaIds }),
    }),
}

// ---------------------------------------------------------------------------
// Media assets (Studio — Media, Thư viện)
// ---------------------------------------------------------------------------
export const mediaAssetsApi = {
  list: (params?: { project_id?: number; kind?: string; search?: string }) => {
    const qs = new URLSearchParams()
    if (params?.project_id !== undefined) qs.set("project_id", String(params.project_id))
    if (params?.kind) qs.set("kind", params.kind)
    if (params?.search) qs.set("search", params.search)
    return req<MediaAssetRead[]>(`/media-assets?${qs.toString()}`)
  },
  get: (assetId: number) => req<MediaAssetRead>(`/media-assets/${assetId}`),
  create: (payload: {
    project_id?: number
    scene_id?: number | null
    kind?: string
    file_path: string
    provider?: string
  }) =>
    req<{ ok: boolean; asset: MediaAssetRead }>(`/media-assets`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  reverify: (assetId: number) =>
    req<{ ok: boolean; asset: MediaAssetRead }>(`/media-assets/${assetId}/reverify`, {
      method: "POST",
    }),
  delete: (assetId: number) => req(`/media-assets/${assetId}`, { method: "DELETE" }),
  references: (assetId: number) =>
    req<{ referenced: boolean; used_by?: string }>(
      `/media-assets/references/${assetId}`,
    ),
}

// ---------------------------------------------------------------------------
// Hàng đợi server-side (Jobs / JobSteps)
// ---------------------------------------------------------------------------
export const queueApi = {
  summary: () => req<QueueSummary>(`/queue/summary`),
  list: (params?: {
    status?: string
    kind?: string
    project_id?: number | null
    page?: number
    page_size?: number
  }) => {
    const qs = new URLSearchParams()
    if (params?.status) qs.set("status", params.status)
    if (params?.kind) qs.set("kind", params.kind)
    if (params?.project_id !== undefined && params.project_id !== null)
      qs.set("project_id", String(params.project_id))
    if (params?.page) qs.set("page", String(params.page))
    if (params?.page_size) qs.set("page_size", String(params.page_size))
    return req<JobListResult>(`/queue/jobs?${qs.toString()}`)
  },
  get: (jobId: number) => req<JobRead>(`/queue/jobs/${jobId}`),
  create: (payload: {
    project_id?: number
    kind: string
    status?: string
    steps?: { scene_id?: number | null; step: string; dependency?: string }[]
  }) => req<{ job_id: number }>(`/queue/jobs`, { method: "POST", body: JSON.stringify(payload) }),
  pause: (jobId: number) => req(`/queue/jobs/${jobId}/pause`, { method: "POST" }),
  resume: (jobId: number) => req(`/queue/jobs/${jobId}/resume`, { method: "POST" }),
  retry: (jobId: number) => req(`/queue/jobs/${jobId}/retry`, { method: "POST" }),
  cancel: (jobId: number) => req(`/queue/jobs/${jobId}/cancel`, { method: "POST" }),
  completeStep: (jobId: number, stepId: number, payload?: { status?: string; log?: string; error?: string }) =>
    req(`/queue/jobs/${jobId}/step/${stepId}/complete`, {
      method: "POST",
      body: JSON.stringify(payload || {}),
    }),
}

// ---------------------------------------------------------------------------
// Timeline & clips (Studio — Dựng phim)
// ---------------------------------------------------------------------------
export const timelineApi = {
  list: (projectId: number) => req<TimelineRead[]>(`/projects/${projectId}/timelines`),
  create: (projectId: number, payload?: { name?: string; track_name?: string; kind?: string; order?: number }) =>
    req<{ timeline_id: number }>(`/projects/${projectId}/timelines`, {
      method: "POST",
      body: JSON.stringify(payload || {}),
    }),
  clips: (projectId: number, timelineId: number) =>
    req<TimelineClipRead[]>(`/projects/${projectId}/timelines/${timelineId}/clips`),
  addClip: (projectId: number, timelineId: number, payload: {
    clip_name?: string
    source_kind?: string
    source_id?: number | null
    start_time?: number
    end_time?: number
    track?: string
    volume?: number
    speed?: number
    position?: number
    extra_json?: Record<string, unknown>
  }) =>
    req<{ clip_id: number }>(`/projects/${projectId}/timelines/${timelineId}/clips`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateClip: (projectId: number, timelineId: number, clipId: number, payload: Record<string, unknown>) =>
    req(`/projects/${projectId}/timelines/${timelineId}/clips/${clipId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteClip: (projectId: number, timelineId: number, clipId: number) =>
    req(`/projects/${projectId}/timelines/${timelineId}/clips/${clipId}`, { method: "DELETE" }),
  autosave: (projectId: number, payload: { notes?: string; data_json?: Record<string, unknown> }) =>
    req(`/projects/${projectId}/timelines/autosave`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
}

// ---------------------------------------------------------------------------
// Xuất bản (Studio — Xuất bản)
// ---------------------------------------------------------------------------
export const publishApi = {
  get: (projectId: number) => req<PublishRead>(`/projects/${projectId}/publish`),
  save: (projectId: number, payload: PublishCreate) =>
    req<PublishRead>(`/projects/${projectId}/publish`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  verify: (projectId: number) =>
    req<VerifyResult>(`/projects/${projectId}/publish/verify`, { method: "POST" }),
}

// ---------------------------------------------------------------------------
// Nhân vật toàn cục (menu Nhân vật)
// ---------------------------------------------------------------------------
export const charactersGlobalApi = {
  list: () => req<CharacterGlobalRead[]>(`/characters-global`),
  create: (payload: { name: string; code?: string; role?: string; appearance?: string; negative_prompt?: string; identity_prompt?: string; face_lock?: number; outfit_lock?: number; seed?: number | null }) =>
    req<{ character_id: number }>(`/characters-global`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  get: (charId: number) => req<CharacterGlobalRead>(`/characters-global/${charId}`),
  addRef: (charId: number, file_path: string, ref_kind: string) =>
    req(`/characters-global/${charId}/refs`, {
      method: "POST",
      body: JSON.stringify({ file_path, ref_kind }),
    }),
  delete: (charId: number) => req(`/characters-global/${charId}`, { method: "DELETE" }),
}

// ---------------------------------------------------------------------------
// Flow Connection (menu Flow)
// ---------------------------------------------------------------------------
export const flowApi = {
  get: () => req<FlowConnectionRead>(`/flow-connection`),
  pair: (pairing_code: string, extension_id: string) =>
    req(`/flow-connection/pair`, {
      method: "POST",
      body: JSON.stringify({ pairing_code, extension_id, extension_name: "Viu Flow Connector" }),
    }),
  heartbeat: (payload: { extension_id: string; extension_version?: string; extension_name?: string; google_account?: string; profile_name?: string }) =>
    req(`/flow-connection/heartbeat`, { method: "POST", body: JSON.stringify(payload) }),
  newPairingCode: () =>
    req<FlowConnectionRead>(`/flow-connection/new-pairing-code`, { method: "POST" }),
}

// ---------------------------------------------------------------------------
// Cài đặt toàn cục + Chẩn đoán + Phân tích
// ---------------------------------------------------------------------------
export const globalApi = {
  getSettings: () => req<{ settings: Record<string, unknown> }>(`/global-settings`),
  updateSettings: (settings: Record<string, unknown>) =>
    req<{ settings: Record<string, unknown> }>(`/global-settings`, {
      method: "PATCH",
      body: JSON.stringify({ settings }),
    }),
  analytics: (days = 0) => req<AnalyticsRead>(`/analytics?days=${days}`),
  diagnose: () => req<DiagnoseRead>(`/system/diagnose`),
  overview: () => req<{
    counts: { producing: number; waiting: number; completed: number; failed: number; total: number }
    delta: { producing: number; waiting: number; completed: number; failed: number }
    snapshot_date: string
  }>(`/dashboard/overview`),
}

export const notificationsApi = {
  list: () => req<{ items: AppNotification[]; unread: number }>(`/notifications`),
  markRead: (keys: string[]) =>
    req<{ ok: boolean }>(`/notifications/read`, {
      method: "POST",
      body: JSON.stringify({ keys }),
    }),
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface IdeaRead {
  id: number
  project_id: number
  batch: number
  letter: string
  title: string
  hook: string
  angle: string
  outline: string[]
  duration_estimate: string
  thumbnail_concept: string
  thumbnail_prompt: string
  status: string
}

export interface MediaAssetRead {
  id: number
  project_id: number | null
  scene_id: number | null
  kind: string
  file_path: string
  provider: string
  checksum: string
  codec: string
  resolution: string
  size_bytes: number
  duration: number
  verify_state: string
  created_at: string
  updated_at?: string
  active: boolean
  reference_count?: number
  flow_task_id?: string | null
}

export interface QueueSummary {
  running: number
  pending: number
  waiting_for_review: number
  completed: number
  paused: number
  failed: number
}

export interface JobRead {
  id: number
  project_id: number | null
  kind: string
  status: string
  progress: number
  current_step?: string
  steps?: { id: number; step: string; status: string; error?: string }[]
  created_at: string
}

export interface JobListResult {
  total: number
  page: number
  page_size: number
  items: JobRead[]
}

export interface TimelineRead {
  id: number
  project_id: number
  name: string
  track_name: string
  kind: string
  order: number
  active: boolean
}

export interface TimelineClipRead {
  id: number
  timeline_id: number
  clip_name: string
  source_kind: string
  source_id: number | null
  start_time: number
  end_time: number
  track: string
  volume: number
  speed: number
  position: number
  status: string
  extra_json: Record<string, unknown>
}

export interface PublishRead {
  id?: number
  project_id: number
  title?: string
  description?: string
  hashtags?: string
  tags?: string
  category?: string
  language?: string
  visibility?: string
  playlist?: string
  thumbnail_path?: string
  scheduled_at?: string
  export_package_path?: string
  platform?: string
  platform_status?: string
}

export interface PublishCreate {
  title?: string
  description?: string
  hashtags?: string
  tags?: string
  category?: string
  language?: string
  visibility?: string
  playlist?: string
  thumbnail_path?: string
  scheduled_at?: string
  export_package_path?: string
  platform?: string
  platform_status?: string
}

export interface VerifyResult {
  verified: boolean
  output_exists: boolean
  ffprobe_ok: boolean
  duration?: number
  resolution?: string
  error?: string
}

export interface CharacterGlobalRead {
  id: number
  name: string
  code?: string
  role?: string
  appearance?: string
  negative_prompt?: string
  identity_prompt?: string
  face_lock?: number
  outfit_lock?: number
  seed?: number | null
  used_projects?: number
  refs?: { id: number; file_path: string; ref_kind: string; version?: number }[]
}

export interface FlowConnectionRead {
  id?: number
  extension_id: string
  extension_version?: string
  extension_name?: string
  google_account?: string
  profile_name?: string
  status: string
  paired_at?: string
  pairing_code?: string
  pairing_expires_at?: string
  heartbeat_at?: string
}

export interface AnalyticsRead {
  range_days?: number
  projects: { total: number; completed: number; in_progress: number; failed: number }
  scenes: { total: number; media_ready: number }
  jobs: { total: number; completed: number; failed: number; by_status?: Record<string, number> }
  render: { avg_minutes: number; total_seconds: number; completed?: number }
  flow: { total_tasks: number; failed_tasks: number; success_rate: number }
  providers?: Array<{ name: string; total: number; failed: number; rate: number }>
}

export interface AppNotification {
  key: string
  title: string
  message: string
  href: string
  created_at: string
  read: boolean
}

export interface DiagnoseRead {
  ffmpeg_version?: string
  ffprobe_version?: string
  data_dir_writable?: boolean
  projects_dir_writable?: boolean
  logs_dir_writable?: boolean
  total_disk_gb?: number
  free_disk_gb?: number
  runtime_port?: number
  runtime_json_valid?: boolean
  os?: string
  cpu_count?: number
  memory_gb?: number
  errors?: string[]
}
