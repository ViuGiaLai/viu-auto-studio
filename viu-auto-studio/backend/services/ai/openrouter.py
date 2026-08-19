"""OpenRouter AI provider implementation."""

from __future__ import annotations

import requests

from backend.core.config import OPENROUTER_API_KEY, OPENROUTER_MODEL
from backend.schemas import ScriptSchema, ScriptGenerateRequest
from backend.services.ai.provider import _build_script_prompt, _extract_json, _parse_script_schema, AIProvider


class OpenRouterProvider(AIProvider):
    """Generate scripts via the OpenRouter API."""

    @property
    def name(self) -> str:
        return "openrouter"

    def is_configured(self) -> bool:
        return bool(OPENROUTER_API_KEY)

    def test_connection(self) -> dict:
        if not self.is_configured:
            return {"ok": False, "message": "Chưa cấu hình OPENROUTER_API_KEY"}
        try:
            response = requests.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": OPENROUTER_MODEL,
                    "messages": [{"role": "user", "content": "Reply with the word OK"}],
                    "max_tokens": 10,
                },
                timeout=30,
            )
            if response.status_code == 200:
                return {"ok": True, "message": f"Kết nối OpenRouter OK (model: {OPENROUTER_MODEL})"}
            return {"ok": False, "message": f"OpenRouter trả về lỗi {response.status_code}: {response.text[:200]}"}
        except requests.RequestException as exc:
            return {"ok": False, "message": f"Lỗi mạng khi gọi OpenRouter: {exc}"}

    def generate_script(self, request: ScriptGenerateRequest) -> ScriptSchema:
        if not self.is_configured:
            raise RuntimeError("OPENROUTER_API_KEY chưa được cấu hình")

        response = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": OPENROUTER_MODEL,
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "Bạn là biên kịch video chuyên nghiệp. Luôn trả về ĐÚNG MỘT đối tượng JSON "
                            "theo cấu trúc yêu cầu, không thêm bất kỳ văn bản nào khác."
                        ),
                    },
                    {"role": "user", "content": _build_script_prompt(request)},
                ],
                "max_tokens": 8000,
                "temperature": 0.8,
            },
            timeout=180,
        )
        response.raise_for_status()
        payload = response.json()

        try:
            content = payload["choices"][0]["message"]["content"]
        except (KeyError, IndexError) as exc:
            raise RuntimeError(f"Phản hồi OpenRouter không hợp lệ: {payload}") from exc

        raw = _extract_json(content)
        return _parse_script_schema(raw)

    def generate_text(
        self,
        system_prompt: str | None = None,
        user_prompt: str | None = None,
        *,
        messages: list[dict] | None = None,
        json_schema: dict | None = None,
    ) -> str:
        """Sinh văn bản tự do bằng model đã cấu hình.

        Hỗ trợ 2 dạng gọi: generate_text(system, user) cũ hoặc
        generate_text(messages=[...], json_schema={...}) mới.
        """
        if not self.is_configured:
            raise RuntimeError("OPENROUTER_API_KEY chưa được cấu hình")
        if messages is None:
            messages = [
                {"role": "system", "content": system_prompt or ""},
                {"role": "user", "content": user_prompt or ""},
            ]
        body = {
            "model": OPENROUTER_MODEL,
            "messages": messages,
            "max_tokens": 4000,
            "temperature": 0.7,
        }
        if json_schema is not None:
            body["response_format"] = {
                "type": "json_schema",
                "json_schema": {"name": "analysis", "strict": False, "schema": json_schema},
            }
        response = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
            },
            json=body,
            timeout=120,
        )
        response.raise_for_status()
        payload = response.json()
        return payload["choices"][0]["message"]["content"]
