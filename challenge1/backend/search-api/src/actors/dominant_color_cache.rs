use async_channel::{Receiver, Sender};
use log::{debug, trace};
use palette::Lab;
use std::collections::HashMap;
use std::io::prelude::*;
use thiserror::Error;

use crate::loggable::Loggable;

type OneSender<T> = oneshot::Sender<T>;

#[derive(Debug, Error)]
pub enum ErrorCode {
    #[error("error on search progress")]
    Error,
    #[error("cannot read cache file")]
    CannotReadCacheFile,
    #[error("cannot parse color component")]
    CannotParseColorComponent,
}

fn handle_write(
    msg: DominantColorCacheMessage,
    map: &mut HashMap<String, Lab>,
) -> Result<(), ErrorCode> {
    match msg {
        DominantColorCacheMessage::Write(url, dominant_color) => {
            let _ = std::fs::create_dir(".cache");
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
            trace!(target: "dominant_color_cache", "Read({}, reply)", url);
            if let Some(dominant_color) = map.get(&url) {
                trace!(target: "dominant_color_cache", "found on map");
                reply
                    .send(Some(dominant_color.clone()))
                    .or(Err(ErrorCode::Error))?;
            } else {
                trace!(target: "dominant_color_cache", "reading from .cache");
                let _ = std::fs::create_dir(".cache");
                let digest = md5::compute(&url);
                let path = format!(".cache/{:x}.txt", digest);
                let dominant_color = match std::fs::File::open(path) {
                    Err(_) => None,
                    Ok(mut f) => {
                        let mut txt = String::with_capacity(100);
                        f.read_to_string(&mut txt)
                            .or(Err(ErrorCode::CannotReadCacheFile))?;
                        let parts: Vec<&str> = txt.split("\n").collect();
                        let dominant_color = Lab::from_components((
                            parts[0]
                                .parse::<f32>()
                                .or(Err(ErrorCode::CannotParseColorComponent))?,
                            parts[1]
                                .parse::<f32>()
                                .or(Err(ErrorCode::CannotParseColorComponent))?,
                            parts[2]
                                .parse::<f32>()
                                .or(Err(ErrorCode::CannotParseColorComponent))?,
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
                let _ = handle_write(msg, &mut map).log_if_error();
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
