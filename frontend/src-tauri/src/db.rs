use std::collections::HashSet;
use std::path::Path;
use std::sync::{Mutex, MutexGuard};
use std::time::Duration;

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Todo {
    pub id: i64,
    pub title: String,
    pub completed: bool,
    pub color: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Default, Deserialize)]
pub struct TodoPatch {
    pub title: Option<String>,
    pub completed: Option<bool>,
    pub color: Option<String>,
}

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn open(path: &Path) -> Result<Self, String> {
        if let Some(parent) = path.parent() {
            if !parent.as_os_str().is_empty() {
                std::fs::create_dir_all(parent)
                    .map_err(|error| format!("创建数据目录失败：{error}"))?;
            }
        }
        let conn = Connection::open(path)
            .map_err(|error| format!("打开本机数据库失败：{error}"))?;
        Self::from_connection(conn)
    }

    pub fn open_in_memory() -> Result<Self, String> {
        let conn = Connection::open_in_memory()
            .map_err(|error| format!("创建测试数据库失败：{error}"))?;
        Self::from_connection(conn)
    }

    fn from_connection(conn: Connection) -> Result<Self, String> {
        conn.busy_timeout(Duration::from_secs(5))
            .map_err(db_error)?;
        let _ = conn.pragma_update(None, "journal_mode", "WAL");
        conn.pragma_update(None, "synchronous", "NORMAL")
            .map_err(db_error)?;
        Self::migrate(&conn)?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    fn migrate(conn: &Connection) -> Result<(), String> {
        let version: i64 = conn
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .map_err(db_error)?;

        if version < 1 {
            conn.execute_batch(
                "
                CREATE TABLE IF NOT EXISTS todos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    completed INTEGER NOT NULL DEFAULT 0,
                    color TEXT NOT NULL DEFAULT 'none',
                    position INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS ix_todos_position ON todos(position);
                PRAGMA user_version = 1;
                ",
            )
            .map_err(db_error)?;
        }

        Ok(())
    }

    fn lock(&self) -> Result<MutexGuard<'_, Connection>, String> {
        self.conn
            .lock()
            .map_err(|_| "本机数据库连接异常，请重启应用。".to_string())
    }

    fn now(conn: &Connection) -> Result<String, String> {
        conn.query_row(
            "SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now')",
            [],
            |row| row.get(0),
        )
        .map_err(db_error)
    }

    fn map_todo(row: &rusqlite::Row<'_>) -> rusqlite::Result<Todo> {
        Ok(Todo {
            id: row.get(0)?,
            title: row.get(1)?,
            completed: row.get(2)?,
            color: row.get(3)?,
            created_at: row.get(4)?,
            updated_at: row.get(5)?,
        })
    }

    fn get_by_id(conn: &Connection, id: i64) -> Result<Todo, String> {
        conn.query_row(
            "SELECT id, title, completed, color, created_at, updated_at
             FROM todos WHERE id = ?1",
            params![id],
            Self::map_todo,
        )
        .optional()
        .map_err(db_error)?
        .ok_or_else(|| "任务不存在，可能已被删除。".to_string())
    }

    pub fn list(&self) -> Result<Vec<Todo>, String> {
        let conn = self.lock()?;
        let mut statement = conn
            .prepare(
                "SELECT id, title, completed, color, created_at, updated_at
                 FROM todos ORDER BY position ASC, id DESC",
            )
            .map_err(db_error)?;
        let todos = statement
            .query_map([], Self::map_todo)
            .map_err(db_error)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(db_error)?;
        Ok(todos)
    }

    pub fn create(&self, title: &str) -> Result<Todo, String> {
        let title = validate_title(title)?;
        let conn = self.lock()?;
        let now = Self::now(&conn)?;
        let min_position: Option<i64> = conn
            .query_row("SELECT MIN(position) FROM todos", [], |row| row.get(0))
            .map_err(db_error)?;
        let position = min_position.map(|value| value - 1).unwrap_or(0);

        conn.execute(
            "INSERT INTO todos (title, completed, color, position, created_at, updated_at)
             VALUES (?1, 0, 'none', ?2, ?3, ?3)",
            params![title, position, now],
        )
        .map_err(db_error)?;

        Self::get_by_id(&conn, conn.last_insert_rowid())
    }

    pub fn update(&self, id: i64, patch: TodoPatch) -> Result<Todo, String> {
        let conn = self.lock()?;
        let Todo {
            title: existing_title,
            completed: existing_completed,
            color: existing_color,
            ..
        } = Self::get_by_id(&conn, id)?;

        let title = match patch.title {
            Some(value) => validate_title(&value)?,
            None => existing_title,
        };
        let color = match patch.color {
            Some(value) => validate_color(&value)?,
            None => existing_color,
        };
        let completed = patch.completed.unwrap_or(existing_completed);
        let now = Self::now(&conn)?;

        let changed = conn
            .execute(
                "UPDATE todos
                 SET title = ?1, completed = ?2, color = ?3, updated_at = ?4
                 WHERE id = ?5",
                params![title, completed, color, now, id],
            )
            .map_err(db_error)?;

        if changed == 0 {
            return Err("任务不存在，可能已被删除。".to_string());
        }

        Self::get_by_id(&conn, id)
    }

    pub fn delete(&self, id: i64) -> Result<(), String> {
        let conn = self.lock()?;
        let changed = conn
            .execute("DELETE FROM todos WHERE id = ?1", params![id])
            .map_err(db_error)?;
        if changed == 0 {
            return Err("任务不存在，可能已被删除。".to_string());
        }
        Ok(())
    }

    pub fn reorder(&self, ids: &[i64]) -> Result<Vec<Todo>, String> {
        let mut conn = self.lock()?;
        let existing_ids: HashSet<i64> = {
            let mut statement = conn
                .prepare("SELECT id FROM todos")
                .map_err(db_error)?;
            statement
                .query_map([], |row| row.get(0))
                .map_err(db_error)?
                .collect::<rusqlite::Result<HashSet<_>>>()
                .map_err(db_error)?
        };
        let incoming_ids: HashSet<i64> = ids.iter().copied().collect();

        if ids.len() != existing_ids.len()
            || incoming_ids.len() != ids.len()
            || incoming_ids != existing_ids
        {
            return Err("任务列表已变化，请重新打开应用。".to_string());
        }

        let now = Self::now(&conn)?;
        let transaction = conn.transaction().map_err(db_error)?;
        for (position, id) in ids.iter().enumerate() {
            transaction
                .execute(
                    "UPDATE todos SET position = ?1, updated_at = ?2 WHERE id = ?3",
                    params![position as i64, now, id],
                )
                .map_err(db_error)?;
        }
        transaction.commit().map_err(db_error)?;
        drop(conn);

        self.list()
    }
}

fn validate_title(value: &str) -> Result<String, String> {
    let title = value.trim();
    let length = title.chars().count();
    if length == 0 {
        return Err("任务内容不能为空。".to_string());
    }
    if length > 200 {
        return Err("任务内容不能超过 200 个字符。".to_string());
    }
    Ok(title.to_string())
}

fn validate_color(value: &str) -> Result<String, String> {
    match value {
        "none" | "red" | "green" | "yellow" => Ok(value.to_string()),
        _ => Err("任务颜色无效。".to_string()),
    }
}

fn db_error(error: rusqlite::Error) -> String {
    format!("本机数据库操作失败：{error}")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn memory_db() -> Database {
        Database::open_in_memory().expect("in-memory database should open")
    }

    #[test]
    fn creates_todos_with_newest_first_order() {
        let db = memory_db();

        let first = db.create("第一项").unwrap();
        let second = db.create("第二项").unwrap();
        let todos = db.list().unwrap();

        assert_eq!(todos.len(), 2);
        assert_eq!(todos[0].id, second.id);
        assert_eq!(todos[1].id, first.id);
        assert_eq!(todos[0].title, "第二项");
    }

    #[test]
    fn updates_title_completion_and_color() {
        let db = memory_db();
        let todo = db.create("原始内容").unwrap();

        let updated = db
            .update(
                todo.id,
                TodoPatch {
                    title: Some("改后的内容".into()),
                    completed: Some(true),
                    color: Some("red".into()),
                },
            )
            .unwrap();

        assert_eq!(updated.title, "改后的内容");
        assert!(updated.completed);
        assert_eq!(updated.color, "red");

        let listed = db.list().unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0], updated);
    }

    #[test]
    fn rejects_empty_or_too_long_title() {
        let db = memory_db();

        assert!(db.create("   ").is_err());
        assert!(db.create(&"字".repeat(201)).is_err());

        let todo = db.create("保留我").unwrap();
        let invalid = db.update(
            todo.id,
            TodoPatch {
                title: Some(" ".into()),
                ..TodoPatch::default()
            },
        );
        assert!(invalid.is_err());
        assert_eq!(db.list().unwrap()[0].title, "保留我");
    }

    #[test]
    fn trims_title_and_rejects_unknown_color() {
        let db = memory_db();
        let todo = db.create("  带空格  ").unwrap();
        assert_eq!(todo.title, "带空格");

        let invalid = db.update(
            todo.id,
            TodoPatch {
                color: Some("purple".into()),
                ..TodoPatch::default()
            },
        );
        assert!(invalid.is_err());
        assert_eq!(db.list().unwrap()[0].color, "none");
    }

    #[test]
    fn deletes_todo_and_reports_missing() {
        let db = memory_db();
        let todo = db.create("要删除").unwrap();

        db.delete(todo.id).unwrap();
        assert!(db.list().unwrap().is_empty());
        assert!(db.delete(todo.id).is_err());
    }

    #[test]
    fn reorders_todos_and_persists_priority() {
        let db = memory_db();
        let first = db.create("A").unwrap();
        let second = db.create("B").unwrap();
        let third = db.create("C").unwrap();

        let reordered = db
            .reorder(&[first.id, third.id, second.id])
            .unwrap();
        assert_eq!(
            reordered.iter().map(|todo| todo.title.as_str()).collect::<Vec<_>>(),
            vec!["A", "C", "B"]
        );

        let listed = db.list().unwrap();
        assert_eq!(
            listed.iter().map(|todo| todo.title.as_str()).collect::<Vec<_>>(),
            vec!["A", "C", "B"]
        );
    }

    #[test]
    fn rejects_reorder_with_missing_ids() {
        let db = memory_db();
        let first = db.create("A").unwrap();
        let second = db.create("B").unwrap();

        assert!(db.reorder(&[first.id]).is_err());
        assert_eq!(db.list().unwrap().len(), 2);

        assert!(db.reorder(&[first.id, second.id, 999_999]).is_err());
    }

    #[test]
    fn persists_data_after_reopening_file() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("todo.db");

        let id = {
            let db = Database::open(&path).unwrap();
            let todo = db.create("持久化任务").unwrap();
            db.update(
                todo.id,
                TodoPatch {
                    completed: Some(true),
                    color: Some("green".into()),
                    ..TodoPatch::default()
                },
            )
            .unwrap();
            todo.id
        };

        let reopened = Database::open(&path).unwrap();
        let todos = reopened.list().unwrap();
        assert_eq!(todos.len(), 1);
        assert_eq!(todos[0].id, id);
        assert_eq!(todos[0].title, "持久化任务");
        assert!(todos[0].completed);
        assert_eq!(todos[0].color, "green");
    }
}
