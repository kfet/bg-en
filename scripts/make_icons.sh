#!/usr/bin/env bash
# Regenerate app icons from a single SVG master.
#
# Produces, in public/icons/:
#   icon-192.png          192x192  purpose "any"          (transparent corners OK; OS masks)
#   icon-512.png          512x512  purpose "any"
#   icon-512-maskable.png 512x512  purpose "maskable"     (content inside central safe zone)
#   apple-touch-icon.png  180x180  iOS home screen        (fully opaque, no transparency)
#
# Requirements: rsvg-convert, ImageMagick (magick). macOS: `brew install librsvg imagemagick`.
#
# The icons are drawn full-bleed (no baked-in rounded corners) so iOS/Android can
# apply their own mask cleanly. The maskable variant shrinks the glyphs into the
# central ~78% safe zone required by Android adaptive icons.
set -euo pipefail

cd "$(dirname "$0")/.."
OUT=public/icons
mkdir -p "$OUT"

FONT="Helvetica Neue, Arial, sans-serif"

# Shared content block: БГ ↔ АН on a 1024x1024 canvas, white on transparent.
# $1 = scale factor about the centre (1.0 full-bleed, <1 pulls into safe zone)
content() {
  local s="$1"
  cat <<SVG
  <g transform="translate(512,512) scale(${s}) translate(-512,-512)">
    <text x="512" y="412" text-anchor="middle"
          font-family="${FONT}" font-weight="700" font-size="300"
          letter-spacing="6" fill="#ffffff">БГ</text>
    <!-- double-headed arrow, weight matched to the glyphs -->
    <g stroke="#ffffff" stroke-width="30" stroke-linecap="round"
       stroke-linejoin="round" fill="none">
      <line x1="420" y1="512" x2="604" y2="512"/>
      <polyline points="452,478 416,512 452,546"/>
      <polyline points="572,478 608,512 572,546"/>
    </g>
    <text x="512" y="838" text-anchor="middle"
          font-family="${FONT}" font-weight="700" font-size="300"
          letter-spacing="6" fill="#ffffff">АН</text>
  </g>
SVG
}

# $1 = output svg path, $2 = content scale, $3 = "opaque"|"transparent"
make_svg() {
  local path="$1" scale="$2" mode="$3"
  {
    echo '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">'
    echo '  <defs>'
    echo '    <linearGradient id="bg" x1="0" y1="0" x2="1024" y2="1024" gradientUnits="userSpaceOnUse">'
    echo '      <stop offset="0" stop-color="#1e88e5"/>'
    echo '      <stop offset="1" stop-color="#0d47a1"/>'
    echo '    </linearGradient>'
    echo '  </defs>'
    # Full-bleed background — fills the whole square, no rounded corners.
    echo '  <rect x="0" y="0" width="1024" height="1024" fill="url(#bg)"/>'
    content "$scale"
    echo '</svg>'
  } > "$path"
}

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

make_svg "$TMP/full.svg"     1.00 opaque
make_svg "$TMP/maskable.svg" 0.78 opaque

# Keep the full-bleed master in the repo for future edits.
cp "$TMP/full.svg" "$OUT/icon.svg"

rsvg-convert -w 192 -h 192 "$TMP/full.svg"     -o "$OUT/icon-192.png"
rsvg-convert -w 512 -h 512 "$TMP/full.svg"     -o "$OUT/icon-512.png"
rsvg-convert -w 512 -h 512 "$TMP/maskable.svg" -o "$OUT/icon-512-maskable.png"

# Apple touch icon: 180x180, flattened onto an opaque blue so iOS never shows
# black behind any transparency.
rsvg-convert -w 180 -h 180 "$TMP/full.svg" -o "$TMP/apple.png"
magick "$TMP/apple.png" -background "#1565c0" -flatten "$OUT/apple-touch-icon.png"

echo "Wrote:"
ls -la "$OUT"/*.png "$OUT"/icon.svg
