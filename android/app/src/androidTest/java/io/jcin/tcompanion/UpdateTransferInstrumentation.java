// SPDX-License-Identifier: AGPL-3.0-only
package io.jcin.tcompanion;

import android.app.Instrumentation;
import android.content.Context;
import android.os.Bundle;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.util.*;

/** Synthetic emulator: real Android files, interrupted HTTPS stream fixtures. */
public class UpdateTransferInstrumentation extends Instrumentation {
    @Override public void onCreate(Bundle args) { start(); }
    private void require(boolean value, String message) { if (!value) throw new AssertionError(message); }
    private final byte[] body = new byte[256 * 1024];
    private final List<Long> offsets = new ArrayList<>();
    private boolean interrupt, ignoreRange, wrongRange, pauseOnRead;
    private TUpdatePlugin plugin(Context context) {
        return new TUpdatePlugin() {
            @Override public Context getContext() { return context; }
            @Override protected void notifyListeners(String event, JSObject data) { }
            @Override protected HttpURLConnection openRange(String address, long offset) throws Exception {
                offsets.add(offset);
                TUpdatePlugin owner = this;
                return new HttpURLConnection(new URL(address)) {
                    public void connect() { }
                    public void disconnect() { }
                    public boolean usingProxy() { return false; }
                    public int getResponseCode() { return offset > 0 && !ignoreRange ? 206 : 200; }
                    public String getHeaderField(String name) {
                        return "Content-Range".equals(name) ? "bytes " + (wrongRange ? offset + 1 : offset) + "-" + (body.length - 1) + "/" + body.length : null;
                    }
                    public InputStream getInputStream() {
                        return new FilterInputStream(new ByteArrayInputStream(body, ignoreRange ? 0 : (int)offset, body.length - (ignoreRange ? 0 : (int)offset))) {
                            int delivered;
                            @Override public int read(byte[] buffer, int start, int count) throws IOException {
                                if (interrupt && delivered >= 65536) throw new SocketTimeoutException("fixture interruption");
                                if (pauseOnRead && delivered >= 65536) {
                                    owner.pause(new PluginCall(null,"TUpdate","fixture","pause",new JSObject()) {
                                        @Override public void resolve() { }
                                    });
                                }
                                int n = super.read(buffer, start, Math.min(count,65536));
                                if (n > 0) delivered += n;
                                return n;
                            }
                        };
                    }
                };
            }
        };
    }
    private void clean(Context context) {
        File directory = new File(context.getCacheDir(),"updates");
        for (String name : new String[]{"update.part","partial.json"}) new File(directory,name).delete();
        offsets.clear(); interrupt=false; ignoreRange=false; wrongRange=false; pauseOnRead=false;
    }
    @Override public void onStart() {
        Bundle result = new Bundle();
        try {
            Context context = getTargetContext(); clean(context);
            for (int i=0;i<body.length;i++) body[i]=(byte)(i%251);
            JSONObject manifest = new JSONObject().put("schemaVersion",1).put("packageName",context.getPackageName())
                .put("versionCode",1000).put("versionName","fixture-only").put("apkUrl","https://fixture.invalid/update.apk")
                .put("sha256",String.join("",Collections.nCopies(64,"a"))).put("sizeBytes",body.length);
            File partial = new File(context.getCacheDir(),"updates/update.part");
            TUpdatePlugin first = plugin(context); interrupt=true;
            try { first.transferManifest(manifest); throw new AssertionError("Expected stream failure"); } catch(SocketTimeoutException expected) { }
            require(partial.length()==65536,"interrupted bytes are retained");
            interrupt=false; TUpdatePlugin reopened=plugin(context); reopened.transferManifest(manifest);
            require(offsets.equals(Arrays.asList(0L,65536L)),"restart resumes exact byte offset");
            require(Arrays.equals(java.nio.file.Files.readAllBytes(partial.toPath()),body),"resumed file is byte identical");
            reopened.transferManifest(manifest); require(offsets.size()==2,"complete partial needs no new transfer");
            clean(context); interrupt=true;
            try { first.transferManifest(manifest); } catch(SocketTimeoutException expected) { }
            interrupt=false; ignoreRange=true; reopened.transferManifest(manifest);
            require(Arrays.equals(java.nio.file.Files.readAllBytes(partial.toPath()),body),"HTTP 200 safely replaces partial");
            clean(context); interrupt=true;
            try { first.transferManifest(manifest); } catch(SocketTimeoutException expected) { }
            interrupt=false; wrongRange=true;
            try { reopened.transferManifest(manifest); throw new AssertionError("Expected range rejection"); } catch(IOException expected) { require(expected.getMessage().contains("续传范围"),"wrong range error"); }
            require(!partial.exists(),"wrong range removes ambiguous bytes");
            clean(context); interrupt=true;
            try { first.transferManifest(manifest); } catch(SocketTimeoutException expected) { }
            interrupt=false;
            reopened.transferManifest(new JSONObject(manifest.toString()).put("sha256",String.join("",Collections.nCopies(64,"b"))));
            require(offsets.equals(Arrays.asList(0L,0L)),"different hash cannot reuse partial bytes");
            clean(context); pauseOnRead=true;
            try { reopened.transferManifest(manifest); throw new AssertionError("Expected pause"); }
            catch(IOException expected) { require(expected.getMessage().contains("暂停"),"pause is explicit"); }
            require(partial.length()==65536,"pause retains the written bytes");
            pauseOnRead=false; plugin(context).transferManifest(manifest);
            require(offsets.equals(Arrays.asList(0L,65536L)),"paused download resumes");
            result.putString("stream","PASS: interrupted transfer persistence, restart Range resume, complete partial reuse, HTTP 200 replacement, mismatched range rejection, manifest isolation, pause and resume\n");
            clean(context); finish(-1,result);
        } catch(Throwable e) { result.putString("stream","FAIL: "+e+"\n");finish(0,result); }
    }
}
