#![feature(proc_macro_hygiene, decl_macro)]

use async_channel::SendError;
use async_channel::{unbounded, Receiver, Sender};
use futures::stream::Map;
use isahc::prelude::*;
use log::{debug, info, trace};
use oneshot::RecvError;
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::cmp::Reverse;
use std::fmt::Display;
use std::{convert::Infallible, error::Error};
use warp::sse::ServerSentEvent;
use warp::Buf;
use warp::Filter;
use warp::Stream;

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
    cache_actor: &Sender<DistanceCacheMessage>,
    dist_actor: &Sender<TestColorMessage>,
    url: &String,
    desired_color: Lab,
) -> u32 {
    let (w, s) = oneshot::channel();
    cache_actor
        .send(DistanceCacheMessage::Read(url.clone(), w))
        .await
        .unwrap();
    if let Some(lab) = s.await.unwrap() {
        return lab_distance(&lab, &desired_color) as u32;
    }

    let (w, s) = oneshot::channel();
    if let Err(_) = dist_actor
        .send(TestColorMessage(url.clone(), desired_color, w))
        .await
    {
        return u32::MAX;
    }
    match s.await {
        Err(_) => u32::MAX,
        Ok(None) => u32::MAX,
        Ok(Some((dominant_color, distance))) => {
            let _ = cache_actor
                .send(DistanceCacheMessage::Write(url.clone(), dominant_color))
                .await;
            distance
        }
    }
}

fn b(x: i32) {}
fn get_reddit_with_progress(
    q: String,
    lab: Lab,
    cache_actor: Sender<DistanceCacheMessage>,
    dist_actor: Sender<TestColorMessage>,
) -> Receiver<String> {
    let (progress, r) = async_channel::unbounded::<String>();
    let reddit = get_reddit(q, lab, cache_actor, dist_actor, progress);
    tokio::spawn(reddit);
    info!("after spwan");
    r
}
//https://www.reddit.com/r/php/search.json?q=oop&limit=5&sort=hot&restrict_sr=0
async fn get_reddit(
    q: String,
    lab: Lab,
    cache_actor: Sender<DistanceCacheMessage>,
    dist_actor: Sender<TestColorMessage>,
    progress: Sender<String>,
) -> SearchResult {
    progress.send("{\"v\":0}".to_owned()).await;

    let mut images: Vec<RedditResultDataChildrenData> = Vec::new();
    let mut qtd = 3;
    let mut currenti = 0.0f32;
    let total = qtd * 100;
    let mut after = None;

    use std::collections::BinaryHeap;
    let mut candidates = BinaryHeap::new();

    let reddit_search_limit = 1000;
    let cont = true;
    while cont {
        let url = match after {
            None => format!("https://www.reddit.com/r/php/search.json?q={}%20site:(500px.com%20OR%20abload.de%20OR%20deviantart.com%20OR%20deviantart.net%20OR%20fav.me%20OR%20fbcdn.net%20OR%20flickr.com%20OR%20forgifs.com%20OR%20giphy.com%20OR%20gfycat.com%20OR%20gifsoup.com%20OR%20gyazo.com%20OR%20imageshack.us%20OR%20imgclean.com%20OR%20imgur.com%20OR%20instagr.am%20OR%20instagram.com%20OR%20mediacru.sh%20OR%20media.tumblr.com%20OR%20min.us%20OR%20minus.com%20OR%20myimghost.com%20OR%20photobucket.com%20OR%20picsarus.com%20OR%20puu.sh%20OR%20staticflickr.com%20OR%20tinypic.com%20OR%20twitpic.com)&limit={}&sort=comments&restrict_sr=0", q, reddit_search_limit),
            Some(after) => format!("https://www.reddit.com/r/php/search.json?q={}%20site:(500px.com%20OR%20abload.de%20OR%20deviantart.com%20OR%20deviantart.net%20OR%20fav.me%20OR%20fbcdn.net%20OR%20flickr.com%20OR%20forgifs.com%20OR%20giphy.com%20OR%20gfycat.com%20OR%20gifsoup.com%20OR%20gyazo.com%20OR%20imageshack.us%20OR%20imgclean.com%20OR%20imgur.com%20OR%20instagr.am%20OR%20instagram.com%20OR%20mediacru.sh%20OR%20media.tumblr.com%20OR%20min.us%20OR%20minus.com%20OR%20myimghost.com%20OR%20photobucket.com%20OR%20picsarus.com%20OR%20puu.sh%20OR%20staticflickr.com%20OR%20tinypic.com%20OR%20twitpic.com)&limit={}&sort=comments&restrict_sr=0&after={}", 
                q, 
                &after,
                reddit_search_limit)
        };
        // info!("Reddit URL: {}", url);
        let mut response = Request::get(&url)
            .header("User-Agent", "linux:isahc:searchapi")
            .body(())
            .unwrap()
            .send_async()
            .await
            .unwrap();
        let reddit = response.json::<RedditResult>();
        if reddit.is_err() {
            info!("{:?} {}", reddit, url);
            break;
        }
        let reddit = reddit.unwrap();
        after = Some(reddit.data.after);
        for i in reddit.data.children.iter() {
            currenti += 1.0;
            let data = &i.data;
            if let Some(url) = is_image(&data.url) {
                info!("{}", currenti / total as f32);
                progress.send(format!("{{\"v\":{},\"msg\":\"{}\"}}",
                    currenti / total as f32,
                    url)
                ).await;
                let distance = get_distance(&cache_actor, &dist_actor, &url, lab).await;
                let mut data = data.clone();
                data.url = url.clone();
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

    info!("{} {}", candidates.len(), total);
    debug!("{:?}", candidates);

    while qtd > 0 {
        qtd -= 1;
        match candidates.pop() {
            None => break,
            Some(data) => {
                images.push((data.0).1);
            }
        }
    }

    progress.send("{\"v\":100}".to_owned()).await;
    let r = SearchResult { images };
    let r_json = serde_json::to_string(&r).unwrap();
    progress.send(r_json).await;
    r
}

#[derive(Debug)]
struct OrdFirst<TA, TB>(TA, TB);

impl<TA: Ord, TB> Ord for OrdFirst<TA, TB> {
    fn cmp(&self, other: &Self) -> Ordering {
        self.0.cmp(&other.0)
    }
}

impl<TA: PartialOrd, TB> PartialOrd for OrdFirst<TA, TB> {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        self.0.partial_cmp(&other.0)
    }
}

impl<TA: Eq, TB> Eq for OrdFirst<TA, TB> {}

impl<TA: PartialEq, TB> PartialEq for OrdFirst<TA, TB> {
    fn eq(&self, other: &Self) -> bool {
        self.0 == other.0
    }
}

#[derive(Deserialize)]
struct SearchQueryString {
    q: Option<String>,
    r: Option<f32>,
    g: Option<f32>,
    b: Option<f32>,
}

use thiserror::Error;

#[derive(Debug, Error)]
pub enum ErrorCode {
    #[error("invalid rdo_lookahead_frames {0} (expected < {})", i32::max_value())]
    Error,
}

async fn search(
    q: SearchQueryString,
    cache: Sender<DistanceCacheMessage>,
    distance: Sender<TestColorMessage>,
) -> Result<impl warp::reply::Reply, Infallible> {
    info!("Search");
    use futures::StreamExt;
    let str_to_sse_data = |x| match Some(x) {
        Some(x) => Ok(warp::sse::data(x)),
        None => Err(ErrorCode::Error),
    };
    match (q.q, q.r, q.g, q.b) {
        (Some(q), Some(r), Some(g), Some(b)) => {
            let lab = palette::rgb::Srgb::new(r, g, b).into_lab();
            let progress = get_reddit_with_progress(q, lab, cache, distance);
            let progress = progress.map(str_to_sse_data);
            Ok(warp::sse::reply(progress))
        }
        _ => {
            let (w, progress) = async_channel::unbounded::<String>();
            w.send("Error".to_owned()).await;
            let progress = progress.map(str_to_sse_data);
            Ok(warp::sse::reply(progress))
        }
    }
}

use kmeans_colors::{get_kmeans, Calculate, Kmeans, MapColor, Sort};
use palette::IntoColor;
use palette::{Lab, Pixel, Srgb};

fn lab_distance(a: &Lab, b: &Lab) -> f32 {
    let x = a.l - b.l;
    let y = a.a - b.a;
    let z = a.b - b.b;
    (x * x + y * y + z * z).sqrt()
}

fn get_image_pixels(data: &[u8]) -> Result<Vec<Lab>, i32> {
    let img = image::load_from_memory(&data).or(Err(0))?;
    let img = img.resize(32, 32, image::imageops::FilterType::Nearest);
    let rgb8 = img.to_rgb();
    let pixels = rgb8.into_raw();
    Ok(Srgb::from_raw_slice(&pixels)
        .iter()
        .map(|x| x.into_format().into())
        .collect())
}

fn get_dominant_color(pixels: &Vec<Lab>) -> Lab {
    let runs = 1;
    let k = 3;
    let max_iter = 1;
    let converge = 0.1;
    let verbose = false;
    let seed = 0;
    let mut result = Kmeans::new();
    (0..runs).for_each(|i| {
        let run_result = get_kmeans(k, max_iter, converge, verbose, &pixels, seed + i as u64);
        if run_result.score < result.score {
            result = run_result;
        }
    });
    // let rgb = &result
    //     .centroids
    //     .iter()
    //     .map(|x| Srgb::from(*x).into_format())
    //     .collect::<Vec<Srgb<u8>>>();
    // let buffer = Srgb::map_indices_to_centroids(&rgb, &result.indices);
    let mut res = Lab::sort_indexed_colors(&result.centroids, &result.indices);
    // let dominant_color = Lab::get_dominant_color(&res);
    res.sort_unstable_by(|a, b| (b.percentage).partial_cmp(&a.percentage).unwrap());
    res.first().unwrap().centroid
}

async fn handle(msg: TestColorMessage) {
    let url = msg.0;
    let desired_color = msg.1;
    let reply = msg.2;

    let mut url = url;
    let mut tries = 10u8;
    let response = loop {
        if tries <= 0 {
            break None;
        }

        let response = Request::get(url)
            .body(())
            .unwrap()
            .send_async()
            .await
            .unwrap();

        let status = response.status().as_u16();
        if status == 200 {
            break Some(response);
        } else if status == 301 {
            let headers = response.headers();
            let location = headers.get("Location").unwrap();
            url = location.to_str().unwrap().to_owned();
            debug!(target: "test_color_actor", "redirected to: {}", url);
            tries -= 1;
        } else {
            break None;
        }
    };

    match response {
        None => {
            reply.send(None).unwrap();
        }
        Some(mut response) => {
            let mut img_data = Vec::new();
            response.copy_to(&mut img_data).unwrap();
            let pixels = match get_image_pixels(&img_data) {
                Err(_) => {
                    reply.send(None).unwrap();
                    return;
                }
                Ok(pixels) => pixels,
            };
            let dominant_color = get_dominant_color(&pixels);
            let distance = lab_distance(&desired_color, &dominant_color);
            reply.send(Some((dominant_color, distance as u32)));

            debug!(target: "test_color_actor", "distance: {}", distance);
        }
    }
}

struct TestColorMessage(String, Lab, oneshot::Sender<Option<(Lab, u32)>>);
async fn test_color_actor(r: async_channel::Receiver<TestColorMessage>) {
    loop {
        match r.recv().await {
            Ok(msg) => handle(msg).await,
            Err(_) => {}
        }
    }
}

enum DistanceCacheMessage {
    Write(String, Lab),
    Read(String, oneshot::Sender<Option<Lab>>),
}
async fn distance_cache(r: async_channel::Receiver<DistanceCacheMessage>) {
    loop {
        match r.recv().await {
            Ok(DistanceCacheMessage::Write(url, lab)) => {
                std::fs::create_dir(".cache");

                let digest = md5::compute(&url);
                let path = format!(".cache/{:x}.txt", digest);
                let mut f = std::fs::File::create(path).unwrap();
                use std::io::prelude::*;
                f.write_all(format!("{}\n", lab.l).as_bytes()).unwrap();
                f.write_all(format!("{}\n", lab.a).as_bytes()).unwrap();
                f.write_all(format!("{}\n", lab.b).as_bytes()).unwrap();
                debug!(target: "distance_cache", "cache written: {:x} {}", digest, url);
            }
            Ok(DistanceCacheMessage::Read(url, reply)) => {
                std::fs::create_dir(".cache");
                let digest = md5::compute(&url);
                let path = format!(".cache/{:x}.txt", digest);
                let distance = match std::fs::File::open(path) {
                    Err(_) => {
                        debug!(target: "distance_cache", "not found: {:x} {}", digest, url);
                        None
                    }
                    Ok(mut f) => {
                        debug!(target: "distance_cache", "found: {:x} {}", digest, url);
                        let mut txt = String::with_capacity(100);
                        use std::io::prelude::*;
                        f.read_to_string(&mut txt);
                        let parts: Vec<&str> = txt.split("\n").collect();
                        Some(Lab::from_components((
                            parts[0].parse::<f32>().unwrap(),
                            parts[1].parse::<f32>().unwrap(),
                            parts[2].parse::<f32>().unwrap(),
                        )))
                    }
                };
                reply.send(distance);
            }
            Err(_) => {}
        }
    }
}

#[tokio::main]
async fn main() {
    pretty_env_logger::init();

    let distance_cache_actor;
    let search_actor;

    {
        let (w, r) = async_channel::unbounded::<DistanceCacheMessage>();
        distance_cache_actor = warp::any().map(move || w.clone());
        tokio::spawn(distance_cache(r));
    }
    {
        let (w, r) = async_channel::unbounded::<TestColorMessage>();
        search_actor = warp::any().map(move || w.clone());
        tokio::spawn(test_color_actor(r));
    }

    let search_endpoint = warp::get()
        .and(warp::path("search"))
        .and(warp::query::<SearchQueryString>())
        .and(distance_cache_actor.clone())
        .and(search_actor.clone())
        .and_then(search);
    warp::serve(search_endpoint)
        .run(([127, 0, 0, 1], 8000))
        .await
}
