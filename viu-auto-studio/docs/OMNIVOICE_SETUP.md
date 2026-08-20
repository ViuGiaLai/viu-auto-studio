# OmniVoice trong Viu Auto Studio

OmniVoice là provider TTS local tùy chọn. Viu Auto Studio không cài hoặc tải model ngầm; khi runtime chưa có, giao diện hiển thị provider là unavailable và pipeline vẫn dùng Edge/Cloud/Local provider hiện tại.

## Cài đặt tùy chọn

Nên cài trong virtual environment riêng hoặc environment backend của Desktop theo đúng phiên bản PyTorch/CUDA của máy. Tham khảo hướng dẫn chính thức của [OmniVoice](https://github.com/k2-fsa/OmniVoice):

```powershell
# Cài PyTorch phù hợp CUDA/CPU trước theo hướng dẫn chính thức
pip install omnivoice soundfile
```

Sau khi cài, khởi động lại backend/Desktop rồi vào **Cài đặt → Giọng nói**, chọn `OmniVoice`. Nút **Test kết nối** chỉ báo runtime/model configuration có thể được load; model weights sẽ load ở lần tổng hợp đầu tiên.

## Voice cloning

Chọn reference audio bằng file upload trong Settings. File được lưu trong `DATA_DIR/voices/references` với giới hạn upload chung của ứng dụng. Nên sử dụng file khoảng 3–10 giây có transcript chính xác và chỉ dùng giọng nói mà người dùng có quyền sử dụng. Viu lưu cache clone prompt theo fingerprint của reference audio + transcript trong `DATA_DIR/voices/omnivoice`, nhờ đó những lần sau không phải tạo lại prompt.

Nếu không có reference audio, có thể dùng **Voice design instruction**, ví dụ `female, warm, low pitch, Vietnamese narrator`. Voice design là tùy chọn; voice cloning có reference audio thường ổn định hơn.

## Kiểm soát long-form

Các trường `Diffusion steps`, `Long-form chunk` và `Chunk threshold` được truyền thật vào `model.generate()`. Văn bản dài được tách chunk theo ngưỡng để giảm áp lực VRAM. `Normalize text / post-process audio` bật chuẩn hóa số và hậu xử lý khoảng lặng khi model hỗ trợ.

## An toàn và giấy phép

Không dùng OmniVoice để giả mạo, lừa đảo hoặc clone giọng khi chưa có sự cho phép. Repository code OmniVoice công bố Apache-2.0, nhưng model pretrained trên model card Hugging Face có ràng buộc **CC-BY-NC**; cần rà soát riêng trước khi dùng cho sản phẩm thương mại hoặc đóng gói model vào installer.

### Sources

- [OmniVoice GitHub](https://github.com/k2-fsa/OmniVoice)
- [OmniVoice generation parameters](https://github.com/k2-fsa/OmniVoice/blob/master/docs/generation-parameters.md)
- [OmniVoice Hugging Face model card](https://huggingface.co/k2-fsa/OmniVoice)
- [Pixelle-Video README](https://github.com/ATH-MaaS/Pixelle-Video/blob/main/README_EN.md)
