from pathlib import Path
import re
path = Path(r"D:\all_my_project\viu-auto-studio\viu-auto-studio\desktop\src\pages\settings-page.tsx")
lines = path.read_text(encoding="utf-8").splitlines()
for start, end, name in [(880, 1172, "quick-edit"), (1173, 1629, "content"), (1629, 1958, "voice"), (1959, 2118, "connections")]:
    text = "\n".join(lines[start-1:end])
    opens = len(re.findall(r"<div(?:\s|>)", text))
    closes = text.count("</div>")
    print(name, opens, closes, opens - closes)
