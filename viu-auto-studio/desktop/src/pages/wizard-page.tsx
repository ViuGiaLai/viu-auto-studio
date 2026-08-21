import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ArrowLeft, Sparkles, FolderOpen, Video, Film, Check, Layers } from "lucide-react"
import { api, selectDirectory } from "@/services/api"
import { toast } from "@/hooks/use-toast"
import { Button } from "@/components/design-system"
import { Input } from "@/components/design-system"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/utils/cn"

export default function WizardPage() {
  const navigate = useNavigate()
  const [name, setName] = useState("")
  const [topic, setTopic] = useState("")
  const [projectType, setProjectType] = useState<"ai_studio" | "recap">("ai_studio")
  const [videoType, setVideoType] = useState<"long" | "short">("long")
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16">("16:9")
  const [language, setLanguage] = useState("vi")
  const [outputFolder, setOutputFolder] = useState("")
  const [creating, setCreating] = useState(false)

  const handleSelectAspect = (ratio: "16:9" | "9:16") => {
    setAspectRatio(ratio)
    setVideoType(ratio === "16:9" ? "long" : "short")
  }

  const handleChooseFolder = async () => {
    try {
      const res = await selectDirectory()
      if (res?.path) setOutputFolder(res.path)
    } catch {
      // User cancelled
    }
  }

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!name.trim()) {
      toast({ title: "Vui lòng nhập tên dự án", variant: "destructive" })
      return
    }

    setCreating(true)
    try {
      const res = await api.createProject({
        name: name.trim(),
        topic: topic.trim() || name.trim(),
        video_type: videoType,
        aspect_ratio: aspectRatio,
        language,
        target_duration: videoType === "short" ? 60 : 180,
        project_type: projectType,
        output_folder: outputFolder.trim() || undefined,
      })

      toast({ title: "Đã tạo dự án thành công", description: name.trim() })
      navigate(`/projects/${res.id}`, { replace: true })
    } catch (err) {
      toast({ title: "Không thể tạo dự án", description: String(err), variant: "destructive" })
      setCreating(false)
    }
  }

  return (
    <div className="min-h-full max-w-4xl mx-auto space-y-6 p-6 sm:p-10">
      {/* Top Breadcrumb */}
      <div className="flex items-center justify-between">
        <Link
          to="/projects"
          className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Quay lại danh sách dự án
        </Link>
        <Badge variant="outline" className="border-amber-500/30 text-amber-300 bg-amber-500/5 text-xs">
          Tạo dự án mới
        </Badge>
      </div>

      {/* Main Project Creation Card */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0e161c] p-6 sm:p-8 shadow-2xl space-y-8">
        {/* Glowing Top Beam */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-amber-400 to-transparent" />

        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Sparkles className="h-6 w-6 text-amber-400" />
            Thông Tin Dự Án Mới
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Khởi tạo không gian làm việc. Các cấu hình chuyên sâu (Giọng AI, Google Flow, Đồng bộ nhân vật) có thể chỉnh sửa bất kỳ lúc nào trong Studio.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 1. Tên dự án & Chủ đề */}
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label className="text-sm font-semibold text-slate-200 flex items-center gap-1">
                Tên dự án <span className="text-amber-400">*</span>
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="VD: Bí ẩn đáy biển sâu · Tập 1"
                className="h-11 border-white/10 bg-white/[0.03] text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-500/60"
                autoFocus
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label className="text-sm font-semibold text-slate-200">
                Chủ đề / Ý tưởng kịch bản <span className="text-xs font-normal text-slate-500">(Tùy chọn)</span>
              </Label>
              <Input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="VD: Khám phá các sinh vật phát sáng kỳ lạ ở độ sâu 10.000m"
                className="h-11 border-white/10 bg-white/[0.03] text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-500/60"
              />
            </div>
          </div>

          {/* 2. Định dạng đầu ra (16:9 vs 9:16) */}
          <div className="space-y-2.5">
            <Label className="text-sm font-semibold text-slate-200">Định dạng khung hình</Label>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => handleSelectAspect("16:9")}
                className={cn(
                  "flex items-center gap-3.5 p-4 rounded-xl border text-left transition-all",
                  aspectRatio === "16:9"
                    ? "border-amber-500 bg-amber-500/10 ring-1 ring-amber-500/50 shadow-md shadow-amber-500/10"
                    : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
                )}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-300 font-bold text-sm">
                  16:9
                </div>
                <div>
                  <div className="font-semibold text-slate-100 text-sm">16:9 · Video dài</div>
                  <div className="text-xs text-slate-400">YouTube, Facebook, Tivi (1920×1080)</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleSelectAspect("9:16")}
                className={cn(
                  "flex items-center gap-3.5 p-4 rounded-xl border text-left transition-all",
                  aspectRatio === "9:16"
                    ? "border-amber-500 bg-amber-500/10 ring-1 ring-amber-500/50 shadow-md shadow-amber-500/10"
                    : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
                )}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-300 font-bold text-sm">
                  9:16
                </div>
                <div>
                  <div className="font-semibold text-slate-100 text-sm">9:16 · Shorts / Reels</div>
                  <div className="text-xs text-slate-400">TikTok, YouTube Shorts (1080×1920)</div>
                </div>
              </button>
            </div>
          </div>

          {/* 3. Loại dự án & Ngôn ngữ */}
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2.5">
              <Label className="text-sm font-semibold text-slate-200">Loại quy trình</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setProjectType("ai_studio")}
                  className={cn(
                    "flex flex-col items-center justify-center p-3.5 rounded-xl border text-center transition-all",
                    projectType === "ai_studio"
                      ? "border-amber-500 bg-amber-500/10 font-semibold text-amber-200"
                      : "border-white/10 bg-white/[0.02] text-slate-300 hover:border-white/20"
                  )}
                >
                  <Sparkles className="h-5 w-5 mb-1 text-amber-400" />
                  <span className="text-xs">AI Studio</span>
                  <span className="text-[10px] text-slate-500 font-normal">Tự động hoàn toàn</span>
                </button>

                <button
                  type="button"
                  onClick={() => setProjectType("recap")}
                  className={cn(
                    "flex flex-col items-center justify-center p-3.5 rounded-xl border text-center transition-all",
                    projectType === "recap"
                      ? "border-amber-500 bg-amber-500/10 font-semibold text-amber-200"
                      : "border-white/10 bg-white/[0.02] text-slate-300 hover:border-white/20"
                  )}
                >
                  <Film className="h-5 w-5 mb-1 text-sky-400" />
                  <span className="text-xs">Recap / Review</span>
                  <span className="text-[10px] text-slate-500 font-normal">Tóm tắt phim & truyện</span>
                </button>
              </div>
            </div>

            <div className="space-y-2.5">
              <Label className="text-sm font-semibold text-slate-200">Ngôn ngữ dự án</Label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full h-11 rounded-xl border border-white/10 bg-[#101920] px-3 text-sm text-slate-200 outline-none focus:border-amber-500/60"
              >
                <option value="vi">🇻🇳 Tiếng Việt (Mặc định)</option>
                <option value="en">🇺🇸 Tiếng Anh (English)</option>
                <option value="ja">🇯🇵 Tiếng Nhật (Japanese)</option>
                <option value="ko">🇰🇷 Tiếng Hàn (Korean)</option>
                <option value="zh">🇨🇳 Tiếng Trung (Chinese)</option>
              </select>
            </div>
          </div>

          {/* 4. Thư mục lưu trữ dự án */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-slate-200">Thư mục lưu trữ dự án</Label>
            <div className="flex gap-2">
              <Input
                value={outputFolder}
                onChange={(e) => setOutputFolder(e.target.value)}
                placeholder="Để trống để dùng thư mục riêng tự động của ứng dụng"
                className="h-10 flex-1 border-white/10 bg-white/[0.03] text-xs text-slate-200 placeholder:text-slate-600 font-mono"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleChooseFolder}
                className="gap-1.5 shrink-0 text-xs border-white/10 hover:bg-white/5"
              >
                <FolderOpen className="h-4 w-4" />
                Chọn thư mục
              </Button>
            </div>
            <p className="text-xs text-slate-500">
              Mỗi dự án sẽ được tự động đóng gói riêng vào một thư mục con chứa toàn bộ video, audio, ảnh và subtitle.
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 border-t border-white/10 pt-6">
            <Button
              type="button"
              variant="ghost"
              onClick={() => navigate("/projects")}
              disabled={creating}
              className="text-slate-400 hover:text-slate-200"
            >
              Hủy
            </Button>
            <Button
              type="submit"
              disabled={creating || !name.trim()}
              className="gap-2 bg-gradient-to-r from-[#d9940a] to-[#faaa02] px-6 text-sm font-bold text-slate-950 shadow-lg shadow-amber-500/20 hover:brightness-110"
            >
              {creating ? "Đang khởi tạo..." : "🚀 Tạo dự án & Bắt đầu"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
