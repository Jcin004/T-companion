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
        intent.setType(Boolean.TRUE.equals(call.getBoolean("image",false))?"image/*":"*/*");
        startActivityForResult(call, intent, "openFileResult");
    }

    @ActivityCallback private void openFileResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            if(Boolean.TRUE.equals(call.getBoolean("image",false)))call.reject("已取消图片选择","image_cancelled");
            else call.reject("已取消恢复文件选择");
            return;
        }
        try (java.io.InputStream input = getContext().getContentResolver().openInputStream(result.getData().getData());
             java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream()) {
            if (input == null) throw new java.io.IOException();
            byte[] buffer = new byte[8192]; int size;
            while ((size = input.read(buffer)) != -1) {
                int limit=Boolean.TRUE.equals(call.getBoolean("image",false))?4000000:20000000;
                if (bytes.size() + size > limit) { call.reject(limit==4000000?"图片超过 4 MB":"备份文件超过 20 MB"); return; }
                bytes.write(buffer, 0, size);
            }
            if(Boolean.TRUE.equals(call.getBoolean("image",false))){
                byte[] raw=bytes.toByteArray();android.graphics.BitmapFactory.Options options=new android.graphics.BitmapFactory.Options();options.inJustDecodeBounds=true;
                android.graphics.BitmapFactory.decodeByteArray(raw,0,raw.length,options);
                if(options.outWidth<=0||options.outHeight<=0||(long)options.outWidth*options.outHeight>16000000||!("image/png".equals(options.outMimeType)||"image/jpeg".equals(options.outMimeType)||"image/webp".equals(options.outMimeType))){call.reject("请选择有效的 PNG、JPEG 或 WebP 图片，且不超过 1600 万像素");return;}
                JSObject response=new JSObject();response.put("dataURL","data:"+options.outMimeType+";base64,"+Base64.encodeToString(raw,Base64.NO_WRAP));call.resolve(response);return;
            }
            String data = new String(bytes.toByteArray(), java.nio.charset.StandardCharsets.UTF_8);
            new org.json.JSONObject(data);
            JSObject response = new JSObject(); response.put("data", data); call.resolve(response);
        } catch (Exception error) { call.reject(Boolean.TRUE.equals(call.getBoolean("image",false))?"读取图片失败，请重新选择图片":"读取备份失败，请选择有效的 JSON 备份文件"); }
    }

    @Override protected void handleOnDestroy() {
        if (speech != null) { speech.stop(); speech.shutdown(); }
    }
}
