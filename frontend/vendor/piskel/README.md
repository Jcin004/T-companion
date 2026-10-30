# Piskel connected fill source

Copyright 2017 Julian Descottes and Piskel contributors. Apache-2.0; full text in LICENSE.

Repository: https://github.com/piskelapp/piskel
Commit: d828941fa9fe76464d69d91d5fd862067c98c02c
Original file: src/js/utils/PixelUtils.js
Git blob: 7aa852d1bcc7628c0b7eedba510ff146f62ab782
SHA-256: c5b6a68f505ca062b3139b7f706f108632161e9573ba6edeb5aadb7ce4f9972b

connected-fill.inc retains only the two reviewed methods as a byte-for-byte excerpt; LICENSE is unchanged. PROVENANCE.json records the original blob, source line range and excerpt digest. The full review copy remains outside the product. No artwork is imported.
scripts/build-pixel-tools.mjs verifies the digest and generates an external ES-module wrapper containing only paintSimilarConnectedPixelsFromFrame and visitConnectedPixels. The private pskl namespace replaces the upstream application namespace; the functions remain unchanged. Other methods, including the separately cited line algorithms, are not imported or distributed. No jQuery, editor controllers or upstream runtime dependency is installed.

frontend/pixel-paint.js supplies the bounded integer Frame adapter. It owns grid snapping, brush units, cancellation and undo; only connected fill comes from Piskel. The original upstream application does not supply the mobile UI or our SQLite persistence. This README is T-companion's provenance record, not an upstream file.
