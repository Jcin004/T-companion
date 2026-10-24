package io.jcin.tcompanion;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.concurrent.*;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;

/** Original thin adapters over Android SQLite, Keystore and streaming HTTPS. */
@CapacitorPlugin(name="TLocal")
public class TLocalPlugin extends Plugin {
    private TDocumentStore database;
    private final ExecutorService io = Executors.newCachedThreadPool();
    private final ConcurrentHashMap<String,HttpURLConnection> requests = new ConcurrentHashMap<>();
    private final java.util.Set<String> cancelled = ConcurrentHashMap.newKeySet();
    private static final String ALIAS="t-local-model-v1";
    @PluginMethod public void lifeSchedule(PluginCall call){try{TResidentWorker.schedule(getContext());call.resolve();}catch(Exception e){call.reject("后台计划保存失败");}}
    @PluginMethod public void lifeRun(PluginCall call){io.execute(()->{
        try(TResidentEngine engine=new TResidentEngine(getContext())){
            JSONObject result=engine.run(call.getString("id",""),"foreground",call.getBoolean("resume",false),call.getBoolean("skip",false));call.resolve(new JSObject(result.toString()));
        }catch(Exception e){String reason=e.getMessage();if(reason==null)reason="居民推进未完成，请查看任务状态";call.reject(reason.split("\n")[0].substring(0,Math.min(reason.split("\n")[0].length(),180)));}
    });}
    @PluginMethod public void lifeCancel(PluginCall call){TResidentEngine.cancel();androidx.work.WorkManager.getInstance(getContext()).cancelUniqueWork(TResidentWorker.NAME);io.execute(()->{try{for(int i=0;i<100&&TResidentEngine.running.get();i++)Thread.sleep(100);call.resolve();}catch(Exception e){call.reject("取消任务未完成，请重试");}});}
    @Override public void load(){database=new TDocumentStore(getContext());}
    private SQLiteDatabase diagnosticDatabase(){SQLiteDatabase db=database.getWritableDatabase();db.execSQL("CREATE TABLE IF NOT EXISTS diagnostics(id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL)");return db;}
    @PluginMethod public void loadDiagnostics(PluginCall call){
        try(Cursor cursor=diagnosticDatabase().rawQuery("SELECT data FROM diagnostics WHERE id=1",null)){JSObject result=new JSObject();if(cursor.moveToFirst())result.put("data",cursor.getString(0));call.resolve(result);}catch(Exception e){call.reject("读取运行日志失败");}
    }
    @PluginMethod public void saveDiagnostics(PluginCall call){
        try{String value=call.getString("data","");if(value.length()>1100000)throw new IOException();new JSONObject(value);ContentValues row=new ContentValues();row.put("id",1);row.put("data",value);if(diagnosticDatabase().insertWithOnConflict("diagnostics",null,row,SQLiteDatabase.CONFLICT_REPLACE)==-1)throw new IOException();call.resolve();}catch(Exception e){call.reject("保存运行日志失败");}
    }
    @PluginMethod public void load(PluginCall call){
        try{call.resolve(new JSObject(database.read(call.getBoolean("assetReferences",false)).toString()));}catch(Exception e){call.reject("读取本机 SQLite 失败");}
    }
    @PluginMethod public void loadImages(PluginCall call){
        try{JSObject result=new JSObject();result.put("images",database.images(call.getArray("ids")));call.resolve(result);}catch(Exception e){call.reject("读取本机图片失败");}
    }
    @PluginMethod public void beginWrite(PluginCall call){
        String owner=call.getString("owner","");
        if(!database.acquire(owner)){call.reject("居民正在推进，请稍后操作");return;}
        try{if(call.getBoolean("assetReferences",false))call.resolve(new JSObject(database.read(true).toString()));else call.resolve();}
        catch(Exception e){database.release(owner);call.reject("读取本机 SQLite 失败");}
    }
    @PluginMethod public void endWrite(PluginCall call){database.release(call.getString("owner",""));call.resolve();}
    @PluginMethod public void save(PluginCall call){
        long started=android.os.SystemClock.elapsedRealtime();
        try{
            // Capacitor getLong accepts Long only; JSON small integers are Integer.
            Object supplied=call.getData().opt("revision");long rev;
            if(supplied==null||supplied==JSONObject.NULL)rev=database.read(true).getLong("revision");
            else{
                if(!(supplied instanceof Number))throw new IllegalArgumentException("Invalid revision");
                double number=((Number)supplied).doubleValue();rev=((Number)supplied).longValue();
                if(!Double.isFinite(number)||number<0||number>9007199254740991d||number!=rev)throw new IllegalArgumentException("Invalid revision");
            }
            long next=database.save(call.getString("data",""),rev,call.getString("owner",""),call.getObject("images"));
            JSObject result=new JSObject();result.put("revision",next);
            if(call.getBoolean("release",false)){database.release(call.getString("owner",""));result.put("released",true);}
            result.put("storageMs",android.os.SystemClock.elapsedRealtime()-started);
            call.resolve(result);
        }catch(Exception e){call.reject(e instanceof IllegalStateException?e.getMessage():"保存本机数据失败，请检查剩余空间");}
    }
    private javax.crypto.SecretKey encryptionKey() throws Exception { return TSecrets.encryptionKey(); }
    @PluginMethod public void setKey(PluginCall call){
        try{String value=call.getString("value","");
            String suffix=keySuffix(call.getString("profile_id","legacy"));
            android.content.SharedPreferences.Editor prefs=getContext().getSharedPreferences("t-secrets",Context.MODE_PRIVATE).edit();
            if(value.isEmpty()){prefs.remove("cipher"+suffix);prefs.remove("iv"+suffix);}else{
                Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,encryptionKey());
                prefs.putString("cipher"+suffix,Base64.encodeToString(cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)),Base64.NO_WRAP));
                prefs.putString("iv"+suffix,Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP));
            }
            if(!prefs.commit())throw new IOException();call.resolve();
        }catch(Exception error){call.reject("安全保存密钥失败，请重新配置");}
    }
    private String keySuffix(String id){return id.equals("legacy")?"":"."+id.replaceAll("[^a-zA-Z0-9_-]", "_");}
    @PluginMethod public void hasKey(PluginCall call){JSObject r=new JSObject();r.put("value",getContext().getSharedPreferences("t-secrets",0).contains("cipher"+keySuffix(call.getString("profile_id","legacy"))));call.resolve(r);}
    private String modelKey(String id) throws Exception { return TSecrets.modelKey(getContext(),id); }
    @PluginMethod public void cancel(PluginCall call){String id=call.getString("id","");cancelled.add(id);HttpURLConnection c=requests.get(id);if(c!=null)c.disconnect();call.resolve();}
    private void event(String id,String text){JSObject e=new JSObject();e.put("id",id);e.put("text",text);notifyListeners("modelChunk",e);}
    @PluginMethod public void memoryRequest(PluginCall call){io.execute(()->{
        String id=call.getString("id","");HttpURLConnection connection=null;
        try{
            URL url=new URL(call.getString("url",""));
            boolean local=url.getHost().equals("localhost")||url.getHost().equals("127.0.0.1")||url.getHost().equals("[::1]");
            if((!url.getProtocol().equals("https")&&!(local&&url.getProtocol().equals("http")))||url.getUserInfo()!=null||url.getQuery()!=null||url.getRef()!=null)throw new IOException("invalid_response");
            if(!url.getPath().equals("/v1/recall")&&!url.getPath().equals("/v1/health"))throw new IOException("invalid_response");
            String origin=url.getProtocol()+"://"+url.getHost().toLowerCase(java.util.Locale.ROOT);
            if(url.getPort()!=-1&&url.getPort()!=url.getDefaultPort())origin+=":"+url.getPort();
            byte[] digest=java.security.MessageDigest.getInstance("SHA-256").digest(origin.getBytes(StandardCharsets.UTF_8));
            StringBuilder keyId=new StringBuilder("obmem_");for(byte b:digest)keyId.append(String.format(java.util.Locale.ROOT,"%02x",b&255));
            if(!keyId.toString().equals(call.getString("profile_id","")))throw new IOException("unauthorized");
            String key=modelKey(keyId.toString());if(key.isEmpty())throw new IOException("missing_token");
            if(cancelled.contains(id))throw new IOException("cancelled");
            int timeout=Math.max(300,Math.min(10000,call.getInt("timeout_ms",2500)));
            connection=(HttpURLConnection)url.openConnection();requests.put(id,connection);
            connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(timeout);connection.setReadTimeout(timeout);
            connection.setRequestProperty("Content-Type","application/json");connection.setRequestProperty("Accept","application/json");connection.setRequestProperty("Authorization","Bearer "+key);
            String body=call.getString("body","");
            if(!body.isEmpty()){
                connection.setRequestMethod("POST");connection.setDoOutput(true);
                byte[] bytes=body.getBytes(StandardCharsets.UTF_8);if(bytes.length>16000)throw new IOException("invalid_response");
                connection.setFixedLengthStreamingMode(bytes.length);try(OutputStream out=connection.getOutputStream()){out.write(bytes);}
            }
            int status=connection.getResponseCode();if(status==401||status==403)throw new IOException("unauthorized");if(status!=200)throw new IOException("unavailable");
            StringBuilder value=new StringBuilder();long deadline=System.currentTimeMillis()+timeout;
            try(Reader reader=new InputStreamReader(connection.getInputStream(),StandardCharsets.UTF_8)){
                char[] buffer=new char[2048];int count;
                while((count=reader.read(buffer))!=-1){if(cancelled.contains(id))throw new IOException("cancelled");if(System.currentTimeMillis()>deadline)throw new IOException("timeout");value.append(buffer,0,count);if(value.length()>64000)throw new IOException("invalid_response");}
            }
            if(cancelled.contains(id))throw new IOException("cancelled");new JSONObject(value.toString());
            JSObject result=new JSObject();result.put("body",value.toString());call.resolve(result);
        }catch(Exception error){String reason=error instanceof java.net.SocketTimeoutException?"timeout":error.getMessage();if(!java.util.Arrays.asList("timeout","unauthorized","missing_token","invalid_response","cancelled").contains(reason))reason="unavailable";call.reject(reason);}
        finally{requests.remove(id);cancelled.remove(id);if(connection!=null)connection.disconnect();}
    });}
    @PluginMethod public void model(PluginCall call){io.execute(()->{
        if(TResidentEngine.running.get()){call.reject("居民正在推进，请稍后发送");return;}
        String id=call.getString("id","");HttpURLConnection connection=null;
        try{
            URL url=new URL(call.getString("base_url","").replaceAll("/+$","")+"/chat/completions");
            boolean loopback=url.getHost().equals("localhost")||url.getHost().equals("127.0.0.1")||url.getHost().equals("[::1]");
            if((!url.getProtocol().equals("https")&&!(loopback&&url.getProtocol().equals("http")))||url.getUserInfo()!=null)throw new IOException("模型地址必须使用 HTTPS");
            if(cancelled.contains(id))throw new IOException("已停止生成");
            connection=(HttpURLConnection)url.openConnection();requests.put(id,connection);
            connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(25000);connection.setReadTimeout(45000);connection.setRequestMethod("POST");connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type","application/json");connection.setRequestProperty("Accept","text/event-stream");
            String key=modelKey(call.getString("profile_id","legacy"));if(!key.isEmpty())connection.setRequestProperty("Authorization","Bearer "+key);
            JSONObject body=new JSONObject();body.put("model",call.getString("model",""));body.put("messages",call.getArray("messages",new JSArray()));body.put("stream",true);
            byte[] encoded=body.toString().getBytes(StandardCharsets.UTF_8);connection.setFixedLengthStreamingMode(encoded.length);
            try(OutputStream out=connection.getOutputStream()){out.write(encoded);}
            int status=connection.getResponseCode();
            if(status==401||status==403)throw new IOException("模型服务拒绝授权，请检查密钥和模型权限");
            if(status!=200)throw new IOException("模型服务返回错误（"+status+"）");
            boolean finished=false;long deadline=System.currentTimeMillis()+180000;int total=0;
            try(BufferedReader reader=new BufferedReader(new InputStreamReader(connection.getInputStream(),StandardCharsets.UTF_8))){
                String line;StringBuilder block=new StringBuilder();
                while((line=reader.readLine())!=null){
                    if(cancelled.contains(id))throw new IOException("已停止生成");if(System.currentTimeMillis()>deadline)throw new IOException("生成超时，请重试");
                    if(!line.isEmpty()){if(line.startsWith("data:")){if(block.length()>0)block.append('\n');block.append(line.substring(5).trim());}if(block.length()>200000)throw new IOException("模型数据块过大");continue;}
                    if(block.length()==0)continue;String value=block.toString();block.setLength(0);
                    if(value.equals("[DONE]")){finished=true;break;}
                    JSONObject chunk=new JSONObject(value);if(chunk.has("error"))throw new IOException("模型服务返回错误");
                    JSONArray choices=chunk.optJSONArray("choices");if(choices==null||choices.length()==0)continue;
                    JSONObject choice=choices.getJSONObject(0),delta=choice.optJSONObject("delta");
                    String text=delta==null?"":delta.optString("content","");if(!text.isEmpty()){total+=text.length();if(total>100000)throw new IOException("回复超过长度限制");event(id,text);}
                    String reason=choice.optString("finish_reason","");if(!reason.isEmpty()&&!reason.equals("null"))finished=true;
                }
            }
            if(cancelled.contains(id))throw new IOException("已停止生成");if(!finished)throw new IOException("模型连接提前中断，回复未完成");call.resolve();
        }catch(Exception error){String message=error instanceof IOException?error.getMessage():"安全存储或模型响应格式错误";if(error instanceof javax.net.ssl.SSLException)message="HTTPS 证书验证失败，请检查服务地址与证书";else if(error instanceof java.net.SocketTimeoutException)message="网络连接超时，请重试";else if(error instanceof java.net.ConnectException||error instanceof java.net.UnknownHostException)message="无法连接模型服务，请检查网络和地址";call.reject(message==null?"模型连接失败":message);
        }finally{requests.remove(id);cancelled.remove(id);if(connection!=null)connection.disconnect();}
    });}
    @Override protected void handleOnPause(){for(String id:requests.keySet()){cancelled.add(id);requests.get(id).disconnect();}}
    @Override protected void handleOnDestroy(){for(HttpURLConnection c:requests.values())c.disconnect();io.shutdownNow();if(database!=null)database.close();}
}
