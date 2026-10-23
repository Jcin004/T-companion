package io.jcin.tcompanion;

import android.app.Instrumentation;
import android.os.Bundle;
import android.graphics.Bitmap;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.util.Base64;
import org.json.*;
import java.io.ByteArrayOutputStream;

/** Dedicated synthetic emulator. Real SQLite asset rows, CAS and transaction rollback. */
public class WorldVisualInstrumentation extends Instrumentation {
    private void check(boolean ok,String reason){if(!ok)throw new AssertionError(reason);}
    @Override public void onCreate(Bundle args){super.onCreate(args);start();}
    @Override public void onStart(){
        Bundle result=new Bundle();TDocumentStore store=new TDocumentStore(getTargetContext());String original=null;
        try{
            JSONObject snap=store.read();original=snap.getString("data");JSONObject data=new JSONObject(original);JSONArray chars=data.getJSONArray("characters");
            check(chars.length()==2&&chars.getJSONObject(0).getString("name").equals("林")&&chars.getJSONObject(1).getString("name").equals("雨"),"Synthetic emulator required");
            String owner=chars.getJSONObject(0).getString("id");JSONObject looks=data.optJSONObject("character_looks");if(looks==null){looks=new JSONObject();data.put("character_looks",looks);}
            JSONArray portraits=new JSONArray();int seed=17;
            for(int n=0;n<6;n++){
                int[] pixels=new int[256*512];for(int i=0;i<pixels.length;i++){seed=seed*1664525+1013904223;pixels[i]=0xff000000|(seed&0x00ffffff);}
                Bitmap bitmap=Bitmap.createBitmap(pixels,256,512,Bitmap.Config.ARGB_8888);ByteArrayOutputStream out=new ByteArrayOutputStream();bitmap.compress(Bitmap.CompressFormat.PNG,100,out);bitmap.recycle();
                String image="data:image/png;base64,"+Base64.encodeToString(out.toByteArray(),Base64.NO_WRAP);check(image.length()<1200000,"bounded asset row");portraits.put(new JSONObject().put("name","合成测试图"+n).put("image",image));
            }
            looks.put(owner,new JSONObject().put("skin",1).put("portrait",0).put("portraits",portraits).put("sprite",JSONObject.NULL));
            JSONObject outfit=new JSONObject().put("id","night").put("name","合成夜间服").put("skin",1).put("portrait",0).put("portraits",new JSONArray().put(new JSONObject(portraits.getJSONObject(0).toString()).put("emotion","happy"))).put("sprite",new JSONObject().put("image",portraits.getJSONObject(1).getString("image")).put("frames",4)).put("actions",new JSONObject().put("plant",new JSONObject().put("image",portraits.getJSONObject(2).getString("image")).put("frames",4).put("row_count",1)));
            outfit.put("gestures",new JSONObject().put("wave",new JSONObject().put("name","挥手").put("atlas",new JSONObject().put("image",portraits.getJSONObject(3).getString("image")).put("frames",3).put("row_count",1))));
            looks.getJSONObject(owner).put("gestures",new JSONObject().put("nod",new JSONObject().put("name","点头").put("atlas",new JSONObject().put("image",portraits.getJSONObject(4).getString("image")).put("frames",3).put("row_count",1))));
            looks.getJSONObject(owner).put("skins",new JSONArray().put(outfit)).put("active_skin_id","default").put("auto_skin",true);
            check(data.toString().length()>2000000,"payload exceeds document CursorWindow");check(store.acquire("visual-assets-test"),"lease");store.save(data.toString(),snap.getLong("revision"),"visual-assets-test");
            SQLiteDatabase db=store.getWritableDatabase();long rawSize;try(Cursor c=db.rawQuery("SELECT LENGTH(data) FROM documents WHERE id=1",null)){c.moveToFirst();rawSize=c.getLong(0);}check(rawSize<2000000,"document remains bounded");
            JSONObject hydrated=new JSONObject(store.read().getString("data"));JSONArray restored=hydrated.getJSONObject("character_looks").getJSONObject(owner).getJSONArray("portraits");
            for(int n=0;n<6;n++)check(restored.getJSONObject(n).getString("image").equals(portraits.getJSONObject(n).getString("image")),"hydrated source image "+n);
            JSONObject loadedSkin=hydrated.getJSONObject("character_looks").getJSONObject(owner).getJSONArray("skins").getJSONObject(0);
            check(loadedSkin.getJSONArray("portraits").getJSONObject(0).getString("image").equals(portraits.getJSONObject(0).getString("image")),"nested expression portrait restored");
            check(loadedSkin.getJSONObject("sprite").getString("image").equals(portraits.getJSONObject(1).getString("image")),"nested walking sprite restored");
            check(loadedSkin.getJSONObject("actions").getJSONObject("plant").getString("image").equals(portraits.getJSONObject(2).getString("image")),"nested interaction sprite restored");
            check(loadedSkin.getJSONObject("gestures").getJSONObject("wave").getJSONObject("atlas").getString("image").equals(portraits.getJSONObject(3).getString("image")),"nested gesture sprite restored");
            check(hydrated.getJSONObject("character_looks").getJSONObject(owner).getJSONObject("gestures").getJSONObject("nod").getJSONObject("atlas").getString("image").equals(portraits.getJSONObject(4).getString("image")),"default gesture sprite restored");
            long revision=store.read().getLong("revision");boolean stale=false;try{store.save(data.toString(),snap.getLong("revision"),"visual-assets-test");}catch(IllegalStateException e){stale=true;}check(stale,"CAS refuses stale asset writes");
            String before=store.read().getString("data");db.execSQL("CREATE TEMP TRIGGER fail_visual_document BEFORE INSERT ON documents BEGIN SELECT RAISE(ABORT,'synthetic document save failure'); END");
            boolean failed=false;try{JSONObject changed=new JSONObject(before);changed.getJSONObject("character_looks").getJSONObject(owner).getJSONArray("portraits").remove(5);store.save(changed.toString(),revision,"visual-assets-test");}catch(Exception e){failed=true;}finally{db.execSQL("DROP TRIGGER IF EXISTS fail_visual_document");}
            check(failed,"injected document failure");check(store.read().getLong("revision")==revision,"failed save does not advance revision");
            JSONArray unchanged=new JSONObject(store.read().getString("data")).getJSONObject("character_looks").getJSONObject(owner).getJSONArray("portraits");check(unchanged.length()==6&&unchanged.getJSONObject(5).getString("image").equals(portraits.getJSONObject(5).getString("image")),"asset deletion rolled back with document");
            result.putString("visual_assets","passed");result.putString("checks","large valid PNG payload, bounded SQLite rows, hydrated backup content, stale CAS, document failure rolls back assets");
        }catch(Throwable e){result.putString("visual_assets","failed");result.putString("error",e.toString());}
        finally{
            try{store.getWritableDatabase().execSQL("DROP TRIGGER IF EXISTS fail_visual_document");if(original!=null){store.release("visual-assets-test");check(store.acquire("visual-assets-test"),"restore lease");store.save(original,store.read().getLong("revision"),"visual-assets-test");}store.release("visual-assets-test");}catch(Throwable e){result.putString("visual_assets","failed");result.putString("restore_error",e.toString());}
            store.close();
        }
        finish("passed".equals(result.getString("visual_assets"))?-1:0,result);
    }
}
