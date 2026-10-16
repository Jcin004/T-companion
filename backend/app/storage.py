"""SQLite source of truth for MVP chat sessions and messages."""
import os
import sqlite3
from pathlib import Path
from uuid import uuid4

from backend.app.contracts import ModelMessage


class ChatStore:
    def __init__(self, path: str | Path | None = None):
        self.path = Path(path or os.environ.get("T_CHAT_DB", "data/chat.db"))
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS sessions(
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
                CREATE TABLE IF NOT EXISTS messages(
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL REFERENCES sessions(id),
                    role TEXT NOT NULL CHECK(role IN ('user','assistant')),
                    content TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id,id);
            """)

    def _connect(self):
        conn = sqlite3.connect(self.path, timeout=10)
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    def create_session(self, title: str = "新对话") -> dict:
        sid = str(uuid4())
        with self._connect() as db:
            db.execute("INSERT INTO sessions(id,title) VALUES(?,?)", (sid,title))
        return {"id": sid, "title": title}

    def list_sessions(self) -> list[dict]:
        with self._connect() as db:
            db.row_factory = sqlite3.Row
            return [dict(r) for r in db.execute("""
                SELECT s.id,s.title,s.created_at,COUNT(m.id) AS message_count
                FROM sessions s LEFT JOIN messages m ON m.session_id=s.id
                GROUP BY s.id ORDER BY s.created_at DESC,s.rowid DESC
            """)]

    def exists(self, sid: str) -> bool:
        with self._connect() as db:
            return db.execute("SELECT 1 FROM sessions WHERE id=?", (sid,)).fetchone() is not None

    def messages(self, sid: str) -> list[dict]:
        with self._connect() as db:
            db.row_factory = sqlite3.Row
            return [dict(r) for r in db.execute(
                "SELECT id,role,content,created_at FROM messages WHERE session_id=? ORDER BY id", (sid,)
            )]

    def append_pair(self, sid: str, user: str, assistant: str) -> None:
        # One transaction: failed model calls never produce orphan user turns.
        with self._connect() as db:
            db.executemany("INSERT INTO messages(session_id,role,content) VALUES(?,?,?)",
                           [(sid,"user",user),(sid,"assistant",assistant)])
            db.execute("UPDATE sessions SET title=? WHERE id=? AND title='新对话'",
                       (user[:36],sid))

    def recent_context(self, sid: str, limit: int = 20) -> tuple[ModelMessage, ...]:
        # Fetch the last N messages, but send them to the model in chronological order.
        with self._connect() as db:
            rows = db.execute(
                "SELECT role,content FROM messages WHERE session_id=? ORDER BY id DESC LIMIT ?",
                (sid,limit)
            ).fetchall()
        return tuple(ModelMessage(role=r[0],content=r[1]) for r in reversed(rows))
