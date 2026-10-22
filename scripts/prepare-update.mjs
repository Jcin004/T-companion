// SPDX-License-Identifier: AGPL-3.0-only
// Generate reviewable release metadata. This script does not publish anything.
import {readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {basename} from 'node:path';
const [apk,versionCode,versionName,tag]=process.argv.slice(2);
if(!apk||!/^\d+$/.test(versionCode)||!versionName||!tag)throw Error('Usage: node scripts/prepare-update.mjs APK VERSION_CODE VERSION_NAME TAG');
const manifest={schemaVersion:1,packageName:'io.jcin.tcompanion',versionCode:Number(versionCode),versionName,
 apkUrl:`https://github.com/Jcin004/T-companion-updates/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(basename(apk))}`,
 sha256:createHash('sha256').update(await readFile(apk)).digest('hex'),sizeBytes:(await stat(apk)).size,
 releaseNotes:['检查更新优先读取直接清单，缩短超时并共用检查等待预算','下载中断或暂停后继续，切换设置页保留同一任务、进度和速度','保留包名、版本、大小、SHA-256、签名校验和原权限安装流程','覆盖安装保留人物、聊天、记忆、世界与模型配置']};
await writeFile('artifacts/t-update.json',JSON.stringify(manifest,null,2)+'\n');
console.log('Prepared artifacts/t-update.json; no release was published.');
