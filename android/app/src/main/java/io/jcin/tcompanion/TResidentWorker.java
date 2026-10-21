package io.jcin.tcompanion;
import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.*;
import org.json.*;
import java.util.concurrent.TimeUnit;

/** Finite work; WorkManager owns wakeups, constraints and cancellation. */
public final class TResidentWorker extends Worker {
    static final String NAME="t-resident-periodic-v1";
    public TResidentWorker(@NonNull Context context,@NonNull WorkerParameters parameters){super(context,parameters);}
    static void schedule(Context context) throws Exception {
        try(TDocumentStore store=new TDocumentStore(context)){
            JSONObject doc=store.read();if(!doc.has("data"))return;
            JSONObject life=new JSONObject(doc.getString("data")).getJSONObject("world").optJSONObject("life");
            if(life==null||!life.getJSONObject("settings").optBoolean("enabled")||!life.getJSONObject("settings").optBoolean("background")){WorkManager.getInstance(context).cancelUniqueWork(NAME);return;}
            int minutes=life.getJSONObject("settings").getInt("interval_minutes");
            Constraints constraints=new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).setRequiresBatteryNotLow(true).build();
            PeriodicWorkRequest request=new PeriodicWorkRequest.Builder(TResidentWorker.class,minutes,TimeUnit.MINUTES).setInitialDelay(minutes,TimeUnit.MINUTES).setConstraints(constraints).addTag(NAME).build();
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(NAME,ExistingPeriodicWorkPolicy.UPDATE,request);
        }
    }
    @NonNull public Result doWork(){
        String id="worker_"+getId()+"_"+getRunAttemptCount()+"_"+System.currentTimeMillis();
        try(TResidentEngine engine=new TResidentEngine(getApplicationContext())){
            engine.run(id,"worker",false,false);return Result.success();
        }catch(Exception e){
            // A paid request may be uncertain. Automatic retries must never resend it.
            return Result.success(new Data.Builder().putString("status","skipped_or_needs_review").build());
        }
    }
    @Override public void onStopped(){TResidentEngine.cancel();}
}
