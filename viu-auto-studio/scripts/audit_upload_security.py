from pathlib import Path

from backend.api.routes import _is_within_any_root, _safe_upload_name


def main() -> None:
    cases = {
        "../../secret.mp4": "secret.mp4",
        "..\\..\\secret.mp4": "secret.mp4",
        "CON.mp4": "_CON.mp4",
        "a:b?.mp4": "b_.mp4",
    }
    for source, expected in cases.items():
        actual = _safe_upload_name(source)
        if actual != expected:
            raise AssertionError(f"sanitize mismatch: {source!r} -> {actual!r}, expected {expected!r}")
    root = Path("C:/safe/project").resolve()
    if not _is_within_any_root(root / "assets" / "scene.mp4", [root]):
        raise AssertionError("valid child path was rejected")
    if _is_within_any_root(Path("C:/safe/project-escape/scene.mp4").resolve(), [root]):
        raise AssertionError("sibling escape path was accepted")
    print("UPLOAD_SECURITY_AUDIT_PASS cases=4 containment=ok")


if __name__ == "__main__":
    main()
