use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use crate::{db, repos};

#[derive(Deserialize, Serialize)]
struct StorageConfig {
    database: PathBuf,
}

pub fn configured_path(default: &Path) -> Result<Option<PathBuf>, String> {
    let config = default.with_file_name("storage.json");
    if !config.exists() {
        return Ok(None);
    }
    let settings: StorageConfig = serde_json::from_slice(&fs::read(&config).map_err(|e| e.to_string())?)
        .map_err(|e| format!("Invalid storage config: {e}"))?;
    if !settings.database.is_absolute() || !settings.database.is_file() {
        return Err(format!("Configured database is unavailable: {}", settings.database.display()));
    }
    Ok(Some(settings.database))
}

pub fn db_path(default: &Path) -> Result<PathBuf, String> {
    Ok(configured_path(default)?.unwrap_or_else(|| default.to_path_buf()))
}

pub fn finish_setup(current: &mut Connection, default: &Path, directory: Option<&Path>) -> Result<PathBuf, String> {
    let config = default.with_file_name("storage.json");
    if config.exists() {
        return Err("Storage has already been configured.".into());
    }
    let target = if let Some(dir) = directory {
        if !dir.is_absolute() || !dir.is_dir() {
            return Err("Select a folder, not a file.".into());
        }
        let selected = dir.canonicalize().map_err(|e| format!("Cannot use selected folder: {e}"))?;
        let original_dir = default.parent().ok_or("Default database has no parent directory")?
            .canonicalize().map_err(|e| e.to_string())?;
        if selected == original_dir { default.to_path_buf() } else { dir.join("contexta.db") }
    } else {
        default.to_path_buf()
    };

    let replacement = if target != default {
        if target.exists() {
            return Err(format!("The selected folder already contains {}. Choose an empty folder.", target.display()));
        }
        repos::backup_db(current, &target)?;
        let mut copied = db::open_db(&target).map_err(|e| e.to_string())?;
        db::run_migrations(&mut copied).map_err(|e| e.to_string())?;
        Some(copied)
    } else {
        None
    };

    let pending = config.with_extension("json.tmp");
    let contents = serde_json::to_vec(&StorageConfig { database: target.clone() }).map_err(|e| e.to_string())?;
    fs::write(&pending, contents).map_err(|e| e.to_string())?;
    fs::rename(&pending, &config).map_err(|e| e.to_string())?;
    if let Some(copied) = replacement {
        *current = copied;
    }
    Ok(target)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn choosing_a_folder_copies_existing_data_and_keeps_the_original() {
        let root = tempfile::tempdir().unwrap();
        let default = root.path().join("app").join("simplememory.db");
        let chosen = root.path().join("chosen");
        fs::create_dir(&chosen).unwrap();
        let mut conn = db::open_db(&default).unwrap();
        db::run_migrations(&mut conn).unwrap();
        conn.execute("INSERT INTO projects (id, name, created_at, updated_at) VALUES ('1', 'Saved', 'now', 'now')", []).unwrap();

        let selected = finish_setup(&mut conn, &default, Some(&chosen)).unwrap();
        assert_eq!(selected, chosen.join("contexta.db"));
        assert_eq!(db_path(&default).unwrap(), selected);
        assert_eq!(conn.query_row::<i64, _, _>("SELECT COUNT(*) FROM projects", [], |r| r.get(0)).unwrap(), 1);
        assert!(default.is_file());
        assert!(finish_setup(&mut conn, &default, Some(&chosen)).is_err());
    }
}
