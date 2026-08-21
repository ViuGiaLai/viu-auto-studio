import { useEffect, useMemo, useState } from "react"
import { Clapperboard, ImageOff } from "lucide-react"
import { buildApiUrl } from "@/services/api"
import { cn } from "@/utils/cn"
import type { Project } from "@/types"

type ProjectThumbnailProps = {
  project: Project
  className?: string
  iconClassName?: string
}

export function ProjectThumbnail({ project, className, iconClassName }: ProjectThumbnailProps) {
  const [failed, setFailed] = useState(false)
  const [src, setSrc] = useState("")
  const configuredPath = project.thumbnail_path?.trim() || ""
  const requestPath = useMemo(
    () => configuredPath
      ? `/media/file?path=${encodeURIComponent(configuredPath)}`
      : `/projects/${project.id}/thumbnail`,
    [configuredPath, project.id],
  )

  useEffect(() => {
    let active = true
    setFailed(false)
    setSrc("")
    void buildApiUrl(requestPath).then((url) => {
      if (active) setSrc(url)
    }).catch(() => {
      if (active) setFailed(true)
    })
    return () => { active = false }
  }, [requestPath])

  if (failed) {
    return (
      <div className={cn("flex h-full w-full items-center justify-center bg-gradient-to-br from-[#16242d] to-[#0b1318]", className)}>
        <div className="flex flex-col items-center gap-2 text-slate-600">
          <ImageOff className={cn("h-10 w-10", iconClassName)} />
          <span className="text-[10px] font-medium uppercase tracking-[0.12em]">Chưa có thumbnail</span>
        </div>
      </div>
    )
  }

  if (!src) {
    return <div className={cn("h-full w-full animate-pulse bg-white/[0.04]", className)} aria-label="Đang tải thumbnail" />
  }

  return (
    <img
      src={src}
      alt={project.name}
      className={cn("h-full w-full object-cover", className)}
      onError={() => setFailed(true)}
    />
  )
}

export function ProjectThumbnailFallbackIcon({ className }: { className?: string }) {
  return <Clapperboard className={cn("h-10 w-10 text-slate-600/60", className)} />
}
