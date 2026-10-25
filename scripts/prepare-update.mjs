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
 releaseNotes:['修正调整第二帧时连带改变其他帧的位置问题','拖动默认只移动选中格，整张图导入的格子也能独立调整','整组移动需明确勾选，切换姿势后恢复单格范围；展开数字微调不再改变范围','行走帧共用固定中心和地面参照，拖动时保留站立叠影，方便纠正左右偏移','保留原图、旧皮肤、备份和 SQLite，沿用原包名与签名']};
await writeFile('artifacts/t-update.json',JSON.stringify(manifest,null,2)+'\n');
console.log('Prepared artifacts/t-update.json; no release was published.');
