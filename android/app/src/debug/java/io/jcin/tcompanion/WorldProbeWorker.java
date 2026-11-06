package io.jcin.tcompanion;

import android.content.Context;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import androidx.annotation.NonNull;

/** One-shot debug worker: no Activity, WebView, network or model dependency. */
public final class WorldProbeWorker extends Worker {
    public WorldProbeWorker(@NonNull Context context,@NonNull WorkerParameters parameters){super(context,parameters);}
    @NonNull @Override public Result doWork(){
        try(WorldProbeEngine engine=new WorldProbeEngine(getApplicationContext())) {
            engine.run("probe-worker-1","今晚一起看书吗？","probe-a",-1);
            return Result.success();
        } catch(Exception error){return Result.failure();}
    }
}
