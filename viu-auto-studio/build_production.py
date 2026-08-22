import os
import sys
import subprocess
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent

def run(cmd, cwd=None, env=None):
    print(f"\n[EXEC] {cmd} (cwd={cwd or ROOT})")
    full_env = os.environ.copy()
    full_env["PYTHONIOENCODING"] = "utf-8"
    if env:
        full_env.update(env)
    res = subprocess.run(cmd, shell=True, cwd=str(cwd or ROOT), env=full_env)
    if res.returncode != 0:
        print(f"[ERROR] Command failed with code {res.returncode}: {cmd}")
        sys.exit(res.returncode)

def main():
    print("==================================================")
    print("VIU AUTO STUDIO - PRODUCTION BUILD PIPELINE")
    print("==================================================")

    # 1. Read Version
    version_file = ROOT / "version.json"
    if version_file.exists():
        v_data = json.loads(version_file.read_text(encoding="utf-8"))
        version = v_data.get("version", "1.0.0")
    else:
        version = "1.0.0"
    print(f"Target Version: v{version}")

    # 2. Validate Backend
    print("\n>>> Step 1/4: Validating Backend & Bundled Assets...")
    run("python -c \"import sys; sys.path.insert(0, '.'); from backend.core.config import init_data_dirs; init_data_dirs()\"")
    run("python -c \"import sys; sys.path.insert(0, '.'); from backend.render.smart_engine import detect_hardware_capabilities; hw = detect_hardware_capabilities(); print('Hardware detected:', hw.get('encoder_name'))\"")

    # 3. TypeScript TypeCheck
    print("\n>>> Step 2/4: Running TypeScript Check...")
    run("pnpm exec tsc --noEmit", cwd=ROOT / "desktop")

    # 4. Build Vite Frontend & Electron Main
    print("\n>>> Step 3/4: Building Vite Frontend & Electron Main...")
    run("pnpm run build", cwd=ROOT / "desktop")

    # 5. Package Electron Distribution
    print("\n>>> Step 4/4: Packaging Production Electron Bundle...")
    env_builder = {"CSC_IDENTITY_AUTO_DISCOVERY": "false"}
    run("pnpm exec electron-builder --dir", cwd=ROOT / "desktop", env=env_builder)

    print("\n==================================================")
    print("BUILD SUCCESSFUL!")
    print(f"Packaged Application Location: {ROOT / 'desktop' / 'release' / 'win-unpacked'}")
    print(f"Executable: {ROOT / 'desktop' / 'release' / 'win-unpacked' / 'Viu Auto Studio.exe'}")
    print("==================================================")

if __name__ == "__main__":
    main()
