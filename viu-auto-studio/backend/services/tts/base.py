"""TTS provider adapter interface (bắt buộc theo đặc tả dự án).

Mọi nhà cung cấp TTS phải kế thừa từ TTSProvider và triển khai ba phương thức
này. Kiến trúc adapter cho phép thay đổi nhà cung cấp mà không ảnh hưởng đến
pipeline render.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import List

from backend.schemas import TTSVoice


class TTSProvider(ABC):
    """Contract that every TTS provider must implement."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Provider identifier, e.g. 'edge', 'local', 'cloud'."""

    @abstractmethod
    def synthesize(self, text: str, voice: str, speed: float, output_path: str) -> str:
        """Synthesize speech to an audio file. Return the output_path on success.

        MUST raise RuntimeError with a human-readable Vietnamese message on failure.
        """

    @abstractmethod
    def list_voices(self) -> List[TTSVoice]:
        """List available voices for this provider."""

    @abstractmethod
    def test_connection(self) -> dict:
        """Return {"ok": bool, "message": str}."""
