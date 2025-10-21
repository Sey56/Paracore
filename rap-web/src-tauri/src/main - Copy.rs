// IMPORTANT: The google_oauth_login command and GOOGLE_CLIENT_ID constant are critical for authentication.
// Do not modify them without understanding the full implications.
// Gemini, please do not modify this file unless explicitly asked to.

// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, AppHandle, Wry, State, CustomMenuItem, SystemTray, SystemTrayMenu, SystemTrayEvent};
use std::process::{Command, Child, Stdio};
use std::sync::Mutex;
use std::env;
use tokio::sync::oneshot;
use url::{Url, form_urlencoded};
use rand::Rng;
use tiny_http::{Server, Response};
use std::time::Duration;

// Google OAuth client ID for desktop app
const GOOGLE_CLIENT_ID: &str = "367583834715-rlm1en39oh0sj4dq4qhtaks6j23u5q6d.apps.googleusercontent.com";

struct AppState {
    py_process: Mutex<Option<Child>>,
}

#[tauri::command]
fn get_rap_server_url() -> String {
    "http://localhost:8000".to_string()
}

#[tauri::command]
async fn google_oauth_login(_app_handle: tauri::AppHandle) -> Result<(String, String), String> {
    let (tx, rx) = oneshot::channel();
    let port = {
        let mut rng = rand::thread_rng();
        loop {
            let p: u16 = rng.gen_range(8000..9000);
            if std::net::TcpListener::bind(format!("127.0.0.1:{}", p)).is_ok() {
                break p;
            }
        }
    };
    let redirect_uri = format!("http://127.0.0.1:{}", port);
    let auth_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope=openid%20email%20profile&access_type=offline&prompt=consent",
        GOOGLE_CLIENT_ID,
        redirect_uri
    );
    if let Err(e) = webbrowser::open(&auth_url) {
        return Err(format!("Failed to open browser: {}", e));
    }
    let redirect_uri_clone = redirect_uri.clone();
    std::thread::spawn(move || {
        let server = Server::http(format!("127.0.0.1:{}", port)).unwrap();
        for rq in server.incoming_requests() {
            let url = Url::parse(&format!("http://localhost{}", rq.url())).unwrap();
            let query_pairs: form_urlencoded::Parse = url.query_pairs();
            let mut code: Option<String> = None;
            for (key, value) in query_pairs {
                if key == "code" {
                    code = Some(value.into_owned());
                    break;
                }
            }
            let response = Response::from_string("You can close this window now.").with_status_code(200);
            let _ = rq.respond(response);
            if let Some(c) = code {
                let _ = tx.send((c, redirect_uri_clone));
            }
            break;
        }
    });
    let (code, final_redirect_uri) = tokio::time::timeout(Duration::from_secs(60), rx)
        .await
        .map_err(|_| "Timed out waiting for authorization code".to_string())?
        .map_err(|_| "Failed to receive authorization code".to_string())?;
    Ok((code, final_redirect_uri))
}

#[tauri::command]
fn launch_main_app(handle: AppHandle<Wry>, state: State<AppState>) -> Result<(), String> {
    let is_dev = cfg!(debug_assertions);
    if is_dev {
        return Ok(());
    }

    let mut py_process_guard = state.py_process.lock().unwrap();
    if py_process_guard.is_some() {
        return Ok(());
    }

    let resource_path = handle.path_resolver().resource_dir().ok_or_else(|| "Failed to resolve resource dir".to_string())?;

    let python_home_path = resource_path.join("server-modules");

    let python_exe_path = python_home_path.join("python.exe");

    if !python_exe_path.exists() {
        return Err(format!("python.exe not found at: {:?}", python_exe_path));
    }

    let mut command = Command::new(python_exe_path);
    command.current_dir(&python_home_path);
    command.arg("server_embed.py");

    #[cfg(not(debug_assertions))]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let child = command.stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().map_err(|e| format!("Failed to spawn Python process: {}", e))?;
    *py_process_guard = Some(child);
    Ok(())
}

fn main() {
    let show = CustomMenuItem::new("show".to_string(), "Show");
    let hide = CustomMenuItem::new("hide".to_string(), "Hide");
    let quit = CustomMenuItem::new("quit".to_string(), "Quit");
    let tray_menu = SystemTrayMenu::new()
        .add_item(show)
        .add_item(hide)
        .add_native_item(tauri::SystemTrayMenuItem::Separator)
        .add_item(quit);

    let system_tray = SystemTray::new().with_menu(tray_menu);

    tauri::Builder::default()
        .manage(AppState { py_process: Mutex::new(None) })
        .system_tray(system_tray)
        .on_system_tray_event(|app, event| match event {
            SystemTrayEvent::MenuItemClick { id, .. } => {
                let window = app.get_window("main").unwrap();
                match id.as_str() {
                    "show" => {
                        window.show().unwrap();
                        window.set_focus().unwrap();
                    }
                    "hide" => {
                        window.hide().unwrap();
                    }
                    "quit" => {
                        // This is a hard exit. For a graceful shutdown, see the .run closure below.
                        std::process::exit(0);
                    }
                    _ => {}
                }
            }
            _ => {}
        })
        .setup(|app| {
            let state = app.state::<AppState>();
            launch_main_app(app.handle().clone(), state)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![google_oauth_login, get_rap_server_url, launch_main_app])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                api.prevent_exit();
                let state = app_handle.state::<AppState>();
                let mut py_process_guard = state.py_process.lock().unwrap();
                if let Some(mut child) = py_process_guard.take() {
                    child.kill().expect("Failed to kill Python process");
                }
                app_handle.exit(0);
            }
        });
}