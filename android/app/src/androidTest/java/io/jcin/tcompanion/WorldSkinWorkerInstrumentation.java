package io.jcin.tcompanion;

import android.app.Instrumentation;
import android.os.Bundle;
import androidx.work.*;
import org.json.*;
import java.util.concurrent.TimeUnit;

/** No Activity or paid service. Real shared QuickJS rules, SQLite and OB. */
public class WorldSkinWorkerInstrumentation extends Instrumentation {
    private void check(boolean value,String reason){if(!value)throw new AssertionError(reason);}
    @Override public void onCreate(Bundle args){super.onCreate(args);start();}
    @Override public void onStart(){
        Bundle result=new Bundle();TDocumentStore store=new TDocumentStore(getTargetContext());String original=null;
        try{
            JSONObject snapshot=store.read(),data=new JSONObject(snapshot.getString("data"));original=data.toString();JSONArray chars=data.getJSONArray("characters");check(chars.length()==2&&chars.getJSONObject(0).getString("name").equals("林")&&chars.getJSONObject(1).getString("name").equals("雨"),"dedicated synthetic emulator required");
            String a=chars.getJSONObject(0).getString("id"),b=chars.getJSONObject(1).getString("id");JSONObject looks=data.getJSONObject("character_looks");check(looks.getJSONObject(a).getJSONArray("skins").getJSONObject(0).getString("id").equals("night"),"skin fixture required");
            looks.put(b,new JSONObject(looks.getJSONObject(a).toString()).put("active_skin_id","default"));
            JSONObject life=data.getJSONObject("world").getJSONObject("life"),settings=life.getJSONObject("settings");settings.put("enabled",true).put("background",true).put("quiet_start",0).put("quiet_end",0).put("max_actions",1).put("max_requests",1).put("daily_requests",200).put("auto_memory",false).put("share",false);life.put("cursor",0);
            check(store.acquire("skin-worker-test"),"lease");store.save(data.toString(),snapshot.getLong("revision"),"skin-worker-test");store.release("skin-worker-test");final int[] requests={0};
            TResidentEngine.testModel=(profile,messages,job)->{
                requests[0]++;JSONObject input=new JSONObject(messages.getJSONObject(1).getString("content")),appearance=input.getJSONObject("appearance");String current=appearance.getString("current_skin");
                check(!messages.toString().contains("base64,"),"images stay out of model context");
                return new JSONObject().put("actor_id",input.getString("actor_id")).put("type","change_skin").put("skin_id",current.equals("night")?"default":"night").toString();
            };
            try(TResidentEngine engine=new TResidentEngine(getTargetContext())){engine.run("skin-foreground","foreground",false,false);}
            check(requests[0]==1,"one foreground request");check(new JSONObject(store.read().getString("data")).getJSONObject("character_looks").getJSONObject(a).getString("active_skin_id").equals("default"),"foreground switches only A");
            WorkManager manager=WorkManager.getInstance(getTargetContext());OneTimeWorkRequest task=new OneTimeWorkRequest.Builder(TResidentWorker.class).build();manager.enqueue(task).getResult().get(20,TimeUnit.SECONDS);
            for(int i=0;i<120;i++){if(manager.getWorkInfoById(task.getId()).get().getState().isFinished())break;Thread.sleep(250);}
            JSONObject after=new JSONObject(store.read().getString("data"));check(requests[0]==2,"one Worker request, no hidden Activity");check(after.getJSONObject("character_looks").getJSONObject(b).getString("active_skin_id").equals("night"),"Worker switches only B");check(after.getJSONObject("character_looks").getJSONObject(a).getString("active_skin_id").equals("default"),"Worker preserves A skin");
            result.putString("skin_worker","passed");result.putString("checks","same rules, no Activity, authorized per-person skins, two mock requests, real SQLite/OB");
        }catch(Throwable e){result.putString("skin_worker","failed");result.putString("error",e.toString());}
        finally{
            TResidentEngine.testModel=null;WorkManager.getInstance(getTargetContext()).cancelUniqueWork(TResidentWorker.NAME);
            try{store.release("skin-worker-test");if(original!=null){check(store.acquire("skin-worker-test"),"restore lease");store.save(original,store.read().getLong("revision"),"skin-worker-test");}store.release("skin-worker-test");}catch(Throwable e){result.putString("skin_worker","failed");result.putString("restore_error",e.toString());}store.close();
        }
        finish("passed".equals(result.getString("skin_worker"))?-1:0,result);
    }
}
