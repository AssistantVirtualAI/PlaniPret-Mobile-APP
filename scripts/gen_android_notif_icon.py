#!/usr/bin/env python3
"""
Génère ic_stat_planipret.png (icône notification Android) en blanc sur fond transparent.
Les icônes de notification Android doivent être monochromes blanches.
"""
from PIL import Image, ImageDraw
import os

SRC = "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"
RES = "android/app/src/main/res"

# Tailles notification Android (drawable-*dpi)
NOTIF_SIZES = {
    "drawable-mdpi":    24,
    "drawable-hdpi":    36,
    "drawable-xhdpi":   48,
    "drawable-xxhdpi":  72,
    "drawable-xxxhdpi": 96,
}

def make_notif_icon(src_path, out_path, size):
    """Crée une icône notification blanche sur fond transparent."""
    img = Image.open(src_path).convert("RGBA")
    img = img.resize((size, size), Image.LANCZOS)

    # Convertir en blanc monochrome sur fond transparent
    result = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    pixels = img.load()
    result_pixels = result.load()
    for y in range(size):
        for x in range(size):
            r, g, b, a = pixels[x, y]
            if a > 30:  # pixel non-transparent → blanc
                result_pixels[x, y] = (255, 255, 255, a)
            else:
                result_pixels[x, y] = (0, 0, 0, 0)

    result.save(out_path, "PNG")
    print(f"  ✓ {out_path} ({size}x{size})")

def main():
    if not os.path.exists(SRC):
        print(f"[ERROR] Source introuvable : {SRC}")
        return

    print(f"Source : {SRC}")
    for folder, size in NOTIF_SIZES.items():
        dir_path = os.path.join(RES, folder)
        os.makedirs(dir_path, exist_ok=True)
        make_notif_icon(SRC, os.path.join(dir_path, "ic_stat_planipret.png"), size)

    print("\n✅ Icônes notification Android générées avec succès.")

if __name__ == "__main__":
    main()
