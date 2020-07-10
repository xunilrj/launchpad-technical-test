# Challenge 1 – Algorithm-focussed.

## Challenge Brief

Here is the problem:
 - Marketers know the best way to sell things is to get great images that tie in with their brand. And everyone wants the best viral images and videos.
 - The marketers also need to match certain colours to tie in well with their brand values.
 - One place where images and videos are clearly sorted by popularity for sharing is reddit.  

So, you need to build a service that can find the most popular images or videos on reddit with a particular dominant colour.  

Stage 1: Write a service in language and framework of your choice that:  
 - Receives the subject of the image as text input from the caller.  
 - Scrapes reddit for the most shared images related to that subject.
 - Outputs links to the top three images from reddit with the ranking being determined by the number of comments on the post with that image in it.  

Stage 2: Improve the service so that it:  
 - Receives input from the caller as a colour (in R,G,B values) and a subject.
 - Scrapes reddit for the most shared images related to that subject with the specified colour, or a similar one, being dominant.
 - Outputs links to the top three images from reddit with that dominant colour, with the ranking being determined by the number of comments on the post with that image in it.


# Solution

## Frontend

 - Snowpack https://www.snowpack.dev/  
 - Preact https://preactjs.com/  
 - Flickity https://github.com/metafizzy/flickity
 - Vanilla Picker https://github.com/Sphinxxxx/vanilla-picker
 - Loading Bar https://loading.io/progress/    

## Backend

 - Rust https://www.rust-lang.org/  
 - Warp https://github.com/seanmonstar/warp  
 - Quickcheck https://github.com/BurntSushi/quickcheck   
 - async-channel https://github.com/stjepang/async-channel  
 - Oneshot https://github.com/faern/oneshot
 - kmeans_colors https://github.com/okaneco/kmeans-colors  

## Deploy

 - kinD https://github.com/kubernetes-sigs/kind  
 - Fluentd https://www.fluentd.org/  
 - Elasticsearch https://www.elastic.co/  
