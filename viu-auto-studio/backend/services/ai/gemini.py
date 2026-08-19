"""Google Gemini AI provider implementation."""

from __future__ import annotations

import requests

from backend.core.config import GEMINI_API_KEY, GEMINI_MODEL
from backend.schemas import ScriptSchema, ScriptGenerateRequest
from backend.services.ai.provider import _build_script_prompt, _extract_json, _parse_script_schema, AIProvider


class GeminiProvider(AIProvider):
    """Generate scripts via the Google Gemini REST API."""

    @property
    def name(self) -> str:
        return "gemini"

    def is_configured(self) -> bool:
        return bool(GEMINI_API_KEY)

    def test_connection(self) -> dict:
        if not self.is_configured:
            return {"ok": False, "message": "Chưa cấu hình GEMINI_API_KEY"}
        try:
            response = requests.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent",
                params={"key": GEMINI_API_KEY},
                headers={"Content-Type": "application/json"},
                json={
                    "contents": [{"parts": [{"text": "Reply with the word OK"}]}]
                },
                timeout=30,
            )
            if response.status_code == 200:
                return {"ok": True, "message": f"Kết nối Gemini OK (model: {GEMINI_MODEL})"}
            return {"ok": False, "message": f"Gemini trả về lỗi {response.status_code}: {response.text[:200]}"}
        except requests.RequestException as exc:
            return {"ok": False, "message": f"Lỗi mạng khi gọi Gemini: {exc}"}

    def generate_script(self, request: ScriptGenerateRequest) -> ScriptSchema:
        if not self.is_configured:
            raise RuntimeError("GEMINI_API_KEY chưa được cấu hình")

        response = requests.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent",
            params={"key": GEMINI_API_KEY},
            headers={"Content-Type": "application/json"},
            json={
                "system_instruction": {
                    "parts": [
                        {
                            "text": (
                                "Bạn là biên kịch video chuyên nghiệp. Luôn trả về ĐÚNG MỘT đối tượng JSON "
                                "theo cấu trúc yêu cầu, không thêm bất kỳ văn bản nào khác. Không dùng markdown code fences."
                            )
                        }
                    ]
                },
                "contents": [{"parts": [{"text": _build_script_prompt(request)}]}],
                "generationConfig": {
                    "temperature": 0.8,
                    "maxOutputTokens": 16000,
                    "responseMimeType": "application/json",
                },
            },
            timeout=180,
        )
        response.raise_for_status()
        payload = response.json()

        try:
            parts = payload["candidates"][0]["content"]["parts"]
            content = "\n".join(part.get("text", "") for part in parts)
        except (KeyError, IndexError) as exc:
            raise RuntimeError(f"Phản hồi Gemini không hợp lệ: {payload}") from exc

        raw = _extract_json(content)
        return _parse_script_schema(raw)

    def generate_text(self, system_prompt: str, user_prompt: str) -> str:
        """Sinh văn bản tự do bằng model Gemini đã cấu hình."""
        if not self.is_configured:
            raise RuntimeError("GEMINI_API_KEY chưa được cấu hình")
        response = requests.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent",
            params={"key": GEMINI_API_KEY},
            headers={"Content-Type": "application/json"},
            json={
                "system_instruction": {"parts": [{"text": system_prompt}]},
                "contents": [{"parts": [{"text": user_prompt}]}],
                "generationConfig": {"temperature": 0.7, "maxOutputTokens": 4000},
            },
            timeout=120,
        )
        response.raise_for_status()
        payload = response.json()
        parts = payload["candidates"][0]["content"]["parts"]
        return "\n".join(part.get("text", "") for part in parts)

    def generate_text(
        self,
        system_prompt: str | None = None,
        user_prompt: str | None = None,
        *,
        messages: list[dict] | None = None,
        json_schema: dict | None = None,
    ) -> str:
        """Sinh văn bản tự do bằng model Gemini đã cấu hình.

        Hỗ trợ 2 dạng gọi:
        - generate_text(system_prompt, user_prompt) — API cũ
        - generate_text(messages=[...], json_schema={...}) — danh sách message
          với structured output qua responseSchema
        """
        if not self.is_configured:
            raise RuntimeError("GEMINI_API_KEY chưa được cấu hình")
        if messages is None:
            messages = [
                {"role": "system", "content": system_prompt or ""},
                {"role": "user", "content": user_prompt or ""},
            ]
        contents = []
        system_parts = None
        for m in messages:
            role = m.get("role", "user")
            if role == "system":
                system_parts = [{"text": m.get("content", "")}]
            else:
                contents.append({"parts": [{"text": m.get("content", "")}]})
        gen_cfg: dict = {"temperature": 0.7, "maxOutputTokens": 4000}
        if json_schema is not None:
            gen_cfg["responseMimeType"] = "application/json"
            gen_cfg["responseSchema"] = json_schema
        payload = {
            "contents": contents,
            "generationConfig": gen_cfg,
        }
        if system_parts:
            payload["system_instruction"] = {"parts": system_parts}
        response = requests.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent",
            params={"key": GEMINI_API_KEY},
            headers={"Content-Type": "application/json"},
            json=payload,
            timeout=180,
        )
        response.raise_for_status()
        result = response.json()
        parts = result["candidates"][0]["content"]["parts"]
        return "\n".join(part.get("text", "") for part in parts)
