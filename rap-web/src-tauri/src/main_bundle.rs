use tauri::{
    AppHandle, Manager, State
};
use log::{error, info};
use std::{collections::HashMap, fs};
use std::sync::{Mutex, MutexGuard};
use std::time::Duration;
use tokio::sync::oneshot;
use url::{form_urlencoded, Url};
use rand::Rng;
use tiny_http::{Response, Server};

mod process_manager;
use process_manager::ManagedProcess;


// Google OAuth client ID for desktop app
const GOOGLE_CLIENT_ID: &str = "367583834715-rlm1en39oh0sj4dq4qhtaks6j23u5q6d.apps.googleusercontent.com";

struct AppState {
    py_process: Mutex<Option<ManagedProcess>>,
    server_port: Mutex<Option<u16>>,
}

#[tauri::command]
fn get_rap_server_url(state: State<AppState>) -> String {
    let port_guard = state.server_port.lock().unwrap();
    if let Some(port) = *port_guard {
        format!("http://localhost:{}", port)
    } else {
        error!("Python server port not set in AppState. Falling back to default.");
        "http://localhost:8000".to_string() // Fallback to default
    }
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
fn launch_main_app(handle: AppHandle, state: State<AppState>) -> Result<(), String> {
    info!("Attempting to launch Python server process...");
    let mut py_process_guard = state.py_process.lock().unwrap();
    if py_process_guard.is_some() {
        return Ok(());
    }

    let data_dir = handle.path_resolver().app_data_dir().unwrap().join("data");
    fs::create_dir_all(&data_dir).map_err(|e| format!("Failed to create data directory: {}", e))?;
    let db_path = data_dir.join("rap_local.db");

    let child = if cfg!(feature = "bundle-server") {
        // --- Release Mode: Launch Nuitka executable from resources ---
        info!("Attempting to spawn Nuitka sidecar executable...");
        let mut envs = HashMap::new();
        envs.insert("RAP_DATABASE_PATH".to_string(), db_path.to_string_lossy().to_string());

        let (mut _rx, child) = tauri::api::process::Command::new_sidecar("bootstrap")
            .expect("failed to create `bootstrap` sidecar command")
            .envs(envs)
            .spawn()
            .map_err(|e| format!("Failed to spawn sidecar: {}", e))?;
        ManagedProcess::Tauri(child)
    } else {
        // --- Development Mode: Launch embedded Python server ---
        let resource_path = handle
            .path_resolver()
            .resource_dir()
            .ok_or_else(|| "Failed to resolve resource dir".to_string())?;

        let server_modules_path = resource_path.join("server-modules");
        let python_exe_path = server_modules_path.join("python.exe");

        if !python_exe_path.exists() {
            let err_msg = format!("python.exe not found at: {:?}", python_exe_path);
            error!("{}", err_msg);
            return Err(err_msg);
        }

        let mut command = std::process::Command::new(python_exe_path);
        command.current_dir(&server_modules_path);
        command.arg("run_server.py");
        command.env("RAP_DATABASE_PATH", db_path);

        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);

        let child = command
            .spawn()
            .map_err(|e| format!("Failed to spawn Python process: {}", e))?;
        ManagedProcess::Std(child)
    };

    *py_process_guard = Some(child);

    info!("Python server process spawned successfully.");
    Ok(())
}

pub fn main() {
    tauri::Builder::default()
        .manage(AppState {
            py_process: Mutex::new(None),
            server_port: Mutex::new(None),
        })
        .setup(|app| {
            info!("RAP application starting up...");
            let state = app.state::<AppState>();
            launch_main_app(app.handle().clone(), state)?;
            Ok(())
        })
        .on_window_event(|event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event.event() {
                // Explicitly scope the state and lock to satisfy the borrow checker.
                {
                    let state: State<AppState> = event.window().state();
                    let mut py_process_guard: MutexGuard<Option<ManagedProcess>> = state.py_process.lock().unwrap();
                    if let Some(child) = py_process_guard.take() {
                        info!("Attempting to terminate Python sidecar process with PID: {}", child.id());
                        if let Err(e) = child.kill() {
                            error!("Failed to send termination signal to Python process: {}", e);
                        } else {
                            info!("Termination signal sent successfully.");
                        }
                    }
                }
                // The lock is released here as py_process_guard goes out of scope.
            }
        })
        .invoke_handler(tauri::generate_handler![
            google_oauth_login,
            get_rap_server_url,
            launch_main_app
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, _event| {});
}