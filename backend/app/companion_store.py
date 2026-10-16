"""Character identities, preferences and durable, idempotent message delivery."""
import json
import sqlite3
from dataclasses import asdict
from datetime import datetime, timezone
from uuid import uuid4
from zoneinfo import ZoneInfo

from backend.app.storage import ChatStore


DEFAULTS = {"base_url": "https://api.openai.com/v1", "model": "", "api_key": "",
            "theme": "light", "font_size": 16, "voice": "", "timezone": "Asia/Shanghai", "history_limit": 30}


class CompanionStore(ChatStore):
    def __init__(self, path=None, profile=None):
        super().__init__(path)
        with self._connect() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS characters(id TEXT PRIMARY KEY, data TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS preferences(id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS turns(
                    request_id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id),
                    user_id INTEGER NOT NULL REFERENCES messages(id),
                    assistant_id INTEGER REFERENCES messages(id), state TEXT NOT NULL);
                CREATE UNIQUE INDEX IF NOT EXISTS one_generation ON turns(session_id) WHERE state='generating';
                CREATE UNIQUE INDEX IF NOT EXISTS turns_user ON turns(user_id);
                CREATE INDEX IF NOT EXISTS message_dates ON messages(session_id,created_at,id);
            """)
            columns = {r[1] for r in db.execute("PRAGMA table_info(sessions)")}
            for name, definition in (("character_id", "TEXT NOT NULL DEFAULT 'primary'"),
                                     ("note", "TEXT NOT NULL DEFAULT ''"),
                                     ("background", "TEXT NOT NULL DEFAULT '#eef2f3'"),
                                     ("voice", "TEXT NOT NULL DEFAULT ''"),
                                     ("history_limit", "INTEGER DEFAULT NULL")):
                if name not in columns:
                    db.execute(f"ALTER TABLE sessions ADD COLUMN {name} {definition}")
            if profile:
                data = {"id": "primary", "name": profile.canon.name, "avatar": "",
                        "identity": profile.canon.description,
                        "style": "\n".join(profile.persona.communication_style),
                        "profile": asdict(profile)}
                db.execute("INSERT OR IGNORE INTO characters VALUES(?,?)", ("primary", json.dumps(data)))

    def recover(self):
        with self._connect() as db:
            db.execute("UPDATE turns SET state='failed' WHERE state='generating'")

    def bootstrap_settings(self, data):
        with self._connect() as db:
            db.execute('INSERT OR IGNORE INTO preferences VALUES(1,?)', (json.dumps(DEFAULTS | data),))

    def settings(self, public=False):
        with self._connect() as db:
            row = db.execute("SELECT data FROM preferences WHERE id=1").fetchone()
        data = DEFAULTS | (json.loads(row[0]) if row else {})
        if public:
            data["has_api_key"] = bool(data.pop("api_key"))
        return data

    def save_settings(self, data):
        merged = self.settings() | data
        with self._connect() as db:
            db.execute("INSERT OR REPLACE INTO preferences VALUES(1,?)", (json.dumps(merged),))
        return self.settings(public=True)

    def characters(self):
        with self._connect() as db:
            return [json.loads(r[0]) for r in db.execute("SELECT data FROM characters ORDER BY rowid")]

    def character(self, cid):
        with self._connect() as db:
            row = db.execute("SELECT data FROM characters WHERE id=?", (cid,)).fetchone()
        return json.loads(row[0]) if row else None

    def save_character(self, data, cid=None):
        cid = cid or str(uuid4())
        old = self.character(cid) or {}
        result = old | data | {"id": cid}
        # Imported Canon/Persona remain the sole authority, edited through the roster only.
        if "profile" in result:
            result["profile"]["canon"]["name"] = result["name"]
            result["profile"]["canon"]["description"] = result["identity"] or "UNSPECIFIED"
            result["profile"]["persona"]["communication_style"] = [result["style"]] if result["style"] else []
        with self._connect() as db:
            db.execute("INSERT OR REPLACE INTO characters VALUES(?,?)", (cid, json.dumps(result)))
        return result

    def create_contact(self, cid):
        with self._connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute("SELECT id FROM sessions WHERE character_id=? ORDER BY rowid LIMIT 1", (cid,)).fetchone()
            if row:
                return self.session(row[0])
            sid = str(uuid4())
            db.execute("INSERT INTO sessions(id,title,character_id) VALUES(?,?,?)", (sid, self.character(cid)["name"], cid))
        return self.session(sid)

    def session(self, sid):
        with self._connect() as db:
            db.row_factory = sqlite3.Row
            row = db.execute("SELECT * FROM sessions WHERE id=?", (sid,)).fetchone()
        return dict(row) if row else None

    def contacts(self):
        with self._connect() as db:
            db.row_factory = sqlite3.Row
            return [dict(r) for r in db.execute("""SELECT s.*,
                (SELECT content FROM messages WHERE session_id=s.id ORDER BY id DESC LIMIT 1) last_message,
                (SELECT created_at FROM messages WHERE session_id=s.id ORDER BY id DESC LIMIT 1) last_time,
                (SELECT MAX(id) FROM messages WHERE session_id=s.id AND role='assistant') last_assistant_id
                FROM sessions s ORDER BY COALESCE((SELECT MAX(id) FROM messages WHERE session_id=s.id),0) DESC,s.rowid DESC""")]

    def patch_session(self, sid, data):
        with self._connect() as db:
            for key in ("note", "background", "voice", "history_limit"):
                if key in data:
                    db.execute(f"UPDATE sessions SET {key}=? WHERE id=?", (data[key], sid))
        return self.session(sid)

    def begin_turn(self, sid, rid, content):
        with self._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT session_id,user_id,assistant_id,state FROM turns WHERE request_id=?", (rid,)).fetchone()
            if row:
                original = db.execute("SELECT content FROM messages WHERE id=?", (row[1],)).fetchone()[0]
                if row[0] != sid or original != content:
                    raise ValueError("请求标识已被另一条消息使用")
                if row[3] == "complete":
                    return "complete", row[1], row[2]
                if row[3] == "generating":
                    raise ValueError("这条消息仍在生成，请稍后刷新")
                db.execute("UPDATE turns SET state='generating' WHERE request_id=?", (rid,))
                return "generating", row[1], row[2]
            uid = db.execute("INSERT INTO messages(session_id,role,content) VALUES(?,'user',?)", (sid, content)).lastrowid
            db.execute("INSERT INTO turns VALUES(?,?,?,NULL,'generating')", (rid, sid, uid))
        return "generating", uid, None

    def finish_turn(self, rid, text=None):
        with self._connect() as db:
            if text is None:
                db.execute("UPDATE turns SET state='failed' WHERE request_id=? AND state='generating'", (rid,))
                return
            row = db.execute("SELECT session_id,state FROM turns WHERE request_id=?", (rid,)).fetchone()
            if row[1] != "generating":
                return
            aid = db.execute("INSERT INTO messages(session_id,role,content) VALUES(?,'assistant',?)", (row[0], text)).lastrowid
            db.execute("UPDATE turns SET state='complete',assistant_id=? WHERE request_id=?", (aid, rid))

    def history(self, sid, before=None, after=None, anchor=None, limit=40):
        with self._connect() as db:
            db.row_factory = sqlite3.Row
            sql = """SELECT m.*,t.request_id,t.state FROM messages m LEFT JOIN turns t ON t.user_id=m.id WHERE m.session_id=?"""
            if anchor is not None:
                if not db.execute("SELECT 1 FROM messages WHERE session_id=? AND id=?", (sid, anchor)).fetchone():
                    raise KeyError(anchor)
                left = db.execute(sql + " AND m.id<=? ORDER BY m.id DESC LIMIT ?", (sid, anchor, limit // 2)).fetchall()
                right = db.execute(sql + " AND m.id>? ORDER BY m.id LIMIT ?", (sid, anchor, limit // 2)).fetchall()
                rows = list(reversed(left)) + right
            elif after is not None:
                rows = db.execute(sql + " AND m.id>? ORDER BY m.id LIMIT ?", (sid, after, limit)).fetchall()
            else:
                rows = list(reversed(db.execute(sql + " AND m.id<? ORDER BY m.id DESC LIMIT ?", (sid, before or 9223372036854775807, limit)).fetchall()))
            items = [dict(r) for r in rows]
            return {"items": items,
                    "has_before": bool(items and db.execute("SELECT 1 FROM messages WHERE session_id=? AND id<? LIMIT 1", (sid, items[0]["id"])).fetchone()),
                    "has_after": bool(items and db.execute("SELECT 1 FROM messages WHERE session_id=? AND id>? LIMIT 1", (sid, items[-1]["id"])).fetchone())}

    def search(self, sid, query, before=9223372036854775807):
        pattern = '%' + query.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_') + '%'
        with self._connect() as db:
            db.row_factory = sqlite3.Row
            return [dict(r) for r in db.execute("SELECT * FROM messages WHERE session_id=? AND id<? AND content LIKE ? ESCAPE '\\' ORDER BY id DESC LIMIT 50", (sid, before, pattern))]

    def calendar(self, sid, month, tz):
        zone = ZoneInfo(tz)
        start = datetime.strptime(month + '-01', '%Y-%m-%d').replace(tzinfo=zone)
        end = start.replace(year=start.year+1, month=1) if start.month == 12 else start.replace(month=start.month+1)
        utc = lambda value: value.astimezone(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')
        with self._connect() as db:
            rows = db.execute("SELECT id,created_at FROM messages WHERE session_id=? AND created_at>=? AND created_at<? ORDER BY id", (sid, utc(start), utc(end)))
            days = {}
            for mid, stamp in rows:
                day = datetime.fromisoformat(stamp).replace(tzinfo=timezone.utc).astimezone(zone).date().isoformat()
                days.setdefault(day, mid)
        return days

    def completed_context(self, sid, limit=30):
        from backend.app.contracts import ModelMessage
        with self._connect() as db:
            rows = db.execute("""SELECT role,content FROM messages m WHERE session_id=? AND
                NOT EXISTS(SELECT 1 FROM turns t WHERE t.user_id=m.id AND t.state!='complete')
                ORDER BY id DESC LIMIT ?""", (sid, limit)).fetchall()
        return tuple(ModelMessage(role=r[0], content=r[1]) for r in reversed(rows))
