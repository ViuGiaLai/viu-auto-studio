/**
 * Trang Hướng dẫn sử dụng — hướng dẫn người dùng từ A đến Z
 * theo đúng luồng sản xuất video của Viu Auto Studio.
 */
import { useEffect, useState } from "react"

import { useNavigate } from "react-router-dom"
import {
  Clapperboard, FileVideo, Mic, Image as ImageIcon, Captions, Send,
  Lightbulb, ListChecks, Megaphone, ListVideo, Library, Settings as SettingsIcon,
  Wand2, CheckCircle2, Play, Clock, Sparkles,
} from "lucide-react"
import { Button } from "@/components/design-system"
import { Badge } from "@/components/ui/badge"
import { useAppStore } from "@/stores/app-store"
import { api } from "@/services/api"

const STEPS: Array<{
  icon: React.ComponentType<{ className?: string }>
  title: string
  where: string
  path: string
  points: string[]
  tip: string
}> = [
    {
      icon: Megaphone,
      title: "1. Tạo kênh",
      where: "Cài đặt → Kênh",
      path: "/settings",
      points: [
        "Vào Cài đặt → tab Kênh → nhấn \"+ Tạo kênh mới\".",
        "Điền tên kênh (YouTube/TikTok), lĩnh vực nội dung và mục tiêu video.",
        "Cấu hình tỷ lệ khung hình: 9:16 cho Shorts/Reels, 16:9 cho YouTube dài.",
      ],
      tip: "Mỗi kênh lưu riêng bộ cài đặt — bạn có thể chạy nhiều kênh cùng lúc.",
    },
    {
      icon: Clapperboard,
      title: "2. Tạo dự án",
      where: "Trang Dự án",
      path: "/projects",
      points: [
        "Nhấn \"+ Project Mới\" (trên sidebar hoặc trang Dự án).",
        "Chọn kênh, đặt tên video, loại video (ngắn/dài) và thời lượng mục tiêu.",
        "Dự án lưu trạng thái tự động — bạn có thể quay lại bất cứ lúc nào.",
      ],
      tip: "Tên dự án gợi ý nên đặt theo tiêu đề video để dễ quản lý.",
    },
    {
      icon: Lightbulb,
      title: "3. Sinh kịch bản (AI)",
      where: "Editor → tab Ý tưởng",
      path: "__project__",
      points: [
        "Mở dự án → tab \"1. Ý tưởng & Kịch bản\".",
        "Nhập chủ đề, chọn dàn ý (hoặc để AI tự lên dàn ý), góc tiếp cận, phong cách viết.",
        "Nhấn \"Tạo kịch bản\" — AI sinh tiêu đề, hook, kịch bản đầy đủ, concept thumbnail và SEO.",
        "Duyệt kịch bản → nhấn \"Lưu và dùng kịch bản này\".",
      ],
      tip: "Nếu không cấu hình API key AI nào, hệ thống tự dùng bộ sinh kịch bản offline (không cần key).",
    },
    {
      icon: ListChecks,
      title: "4. Chỉnh sửa & duyệt kịch bản",
      where: "Editor → tab Trình soạn thảo",
      path: "__project__",
      points: [
        "Sửa trực tiếp kịch bản trong trình soạn thảo — tự động lưu sau 1.5 giây.",
        "Nhấn \"Tách thành câu\" để chia kịch bản thành từng câu độc lập.",
        "Nhấn \"Duyệt kịch bản\" để chốt, sau đó \"Chia thành phân cảnh\".",
        "Mỗi câu sẽ trở thành một cảnh video với giọng đọc và phụ đề riêng.",
      ],
      tip: "Bạn có thể kéo thả để đổi thứ tự cảnh, chia nhỏ hoặc gộp cảnh trong tab Storyboard.",
    },
    {
      icon: Mic,
      title: "5. Giọng đọc (TTS)",
      where: "Editor → Storyboard / tab TTS",
      path: "/tts",
      points: [
        "Mặc định dùng Edge TTS (Microsoft Edge) — miễn phí, không cần API key.",
        "Chọn giọng tiếng Việt: Nữ Hoài My hoặc Nam Nam Minh ở tab TTS.",
        "Mỗi cảnh có thể \"Tạo lại giọng đọc\" với giọng/speed riêng.",
        "Nhấn thử phát để nghe giọng trước khi render.",
      ],
      tip: "Giọng mặc định toàn ứng dụng được đặt ở Cài đặt → Giọng đọc.",
    },
    {
      icon: ImageIcon,
      title: "6. Media cho từng cảnh",
      where: "Editor → tab Storyboard",
      path: "__project__",
      points: [
        "Mỗi cảnh có nút \"Sinh ảnh AI\" — hệ thống tự tạo ảnh minh họa từ mô tả cảnh.",
        "Bật \"Google Labs\" (Cài đặt → tab AI Dịch & Ảnh) để hệ thống tự mở Google Labs (Flow / Nano Banana 2), điền prompt và tải ảnh thật về cho từng cảnh khi render.",
        "Điều kiện dùng Google Labs: máy có Chrome/Chromium và đã đăng nhập tài khoản Google (nhấn \"Mở Google Labs để đăng nhập\" để làm một lần).",
        "Khi chưa đăng nhập hoặc tắt Labs, hệ thống tự động dùng Pollinations.ai (miễn phí, không cần key).",
        "Hoặc tải ảnh/video có sẵn lên ở Thư viện, rồi gán vào cảnh.",
        "Cảnh chưa chọn media sẽ tự động render bằng ảnh AI, không làm lỗi video.",
        "Cảnh nào có video tải lên sẽ ưu tiên dùng video đó.",
      ],
      tip: "Ảnh/video tải lên được lưu vào Thư viện — dùng lại cho nhiều dự án.",
    },
    {
      icon: Captions,
      title: "7. Phụ đề",
      where: "Editor → tab Phụ đề",
      path: "__project__",
      points: [
        "Chọn font, cỡ chữ, màu chữ/viền, vị trí hiển thị (trên/giữa/dưới).",
        "Chọn nhịp hiển thị: theo câu hoặc theo cụm từ, và ký tự tối đa mỗi dòng.",
        "Nhấn \"Xem trước\" để kiểm tra phụ đề trên video mẫu.",
        "Nhấn \"Xuất SRT\" để tải file phụ đề chuẩn, import vào Premiere/CapCut.",
      ],
      tip: "Thời điểm phụ đề được tính tự động từ độ dài giọng đọc thật — luôn khớp với lời nói.",
    },
    {
      icon: Send,
      title: "8. Render video",
      where: "Editor → tab Preview & Render",
      path: "__project__",
      points: [
        "Cấu hình chất lượng: CRF (độ nét), FPS, preset tốc độ.",
        "Bật/tắt phụ đề embed, chỉnh âm lượng nhạc nền, chọn logo nếu có.",
        "Nhấn \"Render\" — hệ thống chạy tự động: giọng đọc → media → phụ đề → ghép video.",
        "Theo dõi tiến trình \"live\" ở tab Hàng đợi (cập nhật mỗi 2 giây, xem log chi tiết).",
      ],
      tip: "Bạn có thể tiếp tục làm việc khác trong lúc render — hàng đợi tự hoàn tất và lưu video.",
    },
    {
      icon: Library,
      title: "9. Hàng đợi & Thư viện",
      where: "Tab Hàng đợi / Thư viện",
      path: "/queue",
      points: [
        "Hàng đợi: xem tiến độ từng lệnh, hủy lệnh đang chạy, thử lại lệnh lỗi, xem log render.",
        "Video hoàn tất có sẵn ngay trong tab Preview & Render của dự án.",
        "Thư viện: quản lý toàn bộ ảnh/video đã tải lên, xóa hoặc tải lại.",
      ],
      tip: "Lệnh render bị lỗi giữa chừng có thể \"Thử lại\" — tiếp tục từ đúng bước bị lỗi.",
    },
    {
      icon: SettingsIcon,
      title: "10. Cài đặt tổng thể",
      where: "Tab Cài đặt",
      path: "/settings",
      points: [
        "Giọng đọc: chọn provider và giọng mặc định cho toàn ứng dụng.",
        "AI: cấu hình OpenRouter / Gemini API key để có kịch bản thông minh hơn.",
        "Kênh: quản lý kênh YouTube/TikTok.",
        "Xuất hiện: nhạc nền, logo, thư mục xuất video.",
      ],
      tip: "Tất cả cài đặt đều lưu vào cơ sở dữ liệu SQLite — an toàn khi đóng/mở ứng dụng.",
    },
  ]

export default function GuidePage() {
  const navigate = useNavigate()
  const { markOnboarded, onboarded } = useAppStore()
  const [projectPath, setProjectPath] = useState("/workspace")

  useEffect(() => {
    if (!onboarded) markOnboarded()
    void api.listProjects().then((projects) => {
      const latest = projects[0]
      if (latest?.id) setProjectPath(`/projects/${latest.id}`)
    }).catch(() => {
      // Workspace remains the safe entry point when no project exists yet.
    })
  }, [onboarded, markOnboarded])

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <div className="flex items-center gap-4">
        <img src="/logo.png" alt="Viu Auto Studio" className="h-16 w-16 object-contain rounded-xl shadow-lg border border-amber-500/20 bg-black/40 p-1" />
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-white">Hướng dẫn sử dụng Viu Auto Studio</h1>
          <p className="text-sm text-slate-400">
            10 bước từ ý tưởng đến video hoàn chỉnh — mọi tính năng đều hoạt động thật và lưu trữ an toàn trong cơ sở dữ liệu.
          </p>
        </div>
      </div>

      <div className="vas-card flex items-start gap-3 border-amber-500/30 bg-amber-500/5 p-4">
        <Play className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <div className="text-sm text-slate-300">
          <strong className="text-amber-300">Luồng nhanh:</strong> Tạo kênh → Tạo dự án → Sinh kịch bản (tab Ý
          tưởng) → Duyệt & chia cảnh → Mở tab TTS chọn giọng → Storyboard gán ảnh AI hoặc tải media → tab Phụ
          đề tùy chỉnh → tab Preview & Render nhấn \"Render\" → theo dõi ở Hàng đợi → xem video hoàn tất trong
          dự án.
        </div>
      </div>

      <div className="space-y-4">
        {STEPS.map((s) => (
          <div key={s.title} className="vas-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15">
                  <s.icon className="h-4.5 w-4.5 text-amber-400" />
                </div>
                <h2 className="text-base font-semibold text-slate-100">{s.title}</h2>
              </div>
              <Button size="sm" variant="outline" onClick={() => navigate(s.path === "__project__" ? projectPath : s.path)}>
                {s.path === "__project__" && projectPath === "/workspace" ? "Mở Workspace →" : "Mở trang →"}
              </Button>
            </div>
            <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
              <ListVideo className="h-3 w-3" />
              {s.where}
            </div>
            <ul className="space-y-1.5">
              {s.points.map((p) => (
                <li key={p} className="flex items-start gap-2 text-sm text-slate-300">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400/70" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-white/[0.03] p-3 text-xs text-slate-400">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400/80" />
              <span>{s.tip}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="vas-card p-5">
        <h2 className="mb-3 text-base font-semibold text-slate-100">Câu hỏi thường gặp</h2>
        <div className="space-y-3 text-sm text-slate-300">
          <div>
            <div className="font-medium text-slate-200">Video tạo ra có thật không? Có dữ liệu giả không?</div>
            <div className="text-slate-400">
              Toàn bộ ứng dụng hoạt động thật: giọng đọc bằng Edge TTS (giọng thật), phụ đề đồng bộ theo độ dài
              giọng đọc thực tế, video ghép bằng FFmpeg thật, mọi dữ liệu lưu vào SQLite. Không có nút giả hay
              dữ liệu mẫu.
            </div>
          </div>
          <div>
            <div className="font-medium text-slate-200">Tôi cần trả phí gì không?</div>
            <div className="text-slate-400">
              Edge TTS (giọng đọc) và AI media (ảnh minh họa) đều miễn phí, không cần API key. Bạn chỉ cần cấu
              hình API key nếu muốn dùng AI mạnh hơn (OpenRouter/Gemini) cho kịch bản chất lượng cao.
            </div>
          </div>
          <div>
            <div className="font-medium text-slate-200">Render mất bao lâu?</div>
            <div className="text-slate-400">
              Phụ thuộc vào số cảnh và cấu hình. Mỗi cảnh tốn vài giây đến vài chục giây (tạo giọng + ghép hình).
              Video 19 cảnh hoàn tất trong vài phút. Theo dõi tiến trình chi tiết ở tab Hàng đợi.
            </div>
          </div>
          <div>
            <div className="font-medium text-slate-200">Tôi đã render xong thì video lưu ở đâu?</div>
            <div className="text-slate-400">
              Video lưu trong thư mục dự án (mở bằng nút \"Mở thư mục\" ở trang Dự án), và phát trực tiếp trong
              tab \"5. Preview & Render\" của dự án sau khi trạng thái \"Hoàn tất\".
            </div>
          </div>
          <div>
            <div className="font-medium text-slate-200">Lệnh render bị lỗi giữa chừng thì sao?</div>
            <div className="text-slate-400">
              Nhấn \"Thử lại\" ở tab Hàng đợi — hệ thống tiếp tục từ đúng bước bị lỗi, không làm lại từ đầu. Các
              cảnh đã hoàn tất không bị lặp lại.
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 pb-8 text-xs text-slate-600">
        <Clock className="h-3 w-3" />
        Viu Auto Studio v2.0.0 — Bản hướng dẫn này được cập nhật {new Date().toLocaleDateString("vi-VN")}
      </div>
    </div>
  )
}
