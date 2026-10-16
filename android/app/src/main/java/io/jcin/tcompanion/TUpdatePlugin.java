// SPDX-License-Identifier: AGPL-3.0-only
package io.jcin.tcompanion;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.*;
import java.io.*;
import java.net.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;

/** Updates use public release metadata only; model credentials never enter this adapter. */
@CapacitorPlugin(name = "TUpdate")
public class TUpdatePlugin extends Plugin {
    // This private trial has no published download channel. Do not query an unprovisioned feed.
    private static final boolean CHANNEL_PUBLISHED = false;
    private static final String MANUAL_UPDATE = "当前为私有手动更新，在线渠道尚未发布。请使用收到的新版 APK 覆盖安装，不要卸载旧版。";
    private static final String FEED = "https://api.github.com/repos/Jcin004/T-companion-updates/releases?per_page=100";
    private static final long MAX_APK = 200L * 1024 * 1024;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final java.util.concurrent.atomic.AtomicBoolean working = new java.util.concurrent.atomic.AtomicBoolean();

    private File directory() { return new File(getContext().getCacheDir(), "updates"); }
    private File apk() { return new File(directory(), "update.apk"); }
    private File receipt() { return new File(directory(), "verified.json"); }
    private PackageInfo installed() throws Exception {
        return getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), flags());
    }
    private int flags() { return Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES; }
    private long code(PackageInfo p) { return Build.VERSION.SDK_INT >= 28 ? p.getLongVersionCode() : p.versionCode; }
    private Signature[] signatures(PackageInfo p) {
        return Build.VERSION.SDK_INT >= 28 ? p.signingInfo.getApkContentsSigners() : p.signatures;
    }
    private boolean allowed() { return Build.VERSION.SDK_INT < 26 || getContext().getPackageManager().canRequestPackageInstalls(); }
    private void run(PluginCall call, Callable<JSObject> operation) {
        if (!working.compareAndSet(false, true)) { call.reject("更新操作正在进行，请稍候"); return; }
        worker.execute(() -> {
            try { call.resolve(operation.call()); }
            catch (Exception e) {
                String message = e.getMessage() == null ? "更新失败，请重试" : e.getMessage();
                if (e instanceof UnknownHostException) message = "无法解析更新服务器地址，请检查手机网络或 DNS；本次未完成更新检查。";
                else if (e instanceof SocketTimeoutException) message = "连接更新服务器超时，请稍后重试；本次未完成更新检查。";
                else if (e instanceof javax.net.ssl.SSLException) message = "更新服务器的安全连接验证失败，请检查网络和系统时间。";
                call.reject(message);
            }
            finally { working.set(false); }
        });
    }
    @PluginMethod public void info(PluginCall call) {
        run(call, () -> {
            PackageInfo p = installed();
            JSObject result = new JSObject(); result.put("versionName", p.versionName); result.put("versionCode", code(p));
            result.put("canInstall", allowed());
            result.put("channelPublished", CHANNEL_PUBLISHED);
            if (receipt().isFile() && apk().isFile()) {
                try { JSONObject m = new JSONObject(readFile(receipt())); verify(m); result.put("ready", m); }
                catch (Exception ignored) { receipt().delete(); apk().delete(); }
            }
            return result;
        });
    }
    private static URL https(String value) throws Exception {
        URL url = new URL(value);
        if (!"https".equals(url.getProtocol()) || url.getUserInfo() != null || url.getRef() != null)
            throw new IOException("更新地址必须使用 HTTPS");
        return url;
    }
    protected HttpURLConnection open(String value) throws Exception {
        URL url = https(value);
        for (int i = 0; i < 6; i++) {
            HttpURLConnection c = (HttpURLConnection) url.openConnection();
            c.setConnectTimeout(15000); c.setReadTimeout(30000); c.setInstanceFollowRedirects(false);
            c.setRequestProperty("User-Agent", "TCompanion-Updater"); c.setRequestProperty("Cache-Control", "no-cache");
            int status = c.getResponseCode();
            if (status == 301 || status == 302 || status == 303 || status == 307 || status == 308) {
                String next = c.getHeaderField("Location"); c.disconnect();
                url = https(new URL(url, next).toString()); continue;
            }
            if (status != 200) { c.disconnect(); throw new IOException(status == 403 || status == 429 ? "更新服务限流，请稍后再试" : status == 404 && value.equals(FEED) ? "更新渠道尚未公开发布，请使用提供的安装包覆盖更新" : "更新服务返回 HTTP " + status); }
            return c;
        }
        throw new IOException("更新下载重定向次数过多");
    }
    private String getJson(String address) throws Exception {
        HttpURLConnection c = open(address);
        try (InputStream in = c.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192]; int n;
            while ((n = in.read(buffer)) != -1) { if (out.size() + n > 2 * 1024 * 1024) throw new IOException("更新信息过大"); out.write(buffer, 0, n); }
            return out.toString("UTF-8");
        } finally { c.disconnect(); }
    }
    private static String readFile(File f) throws Exception {
        try (InputStream in = new FileInputStream(f); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] b = new byte[4096]; int n;
            while ((n = in.read(b)) != -1) { if (out.size() + n > 65536) throw new IOException("更新清单过大"); out.write(b, 0, n); }
            return out.toString("UTF-8");
        }
    }
    private void validate(JSONObject m) throws Exception {
        if (m.optInt("schemaVersion") != 1 || !getContext().getPackageName().equals(m.optString("packageName"))
            || m.optLong("versionCode") <= 0 || m.optString("versionName").isEmpty()
            || !m.optString("sha256").matches("[a-fA-F0-9]{64}")
            || m.optLong("sizeBytes") <= 0 || m.optLong("sizeBytes") > MAX_APK)
            throw new IOException("更新清单无效");
        https(m.getString("apkUrl"));
    }
    @PluginMethod public void check(PluginCall call) {
        run(call, () -> {
            if (!CHANNEL_PUBLISHED) { JSObject result = new JSObject(); result.put("message", MANUAL_UPDATE); return result; }
            JSONArray releases = new JSONArray(getJson(FEED));
            JSONObject best = null;
            // The trial channel includes prereleases, but never draft releases.
            for (int i = 0; i < releases.length(); i++) {
                JSONObject release = releases.getJSONObject(i);
                if (release.optBoolean("draft")) continue;
                JSONArray assets = release.optJSONArray("assets"); if (assets == null) continue;
                for (int j = 0; j < assets.length(); j++) {
                    JSONObject asset = assets.getJSONObject(j);
                    if (!"t-update.json".equals(asset.optString("name"))) continue;
                    JSONObject manifest = new JSONObject(getJson(asset.getString("browser_download_url"))); validate(manifest);
                    if (best == null || manifest.getLong("versionCode") > best.getLong("versionCode")) best = manifest;
                }
            }
            JSObject result = new JSObject();
            if (best != null && best.getLong("versionCode") > code(installed())) result.put("available", best);
            result.put("message", best == null ? "更新渠道已连接，尚无已发布的安装包" : "当前已是最新版本");
            return result;
        });
    }
    private String digest(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new FileInputStream(file)) { byte[] b = new byte[65536]; int n; while ((n = in.read(b)) != -1) digest.update(b, 0, n); }
        StringBuilder hex = new StringBuilder(); for (byte b : digest.digest()) hex.append(String.format(Locale.ROOT, "%02x", b & 255)); return hex.toString();
    }
    void verify(JSONObject m) throws Exception {
        validate(m);
        if (!apk().isFile() || apk().length() != m.getLong("sizeBytes") || !digest(apk()).equalsIgnoreCase(m.getString("sha256")))
            throw new IOException("安装包大小或 SHA-256 校验失败，请重新下载");
        PackageInfo current = installed();
        PackageInfo candidate = getContext().getPackageManager().getPackageArchiveInfo(apk().getPath(), flags());
        if (candidate == null || !current.packageName.equals(candidate.packageName)) throw new IOException("安装包不属于 T-");
        if (code(candidate) != m.getLong("versionCode") || !m.getString("versionName").equals(candidate.versionName)
            || code(candidate) <= code(current)) throw new IOException("安装包版本不匹配或不高于当前版本");
        if (!new HashSet<>(Arrays.asList(signatures(current))).equals(new HashSet<>(Arrays.asList(signatures(candidate)))))
            throw new IOException("安装包签名与当前应用不同，已拒绝安装");
    }
    @PluginMethod public void download(PluginCall call) {
        run(call, () -> downloadManifest(call.getObject("manifest")));
    }
    JSObject downloadManifest(JSONObject m) throws Exception {
            if (m == null) throw new IOException("缺少更新清单"); validate(m);
            if (m.getLong("versionCode") <= code(installed())) throw new IOException("无需安装此版本");
            if (!directory().isDirectory() && !directory().mkdirs()) throw new IOException("无法创建下载目录");
            receipt().delete(); apk().delete(); File partial = new File(directory(), "update.part");
            HttpURLConnection c = open(m.getString("apkUrl"));
            try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(partial)) {
                byte[] b = new byte[65536]; long total = 0, last = 0; int n;
                while ((n = in.read(b)) != -1) {
                    total += n; if (total > m.getLong("sizeBytes")) throw new IOException("下载大小超出清单"); out.write(b, 0, n);
                    long now = System.currentTimeMillis();
                    if (now - last > 250) { JSObject progress = new JSObject(); progress.put("bytes", total); progress.put("total", m.getLong("sizeBytes")); notifyListeners("progress", progress); last = now; }
                }
            } catch (Exception e) { partial.delete(); throw e; }
            finally { c.disconnect(); }
            if (!partial.renameTo(apk())) { partial.delete(); throw new IOException("保存安装包失败"); }
            try {
                verify(m);
                try (OutputStream out = new FileOutputStream(receipt())) { out.write(m.toString().getBytes("UTF-8")); }
            } catch (Exception e) { receipt().delete(); apk().delete(); throw e; }
            return new JSObject();
    }
    @PluginMethod public void install(PluginCall call) {
        run(call, () -> {
            JSONObject m = new JSONObject(readFile(receipt())); verify(m);
            boolean permission = allowed();
            Intent intent;
            if (!permission) intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            else {
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk());
                intent = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive");
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject result = new JSObject(); result.put("status", permission ? "installer" : "permission"); return result;
        });
    }
}
