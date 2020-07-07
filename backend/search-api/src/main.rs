#![feature(proc_macro_hygiene, decl_macro)]

#[macro_use]
extern crate rocket;

use isahc::prelude::*;
use log::{info, trace};
use rocket_contrib::json::Json;
use serde::{Deserialize, Serialize};

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
        } else if !url.ends_with(".png") || !url.ends_with(".jpg") || !url.ends_with(".gif") {
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

//https://www.reddit.com/r/php/search.json?q=oop&limit=5&sort=hot&restrict_sr=0
fn get_reddit(q: String) -> SearchResult {
    let mut images: Vec<RedditResultDataChildrenData> = Vec::new();
    let qtd = 3;
    let mut after = None;

    let cont = true;
    while cont {
        let url = match after {
            None => format!("https://www.reddit.com/r/php/search.json?q={}%20site:(500px.com%20OR%20abload.de%20OR%20deviantart.com%20OR%20deviantart.net%20OR%20fav.me%20OR%20fbcdn.net%20OR%20flickr.com%20OR%20forgifs.com%20OR%20giphy.com%20OR%20gfycat.com%20OR%20gifsoup.com%20OR%20gyazo.com%20OR%20imageshack.us%20OR%20imgclean.com%20OR%20imgur.com%20OR%20instagr.am%20OR%20instagram.com%20OR%20mediacru.sh%20OR%20media.tumblr.com%20OR%20min.us%20OR%20minus.com%20OR%20myimghost.com%20OR%20photobucket.com%20OR%20picsarus.com%20OR%20puu.sh%20OR%20staticflickr.com%20OR%20tinypic.com%20OR%20twitpic.com)&limit=5&sort=comments&restrict_sr=0", q),
            Some(after) => format!("https://www.reddit.com/r/php/search.json?q={}%20site:(500px.com%20OR%20abload.de%20OR%20deviantart.com%20OR%20deviantart.net%20OR%20fav.me%20OR%20fbcdn.net%20OR%20flickr.com%20OR%20forgifs.com%20OR%20giphy.com%20OR%20gfycat.com%20OR%20gifsoup.com%20OR%20gyazo.com%20OR%20imageshack.us%20OR%20imgclean.com%20OR%20imgur.com%20OR%20instagr.am%20OR%20instagram.com%20OR%20mediacru.sh%20OR%20media.tumblr.com%20OR%20min.us%20OR%20minus.com%20OR%20myimghost.com%20OR%20photobucket.com%20OR%20picsarus.com%20OR%20puu.sh%20OR%20staticflickr.com%20OR%20tinypic.com%20OR%20twitpic.com)&limit=5&sort=comments&restrict_sr=0&after={}", 
                q, &after)
        };
        // info!("Reddit URL: {}", url);
        let mut response = Request::get(url)
            .header("User-Agent", "linux:isahc:searchapi")
            .body(())
            .unwrap()
            .send()
            .unwrap();
        let r = response.json::<RedditResult>().unwrap();
        after = Some(r.data.after);
        for i in r.data.children.iter() {
            let data = &i.data;
            if let Some(url) = is_image(&data.url) {
                let mut data = i.data.clone();
                data.url = url;
                images.push(data);
            }

            if images.len() == qtd {
                break;
            }
        }

        if images.len() == qtd {
            break;
        }
    }

    SearchResult { images }
}

#[get("/search?<q>")]
fn search(q: String) -> Json<SearchResult> {
    trace!("search-api: q={}", q);
    Json(get_reddit(q))
}

fn main() {
    pretty_env_logger::init();
    rocket::ignite().mount("/", routes![search]).launch();
}
