use std::collections::HashMap;
use std::process::Command;
use std::sync::Mutex;
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::Emitter;
use tauri_plugin_fs::FsExt;

struct CliState {
    folder: Option<String>,
}

#[tauri::command]
fn get_cli_folder(state: tauri::State<'_, Mutex<CliState>>) -> Option<String> {
    state.lock().unwrap().folder.take()
}

#[tauri::command]
fn get_git_root(repo_path: String) -> Result<Option<String>, String> {
    let output = Command::new("git")
        .args(["rev-parse", "--show-toplevel"])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        let root = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok(Some(root))
    } else {
        Ok(None)
    }
}

#[tauri::command]
fn get_git_status(repo_path: String) -> Result<HashMap<String, String>, String> {
    let root_output = Command::new("git")
        .args(["rev-parse", "--show-toplevel"])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| e.to_string())?;

    if !root_output.status.success() {
        return Ok(HashMap::new());
    }

    let git_root = String::from_utf8_lossy(&root_output.stdout).trim().to_string();

    let output = Command::new("git")
        .args(["status", "--porcelain"])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Ok(HashMap::new());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut statuses = HashMap::new();

    for line in stdout.lines() {
        if line.len() < 4 {
            continue;
        }
        let status_code = &line[0..2];
        let file_path = &line[3..];
        // Handle renamed files: "R  old -> new"
        let file_path = if let Some(pos) = file_path.find(" -> ") {
            &file_path[pos + 4..]
        } else {
            file_path
        };

        let full_path = format!("{}/{}", git_root, file_path);

        let status = match status_code {
            "??" => "untracked",
            " D" | "D " | "DD" => "deleted",
            "A " | "AM" | "A?" => "added",
            _ => "modified",
        };

        statuses.insert(full_path, status.to_string());
    }

    Ok(statuses)
}

#[tauri::command]
fn allow_directory(window: tauri::Window, path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if let Some(scope) = window.try_fs_scope() {
        scope
            .allow_directory(p, true)
            .map_err(|e: tauri::Error| e.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let cli_folder = std::env::args().nth(1).and_then(|arg| {
        let path = std::path::Path::new(&arg);
        if path.is_dir() {
            path.canonicalize()
                .ok()
                .map(|p| p.to_string_lossy().to_string())
        } else {
            None
        }
    });

    tauri::Builder::default()
        .manage(Mutex::new(CliState { folder: cli_folder }))
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![get_git_status, get_git_root, get_cli_folder, allow_directory])
        .setup(|app| {
            let open_folder = MenuItemBuilder::with_id("open_folder", "Open Folder...")
                .accelerator("CmdOrCtrl+O")
                .build(app)?;

            let new_file = MenuItemBuilder::with_id("new_file", "New File")
                .accelerator("CmdOrCtrl+N")
                .build(app)?;

            let save = MenuItemBuilder::with_id("save", "Save")
                .accelerator("CmdOrCtrl+S")
                .build(app)?;

            let save_all = MenuItemBuilder::with_id("save_all", "Save All")
                .accelerator("CmdOrCtrl+Shift+S")
                .build(app)?;

            let file_menu = SubmenuBuilder::new(app, "File")
                .item(&new_file)
                .item(&open_folder)
                .separator()
                .item(&save)
                .item(&save_all)
                .separator()
                .close_window()
                .build()?;

            let find = MenuItemBuilder::with_id("find", "Find")
                .accelerator("CmdOrCtrl+F")
                .build(app)?;

            let find_and_replace = MenuItemBuilder::with_id("find_and_replace", "Find and Replace")
                .accelerator("CmdOrCtrl+H")
                .build(app)?;

            let find_in_files = MenuItemBuilder::with_id("find_in_files", "Find in Files...")
                .accelerator("CmdOrCtrl+Shift+F")
                .build(app)?;

            let edit_menu = SubmenuBuilder::new(app, "Edit")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .select_all()
                .separator()
                .item(&find)
                .item(&find_and_replace)
                .item(&find_in_files)
                .build()?;

            let toggle_sidebar = MenuItemBuilder::with_id("toggle_sidebar", "Toggle Sidebar")
                .accelerator("CmdOrCtrl+B")
                .build(app)?;

            let view_menu = SubmenuBuilder::new(app, "View")
                .item(&toggle_sidebar)
                .separator()
                .fullscreen()
                .minimize()
                .build()?;

            let app_menu = SubmenuBuilder::new(app, "Hashmark")
                .about(None)
                .separator()
                .services()
                .separator()
                .hide()
                .hide_others()
                .show_all()
                .separator()
                .quit()
                .build()?;

            let menu = MenuBuilder::new(app)
                .item(&app_menu)
                .item(&file_menu)
                .item(&edit_menu)
                .item(&view_menu)
                .build()?;

            app.set_menu(menu)?;

            Ok(())
        })
        .on_menu_event(|app, event| {
            match event.id().as_ref() {
                "open_folder" => {
                    let _ = app.emit("menu-open-folder", ());
                }
                "new_file" => {
                    let _ = app.emit("menu-new-file", ());
                }
                "save" => {
                    let _ = app.emit("menu-save", ());
                }
                "save_all" => {
                    let _ = app.emit("menu-save-all", ());
                }
                "find" => {
                    let _ = app.emit("menu-find", ());
                }
                "find_and_replace" => {
                    let _ = app.emit("menu-find", ());
                }
                "find_in_files" => {
                    let _ = app.emit("menu-find-in-files", ());
                }
                "toggle_sidebar" => {
                    let _ = app.emit("menu-toggle-sidebar", ());
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
