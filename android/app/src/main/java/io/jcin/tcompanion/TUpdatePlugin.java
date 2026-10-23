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
    // Public signed trial releases are served independently of model credentials.
    private static final boolean CHANNEL_PUBLISHED = true;
    private static final String MANUAL_UPDATE = "当前为私有手动更新，在线渠道尚未发布。请使用收到的新版 APK 覆盖安装，不要卸载旧版。";
    private static final String FEED = "https://api.github.com/repos/Jcin004/T-companion-updates/releases?per_page=100";
    private static final String STATIC_MANIFEST = "https://raw.githubusercontent.com/Jcin004/T-companion-updates/main/t-update.json";
    private static final String CHANNEL_PREFS = "t_update_channel";
    private String stage = "检查";
    private String requestHost = "";
    private JSONArray attempts = new JSONArray();
    private static final long MAX_APK = 200L * 1024 * 1024;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final java.util.concurrent.atomic.AtomicBoolean working = new java.util.concurrent.atomic.AtomicBoolean();
    private volatile HttpURLConnection transfer;
    private volatile boolean paused;
    private long metadataDeadline;

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
            JSObject result = null, detail = null; String failure = null;
            try { result = operation.call(); }
            catch (Exception e) {
                String message = e.getMessage() == null ? "更新失败，请重试" : e.getMessage();
                if (e instanceof UnknownHostException) message = "无法解析更新服务器地址；可检查 VPN 是否包含本应用，或设置可达的 HTTPS 更新清单。";
                else if (e instanceof SocketTimeoutException) message = "连接更新服务器超时，请稍后重试；本次未完成更新检查。";
                else if (e instanceof javax.net.ssl.SSLException) message = "更新服务器的安全连接验证失败，请检查网络和系统时间。";
                detail = new JSObject(); detail.put("stage", stage); detail.put("host", requestHost); detail.put("attempts", attempts);
                failure = stage + "失败：" + message;
            }
            finally { working.set(false); }
            if (failure == null) call.resolve(result); else call.reject(failure, "UPDATE_FAILED", detail);
        });
    }
    @PluginMethod public void info(PluginCall call) {
        run(call, () -> {
            stage = "读取更新状态"; requestHost = ""; attempts = new JSONArray();
            PackageInfo p = installed();
            JSObject result = new JSObject(); result.put("versionName", p.versionName); result.put("versionCode", code(p));
            result.put("canInstall", allowed());
            result.put("channelPublished", CHANNEL_PUBLISHED);
            result.put("configurableChannel", true);
            result.put("manifestSources", customSources());
            result.put("defaultSource", STATIC_MANIFEST);
            result.put("releaseFallback", FEED);
            result.put("staticFallback", STATIC_MANIFEST);
            if (receipt().isFile() && apk().isFile()) {
                try { JSONObject m = new JSONObject(readFile(receipt())); verify(m); result.put("ready", m); }
                catch (Exception ignored) { receipt().delete(); apk().delete(); }
            }
            File partial = new File(directory(), "update.part"), metadata = new File(directory(), "partial.json");
            if (!result.has("ready") && partial.isFile() && metadata.isFile()) {
                try {
                    JSONObject m = new JSONObject(readFile(metadata)); validate(m);
                    if (m.getLong("versionCode") > code(p) && partial.length() <= m.getLong("sizeBytes")) {
                        result.put("resumable", m); result.put("downloadedBytes", partial.length());
                    }
                } catch (Exception ignored) { metadata.delete(); partial.delete(); }
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
        return connect(value, -1, false);
    }
    protected HttpURLConnection openRange(String value, long offset) throws Exception {
        return offset == 0 ? open(value) : connect(value, offset, false);
    }
    private int remainingMetadataTime() throws SocketTimeoutException {
        if (metadataDeadline == 0) return Integer.MAX_VALUE;
        long remaining = metadataDeadline - android.os.SystemClock.elapsedRealtime();
        if (remaining <= 0) throw new SocketTimeoutException("更新检查超过等待时间，请重试或更换更新渠道");
        return (int)Math.min(Integer.MAX_VALUE, remaining);
    }
    private HttpURLConnection connect(String value, long offset, boolean metadata) throws Exception {
        URL url = https(value);
        requestHost = url.getHost();
        for (int i = 0; i < 6; i++) {
            int remaining = metadata ? remainingMetadataTime() : Integer.MAX_VALUE;
            HttpURLConnection c = (HttpURLConnection) url.openConnection();
            c.setConnectTimeout(Math.min(remaining, metadata ? 5000 : 15000)); c.setReadTimeout(Math.min(remaining, metadata ? 7000 : 30000)); c.setInstanceFollowRedirects(false);
            c.setRequestProperty("User-Agent", "TCompanion-Updater"); c.setRequestProperty("Cache-Control", "no-cache");
            c.setRequestProperty("Accept-Encoding", "identity");
            if (offset > 0) c.setRequestProperty("Range", "bytes=" + offset + "-");
            int status;
            try { status = c.getResponseCode(); } catch (Exception e) { c.disconnect(); throw e; }
            if (status == 301 || status == 302 || status == 303 || status == 307 || status == 308) {
                String next = c.getHeaderField("Location"); c.disconnect();
                url = https(new URL(url, next).toString()); requestHost = url.getHost(); continue;
            }
            if (status != 200 && !(offset > 0 && status == 206)) { c.disconnect(); throw new IOException(status == 403 || status == 429 ? "更新服务限流，请稍后再试" : status == 404 && value.equals(FEED) ? "更新渠道尚未公开发布，请使用提供的安装包覆盖更新" : "更新服务返回 HTTP " + status); }
            return c;
        }
        throw new IOException("更新下载重定向次数过多");
    }
    protected String getJson(String address) throws Exception {
        HttpURLConnection c = connect(address, -1, true);
        try (InputStream in = c.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192]; int n;
            while (true) {
                c.setReadTimeout(Math.min(7000, remainingMetadataTime()));
                n = in.read(buffer); if (n == -1) break;
                if (out.size() + n > 2 * 1024 * 1024) throw new IOException("更新信息过大"); out.write(buffer, 0, n);
            }
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
    static JSONArray validateSources(JSONArray input) throws Exception {
        if (input == null || input.length() > 3) throw new IOException("最多填写 3 个 HTTPS 更新清单地址");
        JSONArray clean = new JSONArray(); Set<String> seen = new HashSet<>();
        for (int i = 0; i < input.length(); i++) {
            if (!(input.get(i) instanceof String)) throw new IOException("更新清单地址必须是文字");
            String value = input.getString(i).trim();
            if (value.length() > 2048) throw new IOException("更新清单地址过长");
            URL url = https(value);
            if (url.getHost().isEmpty() || url.getQuery() != null) throw new IOException("清单地址不能包含访问密钥或查询参数");
            if (seen.add(value)) clean.put(value);
        }
        return clean;
    }
    private JSONArray customSources() throws Exception {
        return validateSources(new JSONArray(getContext().getSharedPreferences(CHANNEL_PREFS, 0).getString("sources", "[]")));
    }
    @PluginMethod public void setSources(PluginCall call) {
        run(call, () -> {
            stage = "保存更新渠道";
            JSONArray input = call.getArray("sources");
            JSONArray clean = validateSources(input);
            if (!getContext().getSharedPreferences(CHANNEL_PREFS, 0).edit().putString("sources", clean.toString()).commit())
                throw new IOException("更新渠道保存失败");
            JSObject result = new JSObject(); result.put("manifestSources", clean); return result;
        });
    }
    private void attempt(String source, Exception failure) throws Exception {
        JSONObject row = new JSONObject().put("host", https(source).getHost());
        row.put("status", failure == null ? "ok" : "failed");
        if (failure != null) row.put("reason", failure instanceof UnknownHostException ? "DNS" : failure instanceof SocketTimeoutException ? "timeout" : failure instanceof javax.net.ssl.SSLException ? "TLS" : failure instanceof JSONException ? "invalid_json" : "request_or_manifest");
        attempts.put(row);
    }
    private JSONObject releaseManifest() throws Exception {
        JSONArray releases = new JSONArray(getJson(FEED)); JSONObject best = null;
        // Includes prereleases; drafts are never eligible.
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
        return best;
    }
    // Explicit channels are tried in order; a valid first response is authoritative.
    JSONObject discover(JSONArray custom) throws Exception {
        attempts = new JSONArray(); stage = "检查更新清单";
        metadataDeadline = android.os.SystemClock.elapsedRealtime() + 20000;
        try {
        JSONArray sources = validateSources(custom);
        if (sources.length() == 0) sources = new JSONArray().put(STATIC_MANIFEST).put(FEED);
        Exception last = null;
        for (int i = 0; i < sources.length(); i++) {
            String source = sources.getString(i); requestHost = https(source).getHost();
            try {
                JSONObject manifest = source.equals(FEED) ? releaseManifest() : new JSONObject(getJson(source));
                if (manifest != null) validate(manifest);
                attempt(source, null); return manifest;
            } catch (Exception e) { last = e; attempt(source, e); }
        }
        throw last == null ? new IOException("没有可用的更新渠道") : last;
        } finally { metadataDeadline = 0; }
    }
    @PluginMethod public void check(PluginCall call) {
        run(call, () -> {
            if (!CHANNEL_PUBLISHED) { JSObject result = new JSObject(); result.put("message", MANUAL_UPDATE); return result; }
            JSONObject best = discover(customSources());
            JSObject result = new JSObject();
            if (best != null && best.getLong("versionCode") > code(installed())) result.put("available", best);
            result.put("message", best == null ? "更新渠道已连接，尚无已发布的安装包" : "当前已是最新版本");
            result.put("attempts", attempts); result.put("host", requestHost); return result;
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
        if (!working.get()) paused = false;
        run(call, () -> downloadManifest(call.getObject("manifest")));
    }
    @PluginMethod public void pause(PluginCall call) {
        paused = true;
        HttpURLConnection connection = transfer;
        if (connection != null) connection.disconnect();
        call.resolve();
    }
    private void progress(long bytes, long total, String phase) {
        JSObject data = new JSObject(); data.put("bytes", bytes); data.put("total", total); data.put("phase", phase);
        notifyListeners("progress", data);
    }
    // A partial file is bound to its complete manifest, never merely to its URL.
    private boolean sameDownload(JSONObject a, JSONObject b) throws Exception {
        for (String key : new String[]{"packageName", "versionCode", "versionName", "apkUrl", "sha256", "sizeBytes"})
            if (!a.get(key).toString().equals(b.get(key).toString())) return false;
        return true;
    }
    void transferManifest(JSONObject m) throws Exception {
        validate(m);
        if (!directory().isDirectory() && !directory().mkdirs()) throw new IOException("无法创建下载目录");
        File partial = new File(directory(), "update.part"), metadata = new File(directory(), "partial.json");
        boolean matches = false;
        try { matches = sameDownload(m, new JSONObject(readFile(metadata))); } catch (Exception ignored) { }
        if (!matches || partial.length() > m.getLong("sizeBytes")) {
            if (partial.exists() && !partial.delete()) throw new IOException("无法清理旧下载");
        }
        try (OutputStream out = new FileOutputStream(metadata)) { out.write(m.toString().getBytes("UTF-8")); }
        long expected = m.getLong("sizeBytes"), offset = partial.length();
        progress(offset, expected, "downloading");
        if (offset == expected) { progress(offset, expected, "verifying"); return; }
        if (paused) throw new IOException("下载已暂停，点击继续下载");
        HttpURLConnection c = openRange(m.getString("apkUrl"), offset); transfer = c;
        try {
            if (paused) throw new IOException("下载已暂停，点击继续下载");
            boolean append = offset > 0 && c.getResponseCode() == 206;
            if (append && !("bytes " + offset + "-" + (expected - 1) + "/" + expected).equals(c.getHeaderField("Content-Range"))) {
                partial.delete(); metadata.delete(); throw new IOException("续传范围与清单不一致，请重新下载");
            }
            if (!append) offset = 0; // A server may ignore Range and return the entire APK.
            try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(partial, append)) {
                byte[] b = new byte[65536]; long total = offset, last = 0; int n;
                while ((n = in.read(b)) != -1) {
                    if (paused) throw new IOException("下载已暂停，点击继续下载");
                    total += n;
                    if (total > expected) { partial.delete(); metadata.delete(); throw new IOException("下载大小超出清单"); }
                    out.write(b, 0, n);
                    long now = android.os.SystemClock.elapsedRealtime();
                    if (now - last > 250) { progress(total, expected, "downloading"); last = now; }
                }
                if (total != expected) throw new IOException("下载中断，已保留进度，点击继续下载");
                progress(total, expected, "verifying");
            }
        } catch (Exception e) {
            if (paused) throw new IOException("下载已暂停，点击继续下载");
            throw e;
        } finally { transfer = null; c.disconnect(); }
    }
    JSObject downloadManifest(JSONObject m) throws Exception {
            stage = "下载并校验安装包"; attempts = new JSONArray();
            if (m == null) throw new IOException("缺少更新清单"); validate(m);
            if (m.getLong("versionCode") <= code(installed())) throw new IOException("无需安装此版本");
            receipt().delete(); apk().delete(); File partial = new File(directory(), "update.part");
            transferManifest(m);
            if (!partial.renameTo(apk())) { partial.delete(); throw new IOException("保存安装包失败"); }
            try {
                verify(m);
                try (OutputStream out = new FileOutputStream(receipt())) { out.write(m.toString().getBytes("UTF-8")); }
            } catch (Exception e) { receipt().delete(); apk().delete(); throw e; }
            new File(directory(), "partial.json").delete();
            return new JSObject();
    }
    @PluginMethod public void install(PluginCall call) {
        run(call, () -> {
            stage = "校验并打开安装器"; attempts = new JSONArray(); requestHost = "";
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
