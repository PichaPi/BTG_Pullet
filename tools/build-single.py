"""รวม index.html + css + js เป็นไฟล์ HTML ไฟล์เดียว (dist/pullet-age-tracker.html)

ใช้สำหรับเผยแพร่เป็น Artifact บน claude.ai หรือแนบส่งต่อ
รัน: python3 tools/build-single.py
"""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
html = (ROOT / "index.html").read_text(encoding="utf-8")

html = html.replace(
    '<link rel="stylesheet" href="css/styles.css">',
    "<style>\n" + (ROOT / "css/styles.css").read_text(encoding="utf-8") + "</style>",
)


def inline_js(m):
    src = m.group(1)
    code = (ROOT / src).read_text(encoding="utf-8").replace("</script", "<\\/script")
    return "<script>\n" + code + "</script>"


html = re.sub(r'<script src="(js/[^"]+)"></script>', inline_js, html)

out = ROOT / "dist" / "pullet-age-tracker.html"
out.parent.mkdir(exist_ok=True)
out.write_text(html, encoding="utf-8")
print("wrote", out)
