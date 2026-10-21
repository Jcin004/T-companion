package io.jcin.tcompanion;

import android.content.Context;
import app.cash.quickjs.QuickJs;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;

/** No Activity or WebView. Native I/O hosts the same bundled JS state machine. */
final class TResidentEngine implements AutoCloseable {
    static final AtomicBoolean running=new AtomicBoolean(false);
    static volatile boolean cancelled;
    static volatile HttpURLConnection connection;
    interface Model { String generate(JSONObject profile,JSONArray messages,String jobId) throws Exception; }
    static volatile Model testModel; // Set only by in-process instrumentation, never by persisted config.
    private final Context context;
    private final TDocumentStore store;
    private final QuickJs js;
    private JSONObject data;
    private long revision;
    private final String lease="resident-batch";
    TResidentEngine(Context context) throws Exception {
        this.context=context.getApplicationContext();store=new TDocumentStore(this.context);js=QuickJs.create();
        try(InputStream in=context.getAssets().open("resident/rules.js");ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1)out.write(b,0,n);js.evaluate(out.toString("UTF-8"),"resident-rules.js");}
    }
    private JSONObject time() throws Exception {
        Date date=new Date();TimeZone zone=TimeZone.getTimeZone(data.getJSONObject("settings").optString("timezone","Asia/Shanghai"));
        SimpleDateFormat iso=new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",Locale.ROOT);iso.setTimeZone(TimeZone.getTimeZone("UTC"));
        SimpleDateFormat day=new SimpleDateFormat("yyyy-MM-dd",Locale.ROOT);day.setTimeZone(zone);Calendar c=Calendar.getInstance(zone);c.setTime(date);
        return new JSONObject().put("iso",iso.format(date)).put("day",day.format(date)).put("hour",c.get(Calendar.HOUR_OF_DAY));
    }
    private JSONObject reduce(String op,JSONObject args,boolean persist) throws Exception {
        args.put("time",time());
        String code="JSON.stringify(ResidentRules.command("+data.toString()+","+JSONObject.quote(op)+","+args.toString()+"))";
        JSONObject output=new JSONObject((String)js.evaluate(code));
        if(persist){JSONObject next=output.getJSONObject("data");syncMemory(next);revision=store.save(next.toString(),revision,lease);data=next;}
        return output;
    }
    private void syncMemory(JSONObject next) throws Exception {
        TMemoryEngine.execute(context,new JSONObject().put("action","sync").put("records",next.getJSONObject("memory").getJSONArray("events")).toString());
    }
    private JSONArray recall(String owner) throws Exception {
        JSONArray records=data.getJSONObject("memory").getJSONArray("events");
        JSONObject response=new JSONObject(TMemoryEngine.execute(context,new JSONObject().put("action","recall").put("records",records).put("owner",owner).put("queries",new JSONArray().put("当前经历 生活 计划")).toString()));
        Set<String> selected=new HashSet<>();JSONArray ranks=response.getJSONArray("ranked").getJSONArray(0);
        for(int i=0;i<ranks.length();i++)selected.add(ranks.getJSONObject(i).getString("id"));
        JSONArray result=new JSONArray();for(int i=0;i<records.length();i++){JSONObject r=records.getJSONObject(i);if(selected.contains(r.getString("id")))result.put(r);}return result;
    }
    JSONObject run(String id,String origin,boolean resume,boolean skip) throws Exception {
        if(!running.compareAndSet(false,true))throw new IllegalStateException("居民批次正在执行");
        cancelled=false;
        try {
            if(!store.acquire(lease))throw new IllegalStateException("前台正在保存，请稍后推进");
            JSONObject snapshot=store.read();revision=snapshot.getLong("revision");data=new JSONObject(snapshot.getString("data"));
            JSONArray turns=data.getJSONArray("turns");for(int i=0;i<turns.length();i++)if(turns.getJSONObject(i).optString("state").equals("generating"))throw new IllegalStateException("前台对话正在生成");
            reduce("attempt",new JSONObject().put("origin",origin).put("status","started"),true);
            try{reduce(resume?"resume":"begin",new JSONObject().put("id",id).put("origin",origin).put("skip",skip),true);}catch(Exception reason){reduce("attempt",new JSONObject().put("origin",origin).put("status","skipped_or_needs_review"),true);throw reason;}
            while(!cancelled){
                Object value=reduce("next",new JSONObject().put("id",id),true).opt("result");if(value==null||value==JSONObject.NULL)break;
                JSONObject job=(JSONObject)value;String jobId=job.getString("id"),state=job.getString("state");
                if(state.equals("requesting")||state.equals("uncertain")){
                    reduce("fail",new JSONObject().put("id",jobId).put("uncertain",true),true);throw new IllegalStateException("请求结果不确定，请明确跳过；没有自动重新计费");
                }
                boolean validated=false;
                try {
                    if(state.equals("prepared")){
                        JSONArray prompt=reduce("prompt",new JSONObject().put("job",job).put("memories",recall(job.getString("owner_id"))),false).getJSONArray("result");
                        JSONObject profile=profile(job.getString("kind"));
                        reduce("reserve",new JSONObject().put("id",jobId).put("prompt",prompt),true);
                        String text=testModel==null?generate(profile,prompt,jobId):testModel.generate(profile,prompt,jobId);
                        if(cancelled)throw new IOException("居民批次已取消");
                        JSONObject parsed=reduce("parse",new JSONObject().put("text",text),false).getJSONObject("result");
                        reduce("response",new JSONObject().put("id",jobId).put("value",parsed),true);
                    }
                    if(cancelled)break;
                    reduce("apply",new JSONObject().put("id",jobId),false);validated=true;
                    reduce("apply",new JSONObject().put("id",jobId),true);
                }catch(Exception failure){
                    JSONObject current=findJob(jobId);boolean uncertain=current.optString("state").equals("requesting");
                    // Persist a terminal/uncertain checkpoint. Never reissue the paid request.
                    if(!current.optString("state").equals("responded")||!validated)reduce("fail",new JSONObject().put("id",jobId).put("uncertain",uncertain),true);throw failure;
                }
            }
            reduce("attempt",new JSONObject().put("origin",origin).put("status",cancelled?"cancelled":"complete"),true);
            return data.getJSONObject("world").getJSONObject("life");
        } finally {store.release(lease);running.set(false);connection=null;}
    }
    private JSONObject findJob(String id) throws Exception {JSONArray jobs=data.getJSONObject("world").getJSONObject("life").getJSONArray("jobs");for(int i=0;i<jobs.length();i++)if(jobs.getJSONObject(i).getString("id").equals(id))return jobs.getJSONObject(i);throw new IllegalStateException();}
    private JSONObject profile(String kind) throws Exception {
        String id=data.getString("active_profile_id");
        if(kind.equals("memory")){String dedicated=data.getJSONObject("memory").getJSONObject("settings").optString("profile_id");if(!dedicated.isEmpty())id=dedicated;}
        JSONArray profiles=data.getJSONArray("api_profiles");for(int i=0;i<profiles.length();i++){JSONObject p=profiles.getJSONObject(i);if(p.getString("id").equals(id))return p;}
        throw new IllegalStateException("请配置居民使用的模型预设");
    }
    private String generate(JSONObject profile,JSONArray messages,String id) throws Exception {
        URL url=new URL(profile.getString("base_url").replaceAll("/+$","")+"/chat/completions");
        if(!url.getProtocol().equals("https")||url.getUserInfo()!=null)throw new IOException("居民模型地址必须使用 HTTPS");
        HttpURLConnection c=(HttpURLConnection)url.openConnection();connection=c;
        try{
            c.setInstanceFollowRedirects(false);c.setConnectTimeout(20000);c.setReadTimeout(30000);c.setRequestMethod("POST");c.setDoOutput(true);c.setRequestProperty("Content-Type","application/json");c.setRequestProperty("Idempotency-Key",id);
            String key=TSecrets.modelKey(context,profile.getString("id"));if(!key.isEmpty())c.setRequestProperty("Authorization","Bearer "+key);
            byte[] body=new JSONObject().put("model",profile.getString("model")).put("messages",messages).put("stream",false).put("max_tokens",1400).toString().getBytes(StandardCharsets.UTF_8);
            c.setFixedLengthStreamingMode(body.length);try(OutputStream out=c.getOutputStream()){out.write(body);}
            if(c.getResponseCode()!=200)throw new IOException("居民模型请求失败（"+c.getResponseCode()+"）");
            StringBuilder response=new StringBuilder();try(Reader in=new InputStreamReader(c.getInputStream(),StandardCharsets.UTF_8)){char[] buffer=new char[2048];int n;long deadline=System.currentTimeMillis()+45000;while((n=in.read(buffer))!=-1){if(cancelled||System.currentTimeMillis()>deadline)throw new IOException("居民请求取消或超时");response.append(buffer,0,n);if(response.length()>100000)throw new IOException("居民响应过大");}}
            JSONObject choice=new JSONObject(response.toString()).getJSONArray("choices").getJSONObject(0);
            if(!choice.optString("finish_reason").equals("stop"))throw new IOException("居民响应未完整完成");
            return choice.getJSONObject("message").getString("content");
        }finally{c.disconnect();connection=null;}
    }
    static void cancel(){cancelled=true;HttpURLConnection c=connection;if(c!=null)c.disconnect();}
    public void close(){js.close();store.close();}
}
