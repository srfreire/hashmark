use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::Emitter;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
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

            let file_menu = SubmenuBuilder::new(app, "File")
                .item(&new_file)
                .item(&open_folder)
                .separator()
                .item(&save)
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

            let view_menu = SubmenuBuilder::new(app, "View")
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
                "find" => {
                    let _ = app.emit("menu-find", ());
                }
                "find_and_replace" => {
                    let _ = app.emit("menu-find", ());
                }
                "find_in_files" => {
                    let _ = app.emit("menu-find-in-files", ());
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
