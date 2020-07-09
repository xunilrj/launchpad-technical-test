use async_channel::{Receiver, Sender};
use isahc::prelude::*;
use palette::Lab;
use serde::{Deserialize, Serialize};
use std::cmp::Reverse;
use std::collections::BinaryHeap;
use thiserror::Error;

use crate::actors::dominant_color::DominantColorDistanceMessage;
use crate::actors::dominant_color_cache::DominantColorCacheMessage;
use crate::colors::lab_distance;
use crate::ord::OrdFirst;

#[derive(Serialize)]
struct SearchResult {
    images: Vec<RedditResultDataChildrenData>,
}

#[derive(Serialize, Deserialize, Debug)]
struct RedditResultDataChildrenData {
    id: String,
    url: String,
    num_comments: u64,
}

impl Clone for RedditResultDataChildrenData {
    fn clone(&self) -> Self {
        RedditResultDataChildrenData {
            id: self.id.clone(),
            url: self.url.clone(),
            num_comments: self.num_comments,
        }
    }
}

#[derive(Deserialize, Debug)]
struct RedditResultDataChildren {
    kind: String,
    data: RedditResultDataChildrenData,
}

#[derive(Deserialize, Debug)]
struct RedditResultData {
    after: String,
    children: Vec<RedditResultDataChildren>,
}

#[derive(Deserialize, Debug)]
struct RedditResult {
    kind: String,
    data: RedditResultData,
}

fn is_image(url: &str) -> Option<String> {
    if url.contains("500px.com")
        || url.contains("abload.de")
        || url.contains("deviantart.com")
        || url.contains("deviantart.net")
        || url.contains("fav.me")
        || url.contains("fbcdn.net")
        || url.contains("flickr.com")
        || url.contains("forgifs.com")
        || url.contains("giphy.com")
        || url.contains("gfycat.com")
        || url.contains("gifsoup.com")
        || url.contains("gyazo.com")
        || url.contains("imageshack.us")
        || url.contains("imgclean.com")
        || url.contains("imgur.com")
        || url.contains("instagr.am")
        || url.contains("instagram.com")
        || url.contains("mediacru.sh")
        || url.contains("media.tumblr.com")
        || url.contains("min.us")
        || url.contains("minus.com")
        || url.contains("myimghost.com")
        || url.contains("photobucket.com")
        || url.contains("picsarus.com")
        || url.contains("puu.sh")
        || url.contains("staticflickr.com")
        || url.contains("tinypic.com")
        || url.contains("twitpic.com)")
    {
        if url.ends_with(".gifv") {
            return Some(url.replace(".gifv", ".gif"));
        } else if !url.ends_with(".png") && !url.ends_with(".jpg") && !url.ends_with(".gif") {
            return Some(format!("{}.png", url));
        } else {
            return Some(url.to_owned());
        }
    }

    if url.ends_with(".png") || url.ends_with(".jpg") || url.ends_with(".gif") {
        return Some(url.to_owned());
    }

    None
}

async fn get_distance(
    cache_actor: &Sender<DominantColorCacheMessage>,
    dist_actor: &Sender<DominantColorDistanceMessage>,
    url: &String,
    desired_color: Lab,
) -> Result<u32, ErrorCode> {
    let (w, s) = oneshot::channel();
    cache_actor
        .send(DominantColorCacheMessage::Read(url.clone(), w))
        .await
        .or(Err(ErrorCode::Error))?;
    if let Some(lab) = s.await.or(Err(ErrorCode::Error))? {
        return Ok(lab_distance(&lab, &desired_color) as u32);
    }

    let (w, s) = oneshot::channel();
    if let Err(_) = dist_actor
        .send(DominantColorDistanceMessage(url.clone(), desired_color, w))
        .await
    {
        return Ok(u32::MAX);
    }
    match s.await {
        Err(_) => Ok(u32::MAX),
        Ok(None) => Ok(u32::MAX),
        Ok(Some((dominant_color, distance))) => {
            cache_actor
                .send(DominantColorCacheMessage::Write(
                    url.clone(),
                    dominant_color,
                ))
                .await
                .or(Err(ErrorCode::Error))?;
            Ok(distance)
        }
    }
}

pub fn get_reddit_with_progress(
    q: String,
    lab: Lab,
    cache_actor: Sender<DominantColorCacheMessage>,
    dist_actor: Sender<DominantColorDistanceMessage>,
) -> Receiver<String> {
    let (progress, r) = async_channel::unbounded::<String>();
    let reddit = get_reddit(q, lab, cache_actor, dist_actor, progress);
    tokio::spawn(reddit);
    r
}

async fn send_progress(
    progress: &Sender<String>,
    v: f32,
    msg: Option<&str>,
) -> Result<(), ErrorCode> {
    let str = match msg {
        None => format!("{{\"v\":{}}}", v),
        Some(msg) => format!("{{\"v\":{},\"msg\":\"{}\"}}", v, msg),
    };
    progress.send(str).await.or(Err(ErrorCode::Error))?;
    Ok(())
}

async fn send_progress_result<T: Serialize>(
    progress: &Sender<String>,
    obj: T,
) -> Result<T, ErrorCode> {
    let r_json = serde_json::to_string(&obj).or(Err(ErrorCode::Error))?;
    progress.send(r_json).await.or(Err(ErrorCode::Error))?;
    Ok(obj)
}

#[derive(Debug, Error)]
pub enum ErrorCode {
    #[error("error on search progress")]
    Error,
}

async fn call_reddit_search_api(url: &str) -> Result<RedditResult, ErrorCode> {
    let mut response = Request::get(url)
        .header("User-Agent", "linux:isahc:searchapi")
        .body(())
        .or(Err(ErrorCode::Error))?
        .send_async()
        .await
        .or(Err(ErrorCode::Error))?;
    let reddit = response.json::<RedditResult>().or(Err(ErrorCode::Error))?;
    Ok(reddit)
}

fn get_reddit_search_url(query: &str, limit: u32, after: Option<String>) -> String {
    match after {
        None => format!("https://www.reddit.com/r/php/search.json?q={}%20site:(500px.com%20OR%20abload.de%20OR%20deviantart.com%20OR%20deviantart.net%20OR%20fav.me%20OR%20fbcdn.net%20OR%20flickr.com%20OR%20forgifs.com%20OR%20giphy.com%20OR%20gfycat.com%20OR%20gifsoup.com%20OR%20gyazo.com%20OR%20imageshack.us%20OR%20imgclean.com%20OR%20imgur.com%20OR%20instagr.am%20OR%20instagram.com%20OR%20mediacru.sh%20OR%20media.tumblr.com%20OR%20min.us%20OR%20minus.com%20OR%20myimghost.com%20OR%20photobucket.com%20OR%20picsarus.com%20OR%20puu.sh%20OR%20staticflickr.com%20OR%20tinypic.com%20OR%20twitpic.com)&limit={}&sort=comments&restrict_sr=0", 
            query, limit),
        Some(after) => format!("https://www.reddit.com/r/php/search.json?q={}%20site:(500px.com%20OR%20abload.de%20OR%20deviantart.com%20OR%20deviantart.net%20OR%20fav.me%20OR%20fbcdn.net%20OR%20flickr.com%20OR%20forgifs.com%20OR%20giphy.com%20OR%20gfycat.com%20OR%20gifsoup.com%20OR%20gyazo.com%20OR%20imageshack.us%20OR%20imgclean.com%20OR%20imgur.com%20OR%20instagr.am%20OR%20instagram.com%20OR%20mediacru.sh%20OR%20media.tumblr.com%20OR%20min.us%20OR%20minus.com%20OR%20myimghost.com%20OR%20photobucket.com%20OR%20picsarus.com%20OR%20puu.sh%20OR%20staticflickr.com%20OR%20tinypic.com%20OR%20twitpic.com)&limit={}&sort=comments&restrict_sr=0&after={}", 
            query, &after, limit)
    }
}

//https://www.reddit.com/r/php/search.json?q=oop&limit=5&sort=hot&restrict_sr=0
async fn get_reddit(
    q: String,
    lab: Lab,
    cache_actor: Sender<DominantColorCacheMessage>,
    dist_actor: Sender<DominantColorDistanceMessage>,
    progress: Sender<String>,
) -> Result<SearchResult, ErrorCode> {
    send_progress(&progress, 0.0, None).await?;

    let return_qtd = 3;
    let total = return_qtd * 100;
    let mut after: Option<String> = None;

    let mut candidates = BinaryHeap::new();

    let reddit_search_limit = 1000;
    let mut currenti = 0.0f32;
    loop {
        let url = get_reddit_search_url(&q, reddit_search_limit, after);
        let reddit = call_reddit_search_api(&url).await?;
        after = Some(reddit.data.after);
        for item in reddit.data.children.iter() {
            currenti += 1.0;
            if let Some(url) = is_image(&item.data.url) {
                send_progress(&progress, currenti / total as f32, Some(&url)).await?;
                let distance = get_distance(&cache_actor, &dist_actor, &url, lab).await?;
                let data = RedditResultDataChildrenData {
                    url: url.clone(),
                    ..item.data.clone()
                };
                candidates.push(Reverse(OrdFirst(distance, data)));
            }

            if candidates.len() == total {
                break;
            }
        }

        if candidates.len() == total {
            break;
        }
    }

    let mut images: Vec<RedditResultDataChildrenData> = Vec::with_capacity(return_qtd);
    for Reverse(OrdFirst(_, item)) in candidates.iter().take(return_qtd) {
        images.push(item.clone());
    }

    send_progress(&progress, 1.0, None).await?;
    let result = send_progress_result(&progress, SearchResult { images }).await?;
    Ok(result)
}
