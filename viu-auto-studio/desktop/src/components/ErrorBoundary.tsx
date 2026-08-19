import { Component, ErrorInfo, ReactNode } from "react"
import { Button } from "@/components/design-system"

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * Error Boundary toàn ứng dụng — khi một component bị lỗi runtime,
 * trang không còn trắng trơn mà hiển thị thông báo + nút làm mới.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 max-w-md">
          <div className="mb-2 text-lg font-semibold text-red-400">
            Đã xảy ra lỗi hiển thị
          </div>
          <p className="mb-1 text-sm text-slate-300">
            Một phần của ứng dụng bị lỗi không mong muốn. Dữ liệu của bạn vẫn được bảo
            vệ vì toàn bộ trạng thái được lưu trong SQLite.
          </p>
          <p className="mb-4 max-h-32 overflow-auto rounded bg-black/40 p-2 text-left text-xs text-slate-400">
            {this.state.error?.message || "Không xác định"}
          </p>
          <div className="flex justify-center gap-2">
            <Button size="sm" onClick={() => window.location.reload()}>
              Làm mới trang
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              Thử lại
            </Button>
          </div>
        </div>
      </div>
    )
  }
}
