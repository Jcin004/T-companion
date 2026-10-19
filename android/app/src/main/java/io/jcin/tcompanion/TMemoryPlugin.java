package io.jcin.tcompanion;

import com.chaquo.python.Python;
import com.chaquo.python.android.AndroidPlatform;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Embedded OB only: no networking, model configuration or business DB writes. */
@CapacitorPlugin(name = "TMemory")
public class TMemoryPlugin extends Plugin {
    private final ExecutorService worker = Executors.newSingleThreadExecutor();

    @PluginMethod public void execute(PluginCall call) {
        String request = call.getString("request");
        if (request == null || request.length() > 60000000) {
            call.reject("记忆请求格式或大小错误");
            return;
        }
        worker.execute(() -> {
            try {
                if (!Python.isStarted()) Python.start(new AndroidPlatform(getContext()));
                File projection = new File(getContext().getCacheDir(), "embedded-ob-v1");
                String result = Python.getInstance().getModule("t_memory")
                    .callAttr("dispatch", projection.getAbsolutePath(), request).toString();
                JSObject output = new JSObject();
                output.put("result", result);
                call.resolve(output);
            } catch (Exception error) {
                // Python tracebacks may contain user text or local paths.
                call.reject("内置 OB 记忆操作失败，原数据未更改；请重试或导出备份");
            }
        });
    }

    @Override protected void handleOnDestroy() { worker.shutdown(); }
}
