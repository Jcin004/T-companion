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
 releaseNotes:['人物形象改为人物列表、皮肤衣橱与独立编辑页面','表情立绘、站立行走、交互动作各有独立分页，交互首屏显示动作卡片','皮肤使用与编辑保存分开，新建名称独立输入，图集参数折叠调整','保留旧皮肤和图片，保存失败可重试；切页、返回和未保存提示适配手机','原包名和原签名覆盖升级，保留聊天、记忆、世界、皮肤与模型配置']};
await writeFile('artifacts/t-update.json',JSON.stringify(manifest,null,2)+'\n');
console.log('Prepared artifacts/t-update.json; no release was published.');
