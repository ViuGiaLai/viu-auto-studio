from pathlib import Path

target_file = Path(__file__).resolve().parent / "desktop" / "src" / "pages" / "settings-page.tsx"
if target_file.exists():
    lines = target_file.read_text(encoding="utf-8").splitlines()
    print(f"Total lines in {target_file.name}: {len(lines)}")
