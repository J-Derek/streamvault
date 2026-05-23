use rusqlite::{Connection, params};
use serde::{Serialize, Deserialize};
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadRecord {
    pub id: i64,           // TMDB ID
    pub title: String,
    pub year: Option<i32>,
    pub file_path: String,  // Absolute path to the video file
    pub file_size: Option<i64>,
    pub info_hash: Option<String>,
    pub status: String,    // "downloading", "complete", "removed"
    pub downloaded_at: String,
}

pub struct DownloadDb {
    conn: Mutex<Connection>,
}

impl DownloadDb {
    pub fn new(db_path: PathBuf) -> Result<Self, String> {
        let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS downloads (
                id          INTEGER PRIMARY KEY,
                title       TEXT NOT NULL,
                year        INTEGER,
                file_path   TEXT NOT NULL,
                file_size   INTEGER,
                info_hash   TEXT,
                status      TEXT NOT NULL DEFAULT 'downloading',
                downloaded_at TEXT NOT NULL
            );"
        ).map_err(|e| e.to_string())?;
        Ok(DownloadDb { conn: Mutex::new(conn) })
    }

    pub fn upsert(&self, record: &DownloadRecord) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO downloads (id, title, year, file_path, file_size, info_hash, status, downloaded_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(id) DO UPDATE SET
                title=excluded.title, year=excluded.year, file_path=excluded.file_path,
                file_size=excluded.file_size, info_hash=excluded.info_hash,
                status=excluded.status, downloaded_at=excluded.downloaded_at",
            params![
                record.id, record.title, record.year, record.file_path,
                record.file_size, record.info_hash, record.status, record.downloaded_at
            ],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get(&self, id: i64) -> Result<Option<DownloadRecord>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare(
            "SELECT id, title, year, file_path, file_size, info_hash, status, downloaded_at
             FROM downloads WHERE id = ?1"
        ).map_err(|e| e.to_string())?;
        let mut rows = stmt.query_map(params![id], |row| {
            Ok(DownloadRecord {
                id: row.get(0)?,
                title: row.get(1)?,
                year: row.get(2)?,
                file_path: row.get(3)?,
                file_size: row.get(4)?,
                info_hash: row.get(5)?,
                status: row.get(6)?,
                downloaded_at: row.get(7)?,
            })
        }).map_err(|e| e.to_string())?;
        match rows.next() {
            Some(Ok(record)) => Ok(Some(record)),
            _ => Ok(None),
        }
    }

    pub fn get_by_info_hash(&self, info_hash: &str) -> Result<Option<DownloadRecord>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare(
            "SELECT id, title, year, file_path, file_size, info_hash, status, downloaded_at
             FROM downloads WHERE info_hash = ?1"
        ).map_err(|e| e.to_string())?;
        let mut rows = stmt.query_map(params![info_hash.to_lowercase()], |row| {
            Ok(DownloadRecord {
                id: row.get(0)?,
                title: row.get(1)?,
                year: row.get(2)?,
                file_path: row.get(3)?,
                file_size: row.get(4)?,
                info_hash: row.get(5)?,
                status: row.get(6)?,
                downloaded_at: row.get(7)?,
            })
        }).map_err(|e| e.to_string())?;
        match rows.next() {
            Some(Ok(record)) => Ok(Some(record)),
            _ => Ok(None),
        }
    }

    pub fn list_complete(&self) -> Result<Vec<DownloadRecord>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare(
            "SELECT id, title, year, file_path, file_size, info_hash, status, downloaded_at
             FROM downloads WHERE status = 'complete' ORDER BY downloaded_at DESC"
        ).map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |row| {
            Ok(DownloadRecord {
                id: row.get(0)?,
                title: row.get(1)?,
                year: row.get(2)?,
                file_path: row.get(3)?,
                file_size: row.get(4)?,
                info_hash: row.get(5)?,
                status: row.get(6)?,
                downloaded_at: row.get(7)?,
            })
        }).map_err(|e| e.to_string())?;
        let mut result = Vec::new();
        for row in rows {
            result.push(row.map_err(|e| e.to_string())?);
        }
        Ok(result)
    }

    pub fn remove(&self, id: i64) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM downloads WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}
