from __future__ import annotations

from backend.services.tts.omnivoice_provider import OmniVoiceProvider


def main() -> None:
    provider = OmniVoiceProvider({"provider": "omnivoice"})
    result = provider.test_connection()
    if OmniVoiceProvider.is_available():
        if not result.get("ok"):
            raise AssertionError(f"OmniVoice is importable but test_connection failed: {result}")
    else:
        if result.get("ok"):
            raise AssertionError("Unavailable OmniVoice runtime was reported as ready")
        if "chưa" not in str(result.get("message", "")).lower():
            raise AssertionError(f"Missing actionable unavailable message: {result}")
    print(f"OMNIVOICE_ADAPTER_SMOKE_PASS available={OmniVoiceProvider.is_available()}")


if __name__ == "__main__":
    main()
