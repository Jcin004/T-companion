// SPDX-License-Identifier: AGPL-3.0-only
package io.jcin.tcompanion;

import android.app.Instrumentation;
import android.os.Bundle;
import android.content.Context;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.security.MessageDigest;

/** Isolated emulator test: real APK parser/signatures and disk writes; fake HTTPS transport. */
public class UpdateInstrumentation extends Instrumentation {
    private Bundle args;
    @Override public void onCreate(Bundle arguments) { args=arguments; start(); }
    private void require(boolean value, String message) { if(!value) throw new AssertionError(message); }
    private JSONObject manifest(File f) throws Exception {
        MessageDigest d=MessageDigest.getInstance("SHA-256");
        try(InputStream in=new FileInputStream(f)){byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1)d.update(b,0,n);}
        StringBuilder hash=new StringBuilder();for(byte b:d.digest())hash.append(String.format("%02x",b&255));
        return new JSONObject().put("schemaVersion",1).put("packageName","io.jcin.tcompanion").put("versionCode",5)
            .put("versionName","0.5.0-trial").put("sizeBytes",f.length()).put("sha256",hash.toString()).put("apkUrl","https://fixture.invalid/update.apk");
    }
    private void reject(TUpdatePlugin p,JSONObject m,String expected) throws Exception {
        try{p.downloadManifest(m);throw new AssertionError("Expected rejection: "+expected);}
        catch(IOException e){require(e.getMessage().contains(expected),e.toString());}
    }
    @Override public void onStart() {
        Bundle result=new Bundle();
        try {
            Context context=getTargetContext();
            if(args.getString("onlyLogs", "false").equals("true")){
                TLocalPlugin local=new TLocalPlugin(){@Override public Context getContext(){return context;}};local.load();
                String value="{\"capture_context\":true,\"entries\":[{\"category\":\"system\",\"label\":\"native storage fixture\"}]}";
                final JSObject[] saved={null};
                JSObject input=new JSObject();input.put("data",value);
                local.saveDiagnostics(new PluginCall(null,"TLocal","test","saveDiagnostics",input){
                    @Override public void resolve(){}
                    @Override public void reject(String message){throw new AssertionError(message);}
                });
                local.loadDiagnostics(new PluginCall(null,"TLocal","test","loadDiagnostics",new JSObject()){
                    @Override public void resolve(JSObject data){saved[0]=data;}
                    @Override public void reject(String message){throw new AssertionError(message);}
                });
                require(saved[0]!=null&&value.equals(saved[0].getString("data")),"Native diagnostics persistence failed");
                result.putString("stream","PASS: native diagnostics table saves and reloads independently of chat document\n");finish(-1,result);return;
            }
            File good=new File(context.getFilesDir(),"update-good.apk"),bad=new File(context.getFilesDir(),"update-bad.apk");
            final File[] source={good};final int[] events={0};
            TUpdatePlugin p=new TUpdatePlugin(){
                @Override public Context getContext(){return context;}
                @Override protected void notifyListeners(String event,JSObject data){events[0]++;}
                @Override protected HttpURLConnection open(String address)throws Exception{
                    return new HttpURLConnection(new URL(address)){
                        public void disconnect(){} public boolean usingProxy(){return false;} public void connect(){}
                        public InputStream getInputStream()throws IOException{return new FileInputStream(source[0]);}
                    };
                }
            };
            JSONObject m=manifest(good);
            reject(p,new JSONObject(m.toString()).put("sha256","0".repeat(64)),"SHA-256");
            reject(p,new JSONObject(m.toString()).put("sizeBytes",1),"超出");
            reject(p,new JSONObject(m.toString()).put("apkUrl","http://fixture.invalid/update.apk"),"HTTPS");
            reject(p,new JSONObject(m.toString()).put("versionCode",4),"无需");
            source[0]=bad;reject(p,manifest(bad),"签名");
            source[0]=good;p.downloadManifest(m);p.verify(m);require(events[0]>0,"No progress");
            require(new File(context.getCacheDir(),"updates/verified.json").isFile(),"No restart receipt");
            result.putString("stream","PASS: hash, size, HTTP, downgrade, signer rejection; valid download, progress, receipt and native verification\n");
            finish(-1,result);
        }catch(Throwable e){result.putString("stream","FAIL: "+e+"\n");finish(0,result);}
    }
}
