# Third-party code and reference audit

Checked on 2026-10-16. T- application code in this distribution is licensed under
AGPL-3.0-only; third-party components retain their own licenses. User-created
identities, avatars, messages and credentials are data, not licensed by this notice.

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
