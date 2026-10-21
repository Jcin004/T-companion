package io.jcin.tcompanion;
import android.content.Context;
import com.chaquo.python.Python;
import com.chaquo.python.android.AndroidPlatform;
import java.io.File;
/** Same embedded OB projection lock for both UI and headless callers. */
final class TMemoryEngine {
    static synchronized String execute(Context context,String request) {
        if(!Python.isStarted())Python.start(new AndroidPlatform(context.getApplicationContext()));
        return Python.getInstance().getModule("t_memory").callAttr("dispatch",new File(context.getCacheDir(),"embedded-ob-v1").getAbsolutePath(),request).toString();
    }
}
