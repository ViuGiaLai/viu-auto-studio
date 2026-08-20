"""UTO Flow (labs.google/fx/tools/flow) image/video automation worker.

Cơ chế theo Flow Factory (1.1.8_0):
1. Mở trang Flow → điền prompt (Slate editor) → mở settings menu gần nút
   submit → chọn model (Nano Banana 2) → chọn IMAGE/VIDEO + LANDSCAPE/PORTRAIT
   → bấm submit (icon arrow_forward).
2. Theo dõi tiles [data-tile-id]: waiting → generating (X%) → done (img.src
   chứa getMediaUrlRedirect) — poll mỗi 2s, timeout 5 phút.
3. Tải file qua URL https://labs.google/fx/api/trpc/media.getMediaUrlRedirect?name=
   bằng session cookie của Chrome profile.

LƯU Ý NGƯỜI DÙNG:
- Đây là NGUỒN TẠO ẢNH/VIDEO CHÍNH của dự án. Gemini/OpenRouter chỉ dùng để
  viết kịch bản, chia cảnh và tạo prompt.
- Đăng nhập Google là điều kiện tiên quyết. Chưa đăng nhập → báo lỗi rõ
  (UTOFlowAuthError), KHÔNG fallback âm thầm sang Pollinations/Gemini.
- Lỗi bất kỳ (timeout, không tìm element, tải file hỏng) → báo lỗi rõ +
  cho phép bấm "Thử lại".
"""

from __future__ import annotations

from backend.core.config import DATA_DIR

import logging
import os
import shutil
import sys
import time
from pathlib import Path

import requests

logger = logging.getLogger("viu.labs")

FLOW_URL = "https://labs.google/fx/tools/flow"
MEDIA_URL_PREFIX = "getMediaUrlRedirect"


class UTOFlowAuthError(Exception):
    """Chưa đăng nhập Google — Flow không dùng được."""


class UTOFlowTimeoutError(Exception):
    """Timeout chờ Flow sinh ảnh/video."""


class UTOFlowError(Exception):
    """Lỗi tự động hóa UTO Flow nói chung."""


DEFAULT_MODEL = "Nano Banana 2"


def _find_chrome_executable() -> str | None:
    """Find a real Chrome/Chromium binary on Windows, macOS or Linux."""
    candidates = [
        os.getenv("VIU_CHROME_PATH", ""),
        shutil.which("chrome"),
        shutil.which("google-chrome"),
        shutil.which("chromium"),
        shutil.which("chromium-browser"),
    ]
    if os.name == "nt":
        candidates.extend([
            os.path.expandvars(r"%PROGRAMFILES%\\Google\\Chrome\\Application\\chrome.exe"),
            os.path.expandvars(r"%PROGRAMFILES(X86)%\\Google\\Chrome\\Application\\chrome.exe"),
            os.path.expandvars(r"%LOCALAPPDATA%\\Google\\Chrome\\Application\\chrome.exe"),
        ])
    elif sys.platform == "darwin":
        candidates.append("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
    else:
        candidates.append("/usr/bin/chromium")
    for candidate in candidates:
        if candidate and Path(candidate).expanduser().is_file():
            return str(Path(candidate).expanduser())
    return None


def _fill_prompt_js() -> str:
    """JS điền prompt vào Slate editor giống fillPrompt của Flow Factory."""
    return """(text) => {
      const editor = document.querySelector('[contenteditable="true"][data-slate-editor="true"]');
      if (!editor) return false;
      editor.focus();
      // Xóa nội dung cũ
      editor.innerText = '';
      editor.dispatchEvent(new Event('input', {bubbles: true}));
      // Chèn text bằng execCommand (React 16+ đồng bộ Slate)
      document.execCommand('insertText', false, text);
      return editor.innerText.trim().length > 0;
    }"""


def _run_flow_job(
    prompt: str,
    out_path: str,
    portrait: bool = False,
    media_kind: str = "image",
    model: str = DEFAULT_MODEL,
    timeout_sec: float = 300.0,
) -> bool:
    """Chạy trọn luồng UTO Flow cho 1 cảnh. Trả True nếu file hợp lệ đã lưu.

    media_kind: 'image' | 'video'.
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        raise UTOFlowError("Chưa cài playwright — không thể chạy UTO Flow")

    prompt = (prompt or "").strip()
    if not prompt:
        raise UTOFlowError("Prompt rỗng — không thể gửi sang UTO Flow")

    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    profile = DATA_DIR / "labs_profile"
    profile.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as pw:
        launch_kwargs = {
            "user_data_dir": str(profile),
            "headless": False,
            "args": ["--no-first-run"],
            "viewport": {"width": 1366, "height": 900},
        }
        executable = _find_chrome_executable()
        if executable:
            launch_kwargs["executable_path"] = executable
        ctx = pw.chromium.launch_persistent_context(**launch_kwargs)
        try:
            page = ctx.pages[0] if ctx.pages else ctx.new_page()
            page.set_default_timeout(60000)

            page.goto(FLOW_URL, wait_until="domcontentloaded", timeout=60000)
            page.wait_for_timeout(7000)

            # ---- Kiểm tra đăng nhập Google ----
            content = page.content()
            sign_in_visible = "Đăng nhập" in content or "Sign in" in content
            editor = page.query_selector('[contenteditable="true"][data-slate-editor="true"]')
            if editor is None or sign_in_visible:
                ctx.close()
                raise UTOFlowAuthError(
                    "UTO Flow yêu cầu đăng nhập Google — hãy bấm \"Đăng nhập Google Labs\""
                    " trong Cài đặt → AI để mở trang Labs và đăng nhập một lần."
                )

            # ---- Điền prompt ----
            editor = page.query_selector('[contenteditable="true"][data-slate-editor="true"]')
            if editor is None:
                raise UTOFlowError("Không tìm thấy ô nhập prompt trên trang UTO Flow")
            ok = page.evaluate(_fill_prompt_js(), prompt)
            if not ok:
                # fallback: click + fill thuần
                editor.click()
                editor.fill(prompt)
            page.wait_for_timeout(1200)

            # ---- Chọn model qua settings menu gần nút submit ----
            try:
                icons = page.query_selector_all("i.google-symbols")
                submit_icon = next((i for i in icons if (i.inner_text() or "").strip() == "arrow_forward"), None)
                menu_btn = None
                if submit_icon:
                    menu_btn = submit_icon.evaluate_handle(
                        "el => el.closest('button[aria-haspopup=\"menu\"]') || el.parentElement?.querySelector('button[aria-haspopup=\"menu\"]')"
                    )
                if menu_btn:
                    btn = menu_btn.as_element()
                    if btn:
                        btn.click()
                        page.wait_for_timeout(900)
                        model_btn = page.query_selector(
                            f"button:text(\"{model}\")"
                        ) or page.query_selector(f"text={model} >> xpath=ancestor::button")
                        if model_btn is None:
                            model_btn = page.query_selector("button", has_text=model)
                        if model_btn:
                            model_btn.click()
                            page.wait_for_timeout(600)
                        # Đóng menu
                        page.keyboard.press("Escape")
                        page.wait_for_timeout(500)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Chọn model %s thất bại (%s) — dùng model mặc định của Flow", model, exc)

            # ---- Chọn IMAGE / VIDEO ----
            if media_kind == "image":
                tab = page.query_selector('button[id*="trigger-IMAGE"]')
            else:
                tab = page.query_selector('button[id*="trigger-VIDEO"]')
            if tab:
                tab.click()
                page.wait_for_timeout(900)

            # ---- Chọn LANDSCAPE / PORTRAIT ----
            ratio_btn = page.query_selector('button[id*="trigger-PORTRAIT"]' if portrait else 'button[id*="trigger-LANDSCAPE"]')
            if ratio_btn:
                ratio_btn.click()
                page.wait_for_timeout(900)

            # ---- Submit ----
            submit = page.query_selector('i.google-symbols')
            submit_el = None
            for icon in page.query_selector_all("i.google-symbols"):
                if (icon.inner_text() or "").strip() == "arrow_forward":
                    parent = icon.evaluate_handle("el => el.closest('button')")
                    submit_el = parent.as_element() if parent else None
                    if submit_el:
                        break
            if submit_el is None:
                raise UTOFlowError("Không tìm thấy nút submit (arrow_forward) trên trang UTO Flow")
            submit_el.click()
            page.wait_for_timeout(3000)

            # ---- Theo dõi tiles: waiting -> generating -> done ----
            start = time.time()
            done_tile = None
            tile_src = ""
            expected = 1
            while time.time() - start < timeout_sec:
                tiles = page.query_selector_all("[data-tile-id]")
                if not tiles:
                    page.wait_for_timeout(2000)
                    continue
                best = None
                for tile in tiles:
                    img = tile.query_selector("img")
                    src = img.get_attribute("src") or ""
                    if MEDIA_URL_PREFIX in src:
                        best = (tile, src)
                        break
                    inner = tile.inner_text() or ""
                    if "%" in inner:
                        best = best or (tile, src)  # đang generating, chưa done
                if best is not None and MEDIA_URL_PREFIX in best[1]:
                    done_tile, tile_src = best
                    break
                page.wait_for_timeout(2000)

            if done_tile is None:
                raise UTOFlowTimeoutError(
                    f"UTO Flow sinh ảnh quá {int(timeout_sec)}s — hãy thử lại (có thể server Flow đang quá tải)"
                )

            # ---- Tải file qua URL media + session cookie ----
            session = _build_request_session(ctx)
            if tile_src.startswith("data:") or tile_src.startswith("blob:"):
                img_bytes = done_tile.query_selector("img").screenshot()
                if not img_bytes or len(img_bytes) < 4096:
                    raise UTOFlowError("Ảnh tile quá nhỏ hoặc không lấy được — thử lại")
                out_path_write = out_path
            else:
                resp = session.get(tile_src, timeout=120)
                resp.raise_for_status()
                if len(resp.content) < 4096:
                    raise UTOFlowError(f"File từ UTO Flow quá nhỏ ({len(resp.content)} bytes) — thử lại")
                out_path_write = out_path
                with open(out_path_write, "wb") as fp:
                    fp.write(resp.content)
                # screenshot fallback không cần khi đã tải đủ bytes
                if out_path_write != out_path:
                    pass
                return True

            with open(out_path_write, "wb") as fp:
                fp.write(img_bytes)
            logger.info("UTO Flow: đã sinh media cảnh → %s", out_path)
            return True
        finally:
            try:
                ctx.close()
            except Exception:  # noqa: BLE001
                pass


def _build_request_session(ctx) -> requests.Session:
    """Xây session requests dùng chung cookie Chrome profile để tải file media."""
    session = requests.Session()
    try:
        cookies = ctx.cookies()
        for cookie in cookies or []:
            try:
                session.cookies.set(
                    cookie.get("name", ""),
                    cookie.get("value", ""),
                    domain=cookie.get("domain", ".labs.google"),
                    path=cookie.get("path", "/"),
                )
            except Exception:  # noqa: BLE001
                pass
    except Exception:  # noqa: BLE001
        pass
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
        "Referer": "https://labs.google/",
    })
    return session


def generate_labs_image(prompt: str, out_path: str, portrait: bool = True) -> str | None:
    """Sinh ảnh qua UTO Flow. Trả đường dẫn ảnh khi thành công, None khi lỗi.

    Lỗi đăng nhập/timeout/nội bộ đều log rõ — pipeline đọc trạng thái để
    báo lỗi minh bạch cho người dùng thay vì fallback âm thầm.
    """
    try:
        ok = _run_flow_job(prompt, out_path, portrait=portrait, media_kind="image")
    except (UTOFlowAuthError, UTOFlowTimeoutError, UTOFlowError) as exc:
        logger.warning("UTO Flow thất bại (%s): %s", type(exc).__name__, exc)
        ok = False
    except Exception as exc:  # noqa: BLE001
        logger.warning("UTO Flow lỗi không lường trước: %s", exc)
        ok = False
    if not ok:
        try:
            Path(out_path).unlink(missing_ok=True)
        except OSError:
            pass
        return None
    return out_path


def check_labs_signed_in() -> dict:
    """Mở trang Flow bằng profile Chrome, kiểm tra đã đăng nhập Google chưa."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return {"signed_in": False, "note": "Chưa cài playwright"}
    profile = DATA_DIR / "labs_profile"
    profile.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        launch_kwargs = {
            "user_data_dir": str(profile),
            "headless": False,
            "args": ["--no-first-run"],
            "viewport": {"width": 1280, "height": 800},
        }
        executable = _find_chrome_executable()
        if executable:
            launch_kwargs["executable_path"] = executable
        ctx = pw.chromium.launch_persistent_context(**launch_kwargs)
        try:
            page = ctx.pages[0] if ctx.pages else ctx.new_page()
            page.goto(FLOW_URL, wait_until="domcontentloaded", timeout=60000)
            page.wait_for_timeout(7000)
            content = page.content()
            editor = page.query_selector('[contenteditable="true"][data-slate-editor="true"]')
            signed_in = editor is not None and "Đăng nhập" not in content and "Sign in" not in content
            return {"signed_in": signed_in, "note": "Đã đăng nhập Google Labs — UTO Flow sẵn sàng" if signed_in else "Chưa đăng nhập Google Labs — bấm \"Đăng nhập Google Labs\" trong Cài đặt → AI"}
        finally:
            try:
                ctx.close()
            except Exception:  # noqa: BLE001
                pass


if __name__ == "__main__":
    import sys

    out = generate_labs_image(
        "A glowing LED light bulb floating above an electricity bill on a wooden desk, "
        "soft warm light, photorealistic, 16:9",
        "/tmp/flow_test.jpg",
        portrait=False,
    )
    print("RESULT:", out)
