use tauri::{
    AppHandle, Manager, State
};
use log::{error, info};
use std::fs::{self, File};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tokio::sync::oneshot;
use url::{form_urlencoded, Url};
use rand::Rng;
use tiny_http::{Response, Server};
use std::io::{BufRead, BufReader, Write};

// Google OAuth client ID for desktop app
const GOOGLE_CLIENT_ID: &str = "367583834715-rlm1en39oh0sj4dq4qhtaks6j23u5q6d.apps.googleusercontent.com";

struct AppState {
    py_process: Mutex<Option<Child>>,
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
    info!("Attempting to launch Python sidecar process...");
    let mut py_process_guard = state.py_process.lock().unwrap();
    if py_process_guard.is_some() {
        return Ok(());
    }

    let resource_path = handle
        .path_resolver()
        .resource_dir()
        .ok_or_else(|| "Failed to resolve resource dir".to_string())?;

    info!("Tauri resource directory found at: {:?}", resource_path);

    // On Windows, the MSI installer places bundled resources relative to the executable.
    // A more robust way to find them is to start from the current executable's path.
    let exe_path = std::env::current_exe()
        .map_err(|e| format!("Failed to get current executable path: {}", e))?;
    info!("Executable path: {:?}", exe_path);

    // The executable is inside the installation dir (e.g., C:\Program Files\RAP).
    // The server-modules are bundled inside `_up_`.
    let server_modules_path = if let Some(parent) = exe_path.parent() {
        parent.join("_up_").join("server-modules")
    } else {
        // Fallback for safety, though it should not be reached in a normal installation.
        resource_path.join("_up_").join("server-modules")
    };

    let python_exe_path = server_modules_path.join("python.exe");

    if !python_exe_path.exists() {
        let err_msg = format!("python.exe not found at: {:?}", python_exe_path);
        error!("{}", err_msg);
        return Err(err_msg);
    }
    info!("Python executable found at: {:?}", python_exe_path);

    // --- Setup Logging ---
    let log_dir = handle.path_resolver().app_data_dir().unwrap().join("rap-data").join("logs");
    fs::create_dir_all(&log_dir).map_err(|e| format!("Failed to create log directory: {}", e))?;
    let log_file_path = log_dir.join("server.log");
    let log_file = File::create(&log_file_path).map_err(|e| format!("Failed to create log file: {}", e))?;
    info!("Python server log will be written to: {:?}", log_file_path);
    
    // Clone the file handle for stderr
    let _stderr_log_file = log_file.try_clone().map_err(|e| format!("Failed to clone log file handle: {}", e))?;


    let mut command = Command::new(python_exe_path);
    command.current_dir(&server_modules_path);
    command.arg("run_server.py");

    // This configuration ensures the Python process runs headlessly
    // without spawning an extra console window in release builds.
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    command.creation_flags(CREATE_NO_WINDOW)
           .stdout(Stdio::null())
           .stderr(Stdio::null());

    info!("Spawning Python process...");
    let child = command
        .spawn()
        .map_err(|e| {
            let err_msg = format!("Failed to spawn Python process: {}", e);
            error!("{}", err_msg);
            err_msg
        })?;
    
    // Store the child process immediately
    *py_process_guard = Some(child);

    // Hardcode the port to 8000
    let port = 8000;
    *state.server_port.lock().unwrap() = Some(port); // Store the port in AppState
    info!("Python server will run on fixed port: {}", port);
    
    info!("Python process spawned successfully with PID: {}", py_process_guard.as_ref().unwrap().id());
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
                // On close requested, kill the python sidecar
                let state = event.window().state::<AppState>();
                let mut py_process_guard = state.py_process.lock().unwrap();
                if let Some(mut child) = py_process_guard.take() {
                    info!("Attempting to terminate Python sidecar process with PID: {}", child.id());
                    match child.kill() {
                        Ok(_) => {
                            info!("Sent termination signal to Python process. Waiting for it to exit...");
                            // Give the process a moment to shut down gracefully
                            let start_wait = Instant::now();
                            let timeout = Duration::from_secs(5); // Wait up to 5 seconds

                            // Use try_wait in a loop to check if the process has exited
                            while start_wait.elapsed() < timeout {
                                if let Ok(Some(status)) = child.try_wait() {
                                    info!("Python process exited with status: {:?}", status);
                                    return;
                                }
                                std::thread::sleep(Duration::from_millis(100));
                            }

                            // If we reach here, the process did not exit within the timeout
                            error!("Python process did not terminate gracefully within 5 seconds. Attempting to kill forcefully.");
                            match child.kill() {
                                Ok(_) => info!("Forcefully killed Python process."),
                                Err(e) => error!("Failed to forcefully kill Python process: {}", e),
                            }
                        },
                        Err(e) => error!("Failed to send termination signal to Python process: {}", e),
                    }
                }
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