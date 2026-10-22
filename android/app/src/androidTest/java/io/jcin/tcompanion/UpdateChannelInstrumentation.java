// SPDX-License-Identifier: AGPL-3.0-only
package io.jcin.tcompanion;

import android.app.Instrumentation;
import android.content.Context;
import android.os.Bundle;
import org.json.*;
import com.getcapacitor.*;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.io.IOException;
import java.net.UnknownHostException;
import java.util.*;

/** Isolated emulator only: real Android JSON/URL policy, fixture HTTPS responses. */
public class UpdateChannelInstrumentation extends Instrumentation {
    @Override public void onCreate(Bundle args) { start(); }
    private void require(boolean value, String message) { if (!value) throw new AssertionError(message); }
    private void invalid(JSONArray values) throws Exception {
        try { TUpdatePlugin.validateSources(values); throw new AssertionError("Expected invalid source rejection"); }
        catch (IOException expected) { }
    }
    @Override public void onStart() {
        Bundle result = new Bundle();
        try {
            Context context = getTargetContext();
            JSONObject good = new JSONObject().put("schemaVersion",1).put("packageName","io.jcin.tcompanion")
                .put("versionCode",11).put("versionName","fixture-only").put("sizeBytes",1024)
                .put("sha256",new String(new char[64]).replace('\0','a')).put("apkUrl","https://download.example/test.apk");
            List<String> calls = new ArrayList<>();
            final boolean[] staticOffline = {false};
            TUpdatePlugin plugin = new TUpdatePlugin() {
                @Override public Context getContext() { return context; }
                @Override protected String getJson(String address) throws Exception {
                    calls.add(address);
                    if (address.contains("offline.example") || staticOffline[0] && address.contains("raw.githubusercontent.com")) throw new UnknownHostException("fixture DNS");
                    if (address.contains("api.github.com")) return new JSONArray().put(new JSONObject().put("prerelease",true).put("assets",new JSONArray().put(new JSONObject().put("name","t-update.json").put("browser_download_url","https://release.example/t-update.json")))).toString();
                    if (address.contains("broken.example")) return "not JSON";
                    return good.toString();
                }
            };
            require(plugin.discover(new JSONArray()).getLong("versionCode")==11,"direct static manifest");
            require(calls.size()==1 && calls.get(0).contains("raw.githubusercontent.com"),"valid direct manifest avoids all release requests");
            calls.clear(); staticOffline[0]=true;
            require(plugin.discover(new JSONArray()).getLong("versionCode")==11,"prerelease fallback after static DNS failure");
            require(calls.size()==3 && calls.get(1).contains("api.github.com"),"static then release fallback order");
            staticOffline[0]=false;
            calls.clear();
            require(plugin.discover(new JSONArray().put("https://own.example/update.json")).getLong("versionCode")==11,"custom source");
            require(calls.size()==1 && !calls.get(0).contains("github"),"custom channel must not depend on GitHub");
            calls.clear();
            plugin.discover(new JSONArray().put("https://offline.example/update.json").put("https://broken.example/update.json").put("https://own.example/update.json"));
            require(calls.size()==3,"DNS and malformed JSON fallback");
            try {plugin.discover(new JSONArray().put("https://offline.example/update.json"));throw new AssertionError("all failures cannot become up to date");}
            catch(UnknownHostException expected) { }
            invalid(new JSONArray().put("http://own.example/update.json"));
            invalid(new JSONArray().put("https://key@own.example/update.json"));
            invalid(new JSONArray().put("https://own.example/update.json?token=private"));
            invalid(new JSONArray().put("https://own.example/update.json#fragment"));
            invalid(new JSONArray().put(42));
            invalid(new JSONArray().put("https://a.example").put("https://b.example").put("https://c.example").put("https://d.example"));
            require(TUpdatePlugin.validateSources(new JSONArray().put("https://a.example/x").put("https://a.example/x")).length()==1,"deduplication");
            android.content.SharedPreferences prefs = context.getSharedPreferences("t_update_channel",0);
            String previous = prefs.getString("sources",null);
            try {
                JSObject input = new JSObject(); input.put("sources",new JSONArray().put("https://own.example/update.json"));
                CountDownLatch saved = new CountDownLatch(1); final String[] failure = {null};
                plugin.setSources(new PluginCall(null,"TUpdate","fixture","setSources",input) {
                    @Override public void resolve(JSObject value) { saved.countDown(); }
                    @Override public void reject(String message,String code,JSObject detail) {failure[0]=message;saved.countDown();}
                });
                require(saved.await(5,TimeUnit.SECONDS) && failure[0]==null,"save configured sources");
                TUpdatePlugin reopened = new TUpdatePlugin(){@Override public Context getContext(){return context;}};
                CountDownLatch loaded = new CountDownLatch(1); final JSObject[] info = {null};
                reopened.info(new PluginCall(null,"TUpdate","fixture","info",new JSObject()) {
                    @Override public void resolve(JSObject value) {info[0]=value;loaded.countDown();}
                    @Override public void reject(String message,String code,JSObject detail) {failure[0]=message;loaded.countDown();}
                });
                require(loaded.await(5,TimeUnit.SECONDS) && info[0]!=null,"reload configured sources");
                require(info[0].getJSONArray("manifestSources").getString(0).equals("https://own.example/update.json"),"native settings persistence");
            } finally {
                if(previous==null)prefs.edit().remove("sources").commit();else prefs.edit().putString("sources",previous).commit();
            }
            good.put("packageName","other.package");
            try {plugin.discover(new JSONArray().put("https://own.example/update.json"));throw new AssertionError("foreign package accepted");}
            catch(IOException expected) { }
            result.putString("stream","PASS: native channel discovery, DNS/JSON fallback, GitHub-independent custom URL, all-failure rejection, source URL policy and package validation\n");
            finish(-1,result);
        } catch(Throwable e) {result.putString("stream","FAIL: "+e+"\n");finish(0,result);}
    }
}
