import json
import os
import re
import shutil
import subprocess
import sys
from typing import Any, Dict, Optional

ACTIVE_PROCESSES: Dict[str, subprocess.Popen] = {}


def get_user_data_dir() -> str:
    appdata = os.environ.get("APPDATA") or os.path.expanduser("~")
    base = os.path.join(appdata, "viu-auto-studio-desktop")
    os.makedirs(base, exist_ok=True)
    return base


def find_from_windows_registry(exe_name: str) -> Optional[str]:
    if sys.platform != "win32":
        return None
    try:
        import winreg
        for hive in [winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER]:
            try:
                with winreg.OpenKey(hive, rf"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\{exe_name}") as key:
                    val, _ = winreg.QueryValueEx(key, "")
                    if val and os.path.exists(str(val).strip('"')):
                        return str(val).strip('"')
            except Exception:
                continue
    except Exception:
        pass
    return None


def find_from_where(exe_name: str) -> Optional[str]:
    if sys.platform != "win32":
        return None
    try:
        out = subprocess.check_output(["where", exe_name], text=True, stderr=subprocess.DEVNULL)
        for line in out.splitlines():
            line = line.strip().strip('"')
            if line and os.path.exists(line):
                return line
    except Exception:
        pass
    return None


def find_browser_executable() -> Optional[str]:
    env = os.environ.get("VIU_CHROME_PATH") or os.environ.get("VIU_BROWSER_PATH")
    if env and os.path.exists(env):
        return env

    candidates = []
    if sys.platform == "win32":
        for exe in ["chrome.exe", "msedge.exe"]:
            reg_path = find_from_windows_registry(exe)
            if reg_path:
                candidates.append(reg_path)
            where_path = find_from_where(exe)
            if where_path:
                candidates.append(where_path)

        pf = os.environ.get("ProgramFiles", r"C:\Program Files")
        pfx86 = os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")
        localapp = os.environ.get("LOCALAPPDATA", os.path.expanduser(r"~\AppData\Local"))
        candidates.extend([
            os.path.join(pf, "Google", "Chrome", "Application", "chrome.exe"),
            os.path.join(pfx86, "Google", "Chrome", "Application", "chrome.exe"),
            os.path.join(localapp, "Google", "Chrome", "Application", "chrome.exe"),
            os.path.join(pf, "Microsoft", "Edge", "Application", "msedge.exe"),
            os.path.join(pfx86, "Microsoft", "Edge", "Application", "msedge.exe"),
            os.path.join(localapp, "Microsoft", "Edge", "Application", "msedge.exe"),
        ])
    elif sys.platform == "darwin":
        candidates.extend([
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        ])
    else:
        candidates.extend([
            "/usr/bin/google-chrome",
            "/usr/bin/google-chrome-stable",
            "/usr/bin/microsoft-edge",
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser",
        ])

    for c in candidates:
        if os.path.exists(c):
            return c
    return None


def open_isolated_browser(provider: str) -> Dict[str, Any]:
    browser_exe = find_browser_executable()
    if not browser_exe:
        return {
            "ok": False,
            "status": "unavailable",
            "message": "Không tìm thấy Google Chrome hoặc Microsoft Edge trên máy. Vui lòng cài đặt Chrome hoặc Edge.",
        }

    target_url = "https://chatgpt.com/" if provider == "chatgpt" else "https://gemini.google.com/app"
    profile_dir = os.path.join(get_user_data_dir(), f"{provider}-browser-profile")
    os.makedirs(profile_dir, exist_ok=True)

    # Terminate existing if any
    old_proc = ACTIVE_PROCESSES.get(provider)
    if old_proc and old_proc.poll() is None:
        try:
            old_proc.terminate()
        except Exception:
            pass

    args = [
        browser_exe,
        f"--user-data-dir={profile_dir}",
        "--new-window",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-sync",
        "--disable-background-networking",
        "--disable-features=Translate,OptimizationHints",
        "--window-size=1280,800",
        target_url,
    ]

    proc = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    ACTIVE_PROCESSES[provider] = proc

    browser_name = "Microsoft Edge" if "edge" in browser_exe.lower() else "Google Chrome"
    return {
        "ok": True,
        "status": "started",
        "message": f"Đã mở cửa sổ {browser_name} riêng biệt để đăng nhập {provider.upper()}.",
        "profilePath": profile_dir,
        "browserName": browser_name,
    }


def find_email_in_profile(profile_dir: str) -> str:
    try:
        email_regex = re.compile(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+')
        pref_file = os.path.join(profile_dir, "Default", "Preferences")
        if os.path.exists(pref_file):
            try:
                with open(pref_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                accs = data.get("account_info", [])
                if accs and accs[0].get("email"):
                    return accs[0]["email"]
            except Exception:
                pass
            with open(pref_file, "rb") as f:
                raw = f.read(500000).decode("latin1", errors="ignore")
                matches = email_regex.findall(raw)
                for m in matches:
                    if not any(m.endswith(ext) for ext in [".png", ".jpg", ".js", ".css", ".google.com"]):
                        return m
    except Exception:
        pass
    return ""


def inspect_profile_on_disk(provider: str) -> Dict[str, Any]:
    profile_dir = os.path.join(get_user_data_dir(), f"{provider}-browser-profile")
    if not os.path.exists(profile_dir):
        return {"connected": False}

    pref_file = os.path.join(profile_dir, "Default", "Preferences")
    if os.path.exists(pref_file):
        try:
            with open(pref_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            accs = data.get("account_info", [])
            if accs and accs[0].get("email"):
                return {
                    "connected": True,
                    "email": accs[0]["email"],
                    "model": "3.5 Flash",
                    "plan": "Google",
                    "lastChecked": "disk"
                }
        except Exception:
            pass

    cookie_files = [
        os.path.join(profile_dir, "Default", "Network", "Cookies"),
        os.path.join(profile_dir, "Network", "Cookies"),
    ]
    for cf in cookie_files:
        if os.path.exists(cf):
            try:
                with open(cf, "rb") as f:
                    raw = f.read().decode("latin1", errors="ignore")
                if provider == "gemini" and ("__Secure-1PSID" in raw or "HSID" in raw or "SSID" in raw):
                    email = find_email_in_profile(profile_dir) or "Google Account"
                    return {
                        "connected": True,
                        "email": email,
                        "model": "3.5 Flash",
                        "lastChecked": "disk"
                    }
                # ONLY __Secure-next-auth.session-token and _puid are REAL auth cookies
                # oai-did, oai-sc, __cf_bm, __cflb, __oailb, g_state are NOT — they exist for ALL visitors
                elif provider == "chatgpt" and ("__Secure-next-auth.session-token" in raw or "_puid" in raw):
                    email = find_email_in_profile(profile_dir) or "ChatGPT Account"
                    return {
                        "connected": True,
                        "email": email,
                        "plan": "Plus/Free",
                        "lastChecked": "disk"
                    }
            except Exception:
                pass

    return {"connected": False}


def get_session_status(provider: str) -> Dict[str, Any]:
    disk_status = inspect_profile_on_disk(provider)
    proc = ACTIVE_PROCESSES.get(provider)
    disk_status["browserRunning"] = bool(proc and proc.poll() is None)
    if disk_status.get("connected"):
        return disk_status

    sessions_file = os.path.join(get_user_data_dir(), "ai-browser-sessions.json")
    saved = {}
    if os.path.exists(sessions_file):
        try:
            with open(sessions_file, "r", encoding="utf-8") as f:
                saved = json.load(f)
        except Exception:
            pass
    status = saved.get(provider, {"connected": False})
    status["browserRunning"] = bool(proc and proc.poll() is None)
    return status


def logout_session(provider: str) -> Dict[str, Any]:
    proc = ACTIVE_PROCESSES.get(provider)
    if proc and proc.poll() is None:
        try:
            proc.terminate()
        except Exception:
            pass
        ACTIVE_PROCESSES.pop(provider, None)

    profile_dir = os.path.join(get_user_data_dir(), f"{provider}-browser-profile")
    if os.path.exists(profile_dir):
        try:
            shutil.rmtree(profile_dir, ignore_errors=True)
        except Exception:
            pass

    sessions_file = os.path.join(get_user_data_dir(), "ai-browser-sessions.json")
    saved = {}
    if os.path.exists(sessions_file):
        try:
            with open(sessions_file, "r", encoding="utf-8") as f:
                saved = json.load(f)
        except Exception:
            pass
    saved[provider] = {"connected": False, "browserRunning": False}
    try:
        with open(sessions_file, "w", encoding="utf-8") as f:
            json.dump(saved, f, indent=2)
    except Exception:
        pass

    return {"ok": True, "message": f"Đã đăng xuất và xóa sạch dữ liệu phiên {provider.upper()}."}
