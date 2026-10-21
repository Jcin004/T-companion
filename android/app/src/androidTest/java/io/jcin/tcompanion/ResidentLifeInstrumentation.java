package io.jcin.tcompanion;

import android.app.Instrumentation;
import android.os.Bundle;
import androidx.work.*;
import org.json.*;
import java.util.concurrent.TimeUnit;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

/** Synthetic dedicated-emulator only. No UI/WebView; real JS/OB/SQLite and fake model I/O. */
public class ResidentLifeInstrumentation extends Instrumentation {
    private boolean natural;
    private void check(boolean value,String message){if(!value)throw new AssertionError(message);}
    @Override public void onCreate(Bundle args){super.onCreate(args);natural=args.getString("natural","false").equals("true");start();}
    @Override public void onStart(){
        Bundle result=new Bundle();TDocumentStore store=new TDocumentStore(getTargetContext());String original=null;
        try{
            JSONObject snap=store.read();original=snap.getString("data");JSONObject d=new JSONObject(original);
            JSONArray chars=d.getJSONArray("characters");check(chars.length()==2&&chars.getJSONObject(0).getString("name").equals("林")&&chars.getJSONObject(1).getString("name").equals("雨"),"Dedicated synthetic emulator required");
            String a=chars.getJSONObject(0).getString("id"),b=chars.getJSONObject(1).getString("id");JSONObject w=d.getJSONObject("world");
            w.getJSONObject("positions").put(a,new JSONObject().put("x",4).put("y",6)).put(b,new JSONObject().put("x",5).put("y",6));w.remove("life");
            // Create settings through the same JS reducer initialization used by the UI.
            try(app.cash.quickjs.QuickJs js=app.cash.quickjs.QuickJs.create()){
                java.io.InputStream in=getTargetContext().getAssets().open("resident/rules.js");java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream();byte[] bytes=new byte[8192];int n;while((n=in.read(bytes))!=-1)out.write(bytes,0,n);in.close();js.evaluate(out.toString("UTF-8"));
                String value=(String)js.evaluate("JSON.stringify(ResidentRules.command("+d.toString()+",'initialize',{}).data)");d=new JSONObject(value);
            }
            JSONObject settings=d.getJSONObject("world").getJSONObject("life").getJSONObject("settings");settings.put("enabled",true).put("background",true).put("quiet_start",0).put("quiet_end",0).put("max_actions",1).put("max_requests",6).put("daily_requests",200).put("interval_minutes",15);
            check(store.acquire("instrumentation"),"lease");store.save(d.toString(),snap.getLong("revision"),"instrumentation");store.release("instrumentation");
            final int[] calls={0};final String ownerA=a;
            TResidentEngine.testModel=(profile,messages,job)->{
                calls[0]++;String system=messages.getJSONObject(0).getString("content");JSONObject p=new JSONObject(messages.getJSONObject(1).getString("content"));String owner=p.getString("actor_id");JSONArray events=p.getJSONArray("observed_events");
                if(system.contains("任务：memory")){
                    JSONArray memories=new JSONArray();for(int i=0;i<Math.min(3,events.length());i++){JSONObject e=events.getJSONObject(i);memories.put(new JSONObject().put("title","居民经历").put("content",e.getString("content")).put("kind","experience").put("evidence",new JSONArray().put(new JSONObject().put("source_type","world_event").put("event_id",e.getString("id")).put("quote",e.getString("content")))));}
                    return new JSONObject().put("memories",memories).toString();
                }
                if(system.contains("任务：share")){JSONObject e=events.getJSONObject(0);return new JSONObject().put("share",owner.equals(ownerA)).put("event_id",e.getString("id")).put("quote",e.getString("content").substring(0,Math.min(500,e.getString("content").length()))).put("comment","这是我的个人理解。").toString();}
                return new JSONObject().put("actor_id",owner).put("type","say").put("to_id",owner.equals(ownerA)?b:ownerA).put("text",owner.equals(ownerA)?"我想一起看书。":"好，我们先聊聊。留言会影响我的下一步计划。").put("event_ids",new JSONArray()).put("plan","之后一起看书").toString();
            };
            JSONObject foreground;
            try(TResidentEngine engine=new TResidentEngine(getTargetContext())){foreground=engine.run("instrumented-foreground","foreground",false,false);}
            check(calls[0]==6,"foreground budget");check(foreground.getJSONArray("jobs").length()==6,"durable jobs");
            JSONObject after=new JSONObject(store.read().getString("data"));int firstEvents=after.getJSONObject("world").getJSONArray("events").length();check(after.getJSONArray("turns").length()==d.getJSONArray("turns").length(),"no fake user turns");
            long revision=store.read().getLong("revision");check(store.acquire("other-host"),"other host lease");boolean refused=false;try{store.save(after.toString(),revision,"stale-host");}catch(IllegalStateException e){refused=true;}store.release("other-host");check(refused,"cross-host write refused");
            WorkManager manager=WorkManager.getInstance(getTargetContext());
            OneTimeWorkRequest request=new OneTimeWorkRequest.Builder(TResidentWorker.class).addTag("resident-forced-test").build();manager.enqueue(request).getResult().get(30,TimeUnit.SECONDS);
            for(int i=0;i<120;i++){WorkInfo info=manager.getWorkInfoById(request.getId()).get();if(info.getState().isFinished())break;Thread.sleep(500);}
            JSONObject forced=new JSONObject(store.read().getString("data"));check(forced.getJSONObject("world").getJSONArray("events").length()>firstEvents,"forced Worker persisted events without Activity");
            JSONObject evidence=new JSONObject().put("foreground",true).put("forced_worker",true).put("natural_requested",natural).put("model_requests",calls[0]).put("forced_completed_at",System.currentTimeMillis()).put("activity_required",false).put("fake_user_turns",false).put("lease_conflict_rejected",true);
            if(natural){
                int before=forced.getJSONObject("world").getJSONObject("life").getJSONArray("runs").length();long scheduled=System.currentTimeMillis();TResidentWorker.schedule(getTargetContext());
                // Real periodic scheduling: no JobScheduler run command, no TestDriver delay override.
                boolean observed=false;for(int i=0;i<1260;i++){Thread.sleep(1000);JSONObject latest=new JSONObject(store.read().getString("data"));JSONArray runs=latest.getJSONObject("world").getJSONObject("life").getJSONArray("runs");if(runs.length()>before){JSONObject last=runs.getJSONObject(runs.length()-1);if(last.optString("state").equals("complete")){observed=true;evidence.put("natural_run",last);break;}}}
                evidence.put("natural_scheduled_at",scheduled).put("natural_observed",observed);check(observed,"natural periodic execution not observed in 21 minutes");
            }
            File out=new File(getTargetContext().getFilesDir(),"resident-acceptance.json");Files.write(out.toPath(),evidence.toString(2).getBytes(StandardCharsets.UTF_8));
            result.putString("stream","PASS: shared QuickJS foreground + no-Activity Worker, real OB/SQLite, mock model; natural="+natural+"\n");finish(-1,result);
        }catch(Throwable e){java.io.StringWriter trace=new java.io.StringWriter();e.printStackTrace(new java.io.PrintWriter(trace));result.putString("stream",trace.toString());finish(1,result);
        }finally{
            TResidentEngine.testModel=null;WorkManager.getInstance(getTargetContext()).cancelUniqueWork(TResidentWorker.NAME);store.close();
            // Keep dedicated synthetic results for subsequent native screenshot and restart verification.
        }
    }
}
