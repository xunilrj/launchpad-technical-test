#![feature(proc_macro_hygiene, decl_macro)]

#[cfg(test)]
extern crate quickcheck;
#[cfg(test)]
#[macro_use(quickcheck)]
extern crate quickcheck_macros;

use async_channel::Sender;
use futures::StreamExt;
use palette::{IntoColor, Srgb};
use serde::Deserialize;
use std::convert::Infallible;
use thiserror::Error;
use warp::Filter;

mod actors;
mod colors;
mod ord;
mod reddit;
use actors::dominant_color::{spawn_dominant_color, DominantColorDistanceMessage};
use actors::dominant_color_cache::{spawn_dominant_color_cache, DominantColorCacheMessage};
use reddit::get_reddit_with_progress;

type BoxedResult = Result<Box<dyn warp::reply::Reply>, Infallible>;

#[derive(Deserialize)]
pub struct SearchQueryString {
    q: Option<String>,
    r: Option<f32>,
    g: Option<f32>,
    b: Option<f32>,
}

#[derive(Debug, Error)]
pub enum ErrorCode {
    #[error("error on search progress")]
    Error,
}

async fn search(
    query_string: SearchQueryString,
    cache_actor: Sender<DominantColorCacheMessage>,
    dominant_color_actor: Sender<DominantColorDistanceMessage>,
) -> BoxedResult {
    let str_to_sse_data = |x| match Some(x) {
        Some(x) => Ok(warp::sse::data(x)),
        None => Err(ErrorCode::Error),
    };
    match (
        query_string.q,
        query_string.r,
        query_string.g,
        query_string.b,
    ) {
        (Some(query), Some(r), Some(g), Some(b)) => {
            let desired_color = Srgb::new(r, g, b).into_lab();
            let progress =
                get_reddit_with_progress(query, desired_color, cache_actor, dominant_color_actor);
            let progress = progress.map(str_to_sse_data);
            let progress = warp::sse::reply(progress);
            Ok(Box::new(progress))
        }
        _ => Ok(Box::new(warp::http::StatusCode::BAD_REQUEST)),
    }
}

#[tokio::main]
async fn main() {
    pretty_env_logger::init();

    let w = spawn_dominant_color_cache();
    let cache_actor = warp::any().map(move || w.clone());

    let w = spawn_dominant_color();
    let dominant_color_actor = warp::any().map(move || w.clone());

    let search_endpoint = warp::get()
        .and(warp::path("search"))
        .and(warp::query::<SearchQueryString>())
        .and(cache_actor.clone())
        .and(dominant_color_actor.clone())
        .and_then(search);
    warp::serve(search_endpoint)
        .run(([127, 0, 0, 1], 8000))
        .await
}
