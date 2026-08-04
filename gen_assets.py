#!/usr/bin/env python3
"""Génère toutes les tailles AppIcon iOS et le splash 2732x2732 depuis les sources."""

from PIL import Image
import os

DEST_ICON = "ios/App/App/Assets.xcassets/AppIcon.appiconset"
DEST_SPLASH = "ios/App/App/Assets.xcassets/Splash.imageset"

# Tailles AppIcon iOS (nom_fichier: taille_px)
ICON_SIZES = {
    "AppIcon-20@2x.png":      40,
    "AppIcon-20@3x.png":      60,
    "AppIcon-29@2x.png":      58,
    "AppIcon-29@3x.png":      87,
    "AppIcon-40@2x.png":      80,
    "AppIcon-40@3x.png":      120,
    "AppIcon-512@2x.png":     1024,
    "AppIcon-60@2x.png":      120,
    "AppIcon-60@3x.png":      180,
    "AppIcon-76.png":         76,
    "AppIcon-76@2x.png":      152,
    "AppIcon-83.5@2x.png":    167,
    "AppIcon-ipad-20@1x.png": 20,
    "AppIcon-ipad-20@2x.png": 40,
    "AppIcon-ipad-29@1x.png": 29,
    "AppIcon-ipad-29@2x.png": 58,
    "AppIcon-ipad-40@1x.png": 40,
    "AppIcon-ipad-40@2x.png": 80,
}

# Charger l'icône source (PNG 512x512)
icon_src = Image.open("appicon_source.png").convert("RGBA")
print(f"Source icône : {icon_src.size}")

for filename, size in ICON_SIZES.items():
    out_path = os.path.join(DEST_ICON, filename)
    resized = icon_src.resize((size, size), Image.LANCZOS)
    resized.save(out_path, "PNG", optimize=True)
    print(f"  ✓ {filename} ({size}×{size}px, {os.path.getsize(out_path)} bytes)")

# Charger le splash source (WebP robot AVA)
splash_src = Image.open("splash_source.webp").convert("RGBA")
print(f"\nSource splash : {splash_src.size}")

# Créer un canvas 2732×2732 fond noir avec le robot centré
SPLASH_SIZE = 2732
canvas = Image.new("RGBA", (SPLASH_SIZE, SPLASH_SIZE), (5, 10, 30, 255))  # fond bleu très foncé

# Redimensionner le robot pour qu'il occupe ~80% de la hauteur
robot_h = int(SPLASH_SIZE * 0.80)
robot_w = int(splash_src.width * robot_h / splash_src.height)
robot = splash_src.resize((robot_w, robot_h), Image.LANCZOS)

# Centrer
x = (SPLASH_SIZE - robot_w) // 2
y = (SPLASH_SIZE - robot_h) // 2
canvas.paste(robot, (x, y), robot)

# Sauvegarder les 3 variantes (même image)
for fname in ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"]:
    out_path = os.path.join(DEST_SPLASH, fname)
    canvas.convert("RGB").save(out_path, "PNG", optimize=True)
    print(f"  ✓ {fname} ({os.path.getsize(out_path)} bytes)")

print("\n✅ Tous les assets générés avec succès.")
