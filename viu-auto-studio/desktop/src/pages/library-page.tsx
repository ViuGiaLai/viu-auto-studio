import { useEffect, useState, useRef } from "react"
import {
  Image as ImageIcon, Video, Music, Plus, Trash2, Search,
  UploadCloud, Play, Pause, Copy, Check, Filter, Sparkles
} from "lucide-react"
import { api, mediaUrl } from "@/services/api"
import { toast } from "@/hooks/use-toast"
import { Button } from "@/components/design-system"
import { Input } from "@/components/design-system"
import { cn } from "@/utils/cn"

type LibraryItem = {
  path: string
  name: string
  media_type: string
  size_kb: number
  updated_at: string
}

export default function LibraryPage() {
  const [items, setItems] = useState<LibraryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [activeTab, setActiveTab] = useState<"all" | "video" | "image" | "audio">("all")
  const [fileInput, setFileInput] = useState<HTMLInputElement | null>(null)
  const [deletingPath, setDeletingPath] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [copiedPath, setCopiedPath] = useState<string | null>(null)
  
  // Audio playback state
  const [playingAudioPath, setPlayingAudioPath] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const load = (q?: string) => {
    api
      .libraryList(q || undefined)
      .then((r) => setItems(r.items))
      .catch(() => toast({ title: "Không thể tải thư viện", variant: "destructive" }))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    const t = setTimeout(() => load(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const ok: string[] = []
    for (let i = 0; i < files.length; i++) {
      try {
        await api.uploadMedia(files[i])
        ok.push(files[i].name)
      } catch (e) {
        toast({ title: `Lỗi tải ${files[i].name}`, description: String(e), variant: "destructive" })
      }
    }
    if (ok.length) toast({ title: `Đã tải lên ${ok.length} file vào thư viện` })
    load(search)
  }

  const kbStr = (kb: number) =>
    kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`

  const remove = async (item: LibraryItem) => {
    if (!window.confirm(`Xóa file ${item.name} khỏi thư viện? File đang được scene/project sử dụng sẽ bị backend từ chối.`)) return
    setDeletingPath(item.path)
    try {
      await api.libraryDelete(item.path)
      toast({ title: "Đã xóa media", description: item.name })
      load(search)
    } catch (e) {
      toast({ title: "Không thể xóa media", description: String(e), variant: "destructive" })
    } finally {
      setDeletingPath(null)
    }
  }

  const handleCopyPath = (path: string) => {
    navigator.clipboard.writeText(path)
    setCopiedPath(path)
    toast({ title: "Đã sao chép đường dẫn", description: path })
    setTimeout(() => setCopiedPath(null), 2000)
  }

  const togglePlayAudio = (itemPath: string) => {
    if (!audioRef.current) return
    const url = mediaUrl(itemPath)
    if (playingAudioPath === itemPath) {
      audioRef.current.pause()
      setPlayingAudioPath(null)
    } else {
      audioRef.current.src = url
      audioRef.current.play().catch(() => {})
      setPlayingAudioPath(itemPath)
    }
  }

  const filteredItems = items.filter((item) => {
    if (activeTab === "all") return true
    if (activeTab === "video") return item.media_type === "video"
    if (activeTab === "image") return item.media_type === "image"
    if (activeTab === "audio") return item.media_type === "audio"
    return true
  })

  return (
    <div className="min-h-full space-y-6 p-8">
      {/* Hidden audio element for previews */}
      <audio
        ref={audioRef}
        onEnded={() => setPlayingAudioPath(null)}
        onPause={() => setPlayingAudioPath(null)}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-amber-400" />
            Thư Viện Media Toàn Cục
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Kho lưu trữ hình ảnh, video, nhạc nền (BGM) và hiệu ứng âm thanh (SFX) — dùng chung cho mọi dự án.
          </p>
        </div>
        <Button
          onClick={() => fileInput?.click()}
          className="gap-2 bg-gradient-to-r from-[#d9940a] to-[#faaa02] text-[#372a01] shadow-lg shadow-amber-500/20 font-bold hover:brightness-110"
        >
          <Plus className="h-4 w-4" />
          Tải lên media
        </Button>
      </div>

      {/* Drag & Drop Upload Banner */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setIsDragging(false)
          if (e.dataTransfer.files) void upload(e.dataTransfer.files)
        }}
        onClick={() => fileInput?.click()}
        className={cn(
          "rounded-2xl border-2 border-dashed p-6 text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center gap-2",
          isDragging
            ? "border-amber-400 bg-amber-500/10 scale-[1.01]"
            : "border-white/10 bg-white/[0.02] hover:border-amber-500/30 hover:bg-white/[0.04]"
        )}
      >
        <UploadCloud className="h-8 w-8 text-amber-400 animate-bounce" />
        <div className="text-sm font-semibold text-slate-200">
          Kéo & thả file ảnh, video hoặc âm thanh vào đây để tải lên
        </div>
        <div className="text-xs text-slate-500">
          Hỗ trợ định dạng: .mp4, .mov, .jpg, .png, .webp, .mp3, .wav, .aac (tự động tối ưu hoá)
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Category Tabs */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-black/40 border border-white/10 w-full sm:w-auto">
          {[
            { id: "all", label: `Tất cả (${items.length})` },
            { id: "video", label: `Video (${items.filter(i => i.media_type === "video").length})` },
            { id: "image", label: `Hình ảnh (${items.filter(i => i.media_type === "image").length})` },
            { id: "audio", label: `Âm thanh (${items.filter(i => i.media_type === "audio").length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                activeTab === tab.id
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/30 shadow-sm"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search Box */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm kiếm media..."
            className="pl-9 text-xs bg-black/30 border-white/10 text-slate-200 placeholder:text-slate-600"
          />
        </div>
      </div>

      <input
        ref={setFileInput}
        type="file"
        accept="image/*,video/*,audio/*"
        multiple
        className="hidden"
        onChange={(e) => {
          void upload(e.target.files)
          e.currentTarget.value = ""
        }}
      />

      {/* Grid of items */}
      {loading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-44 animate-pulse rounded-2xl bg-white/[0.03]" />
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-16 text-center space-y-3">
          <ImageIcon className="h-10 w-10 text-slate-600 mx-auto" />
          <div className="font-semibold text-slate-300">Chưa có tệp nào trong danh mục này</div>
          <div className="text-xs text-slate-500 max-w-sm mx-auto">
            Hãy kéo thả file media từ máy tính hoặc bấm "Tải lên media" để bắt đầu sử dụng.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {filteredItems.map((item) => (
            <div
              key={item.path}
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#12181d] transition-all duration-200 hover:border-amber-500/40 hover:shadow-xl hover:shadow-amber-500/10 flex flex-col"
            >
              {/* Delete Button */}
              <button
                type="button"
                aria-label={`Xóa ${item.name}`}
                title="Xóa khỏi thư viện"
                disabled={deletingPath === item.path}
                onClick={() => void remove(item)}
                className="absolute right-2 top-2 z-20 rounded-lg bg-black/80 p-1.5 text-slate-300 opacity-0 transition-opacity hover:bg-rose-600 hover:text-white group-hover:opacity-100 disabled:opacity-50 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>

              {/* Copy Path Button */}
              <button
                type="button"
                aria-label="Sao chép đường dẫn"
                title="Sao chép đường dẫn"
                onClick={() => handleCopyPath(item.path)}
                className="absolute left-2 top-2 z-20 rounded-lg bg-black/80 p-1.5 text-slate-300 opacity-0 transition-opacity hover:bg-amber-500 hover:text-slate-950 group-hover:opacity-100 cursor-pointer"
              >
                {copiedPath === item.path ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              </button>

              {/* Media Preview Box */}
              <div className="relative aspect-video w-full bg-black/40 overflow-hidden flex items-center justify-center">
                {item.media_type === "video" ? (
                  <video
                    src={mediaUrl(item.path)}
                    className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                    muted
                    onMouseEnter={(e) => e.currentTarget.play().catch(() => {})}
                    onMouseLeave={(e) => e.currentTarget.pause()}
                  />
                ) : item.media_type === "audio" ? (
                  <div className="flex flex-col items-center justify-center gap-2 p-4 text-center">
                    <button
                      type="button"
                      onClick={() => togglePlayAudio(item.path)}
                      className={cn(
                        "h-10 w-10 rounded-full flex items-center justify-center transition-all shadow-md cursor-pointer",
                        playingAudioPath === item.path
                          ? "bg-amber-400 text-slate-950 scale-110 animate-pulse"
                          : "bg-white/10 text-amber-400 hover:bg-amber-400 hover:text-slate-950"
                      )}
                    >
                      {playingAudioPath === item.path ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current ml-0.5" />}
                    </button>
                    <span className="text-[10px] font-semibold text-slate-400">
                      {playingAudioPath === item.path ? "Đang phát..." : "Phát audio"}
                    </span>
                  </div>
                ) : (
                  <img
                    src={mediaUrl(item.path)}
                    alt={item.name}
                    className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                )}
              </div>

              {/* Meta Info */}
              <div className="p-3 bg-[#0d1317] flex-1 flex flex-col justify-between">
                <div className="flex items-center gap-1.5 text-xs">
                  {item.media_type === "video" ? (
                    <Video className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
                  ) : item.media_type === "audio" ? (
                    <Music className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  ) : (
                    <ImageIcon className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                  )}
                  <span className="truncate font-medium text-slate-200" title={item.name}>{item.name}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
                  <span>{kbStr(item.size_kb)}</span>
                  <span>{new Date(item.updated_at).toLocaleDateString("vi-VN")}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
