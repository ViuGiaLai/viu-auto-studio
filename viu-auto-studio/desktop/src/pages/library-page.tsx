import { useEffect, useState } from "react"
import { Image as ImageIcon, Video, Plus } from "lucide-react"
import { api, mediaUrl } from "@/services/api"
import { toast } from "@/hooks/use-toast"
import { Button } from "@/components/design-system"
import { Input } from "@/components/design-system"

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
  const [fileInput, setFileInput] = useState<HTMLInputElement | null>(null)

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
    if (ok.length) toast({ title: `Đã tải lên ${ok.length} file` })
    load(search)
  }

  const kbStr = (kb: number) =>
    kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`

  return (
    <div className="min-h-full space-y-6 p-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Thư viện</h1>
          <p className="mt-1 text-sm text-slate-500">
            Hình ảnh và video đã tải lên — dùng chung cho mọi dự án
          </p>
        </div>
        <Button
          onClick={() => fileInput?.click()}
          className="gap-1.5 bg-gradient-to-r from-[#d9940a] to-[#faaa02] text-[#372a01] shadow-lg shadow-amber-500/20 font-semibold hover:brightness-110"
        >
          <Plus className="h-4 w-4" />
          Tải lên media
        </Button>
      </div>

      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Tìm kiếm media..."
        className="max-w-md text-sm text-slate-200 placeholder:text-slate-600"
      />

      <input
        ref={setFileInput}
        type="file"
        accept="image/*,video/*,audio/*"
        multiple
        className="hidden"
        onChange={(e) => upload(e.target.files)}
      />

      {loading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl bg-white/[0.03]" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="vas-card flex flex-col items-center gap-3 border-dashed p-16 text-center">
          <ImageIcon className="h-10 w-10 text-slate-600" />
          <div>
            <div className="font-medium text-slate-200">Thư viện trống</div>
            <div className="mt-1 text-sm text-slate-500">
              Tải lên hình ảnh, video hoặc audio để dùng chung cho các dự án.
            </div>
          </div>
          <Button onClick={() => fileInput?.click()} variant="outline" className="gap-1.5">
            <Plus className="h-4 w-4" />
            Tải lên file đầu tiên
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
          {items.map((item) => (
            <div
              key={item.path}
              className="group relative overflow-hidden rounded-xl border border-white/[0.06] bg-[#141d22] transition-all duration-200 hover:border-amber-500/30 hover:shadow-lg hover:shadow-amber-500/10"
            >
              {item.media_type === "video" ? (
                <video src={mediaUrl(item.path)} className="aspect-video w-full object-cover" muted />
              ) : (
                <img src={mediaUrl(item.path)} alt={item.name} className="aspect-video w-full object-cover" />
              )}
              <div className="p-2.5">
                <div className="flex items-center gap-1.5 text-xs">
                  {item.media_type === "video" ? (
                    <Video className="h-3 w-3 shrink-0 text-blue-400" />
                  ) : (
                    <ImageIcon className="h-3 w-3 shrink-0 text-amber-400" />
                  )}
                  <span className="truncate font-medium text-slate-200">{item.name}</span>
                </div>
                <div className="mt-0.5 text-[10px] text-slate-500">
                  {kbStr(item.size_kb)} · {new Date(item.updated_at).toLocaleDateString("vi-VN")}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
