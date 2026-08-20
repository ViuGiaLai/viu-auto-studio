# Kiểm thử UI thật bằng Electron

## Capture dashboard/projects

Electron đã khởi động được và tạo ảnh capture từ BrowserWindow thật. Dashboard và route projects hiện đang hiển thị cùng layout Trung tâm sản xuất, nhưng ảnh cho thấy các skeleton/card dự án vẫn còn ở trạng thái loading và sidebar báo `Backend: ...`/`Offline` tại thời điểm capture. Điều này cần kiểm tra lại bằng chờ lâu hơn hoặc do capture đi qua route quá nhanh trước khi các request hoàn tất.

Các route đã được Electron load và capture: dashboard, projects, projects-new, queue và studio. Chưa có bằng chứng rằng thao tác tạo project và mở project editor đã được click thành công; capture mode hiện mới tự chuyển route. Bước tiếp theo là tạo một project thật bằng UI automation trong BrowserWindow, chờ API hoàn tất, sau đó mở Project Editor và click các tab/Timeline.
