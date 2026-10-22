package io.jcin.tcompanion;

import android.content.Intent;
import android.app.Activity;
import android.speech.tts.TextToSpeech;
import android.speech.tts.Voice;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.ActivityCallback;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.Locale;

/** Thin adapters to Android's document picker and speech services; no provider credentials. */
@CapacitorPlugin(name = "TDevice")
public class TDevicePlugin extends Plugin {
    private TextToSpeech speech;
    private volatile boolean ready;

    @Override public void load() {
        getActivity().runOnUiThread(() -> speech = new TextToSpeech(getContext(), status -> ready = status == TextToSpeech.SUCCESS));
    }

    @PluginMethod public void voices(PluginCall call) {
        JSArray values = new JSArray();
        if (ready && speech.getVoices() != null) {
            for (Voice voice : speech.getVoices()) {
                JSObject value = new JSObject();
                value.put("voiceURI", voice.getName());
                value.put("name", voice.getName());
                value.put("lang", voice.getLocale().toLanguageTag());
                values.put(value);
            }
        }
        JSObject result = new JSObject(); result.put("voices", values); call.resolve(result);
    }

    @PluginMethod public void speak(PluginCall call) {
        if (!ready) { call.reject("系统朗读服务尚不可用，请安装或启用中文语音引擎"); return; }
        String text = call.getString("text", "");
        String name = call.getString("voice", "");
        int language = speech.setLanguage(Locale.SIMPLIFIED_CHINESE);
        if (name.isEmpty() && language < TextToSpeech.LANG_AVAILABLE) {
            call.reject("系统语音引擎缺少中文语音，请在 Android 中安装中文声音"); return;
        }
        if (speech.getVoices() != null) for (Voice voice : speech.getVoices()) if (voice.getName().equals(name)) speech.setVoice(voice);
        int result = speech.speak(text, TextToSpeech.QUEUE_FLUSH, null, "t-chat");
        if (result == TextToSpeech.ERROR) call.reject("系统朗读失败，请检查语音引擎"); else call.resolve();
    }

    @PluginMethod public void stopSpeech(PluginCall call) {
        if (speech != null) speech.stop();
        call.resolve();
    }

    @PluginMethod public void exportFile(PluginCall call) {
        try {
            String name = call.getString("name", "");
            String encoded = call.getString("base64", "");
            if (!name.matches("[a-zA-Z0-9._-]+\\.(json|zip)") || encoded.length() > 40000000) {
                call.reject("导出文件名或大小不正确"); return;
            }
            File directory = new File(getContext().getCacheDir(), "exports");
            directory.mkdirs();
            File file = new File(directory, name);
            try (FileOutputStream output = new FileOutputStream(file)) { output.write(Base64.decode(encoded, Base64.DEFAULT)); }
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType(name.endsWith(".zip") ? "application/zip" : "application/json");
            intent.putExtra(Intent.EXTRA_TITLE, name);
            startActivityForResult(call, intent, "saveFileResult");
        } catch (Exception error) { call.reject("文件导出失败"); }
    }

    @ActivityCallback private void saveFileResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.reject("已取消导出"); return;
        }
        File file = new File(new File(getContext().getCacheDir(), "exports"), call.getString("name", ""));
        try (FileInputStream input = new FileInputStream(file);
             OutputStream output = getContext().getContentResolver().openOutputStream(result.getData().getData())) {
            if (output == null) throw new java.io.IOException();
            byte[] buffer = new byte[8192]; int size;
            while ((size = input.read(buffer)) != -1) output.write(buffer, 0, size);
            output.flush(); call.resolve();
        } catch (Exception error) { call.reject("保存文件失败，请重新导出"); }
    }

    @PluginMethod public void importFile(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        // JSON MIME labels vary between Android document providers; validate content after selection.
        intent.setType("*/*");
        startActivityForResult(call, intent, "openFileResult");
    }

    @ActivityCallback private void openFileResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.reject("已取消恢复文件选择"); return;
        }
        try (java.io.InputStream input = getContext().getContentResolver().openInputStream(result.getData().getData());
             java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream()) {
            if (input == null) throw new java.io.IOException();
            byte[] buffer = new byte[8192]; int size;
            while ((size = input.read(buffer)) != -1) {
                if (bytes.size() + size > 20000000) { call.reject("备份文件超过 20 MB"); return; }
                bytes.write(buffer, 0, size);
            }
            String data = new String(bytes.toByteArray(), java.nio.charset.StandardCharsets.UTF_8);
            new org.json.JSONObject(data);
            JSObject response = new JSObject(); response.put("data", data); call.resolve(response);
        } catch (Exception error) { call.reject("读取备份失败，请选择有效的 JSON 备份文件"); }
    }

    @Override protected void handleOnDestroy() {
        if (speech != null) { speech.stop(); speech.shutdown(); }
    }
}
