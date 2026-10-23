package io.jcin.tcompanion;

import android.app.Instrumentation;
import android.os.Bundle;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import org.json.*;

/** Synthetic images in an isolated in-memory SQLite database; no user data. */
public class CharacterArchiveInstrumentation extends Instrumentation {
    private void check(boolean value,String label){if(!value)throw new AssertionError(label);}
    @Override public void onCreate(Bundle args){super.onCreate(args);start();}
    @Override public void onStart(){
        Bundle result=new Bundle();SQLiteDatabase db=SQLiteDatabase.create(null);
        try{
            db.execSQL("CREATE TABLE look_assets(id TEXT PRIMARY KEY, data TEXT NOT NULL)");
            String image="data:image/png;base64,AAAA";
            JSONObject portrait=new JSONObject().put("image",image).put("asset_id","picture_a").put("emotion","happy");
            JSONObject archive=new JSONObject().put("version",1).put("items",new JSONArray().put(new JSONObject().put("id","picture_a").put("image",image)));
            JSONObject original=new JSONObject().put("character_archive",archive).put("character_looks",new JSONObject().put("a",new JSONObject().put("portraits",new JSONArray().put(portrait))));
            String encoded=TLookAssets.encode(db,original.toString());
            check(!encoded.contains("data:image"),"all archive and portrait pixels externalized");
            try(Cursor c=db.rawQuery("SELECT count(*) FROM look_assets",null)){c.moveToFirst();check(c.getInt(0)==1,"shared pixels stored once");}
            JSONObject restored=new JSONObject(TLookAssets.decode(db,encoded));
            check(restored.getJSONObject("character_archive").getJSONArray("items").getJSONObject(0).getString("image").equals(image),"archive round trip");
            check(restored.getJSONObject("character_looks").getJSONObject("a").getJSONArray("portraits").getJSONObject(0).getString("image").equals(image),"legacy projection round trip");
            original.remove("character_looks");TLookAssets.encode(db,original.toString());
            try(Cursor c=db.rawQuery("SELECT count(*) FROM look_assets",null)){c.moveToFirst();check(c.getInt(0)==1,"album-only image retained");}
            TLookAssets.encode(db,"{}");
            try(Cursor c=db.rawQuery("SELECT count(*) FROM look_assets",null)){c.moveToFirst();check(c.getInt(0)==0,"unreferenced bytes collected");}
            result.putString("result","PASS archive/portrait round trip, shared blob deduplication and collection");finish(0,result);
        }catch(Throwable error){result.putString("error",error.toString());finish(1,result);}
        finally{db.close();}
    }
}
