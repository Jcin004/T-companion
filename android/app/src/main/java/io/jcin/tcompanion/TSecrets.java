package io.jcin.tcompanion;
import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;
/** Existing credential format shared by foreground and Worker; no second settings store. */
final class TSecrets {
    static synchronized javax.crypto.SecretKey encryptionKey() throws Exception {
        String alias="t-local-model-v1";KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);
        if(!store.containsAlias(alias)){
            KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(alias,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());generator.generateKey();
        }
        return (javax.crypto.SecretKey)store.getKey(alias,null);
    }
    static String modelKey(Context context,String id) throws Exception {
        String suffix=id.equals("legacy")?"":"."+id.replaceAll("[^a-zA-Z0-9_-]","_");
        android.content.SharedPreferences prefs=context.getSharedPreferences("t-secrets",0);
        if(!prefs.contains("cipher"+suffix))return "";
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,encryptionKey(),new GCMParameterSpec(128,Base64.decode(prefs.getString("iv"+suffix,""),Base64.NO_WRAP)));
        return new String(cipher.doFinal(Base64.decode(prefs.getString("cipher"+suffix,""),Base64.NO_WRAP)),StandardCharsets.UTF_8);
    }
}
