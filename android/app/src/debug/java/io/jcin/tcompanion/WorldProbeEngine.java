package io.jcin.tcompanion;

import android.content.Context;
import android.content.ContextWrapper;
import android.database.DatabaseErrorHandler;
import android.database.sqlite.SQLiteDatabase;
import app.cash.quickjs.QuickJs;
import org.json.JSONObject;
import java.io.*;

/** Debug-only upstream module host. Uses the production store in a separate DB. */
final class WorldProbeEngine implements AutoCloseable {
    private final TDocumentStore store;
    private final QuickJs js;
    private static final String OWNER="world-probe";

    static Context isolated(Context context) {
        return new ContextWrapper(context.getApplicationContext()) {
            @Override public File getDatabasePath(String name) {
                File directory=new File(getFilesDir(),"world-probe-db");
                if(!directory.isDirectory()&&!directory.mkdirs())throw new IllegalStateException("无法创建实验目录");
                return new File(directory,name);
            }
            @Override public SQLiteDatabase openOrCreateDatabase(String name,int mode,SQLiteDatabase.CursorFactory factory) {
                return SQLiteDatabase.openOrCreateDatabase(getDatabasePath(name),factory);
            }
            @Override public SQLiteDatabase openOrCreateDatabase(String name,int mode,SQLiteDatabase.CursorFactory factory,DatabaseErrorHandler handler) {
                return SQLiteDatabase.openOrCreateDatabase(getDatabasePath(name).getPath(),factory,handler);
            }
        };
    }
    WorldProbeEngine(Context context) throws Exception {
        store=new TDocumentStore(isolated(context));js=QuickJs.create();
        try(InputStream in=context.getAssets().open("world-probe/rules.js");ByteArrayOutputStream out=new ByteArrayOutputStream()) {
            byte[] bytes=new byte[8192];int count;while((count=in.read(bytes))!=-1)out.write(bytes,0,count);
            js.evaluate(out.toString("UTF-8"),"upstream-world-probe.js");
        }
    }
    private JSONObject reduce(JSONObject data,String operation,JSONObject args) throws Exception {
        return new JSONObject((String)js.evaluate("JSON.stringify(WorldProbe.command("+data.toString()+","+JSONObject.quote(operation)+","+args.toString()+"))"));
    }
    JSONObject run(String requestId,String text,String sender,long expectedRevision) throws Exception {
        if(!store.acquire(OWNER))throw new IllegalStateException("实验存储被占用");
        try {
            JSONObject saved=store.read();long revision=saved.getLong("revision");
            if(expectedRevision>=0&&expectedRevision!=revision)throw new IllegalStateException("旧版本实验请求被拒绝");
            JSONObject data=saved.has("data")?new JSONObject(saved.getString("data")):reduce(new JSONObject(),"fixture",new JSONObject()).getJSONObject("data");
            JSONObject result=reduce(data,"advance",new JSONObject().put("requestId",requestId).put("text",text).put("sender",sender));
            if(!result.getBoolean("replayed")) {
                JSONObject next=result.getJSONObject("data");next.put("ruleResult",reduce(next,"rules",new JSONObject()));
                // A failed SQLite transaction throws before any success is returned.
                store.save(next.toString(),revision,OWNER);
            }
            return read();
        } finally {store.release(OWNER);}
    }
    JSONObject read() throws Exception {
        JSONObject saved=store.read();if(!saved.has("data"))throw new IllegalStateException("尚无已保存实验结果");
        JSONObject data=new JSONObject(saved.getString("data"));
        return new JSONObject().put("revision",saved.getLong("revision")).put("snapshot",reduce(data,"snapshot",new JSONObject())).put("rules",data.getJSONObject("ruleResult"));
    }
    @Override public void close(){js.close();store.close();}
}
