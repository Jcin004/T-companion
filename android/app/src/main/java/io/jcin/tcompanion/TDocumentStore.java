package io.jcin.tcompanion;

import android.content.Context;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import org.json.JSONObject;

/** One SQLite document, revision CAS and a durable cross-host write lease. */
final class TDocumentStore extends SQLiteOpenHelper {
    private static final java.util.concurrent.atomic.AtomicBoolean processStarted=new java.util.concurrent.atomic.AtomicBoolean(false);
    TDocumentStore(Context context) { super(context,"t-local.db",null,1);setWriteAheadLoggingEnabled(true); }
    public void onCreate(SQLiteDatabase db) { db.execSQL("CREATE TABLE documents(id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)"); }
    public void onUpgrade(SQLiteDatabase db,int from,int to) { }
    private SQLiteDatabase ready() {
        SQLiteDatabase db=getWritableDatabase();
        db.execSQL("CREATE TABLE IF NOT EXISTS document_revision(id INTEGER PRIMARY KEY, revision INTEGER NOT NULL)");
        db.execSQL("INSERT OR IGNORE INTO document_revision VALUES(1,0)");
        db.execSQL("CREATE TABLE IF NOT EXISTS document_lease(id INTEGER PRIMARY KEY, owner TEXT, expires INTEGER)");
        db.execSQL("CREATE TABLE IF NOT EXISTS look_assets(id TEXT PRIMARY KEY, data TEXT NOT NULL)");
        if(processStarted.compareAndSet(false,true))db.delete("document_lease",null,null);
        return db;
    }
    synchronized JSONObject read() throws Exception {
        SQLiteDatabase db=ready();db.beginTransaction();
        try {
            JSONObject result=new JSONObject();
            try(Cursor c=db.rawQuery("SELECT data FROM documents WHERE id=1",null)){if(c.moveToFirst())result.put("data",TLookAssets.decode(db,c.getString(0)));}
            try(Cursor c=db.rawQuery("SELECT revision FROM document_revision WHERE id=1",null)){c.moveToFirst();result.put("revision",c.getLong(0));}
            db.setTransactionSuccessful();return result;
        } finally { db.endTransaction(); }
    }
    synchronized boolean acquire(String owner) {
        SQLiteDatabase db=ready();db.beginTransaction();
        try {
            long now=System.currentTimeMillis();
            try(Cursor c=db.rawQuery("SELECT owner,expires FROM document_lease WHERE id=1",null)){
                if(c.moveToFirst()&&!owner.equals(c.getString(0))&&c.getLong(1)>now)return false;
            }
            ContentValues row=new ContentValues();row.put("id",1);row.put("owner",owner);row.put("expires",now+600000);
            db.insertWithOnConflict("document_lease",null,row,SQLiteDatabase.CONFLICT_REPLACE);db.setTransactionSuccessful();return true;
        } finally { db.endTransaction(); }
    }
    synchronized void release(String owner){ready().delete("document_lease","id=1 AND owner=?",new String[]{owner});}
    synchronized void recoverProcessLease(){ready().delete("document_lease",null,null);}
    synchronized long save(String value,long revision,String owner) throws Exception {
        new JSONObject(value);SQLiteDatabase db=ready();db.beginTransaction();
        try {
            try(Cursor c=db.rawQuery("SELECT revision FROM document_revision WHERE id=1",null)){c.moveToFirst();if(revision!=c.getLong(0))throw new IllegalStateException("数据版本已更新，请重新操作");}
            try(Cursor c=db.rawQuery("SELECT owner,expires FROM document_lease WHERE id=1",null)){if(c.moveToFirst()&&!owner.equals(c.getString(0))&&c.getLong(1)>System.currentTimeMillis())throw new IllegalStateException("居民正在推进，请稍后操作");}
            ContentValues row=new ContentValues();row.put("id",1);row.put("data",TLookAssets.encode(db,value));
            if(db.insertWithOnConflict("documents",null,row,SQLiteDatabase.CONFLICT_REPLACE)==-1)throw new java.io.IOException();
            db.execSQL("UPDATE document_revision SET revision=revision+1 WHERE id=1");db.setTransactionSuccessful();return revision+1;
        } finally { db.endTransaction(); }
    }
}
