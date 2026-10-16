"""Bundle readable license notices for both the website and offline APK."""
from html import escape
from pathlib import Path

root = Path(__file__).resolve().parents[1]
text = '\n\n'.join((root / name).read_text(encoding='utf-8-sig') for name in ('THIRD_PARTY_NOTICES.md','LICENSE'))
page = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>T- · 许可与来源</title><style>body{font:15px/1.7 system-ui;max-width:900px;margin:30px auto;padding:20px}pre{white-space:pre-wrap;overflow-wrap:anywhere}a{color:#337c70}</style><a href="javascript:history.back()">← 返回</a><h1>T- · 许可与来源</h1><p>软件按现状提供，不附带任何保证。你可以按 AGPL-3.0-only 条款修改及再分发应用代码。对应源码可在应用设置中导出。</p><pre>'+escape(text)+'</pre></html>'
(root / 'frontend/legal.html').write_text(page,encoding='utf-8')
