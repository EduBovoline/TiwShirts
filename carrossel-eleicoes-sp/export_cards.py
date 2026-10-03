import os
import subprocess
import re
from PIL import Image

chrome = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
base_dir = r"c:\Antigravity projects\TiwShirts\TiwShirts-git\carrossel-eleicoes-sp"
index_file = os.path.join(base_dir, "index.html")

with open(index_file, "r", encoding="utf-8") as f:
    full_html = f.read()

head_part = full_html.split("</head>")[0] + "</head><body>"

# Regex para pegar o bloco de cada card
cards = re.findall(r'(<div class="card-canvas" id="card-\d+">[\s\S]*?</div>\s*</div>)', full_html)
print(f"Total de cards identificados: {len(cards)}")

for i, card_html in enumerate(cards, start=1):
    temp_html = os.path.join(base_dir, f"temp_card_{i}.html")
    out_png = os.path.join(base_dir, f"card_{i}_carrossel_tiwshirts.png")

    page_content = f"""<!DOCTYPE html>
<html lang="pt-BR">
{head_part}
<style>
  body {{ margin: 0; padding: 0; background: transparent; overflow: hidden; }}
  .card-canvas {{ border: none; box-shadow: none; margin: 0; }}
</style>
{card_html}
</body>
</html>"""

    with open(temp_html, "w", encoding="utf-8") as tf:
        tf.write(page_content)

    cmd = [
        chrome,
        "--headless",
        "--disable-gpu",
        "--window-size=1080,1350",
        "--hide-scrollbars",
        f"--screenshot={out_png}",
        temp_html
    ]
    subprocess.run(cmd, check=True)

    if os.path.exists(out_png):
        img = Image.open(out_png)
        if img.size != (1080, 1350):
            img = img.crop((0, 0, 1080, 1350))
            img.save(out_png, "PNG")
        print(f"Card {i} exportado: {out_png} ({img.size})")

    if os.path.exists(temp_html):
        os.remove(temp_html)

print("Exportação de todos os cards concluída!")
