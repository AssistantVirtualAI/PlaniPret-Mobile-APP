#!/usr/bin/env python3
"""
Génère toutes les icônes Android mipmap depuis le logo iOS 1024x1024.
Usage: python3 scripts/gen_android_icons.py
"""
from PIL import Image
import os

SRC = "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"
RES = "android/app/src/main/res"

# Tailles standard Android mipmap
SIZES = {
    "mipmap-mdpi":    48,
    "mipmap-hdpi":    72,
    "mipmap-xhdpi":   96,
    "mipmap-xxhdpi":  144,
    "mipmap-xxxhdpi": 192,
}

def make_icon(src_path, out_path, size, round_corners=False):
    img = Image.open(src_path).convert("RGBA")
    img = img.resize((size, size), Image.LANCZOS)
    if round_corners:
        # Créer un masque circulaire pour ic_launcher_round
        from PIL import ImageDraw
        mask = Image.new("L", (size, size), 0)
        draw = ImageDraw.Draw(mask)
        draw.ellipse((0, 0, size - 1, size - 1), fill=255)
        result = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        result.paste(img, mask=mask)
        img = result
    img.save(out_path, "PNG")
    print(f"  ✓ {out_path} ({size}x{size})")

def main():
    if not os.path.exists(SRC):
        print(f"[ERROR] Source introuvable : {SRC}")
        return

    print(f"Source : {SRC}")
    for folder, size in SIZES.items():
        dir_path = os.path.join(RES, folder)
        os.makedirs(dir_path, exist_ok=True)

        # ic_launcher.png (carré)
        make_icon(SRC, os.path.join(dir_path, "ic_launcher.png"), size, round_corners=False)
        # ic_launcher_round.png (cercle)
        make_icon(SRC, os.path.join(dir_path, "ic_launcher_round.png"), size, round_corners=True)
        # ic_launcher_foreground.png (même que carré, pour adaptive icon)
        make_icon(SRC, os.path.join(dir_path, "ic_launcher_foreground.png"), size, round_corners=False)

    print("\n✅ Toutes les icônes Android générées avec succès.")

if __name__ == "__main__":
    main()
