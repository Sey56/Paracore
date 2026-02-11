use std::time::Duration;
use tokio::sync::oneshot;
use url::{form_urlencoded, Url};
use rand::Rng;
use tiny_http::{Response, Server};
use tauri::Manager;


// Google OAuth client ID for desktop app
const GOOGLE_CLIENT_ID: &str = "367583834715-rlm1en39oh0sj4dq4qhtaks6j23u5q6d.apps.googleusercontent.com";

use std::path::Path;
use walkdir::WalkDir;

#[tauri::command]
fn get_rap_server_url() -> String {
    "http://localhost:8000".to_string()
}

#[tauri::command]
fn discover_script_sources(path: String) -> Vec<String> {
    let mut sources = Vec::new();
    let root = Path::new(&path);

    // If the root itself has a marker, we treat it as a source and stop
    if root.join(".paracore").exists() || root.join(".scriptsource").exists() {
        sources.push(path);
        return sources;
    }

    let walker = WalkDir::new(root).into_iter();
    let mut it = walker.filter_entry(|e| {
        // Skip hidden directories (like .git)
        let file_name = e.file_name().to_string_lossy();
        if file_name.starts_with('.') && file_name != ".paracore" && file_name != ".scriptsource" {
            return false;
        }
        true
    });

    while let Some(entry) = it.next() {
        match entry {
            Ok(e) => {
                let path = e.path();
                if path.is_dir() {
                    if path.join(".paracore").exists() || path.join(".scriptsource").exists() {
                        sources.push(path.to_string_lossy().to_string());
                        // Important: Skip descending further into this folder once it's marked as a source
                        it.skip_current_dir();
                    }
                }
            }
            Err(_) => continue,
        }
    }

    sources
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

pub fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            google_oauth_login,
            get_rap_server_url,
            discover_script_sources
        ])
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            let window = app.get_window("main").unwrap();
            window.set_focus().unwrap();
            window.unminimize().unwrap();
            window.show().unwrap();
        }))
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                api.prevent_exit();
            }
        });
}