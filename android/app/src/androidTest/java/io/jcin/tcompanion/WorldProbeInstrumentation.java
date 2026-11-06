package io.jcin.tcompanion;

import android.app.Instrumentation;
import android.os.Bundle;
import androidx.work.*;
import org.json.JSONObject;
import java.io.File;
import java.nio.file.Files;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;

/** Run on a dedicated synthetic emulator. Does not open an Activity. */
public final class WorldProbeInstrumentation extends Instrumentation {
    private void check(boolean condition,String message){if(!condition)throw new AssertionError(message);}
    @Override public void onCreate(Bundle args){super.onCreate(args);start();}
    private void worker() throws Exception {
        WorkManager manager=WorkManager.getInstance(getTargetContext());
        OneTimeWorkRequest task=new OneTimeWorkRequest.Builder(WorldProbeWorker.class).build();
        manager.enqueue(task).getResult().get(20,TimeUnit.SECONDS);
        for(int i=0;i<300;i++){
            WorkInfo state=manager.getWorkInfoById(task.getId()).get();
            if(state.getState().isFinished()){check(state.getState()==WorkInfo.State.SUCCEEDED,"worker failed");return;}
            Thread.sleep(100);
        }
        throw new AssertionError("worker timed out");
    }
    @Override public void onStart(){
        Bundle result=new Bundle();
        try {
            check(WorldProbeActivity.created.get()==0,"activity already opened");
            // A new isolated database is required: never delete or reset user data.
            try(TDocumentStore store=new TDocumentStore(WorldProbeEngine.isolated(getTargetContext()))){check(!store.read().has("data"),"use a fresh isolated emulator");}
            worker();
            JSONObject first;
            try(WorldProbeEngine engine=new WorldProbeEngine(getTargetContext())){first=engine.read();}
            check(first.getLong("revision")==1,"initial commit revision");
            check(first.getJSONObject("snapshot").getString("received").contains("林：今晚一起看书吗？"),"B must receive A's original-module message");
            worker();
            try(WorldProbeEngine engine=new WorldProbeEngine(getTargetContext())){check(first.toString().equals(engine.read().toString()),"worker replay changed result");}
            try(WorldProbeEngine engine=new WorldProbeEngine(getTargetContext())){
                engine.run("probe-reply-2","好，我带一本书过去。","probe-b",1);
            }
            JSONObject before;
            try(WorldProbeEngine engine=new WorldProbeEngine(getTargetContext())){before=engine.read();}
            check(before.getLong("revision")==2,"second commit");
            check(before.getJSONObject("snapshot").getJSONArray("threads").getJSONObject(0).getJSONArray("messages").length()==2,"two upstream messages");
            boolean stale=false;
            try(WorldProbeEngine engine=new WorldProbeEngine(getTargetContext())){engine.run("probe-stale","旧版本消息","probe-a",1);}catch(IllegalStateException expected){stale=true;}
            check(stale,"stale request accepted");
            try(TDocumentStore store=new TDocumentStore(WorldProbeEngine.isolated(getTargetContext()))) {
                JSONObject stored=store.read();check(store.acquire("cas-test"),"CAS lease");boolean refused=false;
                try{store.save(stored.getString("data"),stored.getLong("revision")-1,"cas-test");}catch(IllegalStateException expected){refused=true;}finally{store.release("cas-test");}
                check(refused,"production CAS accepted stale version");
                store.getWritableDatabase().execSQL("CREATE TRIGGER probe_fail BEFORE INSERT ON documents BEGIN SELECT RAISE(ABORT,'injected probe disk failure'); END");
                boolean failed=false;
                try(WorldProbeEngine engine=new WorldProbeEngine(getTargetContext())){engine.run("probe-failed-save","不应出现的消息","probe-a",2);}catch(Exception expected){failed=true;}
                finally{store.getWritableDatabase().execSQL("DROP TRIGGER probe_fail");}
                check(failed,"SQLite failure reported as success");
            }
            try(WorldProbeEngine engine=new WorldProbeEngine(getTargetContext())){check(before.toString().equals(engine.read().toString()),"failed save changed committed snapshot or receipt");}
            check(WorldProbeActivity.created.get()==0,"headless worker used Activity");
            JSONObject evidence=new JSONObject().put("headless_worker",true).put("activity_count",0).put("model_requests",0).put("duplicate_unchanged",true).put("stale_refused",true).put("sqlite_failure_rolled_back",true).put("expected",before);
            Files.write(new File(getTargetContext().getFilesDir(),"world-probe-evidence.json").toPath(),evidence.toString(2).getBytes(StandardCharsets.UTF_8));
            result.putString("stream","PASS: upstream SullyOS + A-Life in QuickJS, headless Worker, SQLite, replay, rollback, CAS\n");finish(-1,result);
        } catch(Throwable error){java.io.StringWriter trace=new java.io.StringWriter();error.printStackTrace(new java.io.PrintWriter(trace));result.putString("stream",trace.toString());finish(1,result);}
    }
}
