import { create } from "zustand"
import type { Project, RenderJob, Scene, ScriptData, SubtitleConfig } from "@/types"

interface EditorState {
  project: Project | null
  script: ScriptData | null
  scenes: Scene[]
  job: RenderJob | null
  subtitleConfig: SubtitleConfig
  dirtyScript: boolean
  setProject: (project: Project | null) => void
  setScript: (script: ScriptData | null) => void
  setScenes: (scenes: Scene[]) => void
  setJob: (job: RenderJob | null) => void
  setSubtitleConfig: (cfg: Partial<SubtitleConfig>) => void
  setDirtyScript: (dirty: boolean) => void
  refreshScenes: (scenes: Scene[]) => void
}

const DEFAULT_SUBTITLE_CONFIG: SubtitleConfig = {
  font: "DejaVuSans",
  font_size: 48,
  primary_color: "#FFFFFF",
  border_color: "#000000",
  border_width: 2,
  position: "bottom",
  bottom_margin: 50,
  max_chars_per_line: 60,
  granularity: "sentence",
}

export const useEditorStore = create<EditorState>((set) => ({
  project: null,
  script: null,
  scenes: [],
  job: null,
  subtitleConfig: DEFAULT_SUBTITLE_CONFIG,
  dirtyScript: false,
  setProject: (project) => set({ project }),
  setScript: (script) => set({ script, dirtyScript: false }),
  setScenes: (scenes) => set({ scenes }),
  setJob: (job) => set({ job }),
  setSubtitleConfig: (cfg) =>
    set((state) => ({ subtitleConfig: { ...state.subtitleConfig, ...cfg } })),
  setDirtyScript: (dirty) => set({ dirtyScript: dirty }),
  refreshScenes: (scenes) => set({ scenes }),
}))
