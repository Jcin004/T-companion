// SPDX-License-Identifier: AGPL-3.0-only
// Generate reviewable release metadata. This script does not publish anything.
import {readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {basename} from 'node:path';
import {execFileSync} from 'node:child_process';
const [apk,versionCode,versionName,tag]=process.argv.slice(2);
if(!apk||!/^\d+$/.test(versionCode)||!versionName||!tag)throw Error('Usage: node scripts/prepare-update.mjs APK VERSION_CODE VERSION_NAME TAG');
const manifest={schemaVersion:1,packageName:'io.jcin.tcompanion',versionCode:Number(versionCode),versionName,
 sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
 apkUrl:`https://github.com/Jcin004/T-companion-updates/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(basename(apk))}`,
 sha256:createHash('sha256').update(await readFile(apk)).digest('hex'),sizeBytes:(await stat(apk)).size,
 releaseNotes:['电脑绘画支持滚轮定点缩放、右键拖动画布，屏蔽中键误操作','手机使用单指绘画、双指缩放和平移；双指操作不留下笔迹','新增 128×192 精细画布，一格为原来的半格，可撤销细化','旧图保留原样，精细笔画完整保存并用于衣柜与房间，人物大小和落地点不变','保留 0.20.1 记忆来源、衣柜、聊天、备份、原包名和签名']};
await writeFile('artifacts/t-update.json',JSON.stringify(manifest,null,2)+'\n');
console.log('Prepared artifacts/t-update.json; no release was published.');
