// Shared domain types mirroring the backend Pydantic schemas

export interface Channel {
  id: number
  name: string
  description: string
  niche: string
  script_style: string
  default_voice: string
  default_aspect_ratio: string
  logo_path: string
  created_at: string
  updated_at: string
  config_json?: Record<string, unknown>
}

export interface Character {
  id: number
  project_id: number | null
  channel_id: number | null
  name: string
  description: string
  image_path: string
  is_host: boolean
  is_fixed: boolean
  ai_tag: string
  created_at: string
  updated_at: string
}

export interface PipelineState {
  id: number
  project_id: number
  status: string
  step_data_json: Record<string, string>
  error_step: string
  last_log: string
}

export interface StudioSettings {
  engine_mode: string
  engine_installed: boolean
  ai_provider: string
  ai_model: string
  ai_api_key_set: boolean
  ai_api_key?: string
  deepseek_api_key: string
  deepseek_api_key_set: boolean
  gemini_model: string
  tts_provider: string
  tts_voice: string
  output_folder: string
  display_language: string
  production_language: string
  auto_refresh: boolean
  dark_mode: boolean
  telegram_enabled: boolean
  telegram_configured: boolean
  telegram_bot_token?: string
  telegram_chat_id?: string
  flow_logged_in: boolean
}

export interface TTSVoice {
  id: string
  name: string
  language: string
  gender: string
  description: string
  download_size_mb: number
  downloaded: boolean
}

export interface Project {
  size_bytes?: number
  id: number
  channel_id: number | null
  name: string
  topic: string
  project_type?: string
  video_type: string
  aspect_ratio: string
  language: string
  target_duration: number
  status: string
  progress: number
  current_step: string
  project_directory: string
  output_video_path: string
  thumbnail_path: string
  error_message: string
  created_at: string
  updated_at: string
}

export interface SeoSchema {
  youtube_title: string
  description: string
  hashtags: string[]
  tags: string[]
}

export interface ScriptPayload {
  title: string
  hook: string
  angle: string
  outline: string[]
  full_script: string
  thumbnail_concept: string
  thumbnail_prompt: string
  series_link?: string
  visual_style?: string
  viral_reason?: string
  status?: string
  seo: SeoSchema
}

export interface ScriptData {
  project_id: number
  exists: boolean
  id?: number
  title: string
  hook: string
  angle: string
  outline: string[]
  full_script: string
  thumbnail_concept: string
  thumbnail_prompt: string
  series_link?: string
  visual_style?: string
  viral_reason?: string
  status?: string
  seo: SeoSchema
  approved: boolean
}

export interface Scene {
  id: number
  project_id: number
  order_index: number
  narration: string
  visual_prompt: string
  style_prompt: string
  transition_description: string
  negative_prompt: string
  media_path: string
  image_path?: string | null
  video_path?: string | null
  media_type: string
  audio_path: string
  subtitle_text: string
  duration: number
  start_time: number
  end_time: number
  effect: string
  status: string
  error_message: string
  created_at: string
  updated_at: string
}

export interface TTSConfig {
  provider: string
  voice: string
  speed: number
  volume: number
  model_dir: string
  cloud_api_key_masked: string
}

export interface RenderJob {
  id: number
  project_id: number
  status: string
  progress: number
  current_step: string
  process_id: number | null
  log_path: string
  output_path: string
  error_message: string
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface RenderConfig {
  fps: number
  crf: number
  preset: string
  video_encoder: string
  audio_bitrate: string
  background_music_path: string
  music_volume: number
  logo_path: string
  logo_position: string
  logo_opacity: number
  intro_path: string
  outro_path: string
  enable_subtitles: boolean
  subtitle_config: SubtitleConfig
  transition_duration: number
}

export interface SubtitleConfig {
  font: string
  font_size: number
  primary_color: string
  border_color: string
  border_width: number
  position: string
  bottom_margin: number
  max_chars_per_line: number
  granularity: string
}

export interface MediaInfo {
  path: string
  duration: number
  width: number
  height: number
  media_type: string
}

export interface DashboardStats {
  total_projects: number
  completed_videos: number
  processing_videos: number
  failed_videos: number
  projects_folder_size_mb: number
  recent_activities: Array<{
    project_id: number
    project_name: string
    status: string
    updated_at: string
  }>
}

export interface FFmpegCheck {
  ffmpeg: boolean
  ffprobe: boolean
  guide?: string
  version?: string
  ffmpeg_path?: string
  ffprobe_path?: string
}

export const STATUS_LABELS: Record<string, string> = {
  idle: "Chưa bắt đầu",
  processing: "Đang xử lý",
  draft: "Bản nháp",
  script_ready: "Đã chia cảnh",
  script_approved: "Kịch bản đã duyệt",
  generating_voice: "Đang tạo giọng",
  voice_ready: "Đã có giọng",
  preparing_media: "Đang chuẩn bị media",
  media_ready: "Media sẵn sàng",
  generating_subtitles: "Đang tạo phụ đề",
  subtitle_ready: "Phụ đề sẵn sàng",
  rendering: "Đang render",
  completed: "Hoàn thành",
  failed: "Lỗi",
  cancelled: "Đã hủy",
  queued: "Đang chờ",
  pending: "Đang chờ",
}

export const ASPECT_RATIOS = [
  { value: "16:9", label: "16:9 (YouTube ngang)" },
  { value: "9:16", label: "9:16 (Shorts/TikTok dọc)" },
]

export const LANGUAGES = [
  { value: "vi", label: "Tiếng Việt" },
  { value: "en", label: "English" },
]

export const VIDEO_TYPES = [
  { value: "long", label: "Video dài (YouTube)" },
  { value: "short", label: "Video ngắn (Shorts/Reels)" },
]

export const SCENE_EFFECTS = [
  { value: "zoom_in", label: "Zoom vào" },
  { value: "zoom_out", label: "Zoom ra" },
  { value: "pan_left", label: "Pan trái" },
  { value: "pan_right", label: "Pan phải" },
  { value: "none", label: "Không hiệu ứng" },
]
