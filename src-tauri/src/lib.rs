//! Native side of the desktop (Tauri) build of ApplEm.
//!
//! The web build and the desktop build share the whole frontend in `src/js`
//! and the same Emscripten WASM core. The desktop build is that same app in a
//! native window, plus the plugins a browser cannot offer: native file dialogs,
//! file system access, and opening links in the user's own browser.
//!
//! ## Why the packaged app is served over http://localhost
//!
//! The emulator hands its framebuffer and audio to the page through
//! SharedArrayBuffer. WKWebView reports a page served from Tauri's own
//! `tauri://` scheme as cross-origin isolated when it carries COOP/COEP, but
//! still leaves `SharedArrayBuffer` undefined; the same page from
//! `http://localhost` gets it. So a release build serves `dist/` from a small
//! local HTTP server (tauri-plugin-localhost) with the two headers added, and
//! the window loads that. `tauri dev` already loads the Vite server on
//! localhost, which sends the headers itself.
//!
//! The port is fixed because it is part of the page's origin, and the origin
//! is what localStorage and IndexedDB are keyed by: a port chosen per launch
//! would lose every setting and save state on every restart.

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

/// The port the packaged app serves itself on. Changing it moves the origin,
/// and with it every setting and save state the app has stored.
const LOCAL_PORT: u16 = 47123;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        // First, so a second launch hands over and exits before anything else
        // starts. Two copies would both claim LOCAL_PORT (one on IPv4, one on
        // IPv6), and the second window could load the first copy's pages.
        // Opening the app again brings the running window forward instead.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init());

    if !tauri::is_dev() {
        builder = builder.plugin(
            tauri_plugin_localhost::Builder::new(LOCAL_PORT)
                .on_request(|_, response| {
                    response.add_header("Cross-Origin-Opener-Policy", "same-origin");
                    response.add_header("Cross-Origin-Embedder-Policy", "require-corp");
                })
                .build(),
        );
    }

    builder
        .setup(|app| {
            // The window is described in tauri.conf.json with "create": false,
            // so that only the page it loads has to be decided here.
            let mut config = app.config().app.windows[0].clone();
            if !tauri::is_dev() {
                config.url = WebviewUrl::External(format!("http://localhost:{LOCAL_PORT}").parse()?);
            }
            WebviewWindowBuilder::from_config(app.handle(), &config)?.build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running ApplEm");
}
