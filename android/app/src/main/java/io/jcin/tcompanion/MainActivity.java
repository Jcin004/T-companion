package io.jcin.tcompanion;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle state) {
        registerPlugin(TDevicePlugin.class);
        registerPlugin(TLocalPlugin.class);
        registerPlugin(TUpdatePlugin.class);
        super.onCreate(state);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                getBridge().getWebView().evaluateJavascript("window.tGoBack?.() || false", result -> {
                    if (!"true".equals(result)) {
                        if (getBridge().getWebView().canGoBack()) getBridge().getWebView().goBack();
                        else moveTaskToBack(true);
                    }
                });
            }
        });
    }
}
