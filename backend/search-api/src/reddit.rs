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
use crate::loggable::Loggable;
use crate::ord::OrdFirst;

#[derive(Debug, Serialize)]
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
    } else if url.ends_with(".gifv") {
        return Some(url.replace(".gifv", ".gif"));
    } else if url.ends_with(".png") || url.ends_with(".jpg") || url.ends_with(".gif") {
        return Some(url.to_owned());
    } else {
        None
    }
}

async fn get_distance(
    cache_actor: &Sender<DominantColorCacheMessage>,
    dist_actor: &Sender<DominantColorDistanceMessage>,
    url: &String,
    desired_color: Lab,
) -> Result<u32, ErrorCode> {
    log::trace!("get_distance");
    let (w, s) = oneshot::channel();
    cache_actor
        .send(DominantColorCacheMessage::Read(url.clone(), w))
        .await
        .or(Err(ErrorCode::CannotSendToCache))?;
    if let Some(lab) = s.await.or(Err(ErrorCode::CannotWaitCache))? {
        log::trace!("get_distance: 1.1");
        return Ok(lab_distance(&lab, &desired_color) as u32);
    }
    log::trace!("get_distance: 2");
    let (w, s) = oneshot::channel();
    if let Err(_) = dist_actor
        .send(DominantColorDistanceMessage(url.clone(), desired_color, w))
        .await
    {
        return Ok(u32::MAX);
    }
    log::trace!("get_distance: 3");
    match s.await {
        Err(_) => Ok(u32::MAX),
        Ok(None) => Ok(u32::MAX),
        Ok(Some((dominant_color, distance))) => {
            log::trace!("get_distance: 4");
            cache_actor
                .send(DominantColorCacheMessage::Write(
                    url.clone(),
                    dominant_color,
                ))
                .await
                .or(Err(ErrorCode::Error))?;
            log::trace!("get_distance: 5");
            Ok(distance)
        }
    }
}

async fn run_and_log(reddit: impl std::future::Future<Output = Result<SearchResult, ErrorCode>>) {
    let _ = reddit.await.log_if_error();
}

pub fn get_reddit_with_progress(
    q: String,
    lab: Lab,
    cache_actor: Sender<DominantColorCacheMessage>,
    dist_actor: Sender<DominantColorDistanceMessage>,
) -> Receiver<String> {
    let (progress, r) = async_channel::unbounded::<String>();
    let reddit = get_reddit(q, lab, cache_actor, dist_actor, progress);
    tokio::spawn(run_and_log(reddit));
    r
}

async fn send_progress(
    progress: &Sender<String>,
    v: f32,
    msg: Option<&str>,
) -> Result<(), ErrorCode> {
    // log::trace!("start {} {:?}", v, msg);
    let str = match msg {
        None => format!("{{\"v\":{}}}", v),
        Some(msg) => format!("{{\"v\":{},\"msg\":\"{}\"}}", v, msg),
    };
    progress
        .send(str)
        .await
        .or(Err(ErrorCode::CannotSendProgress))?;
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
    #[error("generic error")]
    Error,
    #[error("invalid url")]
    InvalidUrl,
    #[error("cannot open body")]
    InvalidBody,
    #[error("cannot send request")]
    InvalidSend,
    #[error("cannot parse response json")]
    InvalidResponse,
    #[error("cannot send progress")]
    CannotSendProgress,
    #[error("cannot send to cache")]
    CannotSendToCache,
    #[error("cannot wait cache")]
    CannotWaitCache,
}

async fn call_reddit_search_api(url: &str) -> Result<RedditResult, ErrorCode> {
    let mut response = Request::get(url)
        .header("User-Agent", "linux:isahc:searchapi")
        .body(())
        .or(Err(ErrorCode::InvalidBody))?
        .send_async()
        .await
        .or(Err(ErrorCode::InvalidSend))?;
    let reddit = response
        .json::<RedditResult>()
        .or(Err(ErrorCode::InvalidResponse))?;
    Ok(reddit)
}

fn get_reddit_search_url(query: &str, limit: u32, after: Option<String>) -> Option<String> {
    let query = query.replace(|c: char| !c.is_ascii() || !c.is_alphanumeric(), "");
    if query.len() == 0 {
        return None;
    }
    let r = match after {
        None => format!("https://www.reddit.com/r/php/search.json?q={}%20site:(500px.com%20OR%20abload.de%20OR%20deviantart.com%20OR%20deviantart.net%20OR%20fav.me%20OR%20fbcdn.net%20OR%20flickr.com%20OR%20forgifs.com%20OR%20giphy.com%20OR%20gfycat.com%20OR%20gifsoup.com%20OR%20gyazo.com%20OR%20imageshack.us%20OR%20imgclean.com%20OR%20imgur.com%20OR%20instagr.am%20OR%20instagram.com%20OR%20mediacru.sh%20OR%20media.tumblr.com%20OR%20min.us%20OR%20minus.com%20OR%20myimghost.com%20OR%20photobucket.com%20OR%20picsarus.com%20OR%20puu.sh%20OR%20staticflickr.com%20OR%20tinypic.com%20OR%20twitpic.com)&limit={}&sort=comments&restrict_sr=0", 
            query, limit),
        Some(after) => format!("https://www.reddit.com/r/php/search.json?q={}%20site:(500px.com%20OR%20abload.de%20OR%20deviantart.com%20OR%20deviantart.net%20OR%20fav.me%20OR%20fbcdn.net%20OR%20flickr.com%20OR%20forgifs.com%20OR%20giphy.com%20OR%20gfycat.com%20OR%20gifsoup.com%20OR%20gyazo.com%20OR%20imageshack.us%20OR%20imgclean.com%20OR%20imgur.com%20OR%20instagr.am%20OR%20instagram.com%20OR%20mediacru.sh%20OR%20media.tumblr.com%20OR%20min.us%20OR%20minus.com%20OR%20myimghost.com%20OR%20photobucket.com%20OR%20picsarus.com%20OR%20puu.sh%20OR%20staticflickr.com%20OR%20tinypic.com%20OR%20twitpic.com)&limit={}&sort=comments&restrict_sr=0&after={}", 
            query, &after, limit)
    };
    Some(r)
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
        let url =
            get_reddit_search_url(&q, reddit_search_limit, after).ok_or(ErrorCode::InvalidUrl)?;
        let reddit = call_reddit_search_api(&url).await?;
        after = Some(reddit.data.after);
        for item in reddit.data.children.iter() {
            currenti += 1.0;
            if let Some(url) = is_image(&item.data.url) {
                send_progress(&progress, currenti / total as f32, Some(&url)).await?;
                log::info!("start 1");
                let distance = get_distance(&cache_actor, &dist_actor, &url, lab).await?;
                log::info!("start 2");
                let data = RedditResultDataChildrenData {
                    url: url.clone(),
                    ..item.data.clone()
                };
                log::info!("start 3");
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

#[cfg(test)]
mod test {
    use super::*;
    #[quickcheck]
    fn anything_jpg_png_gif_or_gifv_is_image(path: String) -> bool {
        test_ext(&path, ".jpg")
            && test_ext(&path, ".png")
            && test_ext(&path, ".gif")
            && test_ext_change(&path, ".gifv", ".gif")
    }

    #[quickcheck]
    fn append_png_for_known_domains(path: String) -> bool {
        test_ext_change("fbcdn.net/", &path, ".png")
    }

    #[quickcheck]
    fn dont_append_png_for_known_domains_that_ends_with_png(path: String) -> bool {
        !is_image(&format!("fbcdn.net/{}.png", path))
            .unwrap()
            .ends_with(".png.png")
    }

    use std::convert::TryFrom;
    use uriparse::uri::*;
    #[quickcheck]
    fn get_reddit_search_url_must_sanitize_query(query: String) -> bool {
        match get_reddit_search_url(&query, 0, None) {
            None => true,
            Some(url) => {
                let url = url.as_bytes();
                let url = URI::try_from(url).unwrap();
                url.is_normalized()
            }
        }
    }

    fn test_ext(path: &str, ext: &str) -> bool {
        is_image(&format!("{}{}", path, ext))
            .unwrap()
            .ends_with(ext)
    }

    fn test_ext_change(path: &str, extension: &str, new_extension: &str) -> bool {
        is_image(&format!("{}{}", path, extension))
            .unwrap()
            .ends_with(new_extension)
    }
}
