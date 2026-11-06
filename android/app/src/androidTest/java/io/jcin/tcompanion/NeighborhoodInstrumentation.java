package io.jcin.tcompanion;

import android.app.Instrumentation;
import android.os.Bundle;
import androidx.work.*;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.concurrent.TimeUnit;

/** Dedicated synthetic upgrade data only. No Activity, WebView or paid model. */
public final class NeighborhoodInstrumentation extends Instrumentation {
    private void check(boolean ok,String why){if(!ok)throw new AssertionError(why);}
    @Override public void onCreate(Bundle args){super.onCreate(args);start();}
    private JSONObject initialize(JSONObject data)throws Exception{
        try(app.cash.quickjs.QuickJs js=app.cash.quickjs.QuickJs.create();InputStream in=getTargetContext().getAssets().open("resident/rules.js")){
            ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] bytes=new byte[8192];int n;while((n=in.read(bytes))!=-1)out.write(bytes,0,n);js.evaluate(out.toString("UTF-8"));
            return new JSONObject((String)js.evaluate("JSON.stringify(ResidentRules.command("+data+",'initialize',{}).data)"));
        }
    }
    private void save(TDocumentStore store,JSONObject d)throws Exception{
        check(store.acquire("acceptance"),"write lease");try{store.save(d.toString(),store.read().getLong("revision"),"acceptance");}finally{store.release("acceptance");}
    }
    @Override public void onStart(){Bundle result=new Bundle();
        try(TDocumentStore store=new TDocumentStore(getTargetContext())){
            JSONObject old=new JSONObject(store.read().getString("data"));check(old.optString("synthetic_fixture").equals("neighborhood-upgrade-v1"),"requires isolated synthetic upgrade fixture");
            int messages=old.getJSONArray("messages").length();JSONObject d=initialize(old);
            JSONObject settings=d.getJSONObject("world").getJSONObject("life").getJSONObject("settings");settings.put("enabled",true).put("background",true).put("auto_memory",false).put("share",false).put("quiet_start",0).put("quiet_end",0);
            d.getJSONObject("world").getJSONObject("life").getJSONArray("wakeups").put(new JSONObject().put("owner_id","a").put("reason","encounter").put("key","synthetic-encounter").put("state","pending"));
            save(store,d);check(store.preUpgrade().has("data"),"pre-upgrade recovery backup missing");check(new JSONObject(store.preUpgrade().getString("data")).getJSONObject("world").getInt("version")==1,"backup altered old format");
            final int[] calls={0};TResidentEngine.testModel=(profile,prompt,job)->{
                calls[0]++;JSONObject p=new JSONObject(prompt.getJSONObject(1).getString("content"));String owner=p.getString("actor_id");
                if(prompt.getJSONObject(0).getString("content").contains("任务：plan"))return new JSONObject().put("actor_id",owner).put("plan",new JSONObject().put("title","庭院散步").put("steps",new JSONArray().put(new JSONObject().put("location_id","courtyard").put("activity","walk").put("duration_minutes",30)))).toString();
                return new JSONObject().put("actor_id",owner).put("messages",new JSONArray().put(new JSONObject().put("to_id",owner.equals("a")?"b":"a").put("text","庭院的散步安排已记好。"+job))).toString();
            };
            try(TResidentEngine e=new TResidentEngine(getTargetContext())){e.run("neighborhood-headless","foreground",false,false);}
            JSONObject first=new JSONObject(store.read().getString("data"));JSONObject w=first.getJSONObject("world"),life=w.getJSONObject("life");check(calls[0]<=6,"batch request cap");check(w.getInt("version")==2&&w.getJSONArray("locations").length()==3,"world migration");check(life.getJSONObject("schedules").length()==2,"initial independent plans");check(first.getJSONArray("messages").length()==messages,"no synthetic user dialogue");
            check(w.getJSONObject("communication").getJSONArray("threads").length()>1,"SullyOS DM missing");
            int before=w.getJSONArray("events").length(),paid=calls[0];
            try(TResidentEngine e=new TResidentEngine(getTargetContext())){e.run("neighborhood-headless","foreground",false,false);}check(calls[0]==paid,"replay charged again");
            // Move only synthetic due times into the past. Worker must finish rules with zero budget.
            String due=new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",java.util.Locale.ROOT){{setTimeZone(java.util.TimeZone.getTimeZone("UTC"));}}.format(new java.util.Date(System.currentTimeMillis()-1800000));
            JSONObject activities=life.getJSONObject("activities");java.util.Iterator<String> owners=activities.keys();while(owners.hasNext())activities.getJSONObject(owners.next()).put("ends_at",due);
            life.put("simulated_at",new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",java.util.Locale.ROOT){{setTimeZone(java.util.TimeZone.getTimeZone("UTC"));}}.format(new java.util.Date(System.currentTimeMillis()-3600000)));
            settings=life.getJSONObject("settings");settings.put("daily_requests",0);save(store,first);
            WorkManager manager=WorkManager.getInstance(getTargetContext());OneTimeWorkRequest task=new OneTimeWorkRequest.Builder(TResidentWorker.class).build();manager.enqueue(task).getResult().get(20,TimeUnit.SECONDS);
            boolean done=false;for(int i=0;i<300;i++){WorkInfo info=manager.getWorkInfoById(task.getId()).get();if(info.getState().isFinished()){check(info.getState()==WorkInfo.State.SUCCEEDED,"worker failed");done=true;break;}Thread.sleep(100);}check(done,"worker timeout");
            JSONObject after=new JSONObject(store.read().getString("data"));check(after.getJSONObject("world").getJSONArray("events").length()>before,"worker did not advance rules");check(calls[0]==paid,"ordinary rules called model");
            check(after.getJSONArray("messages").toString().equals(old.getJSONArray("messages").toString()),"old chat changed");check(after.getJSONObject("memory").toString().equals(old.getJSONObject("memory").toString()),"old memory changed");check(after.getJSONObject("character_looks").toString().equals(old.getJSONObject("character_looks").toString()),"wardrobe changed");
            long rev=store.read().getLong("revision");save(store,after);boolean stale=false;try{store.save(after.toString(),rev,"acceptance");}catch(IllegalStateException e){stale=true;}check(stale,"stale SQLite write accepted");
            JSONObject concurrentLife=after.getJSONObject("world").getJSONObject("life");concurrentLife.getJSONObject("settings").put("daily_requests",24).put("max_requests",1);concurrentLife.getJSONArray("wakeups").put(new JSONObject().put("owner_id","a").put("reason","test").put("key","native-write-during-model").put("state","pending"));save(store,after);
            TResidentEngine.testModel=(profile,prompt,job)->{calls[0]++;try(TDocumentStore foreground=new TDocumentStore(getTargetContext())){check(foreground.acquire("foreground-during-model"),"model held global write lock");try{JSONObject snapshot=foreground.read(),changed=new JSONObject(snapshot.getString("data"));changed.getJSONObject("world").put("tick",changed.getJSONObject("world").getLong("tick")+1);foreground.save(changed.toString(),snapshot.getLong("revision"),"foreground-during-model");}finally{foreground.release("foreground-during-model");}}return new JSONObject().put("actor_id",new JSONObject(prompt.getJSONObject(1).getString("content")).getString("actor_id")).put("messages",new JSONArray()).toString();};
            try(TResidentEngine e=new TResidentEngine(getTargetContext())){e.run("native-concurrent-write","foreground",false,false);}
            after=new JSONObject(store.read().getString("data"));JSONArray jobs=after.getJSONObject("world").getJSONObject("life").getJSONArray("jobs");check(jobs.getJSONObject(jobs.length()-1).getString("state").equals("stale"),"old model decision overwrote concurrent world");
            after.getJSONObject("world").getJSONObject("life").getJSONObject("settings").put("daily_requests",0);save(store,after);
            JSONObject evidence=new JSONObject().put("upgrade_preserved",true).put("recovery_backup",true).put("headless_initial_plans",true).put("forced_worker_zero_model",true).put("replay_zero_model",true).put("stale_write_rejected",true).put("model_releases_write_lock",true).put("stale_model_rejected",true).put("mock_model_requests",calls[0]).put("events",after.getJSONObject("world").getJSONArray("events").length());
            Files.write(new File(getTargetContext().getFilesDir(),"neighborhood-acceptance.json").toPath(),evidence.toString(2).getBytes(StandardCharsets.UTF_8));result.putString("stream","PASS: "+evidence+"\n");finish(-1,result);
        }catch(Throwable e){StringWriter trace=new StringWriter();e.printStackTrace(new PrintWriter(trace));result.putString("stream",trace.toString());finish(1,result);}finally{TResidentEngine.testModel=null;WorkManager.getInstance(getTargetContext()).cancelUniqueWork(TResidentWorker.NAME);}
    }
}
