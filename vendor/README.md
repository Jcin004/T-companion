# Android Python dependencies

These are runtime components, not frontend modules. `android/app/build.gradle`
adds `vendor/python` to the APK's Python source set. No Python dependency is
copied into the browser distribution. This language-specific vendor directory
is the Python equivalent of the existing `frontend/vendor` convention.

- `python/ombre`: unchanged dependency closure of Ombre-Brain at
  `115d831d979bf67efc7150f976e2cb34c333c935`, MIT, copyright 2026 P0lar1zzZ.
  `PROVENANCE.json` records upstream path, SHA256 and Git blob for each file.
  Its `VERSION` file is retained because its original package initializer reads it.
  No server, MCP entrypoint, config, credentials, user vault, persona or artwork.
- `python/rapidfuzz`: unchanged pure Python implementation from RapidFuzz 3.14.1.
  The exact wheel, its SHA256, file digests and MIT license are recorded in
  `rapidfuzz-distribution`. No Windows/Android extension is copied. The adapter
  selects the upstream Python implementation through its supported environment
  variable, rather than rewriting fuzzy matching.
- `python/jieba`: unchanged 0.42.1 segmentation core, dictionary and finalseg
  Python probability tables; no unused Paddle model, analysis or POS modules.
  `jieba-distribution` retains MIT attribution, upstream release, source archive
  digest, build wheel digest and each selected file's digest. Android uses its
  normal CPython path; Java/pickle model loading is not used.
- `runtime-licenses`: license texts from the pinned Android runtime packages,
  plus Chaquopy and CPython. The manifest lists package versions and text digests.
  Runtime dependencies are installed at build time by Chaquopy, not downloaded
  on the phone. Numerical libraries retain their upstream bundled notices.

Our adaptations are outside vendor code: `android/app/src/main/python/t_memory.py`,
`TMemoryPlugin.java` and `frontend/embedded-memory*.js`. The application remains
AGPL-3.0-only; permissive third-party notices stay intact.
