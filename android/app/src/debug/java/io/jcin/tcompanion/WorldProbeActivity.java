package io.jcin.tcompanion;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebView;
import android.webkit.JavascriptInterface;
import org.json.JSONObject;

/** Read-only debug viewer; never starts a worker or generates a message. */
public final class WorldProbeActivity extends Activity {
    static final java.util.concurrent.atomic.AtomicInteger created=new java.util.concurrent.atomic.AtomicInteger();
    private WebView view;
    @Override public void onCreate(Bundle state){
        super.onCreate(state);created.incrementAndGet();
        WebView.setWebContentsDebuggingEnabled(true);view=new WebView(this);
        view.getSettings().setJavaScriptEnabled(true);view.getSettings().setBlockNetworkLoads(true);
        view.addJavascriptInterface(new Object(){
            @JavascriptInterface public String read(){
                try(WorldProbeEngine engine=new WorldProbeEngine(WorldProbeActivity.this)){return engine.read().toString();}
                catch(Exception error){return "{\"error\":"+JSONObject.quote(error.getMessage()==null?"读取失败":error.getMessage())+"}";}
            }
        },"Probe");
        setContentView(view);view.loadUrl("file:///android_asset/world-probe/index.html");
    }
    @Override public void onDestroy(){if(view!=null){view.removeJavascriptInterface("Probe");view.destroy();}super.onDestroy();}
}
