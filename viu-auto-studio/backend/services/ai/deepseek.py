"""DeepSeek AI provider implementation."""

from __future__ import annotations

import json
import logging
import requests

from backend.schemas import ScriptSchema, ScriptGenerateRequest
from backend.services.ai.provider import _build_script_prompt, _extract_json, _parse_script_schema, AIProvider

log = logging.getLogger("viu.ai.deepseek")

DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions"
DEFAULT_DEEPSEEK_MODEL = "deepseek-chat"


class DeepSeekProvider(AIProvider):
    """Generate scripts and content via DeepSeek REST API."""

    def __init__(self, api_key: str = "", model: str = DEFAULT_DEEPSEEK_MODEL):
        self._api_key = api_key
        self._model = model

    @property
    def name(self) -> str:
        return "deepseek"

    def is_configured(self) -> bool:
        return bool(self._get_effective_key())

    def _get_effective_key(self) -> str:
        if self._api_key:
            return self._api_key
        # Check DB app settings
        try:
            from backend.core.database import SessionLocal
            from backend.models import AppSetting

            db = SessionLocal()
            try:
                row = db.query(AppSetting).filter(AppSetting.key == "deepseek_api_key").first()
                if row and row.value:
                    return str(row.value).strip()
            finally:
                db.close()
        except Exception:
            pass
        return ""

    def test_connection(self, api_key: str | None = None) -> dict:
        key = (api_key or self._get_effective_key()).strip()
        if not key:
            return {"ok": False, "message": "Chưa nhập API key DeepSeek"}
        try:
            response = requests.post(
                DEEPSEEK_API_URL,
                headers={
                    "Authorization": f"Bearer {key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self._model,
                    "messages": [{"role": "user", "content": "Reply with the word OK"}],
                    "max_tokens": 10,
                },
                timeout=20,
            )
            if response.status_code == 200:
                return {"ok": True, "message": f"Kết nối DeepSeek OK (model: {self._model})"}
            detail = ""
            try:
                err_data = response.json()
                detail = err_data.get("error", {}).get("message", "")
            except Exception:
                detail = response.text[:200]
            return {"ok": False, "message": f"DeepSeek trả về lỗi {response.status_code}: {detail}"}
        except requests.RequestException as exc:
            return {"ok": False, "message": f"Lỗi kết nối tới DeepSeek: {exc}"}

    def generate_script(self, request: ScriptGenerateRequest) -> ScriptSchema:
        key = self._get_effective_key()
        if not key:
            raise RuntimeError("DEEPSEEK_API_KEY chưa được cấu hình")

        prompt = _build_script_prompt(request)
        response = requests.post(
            DEEPSEEK_API_URL,
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            json={
                "model": self._model,
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "Bạn là biên kịch video chuyên nghiệp. Luôn trả về ĐÚNG MỘT đối tượng JSON "
                            "theo cấu trúc yêu cầu, không thêm bất kỳ văn bản nào khác. Không dùng markdown code fences."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                "response_format": {"type": "json_object"},
                "temperature": 0.7,
            },
            timeout=90,
        )
        if response.status_code != 200:
            raise RuntimeError(f"DeepSeek API trả về lỗi {response.status_code}: {response.text[:300]}")

        raw = response.json()["choices"][0]["message"]["content"]
        data = _extract_json(raw)
        return _parse_script_schema(data)

    def generate_text(self, system_prompt: str, user_prompt: str) -> str:
        key = self._get_effective_key()
        if not key:
            raise RuntimeError("DEEPSEEK_API_KEY chưa được cấu hình")

        response = requests.post(
            DEEPSEEK_API_URL,
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            json={
                "model": self._model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "temperature": 0.7,
            },
            timeout=60,
        )
        if response.status_code != 200:
            raise RuntimeError(f"DeepSeek API trả về lỗi {response.status_code}: {response.text[:300]}")
        return response.json()["choices"][0]["message"]["content"]
