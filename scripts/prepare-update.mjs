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
 releaseNotes:['衣柜、衣物制作和人物本体编辑分为独立页面，不再共用类别和选中状态','制作页固定显示正在编辑的素材，四方向点选上传，草稿与保存原版分开','接入 LPC 帧复制与 Fashion Sense 相对图层排序，可分方向设置身体后方或最前','Piskel 填色继续复用；绘画姿势显示缩略图，新增可撤销的站立帧复制','保留共用原版、人物适配、整套搭配、聊天和记忆；原签名覆盖升级']};
await writeFile('artifacts/t-update.json',JSON.stringify(manifest,null,2)+'\n');
console.log('Prepared artifacts/t-update.json; no release was published.');
