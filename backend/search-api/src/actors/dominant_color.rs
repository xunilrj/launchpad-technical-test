use crate::colors::lab_distance;
use async_channel::Sender;
use image::imageops::FilterType::Nearest;
use isahc::prelude::*;
use kmeans_colors::{get_kmeans, Kmeans, Sort};
use palette::{Lab, Pixel, Srgb};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ErrorCode {
    #[error("error on search progress")]
    Error,
}

fn get_image_pixels(data: &[u8]) -> Result<Vec<Lab>, ErrorCode> {
    let img = image::load_from_memory(&data).or(Err(ErrorCode::Error))?;
    let img = img.resize(32, 32, Nearest);
    let rgb8 = img.to_rgb();
    let pixels = rgb8.into_raw();
    Ok(Srgb::from_raw_slice(&pixels)
        .iter()
        .map(|x| x.into_format().into())
        .collect())
}

fn get_dominant_color(pixels: &Vec<Lab>) -> Option<Lab> {
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
    let mut res = Lab::sort_indexed_colors(&result.centroids, &result.indices);

    res.sort_unstable_by(|a, b| {
        b.percentage
            .partial_cmp(&a.percentage)
            .unwrap_or(std::cmp::Ordering::Less)
    });
    res.first().map(|x| x.centroid)
}

async fn handle(
    DominantColorDistanceMessage(url, desired_color, reply): DominantColorDistanceMessage,
) -> Result<(), ErrorCode> {
    let mut url = url;
    let mut tries = 10u8;
    let response = loop {
        if tries <= 0 {
            break None;
        }

        let response = Request::get(url)
            .body(())
            .or(Err(ErrorCode::Error))?
            .send_async()
            .await
            .or(Err(ErrorCode::Error))?;

        let status = response.status().as_u16();
        if status == 200 {
            break Some(response);
        } else if status == 301 {
            let headers = response.headers();
            let location = headers.get("Location").ok_or(ErrorCode::Error)?;
            url = location.to_str().or(Err(ErrorCode::Error))?.to_owned();
            tries -= 1;
        } else {
            break None;
        }
    };

    match response {
        None => {
            reply.send(None).or(Err(ErrorCode::Error))?;
        }
        Some(mut response) => {
            let mut img_data = Vec::new();
            response.copy_to(&mut img_data).or(Err(ErrorCode::Error))?;
            let result = match get_image_pixels(&img_data) {
                Err(_) => None,
                Ok(pixels) => match get_dominant_color(&pixels) {
                    None => None,
                    Some(dominant_color) => {
                        let distance = lab_distance(&desired_color, &dominant_color);
                        Some((dominant_color, distance as u32))
                    }
                },
            };
            reply.send(result).or(Err(ErrorCode::Error))?;
        }
    }
    Ok(())
}

pub struct DominantColorDistanceMessage(
    pub String,
    pub Lab,
    pub oneshot::Sender<Option<(Lab, u32)>>,
);
async fn test_color_actor(r: async_channel::Receiver<DominantColorDistanceMessage>) {
    loop {
        match r.recv().await {
            Ok(msg) => {
                let _ = handle(msg).await;
            }
            Err(_) => {}
        }
    }
}

pub fn spawn_dominant_color() -> Sender<DominantColorDistanceMessage> {
    let (w, r) = async_channel::unbounded::<DominantColorDistanceMessage>();
    tokio::spawn(test_color_actor(r));
    w
}
