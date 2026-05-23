use tauri::{AppHandle, Manager, Emitter, State};
use serde::{Serialize, Deserialize};
mod db;
use db::DownloadDb;
use std::fs::File;
use std::io::{Read, Write};
use std::thread;
use tiny_http::{Server, Response as TinyResponse, Header};
use futures_util::StreamExt;
use reqwest::Client;
use std::collections::HashMap;
use std::sync::Mutex;
use std::process::{Command, Child, Stdio};

#[derive(Clone, Serialize)]
struct DownloadProgress {
    id: u32,
    progress: f64,
    downloaded_bytes: u64,
    total_bytes: u64,
    speed: String,
    peers: usize,
}

// Simple XOR Key for "Poor Man's DRM"
const DRM_KEY: &[u8] = b"StreamVault_Secure_Offline_Key__";

fn get_streamvault_dir(app: &AppHandle) -> std::path::PathBuf {
    let downloads = app.path().download_dir().unwrap_or_else(|_| {
        // Fallback: use app_data_dir / "StreamVault" if download_dir is unavailable
        app.path().app_data_dir().unwrap_or_default()
    });
    downloads.join("StreamVault")
}

fn migrate_existing_downloads(app: &AppHandle) {
    let app_data = match app.path().app_data_dir() {
        Ok(d) => d,
        Err(_) => return,
    };
    let old_dir = app_data.join("p2p_cache");
    if !old_dir.exists() {
        return;
    }

    let streamvault = get_streamvault_dir(app);

    // Read the path map (info_hash → file_path) to update after moving
    let mapping_path = app_data.join("p2p_path_map.json");
    let mut path_map: HashMap<String, String> = match std::fs::read_to_string(&mapping_path) {
        Ok(c) => serde_json::from_str(&c).unwrap_or_default(),
        Err(_) => HashMap::new(),
    };

    let mut to_move: Vec<std::path::PathBuf> = Vec::new();

    // Walk p2p_cache top-level for named subdirectories
    if let Ok(entries) = std::fs::read_dir(&old_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() { continue; }
            let dir_name = path.file_name().unwrap().to_string_lossy().to_string();
            let dest = streamvault.join(&dir_name);
            if !dest.exists() {
                // Move the entire directory
                if std::fs::rename(&path, &dest).is_ok() {
                    log::info!("Migrated: {} → {}", path.display(), dest.display());
                    // Update path map entries that pointed to files in this directory
                    let old_prefix = path.to_string_lossy().to_string();
                    let new_prefix = dest.to_string_lossy().to_string();
                    for (_, p) in path_map.iter_mut() {
                        if p.starts_with(&old_prefix) {
                            *p = p.replace(&old_prefix, &new_prefix);
                        }
                    }
                    to_move.push(dest);
                }
            }
        }
    }

    // Also handle loose files directly in p2p_cache root
    if let Ok(entries) = std::fs::read_dir(&old_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() { continue; }
            let fname = path.file_name().unwrap().to_string_lossy().to_string();
            let dest = streamvault.join(&fname);
            if !dest.exists() {
                std::fs::rename(&path, &dest).ok();
            }
        }
    }

    // Save updated path map
    if !path_map.is_empty() {
        let _ = std::fs::write(&mapping_path, serde_json::to_string(&path_map).unwrap());
    }

    // Remove old p2p_cache if empty
    if std::fs::read_dir(&old_dir).map(|mut r| r.next().is_none()).unwrap_or(false) {
        let _ = std::fs::remove_dir(&old_dir);
    }

    if !to_move.is_empty() {
        log::info!("Migration complete: {} directories moved to StreamVault", to_move.len());
    }
}

fn percent_decode(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut chars = s.chars();
    while let Some(c) = chars.next() {
        if c == '%' {
            let mut hex = String::with_capacity(2);
            hex.push(chars.next().unwrap_or('0'));
            hex.push(chars.next().unwrap_or('0'));
            if let Ok(byte) = u8::from_str_radix(&hex, 16) {
                result.push(byte as char);
            } else {
                result.push('%');
                result.push_str(&hex);
            }
        } else if c == '+' {
            result.push(' ');
        } else {
            result.push(c);
        }
    }
    result
}

fn decode_p2p_path(s: &str) -> String {
    use base64::{Engine as _, engine::general_purpose};
    if let Ok(bytes) = general_purpose::STANDARD.decode(s) {
        if let Ok(utf8_str) = String::from_utf8(bytes) {
            if utf8_str.contains('/') || utf8_str.contains('\\') || utf8_str.contains(':') {
                return utf8_str;
            }
        }
    }
    percent_decode(s)
}

fn obfuscate(data: &mut [u8], offset: u64) {
    for (i, byte) in data.iter_mut().enumerate() {
        let key_idx = ((offset + i as u64) % DRM_KEY.len() as u64) as usize;
        *byte ^= DRM_KEY[key_idx];
    }
}

struct XorReader { 
    file: File, 
    offset: u64 
}

impl Read for XorReader {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        let n = self.file.read(buf)?;
        if n > 0 {
            obfuscate(buf, self.offset);
            self.offset += n as u64;
        }
        Ok(n)
    }
}

#[derive(Deserialize)]
struct RqbitFile {
    components: Vec<String>,
    length: u64,
}

#[derive(Deserialize)]
struct RqbitTorrentDetails {
    info_hash: String,
    name: Option<String>,
    files: Option<Vec<RqbitFile>>,
}

#[derive(Deserialize)]
#[allow(dead_code)]
struct RqbitTorrent {
    id: Option<usize>,
    details: RqbitTorrentDetails,
}

#[derive(Deserialize)]
struct RqbitStats {
    progress_bytes: u64,
    total_bytes: u64,
    download_speed: f64,
    live_peers: usize,
    finished: bool,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct TorrentInfo {
    pub info_hash: String,
    pub file_index: usize,
}

pub struct TorrentState {
    pub sidecar_process: Mutex<Option<Child>>,
    pub id_to_info: Mutex<HashMap<u32, TorrentInfo>>,
    pub client: Client,
    pub download_db: DownloadDb,
}

impl TorrentState {
    fn new(client: Client, db_path: std::path::PathBuf) -> Self {
        let download_db = DownloadDb::new(db_path).unwrap_or_else(|e| {
            panic!("Failed to initialize download database: {}", e);
        });
        TorrentState {
            sidecar_process: Mutex::new(None),
            id_to_info: Mutex::new(HashMap::new()),
            client,
            download_db,
        }
    }
}

async fn wait_for_engine(client: &Client) -> Result<(), String> {
    for _ in 0..15 {
        if let Ok(res) = client.get("http://127.0.0.1:3030/torrents").send().await {
            if res.status().is_success() {
                return Ok(());
            }
        }
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
    }
    Err("P2P engine (rqbit) not responding after 7.5s. Is the binary running?".into())
}

async fn remove_torrent_from_engine_and_registry(
    app: &AppHandle,
    state: &State<'_, TorrentState>,
    id: u32,
    fallback_hash: Option<String>,
    purge_files: bool,
) {
    let mut info_hash = fallback_hash;

    // 1. Remove from memory mapping and write to registry
    {
        let mut map = state.id_to_info.lock().unwrap();
        if let Some(info) = map.remove(&id) {
            if info_hash.is_none() {
                info_hash = Some(info.info_hash.clone());
            }
        }
        let registry_path = app.path().app_data_dir()
            .unwrap_or_default()
            .join("p2p_registry.json");
        if let Ok(json) = serde_json::to_string(&*map) {
            let _ = std::fs::write(&registry_path, json);
        }
    }

    // 2. Remove from rqbit engine if still active
    if let Some(hash) = info_hash {
        let endpoint = if purge_files { "delete" } else { "forget" };
        let _ = state.client.post(format!("http://127.0.0.1:3030/torrents/{}/{}", hash.to_lowercase(), endpoint))
            .send().await;
        log::info!("Cleaned/stopped torrent on P2P engine ({}): {}", endpoint, hash);
    }
}

#[tauri::command]
async fn start_p2p_download(
    app: AppHandle,
    state: State<'_, TorrentState>,
    id: u32,
    magnet: String,
) -> Result<(), String> {
    // 0. Wait for engine to be ready
    wait_for_engine(&state.client).await?;

    // 1. Add torrent to rqbit server
    // Add extra reliable trackers to the magnet if they are missing
    let mut final_magnet = magnet.clone();
    if !final_magnet.contains("tr=") {
        final_magnet.push_str("&tr=udp://tracker.opentrackr.org:1337/announce&tr=udp://opentracker.iise.re:6969/announce&tr=udp://9.rarbg.com:2810/announce&tr=udp://open.stealth.si:80/announce");
    }

    let res = state.client.post("http://127.0.0.1:3030/torrents?is_url=true")
        .header("Content-Type", "text/plain")
        .body(final_magnet)
        .send().await.map_err(|e| format!("Failed to connect to P2P engine: {}", e))?;
    
    let status = res.status();
    let text = res.text().await.map_err(|e| format!("Failed to read response body: {}", e))?;
    
    log::info!("P2P engine response [{}]: {}", status, text);

    if !status.is_success() {
        return Err(format!("P2P engine error [{}]: {}", status, text));
    }

    let torrent_info_res: RqbitTorrent = serde_json::from_str(&text)
        .map_err(|e| format!("Invalid engine response structure: {} (Body: {})", e, text))?;
    
    let info_hash = torrent_info_res.details.info_hash.clone();
    
    // 1.5 Find largest file index
    let mut file_index = 0;
    let details_url = format!("http://127.0.0.1:3030/torrents/{}", info_hash.to_lowercase());
    if let Ok(details_res) = state.client.get(&details_url).send().await {
        if let Ok(full_details) = details_res.json::<RqbitTorrent>().await {
            if let Some(files) = full_details.details.files {
                let mut max_size = 0;
                for (i, file) in files.iter().enumerate() {
                    if file.length > max_size {
                        max_size = file.length;
                        file_index = i;
                    }
                }
                log::info!("Selected largest file for {}: index {} ({} bytes)", info_hash, file_index, max_size);
            }
        }
    }

    // Store the mapping
    {
        let mut map = state.id_to_info.lock().unwrap();
        map.insert(id, TorrentInfo { info_hash: info_hash.clone(), file_index });
        let registry_path = app.path().app_data_dir()
            .unwrap_or_default()
            .join("p2p_registry.json");
        if let Ok(json) = serde_json::to_string(&*map) {
            let _ = std::fs::write(&registry_path, json);
        }
    }

    // 2. Spawn telemetry loop
    let app_clone = app.clone();
    let client_clone = state.client.clone();
    let info_hash_clone = info_hash.clone();
    
    tokio::spawn(async move {
        let info_hash_lower = info_hash_clone.to_lowercase();
        let mut fail_count = 0;
        loop {
            let stats_url = format!("http://127.0.0.1:3030/torrents/{}/stats/v1", info_hash_lower);
            match client_clone.get(&stats_url).send().await {
                Ok(res) => {
                    fail_count = 0;
                    if res.status() == reqwest::StatusCode::NOT_FOUND {
                        break;
                    }
                    if let Ok(stats) = res.json::<RqbitStats>().await {
                        let progress = if stats.total_bytes > 0 {
                            (stats.progress_bytes as f64 / stats.total_bytes as f64) * 100.0
                        } else {
                            0.0
                        };

                        let speed = format!("{:.2} MB/s", (stats.download_speed / (1024.0 * 1024.0)));
                        
                        let _ = app_clone.emit("download-progress", DownloadProgress {
                            id,
                            progress,
                            downloaded_bytes: stats.progress_bytes,
                            total_bytes: stats.total_bytes,
                            speed,
                            peers: stats.live_peers,
                        });

                        if stats.finished {
                            let _ = app_clone.emit("download-complete", serde_json::json!({ "id": id }));
                            break;
                        }
                    }
                }
                Err(_) => {
                    fail_count += 1;
                    if fail_count > 5 {
                        break; // Engine unreachable, break gracefully to avoid infinite retry logs.
                    }
                }
            }
            tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
        }
    });

    Ok(())
}

#[tauri::command]
async fn stop_p2p_download(
    app: AppHandle,
    state: tauri::State<'_, TorrentState>,
    id: u32,
) -> Result<(), String> {
    remove_torrent_from_engine_and_registry(&app, &state, id, None, false).await;
    Ok(())
}

#[tauri::command]
async fn get_p2p_status(state: tauri::State<'_, TorrentState>) -> Result<bool, String> {
    match state.client.get("http://127.0.0.1:3030/torrents").send().await {
        Ok(res) => Ok(res.status().is_success()),
        Err(_) => Ok(false),
    }
}

#[derive(Serialize)]
pub struct GlobalStats {
    fetched_bytes: u64,
    uploaded_bytes: u64,
    uptime_seconds: u64,
    live_peers: usize,
}

#[tauri::command]
async fn get_p2p_global_stats(state: tauri::State<'_, TorrentState>) -> Result<GlobalStats, String> {
    let res = state.client.get("http://127.0.0.1:3030/stats").send().await
        .map_err(|e| e.to_string())?;
    
    let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    
    let stats = GlobalStats {
        fetched_bytes: json["counters"]["fetched_bytes"].as_u64().unwrap_or(0),
        uploaded_bytes: json["counters"]["uploaded_bytes"].as_u64().unwrap_or(0),
        uptime_seconds: json["uptime_seconds"].as_u64().unwrap_or(0),
        live_peers: json["peers"]["live"].as_u64().unwrap_or(0) as usize,
    };
    
    Ok(stats)
}

#[tauri::command]
async fn download_media(
    app: AppHandle,
    id: u32,
    url: String,
) -> Result<String, String> {
    let client = Client::new();
    let response = client.get(&url).send().await.map_err(|e| e.to_string())?;
    
    let total_size = response.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;
    let start_time = std::time::Instant::now();
    
    let download_dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("offline_content");
    std::fs::create_dir_all(&download_dir).map_err(|e| e.to_string())?;
    
    let file_path = download_dir.join(format!("{}.svd", id));
    let mut file = File::create(&file_path).map_err(|e| e.to_string())?;

    let mut stream = response.bytes_stream();
    while let Some(chunk_result) = stream.next().await {
        let mut chunk = chunk_result.map_err(|e| e.to_string())?.to_vec();
        
        obfuscate(&mut chunk, downloaded);
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        
        downloaded += chunk.len() as u64;
        let progress = if total_size > 0 { (downloaded as f64 / total_size as f64) * 100.0 } else { 0.0 };
        
        let elapsed = start_time.elapsed().as_secs_f64().max(0.001);
        let speed_bps = downloaded as f64 / elapsed;
        let speed = format!("{:.2} MB/s", speed_bps / (1024.0 * 1024.0));
        
        let _ = app.emit("download-progress", DownloadProgress {
            id,
            progress,
            downloaded_bytes: downloaded,
            total_bytes: total_size,
            speed,
            peers: 0,
        });
    }
    
    Ok(file_path.to_string_lossy().into_owned())
}

#[tauri::command]
fn download_torrent(url: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd").args(["/C", "start", &url]).spawn().map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open").arg(&url).spawn().map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open").arg(&url).spawn().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn delete_media_file(
    app: AppHandle,
    state: tauri::State<'_, TorrentState>,
    id: u32,
) -> Result<(), String> {
    let mut info_hash = None;

    // 1. Remove DB record first (get file_path and info_hash before it's gone)
    if let Ok(Some(record)) = state.download_db.get(id as i64) {
        // Delete the actual video file from disk
        let path = std::path::Path::new(&record.file_path);
        if path.exists() {
            let _ = std::fs::remove_file(path);
        }
        info_hash = record.info_hash.clone();
        // Remove from SQLite
        let _ = state.download_db.remove(id as i64);
    }

    // 2. Clean up old-format .svd file (legacy)
    if let Ok(app_data) = app.path().app_data_dir() {
        let file_path = app_data.join("offline_content").join(format!("{}.svd", id));
        if file_path.exists() {
            let _ = std::fs::remove_file(file_path);
        }
    }

    // 3. Remove from engine, mapping, and registry using helper
    remove_torrent_from_engine_and_registry(&app, &state, id, info_hash, true).await;

    Ok(())
}

fn find_video_in_p2p(app_data: &std::path::Path, streamvault_dir: &std::path::Path, info_hash: &str, torrent_name: Option<&str>) -> String {
    let search_dirs = [
        app_data.join("p2p_cache"),
        streamvault_dir.to_path_buf(),
    ];

    for p2p_dir in &search_dirs {
        if !p2p_dir.exists() {
            continue;
        }

        // Try known directory patterns
        let mut candidate_dirs: Vec<std::path::PathBuf> = Vec::new();
        candidate_dirs.push(p2p_dir.join(info_hash.to_lowercase()));
        if let Some(name) = torrent_name {
            candidate_dirs.push(p2p_dir.join(name));
            let short = &info_hash[..8.min(info_hash.len())];
            candidate_dirs.push(p2p_dir.join(format!("{}-{}", name, short)));
        }

        for dir in &candidate_dirs {
            if dir.exists() {
                if dir.is_dir() {
                    let mut best_path = String::new();
                    let mut best_size: u64 = 0;
                    walk_video_dir(dir, &mut best_path, &mut best_size);
                    if !best_path.is_empty() {
                        return best_path;
                    }
                } else if dir.is_file() {
                    return dir.to_string_lossy().to_string();
                }
            }
        }
        
        // Final fallback just for single file torrents directly in p2p_dir
        if let Some(name) = torrent_name {
            let direct_file = p2p_dir.join(name);
            if direct_file.exists() && direct_file.is_file() {
                return direct_file.to_string_lossy().to_string();
            }
        }
    }

    String::new()
}

fn walk_video_dir(dir: &std::path::Path, best_path: &mut String, best_size: &mut u64) {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                walk_video_dir(&path, best_path, best_size);
            } else if let Some(ext) = path.extension() {
                let ext = ext.to_string_lossy().to_lowercase();
                if matches!(ext.as_str(), "mp4" | "mkv" | "avi" | "webm") {
                    if let Ok(meta) = std::fs::metadata(&path) {
                        if meta.len() > *best_size {
                            *best_size = meta.len();
                            *best_path = path.to_string_lossy().to_string();
                        }
                    }
                }
            }
        }
    }
}

#[derive(Serialize)]
struct FinalizeResult {
    file_path: String,
}

#[tauri::command]
async fn finalize_p2p_download(
    app: AppHandle,
    state: tauri::State<'_, TorrentState>,
    id: u32,
    info_hash: String,
) -> Result<FinalizeResult, String> {
    let details_url = format!("http://127.0.0.1:3030/torrents/{}", info_hash.to_lowercase());
    let mut file_path = String::new();
    let mut torrent_name: Option<String> = None;

    if let Ok(details_res) = state.client.get(&details_url).send().await {
        if let Ok(full_details) = details_res.json::<RqbitTorrent>().await {
            torrent_name = full_details.details.name.clone();
            if let Some(files) = full_details.details.files {
                let mut max_size = 0;
                for file in files.iter() {
                    if file.length > max_size {
                        max_size = file.length;
                        let mut path_buf = get_streamvault_dir(&app);
                        if let Some(name) = &full_details.details.name {
                            path_buf = path_buf.join(name);
                        }
                        for comp in &file.components {
                            path_buf = path_buf.join(comp);
                        }
                        file_path = path_buf.to_string_lossy().to_string();
                    }
                }
            }
        }
    }

    let app_data = app.path().app_data_dir().unwrap_or_default();
    let streamvault_dir = get_streamvault_dir(&app);
    if !file_path.is_empty() && !std::path::Path::new(&file_path).exists() {
        log::warn!("Constructed path does not exist, searching alternatives: {}", file_path);
        file_path = find_video_in_p2p(&app_data, &streamvault_dir, &info_hash, torrent_name.as_deref());
    } else if file_path.is_empty() {
        file_path = find_video_in_p2p(&app_data, &streamvault_dir, &info_hash, torrent_name.as_deref());
    }

    // Rename file to a predictable format: {id}.{ext}
    if !file_path.is_empty() && std::path::Path::new(&file_path).exists() {
        let ext = std::path::Path::new(&file_path).extension().and_then(|e| e.to_str()).unwrap_or("mp4");
        let new_path = streamvault_dir.join(format!("{}.{}", id, ext));
        
        if file_path != new_path.to_string_lossy().to_string() {
            if std::fs::rename(&file_path, &new_path).is_ok() || std::fs::copy(&file_path, &new_path).is_ok() {
                let _ = std::fs::remove_file(&file_path);
                if let Some(parent) = std::path::Path::new(&file_path).parent() {
                    if parent != streamvault_dir.as_path() {
                        let _ = std::fs::remove_dir(parent);
                    }
                }
                file_path = new_path.to_string_lossy().to_string();
                log::info!("Renamed downloaded file to: {}", file_path);
            }
        }
    }

    

    remove_torrent_from_engine_and_registry(&app, &state, id, Some(info_hash), false).await;

    Ok(FinalizeResult { file_path })
}

#[tauri::command]
async fn resolve_p2p_file(app: AppHandle) -> Result<String, String> {
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let p2p_dir = app_data.join("p2p_cache");
    let streamvault_dir = get_streamvault_dir(&app);

    let mut best_path = String::new();
    let mut best_size: u64 = 0;

    fn walk_dir(dir: &std::path::Path, best_path: &mut String, best_size: &mut u64) {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    walk_dir(&path, best_path, best_size);
                } else if let Some(ext) = path.extension() {
                    let ext = ext.to_string_lossy().to_lowercase();
                    if matches!(ext.as_str(), "mp4" | "mkv" | "avi" | "webm") {
                        if let Ok(meta) = std::fs::metadata(&path) {
                            if meta.len() > *best_size {
                                *best_size = meta.len();
                                *best_path = path.to_string_lossy().to_string();
                            }
                        }
                    }
                }
            }
        }
    }

    if p2p_dir.exists() {
        walk_dir(&p2p_dir, &mut best_path, &mut best_size);
    }
    if streamvault_dir.exists() {
        walk_dir(&streamvault_dir, &mut best_path, &mut best_size);
    }

    if best_path.is_empty() {
        return Err("No video files found".into());
    }

    Ok(best_path)
}

#[tauri::command]
async fn resolve_p2p_file_by_hash(app: AppHandle, state: tauri::State<'_, TorrentState>, info_hash: String) -> Result<String, String> {
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let p2p_dir = app_data.join("p2p_cache");
    let streamvault_dir = get_streamvault_dir(&app);

    if !p2p_dir.exists() && !streamvault_dir.exists() {
        return Err("No download directories found".into());
    }

    // First check the persisted path map (written by finalize_p2p_download)
    let mapping_path = app_data.join("p2p_path_map.json");
    if mapping_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&mapping_path) {
            if let Ok(map) = serde_json::from_str::<HashMap<String, String>>(&content) {
                let lookup = info_hash.to_lowercase();
                if let Some(path) = map.get(&lookup) {
                    if std::path::Path::new(path).exists() {
                        return Ok(path.clone());
                    }
                }
            }
        }
    }

    // Also check the registry for any entry with this hash
    let registry_path = app_data.join("p2p_registry.json");
    if registry_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&registry_path) {
            if let Ok(registry) = serde_json::from_str::<HashMap<u32, TorrentInfo>>(&content) {
                for (_, entry) in &registry {
                    if entry.info_hash.to_lowercase() == info_hash.to_lowercase() {
                        // Try to query rqbit for the full path
                        if let Ok(details_res) = state.client.get(
                            format!("http://127.0.0.1:3030/torrents/{}", info_hash.to_lowercase())
                        ).send().await {
                            if let Ok(full_details) = details_res.json::<RqbitTorrent>().await {
                                if let Some(files) = full_details.details.files {
                                    let mut max_size = 0u64;
                                    let mut resolved_path = String::new();
                                    for file in files.iter() {
                                        if file.length > max_size {
                                            max_size = file.length;
                                            let mut path_buf = get_streamvault_dir(&app);
                                            if let Some(name) = &full_details.details.name {
                                                path_buf = path_buf.join(name);
                                            }
                                            for comp in &file.components {
                                                path_buf = path_buf.join(comp);
                                            }
                                            resolved_path = path_buf.to_string_lossy().to_string();
                                        }
                                    }
                                    if !resolved_path.is_empty() && std::path::Path::new(&resolved_path).exists() {
                                        return Ok(resolved_path);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // No fallback: if we couldn't find the specific file for this hash, return error
    // rather than returning the wrong file.
    Err(format!("No video file found for hash {}", info_hash))
}

#[tauri::command]
async fn spawn_p2p_engine(app: AppHandle, state: tauri::State<'_, TorrentState>) -> Result<(), String> {
    let mut process_guard = state.sidecar_process.lock().unwrap();
    if process_guard.is_some() {
        return Ok(()); // Already running
    }
    
    let target_triple = app.env().args_os.get(0).and_then(|_| Some("x86_64-pc-windows-msvc")).unwrap_or("x86_64-pc-windows-msvc");
    
    let bin_dir_resource = app.path().resource_dir().map_err(|e| e.to_string())?.join("bin");
    let app_config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let bin_dir_dev = if let Some(parent) = app_config_dir.parent() {
        parent.join("src-tauri/bin")
    } else {
        bin_dir_resource.clone()
    };
    
    let mut sidecar_path = bin_dir_resource.join(format!("rqbit-{}.exe", target_triple));
    if !sidecar_path.exists() {
        let dev_path = bin_dir_dev.join(format!("rqbit-{}.exe", target_triple));
        if dev_path.exists() {
            sidecar_path = dev_path;
        }
    }
    
    let streamvault_dir = get_streamvault_dir(&app);
    std::fs::create_dir_all(&streamvault_dir).map_err(|e| format!("Failed to create StreamVault dir: {}", e))?;

    let mut child = Command::new(&sidecar_path)
        .args([
            "--http-api-listen-addr", "127.0.0.1:3030",
            "--disable-dht",
            "--listen-port", "4241",
            "server", "start",
            "--disable-persistence",
        ])
        .arg(&streamvault_dir)
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .spawn().map_err(|e| format!("Failed to spawn rqbit: {}", e))?;

    // Check if process died immediately (common crash on Windows due to port conflicts)
    let pid = child.id();
    std::thread::sleep(std::time::Duration::from_millis(500));
    match child.try_wait() {
        Ok(Some(exit)) => {
            let _ = std::process::Command::new("taskkill")
                .args(["/F", "/PID", &pid.to_string()])
                .output();
            return Err(format!("rqbit exited immediately with status {}. Check firewall or try running as admin.", exit));
        }
        Ok(None) => { /* still running, good */ }
        Err(e) => {
            return Err(format!("Failed to check rqbit process: {}", e));
        }
    }

    *process_guard = Some(child);
    drop(process_guard); // Release lock before async work

    // Auto-cleanup: wait for engine to be ready, then repeatedly delete completed + orphaned torrents
    // until none remain. This handles the case where rqbit loads torrents from its own session DB
    // (e.g., `%APPDATA%/rqbit/session/data`) and we need to clear out ghosts.
    let client = state.client.clone();
    let known_hashes: std::collections::HashSet<String> = {
        let map = state.id_to_info.lock().unwrap();
        map.values().map(|info| info.info_hash.to_lowercase()).collect()
    };
    tokio::spawn(async move {
        // Wait for engine to be ready (up to 15s)
        for _ in 0..30 {
            if let Ok(res) = client.get("http://127.0.0.1:3030/torrents").send().await {
                if res.status().is_success() {
                    // Keep retrying cleanup until we get a full pass with nothing to delete.
                    // This catches torrents that were "initializing" on previous passes.
                    loop {
                        let mut cleaned = 0u32;
                        if let Ok(list) = client.get("http://127.0.0.1:3030/torrents").send().await {
                            if let Ok(body) = list.json::<serde_json::Value>().await {
                                if let Some(torrents) = body["torrents"].as_array() {
                                    for t in torrents {
                                        let hash = t["info_hash"].as_str().unwrap_or("").to_lowercase();
                                        if hash.is_empty() { continue; }

                                        // Remove orphaned torrents (not in the frontend registry)
                                        if !known_hashes.contains(&hash) {
                                            let _ = client.post(format!("http://127.0.0.1:3030/torrents/{}/delete", hash))
                                                .send().await;
                                            log::info!("Auto-cleaned orphaned torrent: {}", hash);
                                            cleaned += 1;
                                        }
                                    }
                                }
                            }
                        }
                        if cleaned == 0 { break; }
                        tokio::time::sleep(tokio::time::Duration::from_millis(800)).await;
                    }
                    log::info!("Engine cleanup complete — no orphaned torrents remain");
                    return;
                }
            }
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
        }
        log::error!("rqbit engine failed to start within 15s timeout");
    });

    Ok(())
}

#[tauri::command]
async fn kill_p2p_engine(state: tauri::State<'_, TorrentState>) -> Result<(), String> {
    let mut process_guard = state.sidecar_process.lock().unwrap();
    if let Some(mut child) = process_guard.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    Ok(())
}

#[tauri::command]
async fn open_in_external_player(app: AppHandle, id: u32, file_path: Option<String>) -> Result<(), String> {
    let try_launch = |path: &str| -> bool {
        if !std::path::Path::new(path).exists() { return false; }
        let vlc_candidates: &[&str] = &[
            "vlc",
            r"C:\Program Files\VideoLAN\VLC\vlc.exe",
            r"C:\Program Files (x86)\VideoLAN\VLC\vlc.exe",
            r"C:\Program Files\VideoLAN\VLC\vlc.cmd",
        ];
        #[cfg(target_os = "windows")]
        {
            for vlc in vlc_candidates {
                let p = std::path::PathBuf::from(vlc);
                if p.exists() || (vlc == &"vlc" && std::process::Command::new("vlc").arg("--version").stdout(Stdio::null()).stderr(Stdio::null()).spawn().is_ok()) {
                    if std::process::Command::new(if vlc == &"vlc" { "vlc" } else { vlc }).arg(path)
                        .stdout(Stdio::null()).stderr(Stdio::null()).spawn().is_ok() { return true; }
                }
            }
            if std::process::Command::new("mpv").arg(path)
                .stdout(Stdio::null()).stderr(Stdio::null()).spawn().is_ok() { return true; }
            if std::process::Command::new("cmd").args(["/C", "start", "", &path])
                .stdout(Stdio::null()).stderr(Stdio::null()).spawn().is_ok() { return true; }
        }
        #[cfg(target_os = "macos")]
        {
            if std::process::Command::new("open").arg("-a").arg("VLC").arg(path).spawn().is_ok() { return true; }
            if std::process::Command::new("open").arg("-a").arg("mpv").arg(path).spawn().is_ok() { return true; }
            if std::process::Command::new("open").arg(path).spawn().is_ok() { return true; }
        }
        #[cfg(target_os = "linux")]
        {
            if std::process::Command::new("vlc").arg(path).stdout(Stdio::null()).stderr(Stdio::null()).spawn().is_ok() { return true; }
            if std::process::Command::new("mpv").arg(path).stdout(Stdio::null()).stderr(Stdio::null()).spawn().is_ok() { return true; }
            if std::process::Command::new("xdg-open").arg(path).spawn().is_ok() { return true; }
        }
        false
    };

    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;

    // 0. If frontend passed a direct file_path, use it first (most reliable)
    if let Some(ref fp) = file_path {
        if try_launch(fp) { return Ok(()); }
    }

    // 1. Database lookup (single source of truth)
    let ts = app.state::<TorrentState>();
    if let Ok(record) = ts.download_db.get(id as i64) {
        if let Some(r) = record {
            if try_launch(&r.file_path) { return Ok(()); }
        }
    }

    // 2. Search for the largest video file across both directories
    let search_dirs = [app_data.join("p2p_cache"), get_streamvault_dir(&app)];
    for dir in &search_dirs {
        if !dir.exists() { continue; }
        fn walk_videos(dir: &std::path::Path) -> Option<String> {
            let mut best = String::new();
            let mut best_size: u64 = 0;
            if let Ok(entries) = std::fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir() {
                        if let Some(found) = walk_videos(&path) {
                            if let Ok(meta) = std::fs::metadata(&found) {
                                if meta.len() > best_size { best_size = meta.len(); best = found; }
                            }
                        }
                    } else if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                        if matches!(ext.to_lowercase().as_str(), "mp4" | "mkv" | "avi" | "webm" | "m4v" | "mov" | "mpg" | "mpeg" | "ts") {
                            if let Ok(meta) = std::fs::metadata(&path) {
                                if meta.len() > best_size { best_size = meta.len(); best = path.to_string_lossy().to_string(); }
                            }
                        }
                    }
                }
            }
            if best.is_empty() { None } else { Some(best) }
        }
        if let Some(found) = walk_videos(dir) {
            if try_launch(&found) { return Ok(()); }
        }
    }

    // 3. Final fallback: Return error to UI instead of opening browser
    Err("Could not find the downloaded file on disk. It may have been moved or deleted.".to_string())
}


#[tauri::command]
async fn sync_download_path(
    app: AppHandle,
    state: tauri::State<'_, TorrentState>,
    id: u32,
    info_hash: String,
) -> Result<String, String> {
    let details_url = format!("http://127.0.0.1:3030/torrents/{}", info_hash.to_lowercase());
    let mut file_path = String::new();
    let mut file_size: Option<i64> = None;

    if let Ok(details_res) = state.client.get(&details_url).send().await {
        if let Ok(full_details) = details_res.json::<serde_json::Value>().await {
            let details = full_details.get("details").unwrap_or(&full_details);
            
            if let Some(files) = details.get("files").and_then(|f| f.as_array()) {
                let mut max_size = 0u64;
                for file in files {
                    let length = file.get("length").and_then(|l| l.as_u64()).unwrap_or(0);
                    if length > max_size {
                        max_size = length;
                        let mut path_buf = get_streamvault_dir(&app);
                        if let Some(name) = details.get("name").and_then(|n| n.as_str()) {
                            let comps = file.get("components").and_then(|c| c.as_array());
                            if let Some(comps) = comps {
                                let first = comps.first().and_then(|c| c.as_str()).unwrap_or("");
                                if name != first || comps.len() > 1 {
                                    path_buf = path_buf.join(name);
                                }
                            } else {
                                path_buf = path_buf.join(name);
                            }
                        }
                        if let Some(comps) = file.get("components").and_then(|c| c.as_array()) {
                            for comp in comps {
                                if let Some(comp_str) = comp.as_str() {
                                    path_buf = path_buf.join(comp_str);
                                }
                            }
                        }
                        file_path = path_buf.to_string_lossy().to_string();
                        file_size = Some(max_size as i64);
                    }
                }
            }
        }
    }

    if file_path.is_empty() {
        return Err("Could not resolve file path from rqbit".into());
    }

    // Retrieve existing record first if it exists to preserve title, year, etc.
    let (existing_title, existing_year, existing_size) = if let Ok(Some(existing)) = state.download_db.get(id as i64) {
        (existing.title, existing.year, existing.file_size)
    } else {
        (String::new(), None, None)
    };

    let new_record = crate::db::DownloadRecord {
        id: id as i64,
        title: if existing_title.is_empty() { format!("Media {}", id) } else { existing_title },
        year: existing_year,
        file_path: file_path.clone(),
        file_size: file_size.or(existing_size),
        info_hash: Some(info_hash.to_lowercase()),
        status: "complete".to_string(),
        downloaded_at: chrono::Utc::now().to_rfc3339(),
    };
    let _ = state.download_db.upsert(&new_record);

    // Completely remove the torrent job from the engine, from memory, and from the registry.
    // This stops seeding and frees it so it doesn't seed or show up in the engine anymore,
    // while keeping the downloaded file fully intact.
    remove_torrent_from_engine_and_registry(&app, &state, id, Some(info_hash), false).await;

    Ok(file_path)
}

#[tauri::command]
async fn stop_torrent_engine(
    app: AppHandle,
    state: tauri::State<'_, TorrentState>,
    info_hash: String,
) -> Result<(), String> {
    // Look up mapped ID in memory to cleanly clean registry
    let mut mapped_id = None;
    {
        let map = state.id_to_info.lock().unwrap();
        for (id, info) in map.iter() {
            if info.info_hash.to_lowercase() == info_hash.to_lowercase() {
                mapped_id = Some(*id);
                break;
            }
        }
    }

    if let Some(id) = mapped_id {
        // Check if there is an active background download record for this ID in the database
        let is_background_download = if let Ok(Some(record)) = state.download_db.get(id as i64) {
            record.status == "downloading" || record.status == "complete"
        } else {
            false
        };

        if !is_background_download {
            // It was just a stream! Purge it from rqbit AND from registry/memory mapping!
            remove_torrent_from_engine_and_registry(&app, &state, id, Some(info_hash), true).await;
        } else {
            log::info!("Keeping background download active for ID: {}", id);
        }
    } else {
        // If not mapped, just delete the torrent from rqbit directly to be safe
        let _ = state.client.post(format!("http://127.0.0.1:3030/torrents/{}/delete", info_hash.to_lowercase()))
            .send().await;
    }
    Ok(())
}

#[tauri::command]
async fn get_playable_url(
    state: tauri::State<'_, TorrentState>,
    id: u32,
) -> Result<String, String> {
    if let Ok(Some(record)) = state.download_db.get(id as i64) {
        let path = std::path::Path::new(&record.file_path);
        if path.exists() {
            // Encode the path for local proxy
            use url::form_urlencoded;
            let encoded: String = form_urlencoded::byte_serialize(record.file_path.as_bytes()).collect();
            return Ok(format!("http://127.0.0.1:8083/p2p-stream/?path={}", encoded));
        }
    }
    Err("File not found on disk or in DB".into())
}

// ── Database-backed download records ─────────────────────────────

#[tauri::command]
async fn db_save_download(state: tauri::State<'_, TorrentState>, record: db::DownloadRecord) -> Result<(), String> {
    state.download_db.upsert(&record)
}

#[tauri::command]
async fn db_get_download(state: tauri::State<'_, TorrentState>, id: i64) -> Result<Option<db::DownloadRecord>, String> {
    state.download_db.get(id)
}

#[tauri::command]
async fn db_list_downloads(state: tauri::State<'_, TorrentState>) -> Result<Vec<db::DownloadRecord>, String> {
    state.download_db.list_complete()
}

#[tauri::command]
async fn db_remove_download(
    app: tauri::AppHandle,
    state: tauri::State<'_, TorrentState>,
    id: i64
) -> Result<(), String> {
    let mut info_hash = None;

    if let Ok(Some(record)) = state.download_db.get(id) {
        let path = std::path::Path::new(&record.file_path);
        if path.exists() {
            let _ = std::fs::remove_file(path);
        }

        info_hash = record.info_hash.clone();

        if let Some(hash) = &record.info_hash {
            let mapping_path = app.path().app_data_dir()
                .unwrap_or_default()
                .join("p2p_path_map.json");
            if mapping_path.exists() {
                if let Ok(content) = std::fs::read_to_string(&mapping_path) {
                    if let Ok(mut map) = serde_json::from_str::<std::collections::HashMap<String, String>>(&content) {
                        map.remove(hash);
                        if let Ok(json) = serde_json::to_string(&map) {
                            let _ = std::fs::write(&mapping_path, json);
                        }
                    }
                }
            }
        }
    }

    remove_torrent_from_engine_and_registry(&app, &state, id as u32, info_hash, true).await;

    state.download_db.remove(id)
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct ScannedFile {
    pub file_path: String,
    pub parsed_title: String,
    pub parsed_year: Option<i32>,
    pub file_size: u64,
}

#[tauri::command]
async fn scan_local_library(app: tauri::AppHandle) -> Result<Vec<ScannedFile>, String> {
    let streamvault_dir = get_streamvault_dir(&app);

    if !streamvault_dir.exists() {
        return Ok(vec![]);
    }

    let video_extensions = ["mp4", "mkv", "avi", "webm"];
    let mut results: Vec<ScannedFile> = Vec::new();

    // Regex to strip torrent tags and extract title + year
    let tag_regex = regex::Regex::new(
        r"(?i)[\(\[\{]?(19|20)\d{2}[\)\]\}]?.*$|\b(1080p|720p|480p|4k|2160p|bluray|webrip|hdtv|x264|x265|hevc|aac|yts|yify|rarbg|eztv|mx|web\-dl|dvdrip|brrip|xvid)\b.*$"
    ).map_err(|e| e.to_string())?;

    let year_regex = regex::Regex::new(r"(19|20)\d{2}")
        .map_err(|e| e.to_string())?;

    fn walk_dir(
        dir: &std::path::Path,
        video_extensions: &[&str],
        tag_regex: &regex::Regex,
        year_regex: &regex::Regex,
        results: &mut Vec<ScannedFile>,
    ) {
        let entries = match std::fs::read_dir(dir) {
            Ok(e) => e,
            Err(_) => return,
        };

        for entry in entries.flatten() {
            let path = entry.path();

            if path.is_dir() {
                walk_dir(&path, video_extensions, tag_regex, year_regex, results);
                continue;
            }

            if path.is_file() {
                let ext = path.extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("")
                    .to_lowercase();

                if !video_extensions.contains(&ext.as_str()) {
                    continue;
                }

                // Use parent folder name if filename looks like a hash/code,
                // otherwise use the filename stem
                let stem = path.file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("")
                    .to_string();

                let raw_name = if stem.len() < 5 || stem.chars().all(|c| c.is_alphanumeric()) {
                    // Looks like a hash, use parent folder name instead
                    path.parent()
                        .and_then(|p| p.file_name())
                        .and_then(|n| n.to_str())
                        .unwrap_or(&stem)
                        .to_string()
                } else {
                    stem.replace('.', " ").replace('_', " ")
                };

                // Extract year before stripping tags
                let parsed_year = year_regex.find(&raw_name)
                    .and_then(|m| m.as_str().parse::<i32>().ok());

                // Strip tags to get clean title
                let parsed_title = tag_regex.replace(&raw_name, "")
                    .trim()
                    .trim_matches(|c: char| !c.is_alphanumeric())
                    .to_string();

                if parsed_title.is_empty() {
                    continue;
                }

                let file_size = entry.metadata()
                    .map(|m| m.len())
                    .unwrap_or(0);

                // Skip files smaller than 50MB (likely samples or extras)
                if file_size < 50 * 1024 * 1024 {
                    continue;
                }

                results.push(ScannedFile {
                    file_path: path.to_string_lossy().to_string(),
                    parsed_title,
                    parsed_year,
                    file_size,
                });
            }
        }
    }

    walk_dir(&streamvault_dir, &video_extensions, &tag_regex, &year_regex, &mut results);

    Ok(results)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let nav_plugin = tauri::plugin::Builder::<tauri::Wry, ()>::new("navigation")
    .on_navigation(|_window, url| {
        let host = url.host_str().unwrap_or("");
        if host == "localhost" || host == "127.0.0.1" || url.scheme() == "tauri" {
            return true;
        }
        
        let allowed_domains = [
            "themoviedb.org", "tmdb.org", "vidsrc.me", "vidsrc.to", "vidsrc.pro",
            "vidsrc.net", "vidsrc.in", "vidsrc.xyz", "embed.su", "2embed.cc",
            "vidsrc.rip", "superembed.stream"
        ];
        
        for domain in allowed_domains.iter() {
            if host == *domain || host.ends_with(&format!(".{}", domain)) {
                return true;
            }
        }
        
        println!("Blocked ad redirect to: {}", url);
        false
    })
    .build();

  let app = tauri::Builder::default()
    .plugin(nav_plugin)
    .plugin(tauri_plugin_log::Builder::default().build())
    .plugin(tauri_plugin_fs::init())
    .setup(|app| {
      #[cfg(target_os = "windows")]
      {
          let _ = std::process::Command::new("taskkill")
              .args(["/F", "/IM", "rqbit-x86_64-pc-windows-msvc.exe"])
              .output();
          let _ = std::process::Command::new("taskkill")
              .args(["/F", "/IM", "rqbit.exe"])
              .output();
      }

      let app_handle = app.handle().clone();
      let app_data = app_handle.path().app_data_dir().unwrap();
      let streamvault_dir = get_streamvault_dir(&app_handle);
      std::fs::create_dir_all(&streamvault_dir).unwrap();
      // Migrate existing downloads from p2p_cache to Downloads/StreamVault
      migrate_existing_downloads(&app_handle);
      // Still create p2p_cache in case any code needs it
      let p2p_dir = app_data.join("p2p_cache");
      std::fs::create_dir_all(&p2p_dir).unwrap();
      
      // 🚀 Engine starts entirely manually now via spawn_p2p_engine.

      // Load persisted registry
      let registry_path = app_data.join("p2p_registry.json");
      let mut id_to_info = HashMap::new();
      if let Ok(content) = std::fs::read_to_string(&registry_path) {
          if let Ok(map) = serde_json::from_str::<HashMap<u32, TorrentInfo>>(&content) {
              id_to_info = map;
              log::info!("Restored {} P2P mappings", id_to_info.len());
          }
      }

      let db_path = app_data.join("downloads.db");
      app.manage(TorrentState::new(Client::new(), db_path));
      // Restore id_to_info from old registry for backward compatibility
      {
          let state = app.state::<TorrentState>();
          let mut map = state.id_to_info.lock().unwrap();
          *map = id_to_info;
      }

      // Clean up orphaned DB records (file was deleted outside the app)
      {
          let state = app.state::<TorrentState>();
          if let Ok(records) = state.download_db.list_complete() {
              for r in &records {
                  let p = std::path::Path::new(&r.file_path);
                  if !p.exists() {
                      let _ = state.download_db.remove(r.id);
                      log::info!("Cleaned up orphaned DB record for {} (file missing)", r.id);
                  }
              }
          }
      }

      let app_handle_for_server = app.handle().clone();
      thread::spawn(move || {
          let server = Server::http("127.0.0.1:8083").unwrap();
          for mut request in server.incoming_requests() {
              let url = request.url().to_string();
              
              // Handle OPTIONS requests (CORS preflight) site-wide
              if request.method() == &tiny_http::Method::Options {
                  let res = TinyResponse::empty(204)
                      .with_header(Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap())
                      .with_header(Header::from_bytes(&b"Access-Control-Allow-Methods"[..], &b"GET, POST, OPTIONS, DELETE"[..]).unwrap())
                      .with_header(Header::from_bytes(&b"Access-Control-Allow-Headers"[..], &b"Content-Type, Range"[..]).unwrap())
                      .with_header(Header::from_bytes(&b"Access-Control-Max-Age"[..], &b"86400"[..]).unwrap());
                  let _ = request.respond(res);
                  continue;
              }

              if url.starts_with("/offline/") {
                  let id_str = url.trim_start_matches("/offline/").split('?').next().unwrap_or("");
                  let id: u32 = id_str.parse().unwrap_or(0);
                  
                  let download_dir = app_handle_for_server.path().app_data_dir().unwrap().join("offline_content");
                  let file_path = download_dir.join(format!("{}.svd", id));
                  
                  if let Ok(mut file) = File::open(&file_path) {
                      let file_size = std::fs::metadata(&file_path).map(|m| m.len()).unwrap_or(0) as u64;
                      
                      let mut start: u64 = 0;
                      let mut end: u64 = file_size.saturating_sub(1);
                      let mut is_partial = false;
                      
                      for header in request.headers() {
                          if header.field.equiv("Range") {
                              let value = header.value.as_str();
                              if value.starts_with("bytes=") {
                                  let range_part = &value[6..];
                                  let parts: Vec<&str> = range_part.split('-').collect();
                                  
                                  if let Ok(s) = parts[0].parse::<u64>() {
                                      start = s;
                                      is_partial = true;
                                  }
                                  
                                  if parts.len() > 1 && !parts[1].is_empty() {
                                      if let Ok(e) = parts[1].parse::<u64>() {
                                          end = e;
                                      }
                                  }
                              }
                          }
                      }
                      
                      use std::io::Seek;
                      let _ = file.seek(std::io::SeekFrom::Start(start));
                      let content_length = end.saturating_sub(start) + 1;
                      
                      let status_code = if is_partial { 206 } else { 200 };
                      let mut response = TinyResponse::new(
                          tiny_http::StatusCode(status_code),
                          vec![
                              Header::from_bytes(&b"Content-Type"[..], &b"video/mp4"[..]).unwrap(),
                              Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap(),
                              Header::from_bytes(&b"Accept-Ranges"[..], &b"bytes"[..]).unwrap(),
                          ],
                          XorReader { file, offset: start },
                          Some(content_length as usize),
                          None,
                      );
                      
                      if is_partial {
                          response.add_header(
                              Header::from_bytes(
                                  &b"Content-Range"[..],
                                  format!("bytes {}-{}/{}", start, end, file_size).as_bytes()
                              ).unwrap()
                          );
                      }
                      
                      let _ = request.respond(response);
                      continue;
                  }

                  // P2P Streaming Fallback (Redirect to rqbit)
                  let torrent_state = app_handle_for_server.state::<TorrentState>();
                  let info = {
                      let map = torrent_state.id_to_info.lock().unwrap();
                      map.get(&id).cloned()
                  };

                  if let Some(i) = info {
                      let stream_url = format!("http://127.0.0.1:3030/torrents/{}/stream/{}", i.info_hash.to_lowercase(), i.file_index);
                      let response = TinyResponse::empty(302)
                          .with_header(Header::from_bytes(&b"Location"[..], stream_url.as_bytes()).unwrap());
                      let _ = request.respond(response);
                      continue;
                  }
              } else if url.starts_with("/p2p-stream/") {
                  // Direct file serving — bypasses asset protocol
                  let query_str = url.split('?').nth(1).unwrap_or("");
                  let mut encoded_path = "";
                  for param in query_str.split('&') {
                      if param.starts_with("path=") {
                          encoded_path = &param[5..];
                          break;
                      }
                  }
                  let file_path_str = decode_p2p_path(encoded_path);
                  
                  let file_path = if file_path_str.contains(':') || file_path_str.starts_with('/') {
                      // Absolute path provided
                      std::path::PathBuf::from(&file_path_str)
                  } else {
                      // Try p2p_cache first, then StreamVault
                      let app_data = app_handle_for_server.path().app_data_dir().unwrap();
                      let cached = app_data.join("p2p_cache").join(&file_path_str);
                      if cached.exists() { cached } else {
                          get_streamvault_dir(&app_handle_for_server).join(&file_path_str)
                      }
                  };
                  
                  if let Ok(mut file) = File::open(&file_path) {
                      let file_size = std::fs::metadata(&file_path).map(|m| m.len()).unwrap_or(0);
                      
                      // Detect MIME type from file extension
                      let content_type = file_path.extension()
                          .and_then(|ext| ext.to_str())
                          .map(|ext| match ext.to_lowercase().as_str() {
                              "mp4" => "video/mp4",
                              "webm" => "video/webm",
                              "mkv" => "video/x-matroska",
                              "avi" => "video/x-msvideo",
                              "mov" => "video/quicktime",
                              "m4v" => "video/mp4",
                              "mpg" | "mpeg" => "video/mpeg",
                              "ts" => "video/mp2t",
                              _ => "video/mp4",
                          })
                          .unwrap_or("video/mp4");
                      
                      let mut start: u64 = 0;
                      let mut end: u64 = file_size.saturating_sub(1);
                      let mut is_partial = false;
                      
                      for header in request.headers() {
                          if header.field.equiv("Range") {
                              let value = header.value.as_str();
                              if value.starts_with("bytes=") {
                                  let range_part = &value[6..];
                                  let parts: Vec<&str> = range_part.split('-').collect();
                                  if let Ok(s) = parts[0].parse::<u64>() {
                                      start = s;
                                      is_partial = true;
                                  }
                                  if parts.len() > 1 && !parts[1].is_empty() {
                                      if let Ok(e) = parts[1].parse::<u64>() {
                                          end = e;
                                      }
                                  }
                              }
                          }
                      }
                      
                      use std::io::Seek;
                      let _ = file.seek(std::io::SeekFrom::Start(start));
                      let content_length = end.saturating_sub(start) + 1;
                      
                      let status_code = if is_partial { 206 } else { 200 };
                      let mut response = TinyResponse::new(
                          tiny_http::StatusCode(status_code),
                          vec![
                              Header::from_bytes(&b"Content-Type"[..], content_type.as_bytes()).unwrap(),
                              Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap(),
                              Header::from_bytes(&b"Accept-Ranges"[..], &b"bytes"[..]).unwrap(),
                          ],
                          file,
                          Some(content_length as usize),
                          None,
                      );
                      
                      if is_partial {
                          response.add_header(
                              Header::from_bytes(
                                  &b"Content-Range"[..],
                                  format!("bytes {}-{}/{}", start, end, file_size).as_bytes()
                              ).unwrap()
                          );
                      }
                      
                      let _ = request.respond(response);
                      continue;
                  }

                  let _ = request.respond(TinyResponse::from_string("File not found").with_status_code(tiny_http::StatusCode(404)));
                  continue;
              } else if url.starts_with("/p2p-proxy/") {
                  let path_with_query = url.trim_start_matches("/p2p-proxy/");
                  let target_url = format!("http://127.0.0.1:3030/{}", path_with_query);
                  let method = request.method().clone();
                  
                  // Read body if it's a POST
                  let mut body_bytes = Vec::new();
                  if method == tiny_http::Method::Post {
                      let _ = request.as_reader().read_to_end(&mut body_bytes);
                  }

                  let client = Client::new();
                  let response = thread::spawn(move || {
                      let rt = tokio::runtime::Runtime::new().unwrap();
                      rt.block_on(async {
                           let rb = match method {
                               tiny_http::Method::Post => client.post(&target_url).body(body_bytes),
                               tiny_http::Method::Delete => client.delete(&target_url),
                               _ => client.get(&target_url),
                           };

                          match rb.send().await {
                              Ok(res) => {
                                  let status = res.status().as_u16();
                                  let body = res.text().await.unwrap_or_default();
                                  (status, body)
                              },
                              Err(_) => (500, "Proxy Error".to_string())
                          }
                      })
                  }).join().unwrap_or((500, "Thread Error".to_string()));

                  let res = TinyResponse::from_string(response.1)
                      .with_status_code(tiny_http::StatusCode(response.0))
                      .with_header(Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap())
                      .with_header(Header::from_bytes(&b"Access-Control-Allow-Methods"[..], &b"GET, POST, OPTIONS, DELETE"[..]).unwrap())
                      .with_header(Header::from_bytes(&b"Access-Control-Allow-Headers"[..], &b"Content-Type"[..]).unwrap())
                      .with_header(Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap());
                  let _ = request.respond(res);
                  continue;
              }
              let _ = request.respond(TinyResponse::from_string("StreamVault Native Proxy Active"));
          }
      });
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      open_in_external_player,
      delete_media_file,
      download_media,
      download_torrent,
      start_p2p_download,
      stop_p2p_download,
      get_p2p_status,
      get_p2p_global_stats,
      spawn_p2p_engine,
      kill_p2p_engine,
      finalize_p2p_download,
      resolve_p2p_file,
      resolve_p2p_file_by_hash,
      db_save_download,
            db_get_download,
            sync_download_path,
            stop_torrent_engine,
            get_playable_url,
      db_list_downloads,
      db_remove_download,
      scan_local_library
    ])
    .build(tauri::generate_context!())
    .expect("error while building tauri application");

  app.run(move |app_handle, event| {
    if let tauri::RunEvent::Exit = event {
        let state = app_handle.state::<TorrentState>();
        let mut process_guard = state.sidecar_process.lock().unwrap();
        if let Some(mut child) = process_guard.take() {
            let _ = child.kill();
            let _ = child.wait();
            log::info!("Sidecar process terminated successfully on app exit.");
        }
    }
  });
}
