use async_channel::{Receiver, Sender};
use log::debug;
use palette::Lab;
use std::collections::HashMap;
use thiserror::Error;

type OneSender<T> = oneshot::Sender<T>;

#[derive(Debug, Error)]
pub enum ErrorCode {
    #[error("error on search progress")]
    Error,
}

fn handle_write(
    msg: DominantColorCacheMessage,
    map: &mut HashMap<String, Lab>,
) -> Result<(), ErrorCode> {
    match msg {
        DominantColorCacheMessage::Write(url, dominant_color) => {
            std::fs::create_dir(".cache").or(Err(ErrorCode::Error))?;
            let digest = md5::compute(&url);
            let path = format!(".cache/{:x}.txt", digest);
            let mut f = std::fs::File::create(path).or(Err(ErrorCode::Error))?;
            use std::io::prelude::*;
            f.write_all(format!("{}\n", dominant_color.l).as_bytes())
                .or(Err(ErrorCode::Error))?;
            f.write_all(format!("{}\n", dominant_color.a).as_bytes())
                .or(Err(ErrorCode::Error))?;
            f.write_all(format!("{}\n", dominant_color.b).as_bytes())
                .or(Err(ErrorCode::Error))?;
            debug!(target: "distance_cache", "cache written: {:x} {}", digest, url);
            map.insert(url.clone(), dominant_color);
        }
        DominantColorCacheMessage::Read(url, reply) => {
            if let Some(dominant_color) = map.get(&url) {
                reply
                    .send(Some(dominant_color.clone()))
                    .or(Err(ErrorCode::Error))?;
            } else {
                std::fs::create_dir(".cache").or(Err(ErrorCode::Error))?;
                let digest = md5::compute(&url);
                let path = format!(".cache/{:x}.txt", digest);
                let dominant_color = match std::fs::File::open(path) {
                    Err(_) => None,
                    Ok(mut f) => {
                        let mut txt = String::with_capacity(100);
                        use std::io::prelude::*;
                        f.read_to_string(&mut txt).or(Err(ErrorCode::Error))?;
                        let parts: Vec<&str> = txt.split("\n").collect();
                        let dominant_color = Lab::from_components((
                            parts[0].parse::<f32>().or(Err(ErrorCode::Error))?,
                            parts[1].parse::<f32>().or(Err(ErrorCode::Error))?,
                            parts[2].parse::<f32>().or(Err(ErrorCode::Error))?,
                        ));
                        map.insert(url.clone(), dominant_color);
                        Some(dominant_color)
                    }
                };
                reply.send(dominant_color).or(Err(ErrorCode::Error))?;
            }
        }
    }
    Ok(())
}

pub enum DominantColorCacheMessage {
    Write(String, Lab),
    Read(String, OneSender<Option<Lab>>),
}
async fn distance_cache(r: Receiver<DominantColorCacheMessage>) {
    let mut map = HashMap::new();
    loop {
        match r.recv().await {
            Ok(msg) => {
                let _ = handle_write(msg, &mut map);
            }
            Err(_) => {}
        }
    }
}

pub fn spawn_dominant_color_cache() -> Sender<DominantColorCacheMessage> {
    let (w, r) = async_channel::unbounded::<DominantColorCacheMessage>();
    tokio::spawn(distance_cache(r));
    w
}
