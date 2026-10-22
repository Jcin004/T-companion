package io.jcin.tcompanion;

import android.content.ContentValues;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import org.json.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.io.IOException;

/** Image rows share the business SQLite transaction; never overflow its document CursorWindow. */
final class TLookAssets {
    private interface Visitor { String image(String value) throws Exception; }
    private static void visit(JSONObject document,Visitor visitor) throws Exception {
        JSONObject looks=document.optJSONObject("character_looks");if(looks==null)return;
        for(Iterator<String> keys=looks.keys();keys.hasNext();){
            JSONObject look=looks.getJSONObject(keys.next());visitSkin(look,visitor);
            JSONArray skins=look.optJSONArray("skins");if(skins!=null)for(int i=0;i<skins.length();i++)visitSkin(skins.getJSONObject(i),visitor);
        }
    }
    private static void visitSkin(JSONObject look,Visitor visitor) throws Exception {
            JSONArray portraits=look.optJSONArray("portraits");
            if(portraits!=null)for(int i=0;i<portraits.length();i++){JSONObject portrait=portraits.getJSONObject(i);portrait.put("image",visitor.image(portrait.getString("image")));}
            JSONObject sprite=look.optJSONObject("sprite");if(sprite!=null)sprite.put("image",visitor.image(sprite.getString("image")));
            JSONObject actions=look.optJSONObject("actions");if(actions!=null)for(Iterator<String> keys=actions.keys();keys.hasNext();){JSONObject animation=actions.getJSONObject(keys.next());animation.put("image",visitor.image(animation.getString("image")));}
    }
    static String encode(SQLiteDatabase db,String value) throws Exception {
        JSONObject document=new JSONObject(value);Set<String> keep=new HashSet<>();
        visit(document,image->{
            if(!image.startsWith("data:image/")||image.length()>1200000)throw new IOException("Invalid image size");
            byte[] digest=MessageDigest.getInstance("SHA-256").digest(image.getBytes(StandardCharsets.UTF_8));StringBuilder hash=new StringBuilder();
            for(byte b:digest)hash.append(String.format(java.util.Locale.ROOT,"%02x",b&255));String id=hash.toString();
            boolean exists;try(Cursor c=db.rawQuery("SELECT id FROM look_assets WHERE id=?",new String[]{id})){exists=c.moveToFirst();}
            if(!exists){ContentValues row=new ContentValues();row.put("id",id);row.put("data",image);if(db.insertWithOnConflict("look_assets",null,row,SQLiteDatabase.CONFLICT_IGNORE)==-1)throw new IOException("Image asset save failed");}
            keep.add(id);return "asset:"+id;
        });
        List<String> remove=new ArrayList<>();try(Cursor c=db.rawQuery("SELECT id FROM look_assets",null)){while(c.moveToNext())if(!keep.contains(c.getString(0)))remove.add(c.getString(0));}
        for(String id:remove)db.delete("look_assets","id=?",new String[]{id});
        return document.toString();
    }
    static String decode(SQLiteDatabase db,String value) throws Exception {
        JSONObject document=new JSONObject(value);
        visit(document,image->{
            if(!image.startsWith("asset:"))return image;
            String id=image.substring(6);if(!id.matches("[a-f0-9]{64}"))throw new IOException("Invalid image reference");
            try(Cursor c=db.rawQuery("SELECT data FROM look_assets WHERE id=?",new String[]{id})){if(!c.moveToFirst())throw new IOException("Missing image asset");return c.getString(0);}
        });return document.toString();
    }
}
