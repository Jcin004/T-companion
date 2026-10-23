# Third-party code and reference audit

## 0.14.0 world presentation references

`config/world-presentation-sources.json` records pinned SullyOS and float files inspected for expression portraits, skin sets and story parsing. These are design references only; no new third-party code or art is copied. SullyOS Source-Available License 1.0 is not an AGPL permission to redistribute its implementation. T-companion independently implements its own small interfaces and reuses its existing runtime modules and artwork. User-provided watermarked sprite examples are not bundled.

Checked on 2026-10-16. T- application code in this distribution is licensed under
AGPL-3.0-only; third-party components retain their own licenses. User-created
identities, avatars, messages and credentials are data, not licensed by this notice.

## Optional Ombre-Brain runtime integration (2026-10-20)

- External source: `Jcin004/Ombre-Brain` at `115d831d979bf67efc7150f976e2cb34c333c935`, MIT. Source and license fingerprints are in `config/memory-sources.json`; the repository's `AUTHORS.md` retains contributor attribution.
- `backend/ob_gateway.py` calls the unmodified external `BucketManager` and `SurfacePolicyVM` in a separate optional process. No OB implementation, artwork, persona, vault or service credential is bundled here. `frontend/external-memory*.js`, the gateway and transport adapter are original integration code.
- OB remains externally installed with its LICENSE. No copied vendor files or modifications to list. The existing phone-local implementation stays available. Scope, exact behavior and acceptance evidence: `docs/OB_MEMORY_GATEWAY.md`.

## AI Virtual Phone / float: reused SSE parser

- Fork: https://github.com/Jcin004/float
- Upstream: https://github.com/xiaolongbao0709/ai-virtual-phone
- Inspected revision: `c1b0ea74d7690beae31bc7c9e2a8c382fa4b151b` (2026-09-26).
- Original file: `lib/sse-json.ts`, Git blob `e9321336ed3ca9ec46aff65fd54cd486c5108937`.
- Contributor recorded by that file's latest commit: `yechen1844`.
- Local derivative: `frontend/sse-json.js`.
- Changes by T- on 2026-10-15: removed TypeScript annotations for browser ES modules;
  retained parser behavior; added source/license/change notices and regression tests.
- License basis: this revision's `LICENSE` is GNU AGPL v3 and `NOTICE` explicitly
  identifies the implementation as **AGPL-3.0-only**. The source file has no separate
  restrictive header or asset dependency. A copy of the license is in `LICENSE`.
- Conditions implemented: attribution, prominent modification notice, license copy,
  corresponding source and build instructions. Settings offers the running backend's
  source archive. APK distribution must include its matching source archive.

### README / license discrepancy

The same revision's README requests that code and ideas not be reused in other
virtual-phone projects, whereas LICENSE and NOTICE explicitly license implementation
under AGPL-3.0-only. These statements are recorded as inconsistent; the README is
not silently treated as an additional license term or a blanket ban on every file.
The selected standalone code file is reused on the explicit AGPL grant and the
user's instruction to comply with it. No claim of endorsement is made.

The upstream NOTICE separately excludes purchased sticker artwork and Nucleo glass
icons from its AGPL grant and lists distinct font terms. T- copies **none** of those
assets, fonts, 3D models, character settings, service URLs, accounts or keys. The
AGPL code assessment does not authorize separately licensed assets. Other float
files remain candidates requiring their own provenance and license checks.

## Capacitor 7.6.9

`@capacitor/core`, `@capacitor/android` and development-only `@capacitor/cli`:
https://github.com/ionic-team/capacitor — MIT.

Copyright (c) 2017-present Drifty Co.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

The Android project starts from Capacitor's MIT template. Modified files include
MainActivity, the manifest, styles, launcher icon, network configuration, version
and Gradle wrapper download settings. TDevicePlugin is T-'s own thin adapter to
Android speech and file sharing. No float Android shell code is copied.

## Android runtime dependencies

AndroidX activity 1.9.2, appcompat 1.7.0, coordinatorlayout 1.2.0, core 1.15.0,
fragment 1.8.4, webkit 1.12.1, core-splashscreen 1.0.1: Apache-2.0.
Apache Cordova framework 10.1.1: Apache-2.0. Kotlin stdlib transitive dependencies:
Apache-2.0. License text is bundled in `frontend/licenses/Apache-2.0.txt`.
Gradle 8.11.1 and Android Gradle Plugin 8.7.2 are build tools, not app services.

## Existing Python stack and development tools

FastAPI (MIT), httpx (BSD-3-Clause), OpenAI Python SDK (Apache-2.0), Pydantic and
pydantic-settings (MIT), PyYAML (MIT), uvicorn (BSD-3-Clause), pytest (MIT),
tzdata (Apache-2.0 / IANA public-domain timezone data). Exact installed Python
versions and metadata are recorded in `backend/requirements-lock.txt` and
`docs/python-dependencies.json`. Playwright 1.58.2 is an Apache-2.0 development
dependency, not included in the APK. JavaScript dependency versions and integrity
hashes are in `package-lock.json`.

## References inspected but not copied

| Source | License/source finding | Decision for this milestone |
|---|---|---|
| Jcin004/SullyOS, upstream qegj567-cloud/SullyOS; fork HEAD `7be010ff880e797ff0723472931ccdc539c5125b` | SullyOS Source-Available License 1.0; README distinguishes learning, modification and redistribution | General behavior/reference only; no code, art, settings or online services copied. Extra authorization is required before importing restricted files. |
| Jcin004/AionsHome | Root MIT, copyright 2026 death34018-hue; local inspected HEAD `333ce409f6c3c9b4b049ae8206abcb6899aeffa6` | No module is needed for text-chat milestones; no code copied. Recheck per-file and upstream conditions before future imports. |
| Jcin004/Ombre-Brain | Root MIT, copyright 2026 P0lar1zzZ | Memory integration deferred; no code copied. |
| Jcin004/WrenWen | Architecture documentation, not a deployable runtime; root LICENSE fetch did not establish a reusable code license | Documentation reference only; no text copied and no runtime imported. |
| Jcin004/ai-phone-agent-computer | Root LICENSE fetch did not establish a redistribution grant for a selected file | No code copied; revisit only if a concrete needed module is identified. |
| DasterProkio/awesome-ai-companion | Current directory CC BY 4.0; versions before 2026-10-12 were CC0 1.0 | Discovery only; no catalog prose or artwork copied. Listed projects retain their own licenses. |

Sources: each repository's LICENSE/NOTICE/README at the inspected revision.
Public visibility, fork ownership, personal use and free redistribution are not
substitutes for the selected file's license.

## 0.6.1: additional implementation reuse

### AI Virtual Phone / float: model JSON wrapper helpers (AGPL-3.0-only)

- Source: `Jcin004/float`, revision `c1b0ea74d7690beae31bc7c9e2a8c382fa4b151b`.
- File: `lib/checkphone-json-repair.ts`; blob `fa64ad54e118b1a5d4fde3fc22ae21fe0e7dfdfb`.
- Contributor recorded for that file: `xiaolongbao0709`, last file commit `5ab8c6b`.
- Local derivative: `frontend/model-json.js` imports and adapts `stripJsonWrapperNoise` and `extractJSONObjectCandidate`. Remaining orchestration and completion guard are T- additions.
- Changes on 2026-10-16: remove TypeScript, remove wrappers only outside the JSON payload, parse raw JSON first, preserve quotes/punctuation/tags inside values, omit global typography replacement, use pinned jsonrepair recovery after completion checks. Source evidence validation still runs after parsing.
- File has no separate restrictive header or artwork dependency. LICENSE/NOTICE establish AGPL-3.0-only; the README discrepancy documented above still applies. No unrelated prompt sets, personal data or assets copied.

### Serein: weighted lexical retrieval port (MIT)

- Repository: https://github.com/Yinglianchun/Serein
- Revision: `180c94a54feb28283aa8af15a4f49a129aa8b397`.
- Source: `src/serein/recall/germany/memory_recall/fact_event_lexical_shadow.py`, blob `fe6ddaf327249129b55a079cbf4caffd69e30c08`.
- Copyright: 2026 ChiYouyu. Latest file contributor: `Yinglianchun`, file commit `5816c6e`.
- Local derivative: `frontend/memory-lexical.js`; ported `_document_terms` field-weighted frequency construction and `search` BM25 scoring, specificity filtering and matched-term metadata to JavaScript.
- Changes on 2026-10-16: no SQLite service or jieba dependency; rebuildable in-memory postings; Chinese bigrams and Latin words; title/body/source-quote fields; small personal corpora are exempt from the large-corpus common-term gate; owner isolation and material-budget selection remain T- rules. No semantic/vector reranker is claimed.
- The selected Python file has no additional header restriction and no assets or persona defaults. Full root MIT text is retained in `frontend/licenses/Serein-MIT.txt`. The overall T- application remains AGPL-3.0-only; this derivative retains its MIT notice.
- Ombre-Brain `115d831d979bf67efc7150f976e2cb34c333c935`, `src/bm25_index.py`, was also inspected. Its Python rank_bm25/jieba facade requires external runtime dependencies; no code from it is imported in this release.

### jsonrepair 3.15.0 (ISC)

- https://github.com/josdejong/jsonrepair — copyright 2020–2026 Jos de Jong.
- Exact npm dependency and integrity are pinned in package-lock.json. Three regular/browser ESM files are vendored verbatim under `frontend/vendor/jsonrepair/`; no streaming/Node modules or CDN requests are included in the APK.
- `scripts/vendor-jsonrepair.mjs` reproduces the vendored files from the pinned package. SHA-256 digests are in `frontend/vendor/jsonrepair/provenance.json`; tests compare both installed originals and digests.
- Full ISC license is bundled as `frontend/vendor/jsonrepair/LICENSE.md`. Files are unmodified; wrapper handling and source-proof rules live outside the library.
# 0.3.0 本地客户端补充

本次桌面壁纸、图标排版、客户端业务与 Android 桥接代码由 T- 项目自行实现。未复制 float / SullyOS 的美术、字体、桌面实现或私人配置。原 float SSE 衍生文件及授权冲突记录继续适用。系统 SQLite、Keystore、HttpURLConnection 和 IndexedDB 通过平台 API 调用，无新增第三方源码搬入。具体版本、接口与迁移说明见 `docs/LOCAL-ANDROID.md`。

## 0.7.1 update-channel reference and authorization record

The user confirmed on 2026-10-17 that the official SullyOS community announcement and author consent permit their personal noncommercial modification. This is recorded as user-provided authorization evidence, not as a replacement MIT/AGPL grant. Community evidence remains local. This milestone references the configurable HTTPS manifest approach in `utils/androidAppUpdate.ts` at `da33732253fbf3174bf068a237375155a8d1a846`; no SullyOS source, art, character material, private settings or hosted services are imported. Existing TUpdate download/verification/install code is retained rather than adding another implementation or native plugin. See `docs/UPDATE_CHANNEL.md`. Earlier reference-only assessments describe their original milestones.


## 0.8.0: Serein recall-cue adaptation (MIT)

- Repository: https://github.com/Yinglianchun/Serein, revision `180c94a54feb28283aa8af15a4f49a129aa8b397`.
- File: `src/serein/recall/germany/memory_recall/retrieval_budget.py`, blob `72838be2e3c8ae3f994bacb6c5b6afc066f67046`; last file contributor `Yinglianchun`, file commit `5816c6e`.
- Copyright 2026 ChiYouyu; root MIT text is retained in `frontend/licenses/Serein-MIT.txt`. The source file has no additional license restriction. Germany PROVENANCE.md identifies an earlier Ombre-Brain lineage and the reviewed-neighbor design; no private defaults or deployment discovery are used.
- Local derivative: `frontend/recall-cues.js`, ports the generic REFERENCE_MARKERS, CONTINUATION_MARKERS and `_contains_any` longest-marker filtering to JavaScript. Local changes add a short-followup bound, common greeting exclusion and follow-up openings. No identity terms, persona defaults, planner/LLM endpoint or Python service is copied.
- Existing `frontend/memory-lexical.js` Serein BM25 port remains the lexical engine. T-companion owns the evidence checks, same-owner one-hop traversal, anchor confirmation, exact material budget, receipt projection and UI; this is not an import of Serein's whole recall pipeline or SullyOS source. No new runtime dependency or embedding/rerank network call.

## 0.10.0: Android embedded OB core (MIT)

- Ombre-Brain, https://github.com/Jcin004/Ombre-Brain at `115d831d979bf67efc7150f976e2cb34c333c935`; copyright 2026 P0lar1zzZ, MIT. Exact files, Git blob IDs and SHA256s are recorded in `vendor/python/ombre/PROVENANCE.json`; full license is adjacent. Imported files are unchanged; this is the BucketManager/storage/retrieval/policy dependency closure, not the server, persona, assets, credentials or a user vault.
- RapidFuzz 3.14.1, Max Bachmann and contributors, MIT. Pure Python implementation imported verbatim from the pinned, checksum-verified PyPI wheel; no platform extension. Package/file digests and complete license: `vendor/rapidfuzz-distribution/`.
- jieba 0.42.1, copyright 2013 Sun Junyi, MIT. Segmentation core, dictionary and Python finalseg tables, unchanged. Fixed upstream commit `1e20c89b66f56c9301b0feed211733ffaa1bd72a`; each selected file verified against it. Source/archive/file provenance and full license: `vendor/jieba-distribution/`. Optional Paddle/POS/analysis/Java-pickle modules are not used.
- Chaquopy 17.1.0 (MIT), CPython 3.12 (PSF), python-frontmatter 1.1.0 (MIT), rank-bm25 0.2.2 (Apache-2.0), PyYAML 6.0.3 (MIT), NumPy 1.26.2 (BSD and bundled notices), tzdata 2025.2 (Apache-2.0 / upstream timezone notices), and packaged numerical/runtime libraries retain license texts in `vendor/runtime-licenses/`. Its manifest records actual build package versions and license digests. Full texts are also displayed in the app legal page.
- Adaptation is outside vendor files: `t_memory.py`, `TMemoryPlugin.java`, `frontend/embedded-memory*.js`. SQLite remains authoritative; OB files are disposable projections. The adapter canonicalizes Android paths, uses original event dates for ranking, waits for the upstream BM25 rebuild, and selects RapidFuzz's supported Python implementation. Existing T domain evidence/owner/graph/budget rules remain. No OB model client, MCP server, embedding network call, dream/autonomous task or private material is imported.
- Earlier reference-only statements describe previous releases. Android now executes this original Python core; browser retains the earlier Serein port and optional gateway evaluation. The complete application remains AGPL-3.0-only.
# Alicization Town grid pathfinding (2026-10-21)

Imported from [Jcin004/Alicization-Town](https://github.com/Jcin004/Alicization-Town), upstream [ceresOPA/Alicization-Town](https://github.com/ceresOPA/Alicization-Town), commit `1a33ba65d0af2134b369b1eb4eb68f45d2c817c4`. Source: `server/src/engine/pathfinding.js`, last author Northseadl, change `aeb1cb733d9fd6670e8d2deca6c59f762ee15a61`, blob `0254cab9ccf7e11769336839b0d040ffe4fdb1d1`.

Exact source and root license are retained in `frontend/vendor/alicization-town/`; per-file hashes are in `provenance.json`. `frontend/world-pathfinding.js` changes only the CommonJS export to ESM and adds a provenance comment. The A* heap, traversal and nearest-walkable algorithm are unchanged. No Node dependencies. We use the root AGPL-3.0-or-later grant (version 3 for this combined AGPL-3.0-only application); README/package MIT labels conflict and are not used to relicense the engine.

Canvas rendering, room geometry, command/observation persistence and UI are original T-companion code. No upstream character, AI, model, memory, authentication, analytics, network service or art is imported. The private room screenshot is a local style reference only. InternalBeyond code/art is not imported; its file review and noncommercial license scope are recorded in `docs/MINIMAL_PIXEL_WORLD.md`.
# Resident activity and headless runtime (0.12.0)

- Alicization Town at `1a33ba65d0af2134b369b1eb4eb68f45d2c817c4`: `server/src/engine/action-lock.js` (ceresOPA, blob `8c5e3277f79a56d61d9f3f9838cac00fa253f1e5`) adapted only from CommonJS to ESM in `frontend/resident-lock.js`. `AiScheduler.gatherContext` neighborhood loop from `server/src/ai/scheduler/ai-scheduler.js` (CeresOPA, blob `71a8f17334f3593e5b3a4a165feda47032873360`) is adapted in `frontend/resident-perception.js`: pure roster/position inputs, include other NPCs, range three, remove engine and separate memory dependencies. Verbatim originals, root AGPL-3.0-or-later grant and hashes are in `frontend/vendor/alicization-town-life/`. The combined application uses AGPL version 3. No upstream NPC identity, model setup, SQLite memory, heartbeat, public server or fallback fabricated dialogue is imported.
- QuickJS Java `app.cash.quickjs:quickjs-android:0.9.2`, CashApp/Square, Apache-2.0; embedded QuickJS engine by Fabrice Bellard and Charlie Gordon, MIT. Maven artifact and source-jar fingerprints are in `config/resident-runtime-sources.json`; dependency is unchanged. Exact native source commit is not asserted from the artifact POM. Full licenses are `frontend/licenses/QuickJS-Java-Apache-2.0.txt` and `frontend/licenses/QuickJS-MIT.txt`. QuickJS executes only the APK-bundled T domain rules; no remotely downloaded scripts or model output is evaluated as code.
- AndroidX WorkManager `androidx.work:work-runtime:2.10.1`, Android Open Source Project, Apache-2.0 (full text in `frontend/licenses/Apache-2.0.txt`). Used for network/battery constrained finite periodic work, no hidden WebView. Runtime limitations and host adapter responsibilities are documented in `docs/RESIDENT_LIFE.md`.
- esbuild `0.25.12`, Evan Wallace and contributors, MIT, pinned build dependency only. License: `frontend/licenses/esbuild-MIT.txt`. It bundles the same project JS rules into a local IIFE for native QuickJS; it is not an Android Node runtime.

# Original world artwork and visual adaptation (0.13.0)

0.13.1 revises only the project's original `residents.png` through the same built-in image_gen tool to use standing/contact/standing/opposite-contact frames. The replacement and predecessor hashes and revised brief are recorded in the existing asset manifest. The other three production images retain their original bytes and provenance.

- `frontend/assets/world/`: four original production PNGs generated for this project with the built-in image_gen tool from text briefs, after approval of the visual direction. File hashes, dimensions, briefs and distribution license are recorded in `PROVENANCE.json`. No stock assets, upstream game artwork, private screenshot, real chat or user identity is bundled. These replaceable example appearances do not define roster Canon/Persona.
- Existing Alicization Town imports above remain unchanged. `server/web/js/game.js` at the same pinned `1a33ba65d0af2134b369b1eb4eb68f45d2c817c4` was additionally reviewed for step animation (533–545) and facing/frame selection (875–883). The local renderer uses its own elapsed-time path animation and a different, generated atlas layout; the whole upstream page and art are not copied. No new third-party engine or runtime dependency.

## Android updater comparison (2026-10-23)

Reviewed qegj567-cloud/SullyOS `utils/androidAppUpdate.ts`, last modifying commit `4ed3c293af89acf89762a892e72e811017c1b9dc`, blob `15e88dabcb2e5bd36f3d56460eb1aba978b14ff9`, author qegj567-cloud / project copyright NMJ. The file uses Capacitor core and Filesystem; its repository license remains SullyOS Source-Available License 1.0. The previously recorded personal noncommercial authorization does not grant public redistribution. T- reuses its existing Java transport/verifier/installer and independently implements shared UI state and Range resume. No SullyOS source file, dependency, private configuration or hosted service is imported. Direct-manifest and page-independent task behavior are design references; see `docs/UPDATE_CHANNEL.md`.
