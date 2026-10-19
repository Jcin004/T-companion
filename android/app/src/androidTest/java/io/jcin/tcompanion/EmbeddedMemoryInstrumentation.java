package io.jcin.tcompanion;

import android.app.Instrumentation;
import android.os.Bundle;
import com.chaquo.python.Python;
import com.chaquo.python.android.AndroidPlatform;
import java.io.File;
import java.io.PrintWriter;
import java.io.StringWriter;

/** Empty synthetic vault only. Reports packaging failures without touching app data. */
public class EmbeddedMemoryInstrumentation extends Instrumentation {
    @Override public void onCreate(Bundle args) { super.onCreate(args); start(); }
    @Override public void onStart() {
        Bundle result = new Bundle();
        try {
            if (!Python.isStarted()) Python.start(new AndroidPlatform(getTargetContext()));
            String output = Python.getInstance().getModule("t_memory").callAttr("dispatch",
                new File(getTargetContext().getCacheDir(), "ob-packaging-test").getAbsolutePath(),
                "{\"action\":\"recall\",\"owner\":\"test\",\"queries\":[\"orchid\"],\"records\":[{\"id\":\"fixture\",\"owner_id\":\"test\",\"title\":\"orchid\",\"content\":\"purple orchid\",\"active\":true}]}").toString();
            if (!output.contains("embedded-ob")) throw new AssertionError("Incorrect provider");
            result.putString("stream", "PASS: embedded Python/OB loaded\n");
            finish(-1, result);
        } catch (Throwable error) {
            StringWriter trace = new StringWriter(); error.printStackTrace(new PrintWriter(trace));
            result.putString("stream", trace.toString()); finish(1, result);
        }
    }
}
