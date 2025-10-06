// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tokio::sync::oneshot;
use url::{Url, form_urlencoded};
use rand::Rng;
use tiny_http::{Server, Response};
use std::time::Duration;
use std::process::{Command, Child};
use std::path::PathBuf;
use std::env;
use std::sync::Mutex;

// Google OAuth client ID for desktop app
const GOOGLE_CLIENT_ID: &str = "367583834715-rlm1en39oh0sj4dq4qhtaks6j23u5q6d.apps.googleusercontent.com";

// Static mutable variable to hold the child process handle
static RAP_SERVER_PROCESS: Mutex<Option<Child>> = Mutex::new(None);

fn get_rap_server_exe_path() -> Option<PathBuf> {
    let current_exe = env::current_exe().ok()?;
    println!("get_rap_server_exe_path: current_exe = {:?}", current_exe);
    let app_dir = current_exe.parent()?.to_path_buf(); // C:\Program Files\RAP
    println!("get_rap_server_exe_path: app_dir = {:?}", app_dir);
    let rap_server_exe = app_dir.join("server").join("rap-server.exe");

    if rap_server_exe.exists() {
        println!("get_rap_server_exe_path: Found rap-server.exe at {:?}", rap_server_exe);
        Some(rap_server_exe)
    } else {
        println!("get_rap_server_exe_path: rap-server.exe not found at: {:?}", rap_server_exe);
        None
    }
}

fn is_rap_server_running() -> bool {
    // Check if the process is already stored and still running
    if let Some(child) = RAP_SERVER_PROCESS.lock().unwrap().as_mut() {
        // Try to get the status without blocking
        if let Ok(Some(status)) = child.try_wait() {
            // Process has exited
            println!("is_rap_server_running: Stored rap-server process has exited with status: {:?}", status);
            return false;
        } else {
            // Process is still running
            println!("is_rap_server_running: Stored rap-server process is still running.");
            return true;
        }
    }
    println!("is_rap_server_running: No stored rap-server process found.");
    false
}

fn start_rap_server() {
    if is_rap_server_running() {
        println!("start_rap_server: rap-server is already running.");
        return;
    }

    if let Some(exe_path) = get_rap_server_exe_path() {
        println!("start_rap_server: Attempting to start rap-server from: {:?}", exe_path);
        let working_dir = exe_path.parent().unwrap().parent().unwrap();
        println!("start_rap_server: Setting working directory to: {:?}", working_dir);
        match Command::new(&exe_path)
            .current_dir(working_dir) // Set working directory to C:\Program Files\RAP\
            .spawn() {
            Ok(child) => {
                *RAP_SERVER_PROCESS.lock().unwrap() = Some(child);
                println!("start_rap_server: rap-server started successfully.");
            }
            Err(e) => println!("start_rap_server: Failed to start rap-server: {}", e),
        }
    } else {
        println!("start_rap_server: Could not find rap-server executable.");
    }
}

fn terminate_rap_server() {
    if let Some(mut child) = RAP_SERVER_PROCESS.lock().unwrap().take() {
        println!("Attempting to terminate rap-server.");
        match child.kill() {
            Ok(_) => {
                let _ = child.wait(); // Wait for the process to actually exit
                println!("rap-server terminated.");
            }
            Err(e) => println!("Failed to terminate rap-server: {}", e),
        }
    }
}

#[tauri::command]
async fn google_oauth_login(_app_handle: tauri::AppHandle) -> Result<(String, String), String> {
    let (tx, rx) = oneshot::channel();

    // Find an available port
    let port = {
        let mut rng = rand::thread_rng();
        loop {
            let p: u16 = rng.gen_range(8000..9000); // Random port between 8000 and 9000
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

    // Open the URL in the system's default browser
    if let Err(e) = webbrowser::open(&auth_url) {
        return Err(format!("Failed to open browser: {}", e));
    }

    // Start a tiny_http server in a new thread to listen for the redirect
    let redirect_uri_clone = redirect_uri.clone(); // Clone for the thread
    std::thread::spawn(move || {
        let server = Server::http(format!("127.0.0.1:{}", port)).unwrap();
        println!("Listening for OAuth redirect on {}", redirect_uri_clone);

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

            // Respond to the browser to close the window
            let response = Response::from_string("You can close this window now.").with_status_code(200);
            let _ = rq.respond(response);

            if let Some(c) = code {
                let _ = tx.send((c, redirect_uri_clone));
            }
            break; // Shut down the server after the first request
        }
    });

    // Wait for the authorization code and redirect URI from the server thread
    let (code, final_redirect_uri) = tokio::time::timeout(Duration::from_secs(60), rx)
        .await
        .map_err(|_| "Timed out waiting for authorization code".to_string())?
        .map_err(|_| "Failed to receive authorization code".to_string())?;

    Ok((code, final_redirect_uri))
}

fn main() {
  tauri::Builder::default()
    .setup(|_app| {
        start_rap_server();
        Ok(())
    })
    .on_window_event(|event| match event.event() {
        tauri::WindowEvent::Destroyed => {
            terminate_rap_server();
        }
        _ => {}
    })
    .invoke_handler(tauri::generate_handler![google_oauth_login])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}