import { h, hydrate, Fragment } from 'preact';
import render from 'preact-render-to-string';
import { useEffect, useRef, useState } from 'preact/hooks';
import L from 'leaflet';
import BoundingBox from 'boundingbox';
import RBush from 'rbush';
import knn from 'rbush-knn';
import useInput, { useRadio } from './useInput.js';
import Supercluster from 'supercluster';
import { SearchControl, OpenStreetMapProvider } from 'leaflet-geosearch';
import '@skyraptor/leaflet.bouncemarker';
import './greatCircle.js';
import 'leaflet.polyline.snakeanim';

const cluster = new Supercluster();
const tree = new RBush();
const markersTree = new RBush();
let spots;

async function getSpots() {
    const url = "spots.json";
    const response = await fetch(url, { mode: 'cors' });
    const json = await response.json();
    return json;
}

async function getWeatherBB(mapbb, zoom) {
    const distance = mapbb.diagonalDistance({ unit: 'km' });
    if (distance < 500) {
        const mapbbstring = mapbb.toLonLatString();
        const url = `weather?bbox=${mapbbstring},${zoom}&appid=7c5cef09fcfe08e6eb62d06c3f6ad76d`;
        const response = await fetch(url, { mode: 'cors' });
        const json = await response.json();
        return json;
    } else {
        return null;
    }
}

async function getWeather(map) {
    const mapbb = new BoundingBox(map.getBounds());
    return getWeatherBB(mapbb, 15);
}

async function getHistory(spot) {
    const url = `onecall?lat=${spot.latitude}&lon=${spot.longitude}&exclude=minutily&appid=7c5cef09fcfe08e6eb62d06c3f6ad76d`;
    const response = await fetch(url, { mode: 'cors' });
    const json = await response.json();
    return json;
}

function degreeToWindText(d) {
    var ret = 'N';
    if (d < 10) {
        ret = 'N';
        return ret
    }
    if (20 < d && d < 57) {
        ret = 'NE';
        return ret
    }
    if (30 < d && d < 80) {
        ret = 'ENE';
        return ret
    }
    if (40 < d && d < 102) {
        ret = 'E';
        return ret
    }
    if (50 < d && d < 127) {
        ret = 'ESE';
        return ret;
    }
    if (60 < d && d < 143) {
        ret = 'SE';
        return ret;
    }
    if (70 < d && d < 166) {
        ret = 'SSE';
        return ret;
    }
    if (80 < d && d < 190) {
        ret = 'S';
        return ret;
    }
    if (90 < d && d < 215) {
        ret = 'SSW';
        return ret;
    }
    if (100 < d && d < 237) {
        ret = 'SW';
        return ret;
    }
    if (237 < d && d < 260) {
        ret = 'WSW';
        return ret;
    }
    if (260 < d && d < 281) {
        ret = 'W';
        return ret;
    }
    if (281 < d && d < 304) {
        ret = 'WNW';
        return ret;
    }
    if (304 < d && d < 324) {
        ret = 'NW';
        return ret;
    }
    if (324 < d && d < 350) {
        ret = 'NNW';
        return ret;
    }
    return ret;
}

function ms2Knot(ms) {
    return 1.9438445 * ms;
}

function centerLeafletMapOnMarker(map, marker) {
    let ll = marker.getLatLng();
    map.setView({ lat: ll.lat + 0.04, lng: ll.lng + 0.1 }, 12);
}

function spotScore(level, windSpeed) {
    const isNovice = level.localeCompare("novice", undefined, { sensitivity: 'accent' }) === 0;
    if (isNovice) {
        if (windSpeed < 15) { return windSpeed; }
        if (windSpeed >= 15 && windSpeed <= 20) {
            return 15 - (windSpeed - 15);
        } else {
            return 0;
        }
    }

    const isIntermediate = level.localeCompare("intermediate", undefined, { sensitivity: 'accent' }) === 0;
    if (isIntermediate) {
        if (windSpeed < 20) { return windSpeed; }
        if (windSpeed >= 20 && windSpeed <= 25) {
            return 20 - (windSpeed - 20);
        } else {
            return 0;
        }
    }

    return windSpeed;
}

function spotScoreCategory(level, score) {
    const isNovice = level.localeCompare("novice", undefined, { sensitivity: 'accent' }) === 0;
    if (isNovice) {
        if (score < 5) return 0;
        else if (score < 10) return 1;
        else return 2;
    }

    const isIntermediate = level.localeCompare("intermediate", undefined, { sensitivity: 'accent' }) === 0;
    if (isIntermediate) {
        if (score < 7) return 0;
        else if (score < 4) return 1;
        else return 2;
    }

    if (score < 10) return 0;
    else if (score < 20) return 1;
    else return 2;
}

function WindRose({ weather }) {
    console.log(weather);
    let cx = 120;
    let cy = 90;
    let r = 100;
    let rstep = 20;
    let outterRimProb = 0.2;
    let outterRimSpeedKnots = 25;

    let directions = [];
    for (let i = 0; i < 12; i++) {
        let angle = (-Math.PI / 2.0) + i * (Math.PI / 6);
        let x = Math.cos(angle) * (r + 5);
        let y = Math.sin(angle) * (r + 5);
        let windDir = degreeToWindText(i * 30);
        let size = "0.6em";
        if (windDir.length == 1)
            size = "1em";
        directions.push(<text text-anchor="middle" transform={`translate(${x},${y}) rotate(${i * 30})`} font-size={size}>{windDir}</text>);
    }

    let windPercentage = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    let windSpeed = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    if (weather) {
        console.log(weather);
        for (let h of weather.hourly) {
            const idx = Math.floor(h.wind_deg / 30);
            windPercentage[idx]++;
            windSpeed[idx] = Math.max(windSpeed[idx], h.wind_speed);
        }
        for (let i = 0; i < 12; i++) {
            windPercentage[i] /= weather.hourly.length;
        }
    }

    let paths = []
    for (let i = 0; i < 12; i++) {
        const speedKnot = ms2Knot(windSpeed[i]);
        let slicer = speedKnot / outterRimSpeedKnots;
        slicer *= r;

        let sliceColor = windPercentage[i];
        if (sliceColor > 1) sliceColor = 1;

        let angle = (-Math.PI / 2.0) + i * (Math.PI / 6) - (Math.PI / 12);
        let x = Math.cos(angle) * slicer;
        let y = Math.sin(angle) * slicer;

        let nextangle = (-Math.PI / 2.0) + i * (Math.PI / 6) + (Math.PI / 12);
        let nextx = Math.cos(nextangle) * slicer;
        let nexty = Math.sin(nextangle) * slicer;
        paths.push(
            <path d={`M 0 0 L ${x} ${y} A 0 0 0 0 0 ${nextx} ${nexty} Z`} stroke="black" stroke-opacity={sliceColor} fill="black" fill-opacity={sliceColor} />
        );
    }

    let windNowSpeed = 0;
    let windNowAngle = 0;
    if (weather && weather.current) {
        windNowSpeed = ms2Knot(weather.current.wind_speed) / outterRimSpeedKnots;
        if (windNowSpeed > 1) windNowSpeed = 1;

        windNowAngle = weather.current.wind_deg
    }

    let windNowScale = 0.09 + (windNowSpeed * 0.5);
    const showNowInput = useInput(true);
    return <div>
        <div>
            <input type="checkbox" {...showNowInput} /><span>Show now</span>
        </div>
        <svg width="240px" height="240">
            <g transform={`translate(${cx} ${cy + 30})`}>
                {directions}
                <circle r={r - 0 * rstep} stroke="grey" stroke-width="1" fill="none" />
                <circle r={r - 1 * rstep} stroke="lightgrey" stroke-width="1" fill="none" />
                <text text-anchor="middle" transform={`translate(0,${-(r - 1 * rstep) - 5})`} font-size="0.5em">{outterRimSpeedKnots / 5 * 4}knots</text>
                <circle r={r - 2 * rstep} stroke="grey" stroke-width="1" fill="none" />
                <circle r={r - 3 * rstep} stroke="lightgrey" stroke-width="1" fill="none" />
                <text text-anchor="middle" transform={`translate(0,${-(r - 3 * rstep) - 5})`} font-size="0.5em">{outterRimSpeedKnots / 5 * 2}knots</text>
                <circle r={r - 4 * rstep} stroke="grey" stroke-width="1" fill="none" />
                {paths}
                {showNowInput.value && <g transform={`rotate(${windNowAngle}) scale(${windNowScale} ${windNowScale}) translate(-250 -290) `}>
                    <path stroke="#000000" stroke-width="1.9" fill="#ffffff" d="m72.001 431.91c1.613-2.38 180.24-362.1 180.24-362.1l179.39 362.27-181.23-144.24s-180.01 146.45-178.4 144.07z" />
                    <path fill="#000000" d="m250.38 287.85c1.87 1.47 181.25 144.29 181.25 144.29l-179.41-362.32c0 0.003-3.72 216.55-1.84 218.03z" />
                </g>}
            </g>
        </svg>
    </div>;
}

function clusterBB(cluster, id) {
    const leaves = cluster.getLeaves(id, 1000);
    const points = leaves.map(x => L.latLng(x.geometry.coordinates[1], x.geometry.coordinates[0]));
    const bounds = L.latLngBounds(points);
    const bb = new BoundingBox(bounds);
    return bb;
}

async function downloadWeatherData(map, cluster, q, weathers) {
    while (q.length > 0) {
        const [bb, zoom] = q.pop();
        const clusters = cluster.getClusters(bb, zoom);
        for (const c of clusters) {
            const cbb = clusterBB(cluster, c.id);
            if (cbb.diagonalDistance({ unit: 'km' }) > 200) {
                q.push([[
                    cbb.getWest(),
                    cbb.getSouth(),
                    cbb.getEast(),
                    cbb.getNorth()
                ], zoom + 1]);
            } else {
                cbb.minlon -= 0.2;
                cbb.maxlon += 0.2;
                cbb.minlat -= 0.2;
                cbb.maxlat += 0.2;

                const r = await getWeatherBB(cbb, 10);
                if (r && r.list)
                    weathers.push(...r.list);
            }
        }
    }
    return weathers;
}

function showWeatherIcon() {
    // const iconId = item.weather[0].icon;
    // var icon = L.icon({
    //     iconUrl: `http://openweathermap.org/img/wn/${iconId}.png`,
    // });
    // L.marker([item.coord.Lat, item.coord.Lon], { icon })
    //     .addTo(map.current);
}

const spotBadIcon = L.divIcon({
    className: "",
    html: `<svg width="32" height="32" viewBox="0 0 512 512" transform="translate(-9 -25)">
<path fill="#FFFFFF" d="M 256 270 C 205.602 270 166 229.2 166 180 C 166 130.499 206.499 90 256 90 S 346 130.499 346 180 C 346 228.9 306.999 270 256 270 Z" />
<path fill="#FD003A" d="M256,0C156.698,0,76,80.7,76,180c0,33.6,9.302,66.301,27.001,94.501l140.797,230.414 c2.402,3.9,6.002,6.301,10.203,6.901c5.698,0.899,12.001-1.5,15.3-7.2l141.2-232.516C427.299,244.501,436,212.401,436,180 C436,80.7,355.302,0,256,0z M256,270c-50.398,0-90-40.8-90-90c0-49.501,40.499-90,90-90s90,40.499,90,90 C346,228.9,306.999,270,256,270z"/>
<path fill="#E50027" d="M256,0v90c49.501,0,90,40.499,90,90c0,48.9-39.001,90-90,90v241.991 c5.119,0.119,10.383-2.335,13.3-7.375L410.5,272.1c16.799-27.599,25.5-59.699,25.5-92.1C436,80.7,355.302,0,256,0z"/>
</svg>` });
const spotOkIcon = L.divIcon({
    className: "",
    html: `<svg width="32" height="32" viewBox="0 0 512 512" transform="translate(-9 -25)">
<path fill="#FFFFFF" d="M 256 270 C 205.602 270 166 229.2 166 180 C 166 130.499 206.499 90 256 90 S 346 130.499 346 180 C 346 228.9 306.999 270 256 270 Z" />
<path fill="#24244c" d="M256,0C156.698,0,76,80.7,76,180c0,33.6,9.302,66.301,27.001,94.501l140.797,230.414 c2.402,3.9,6.002,6.301,10.203,6.901c5.698,0.899,12.001-1.5,15.3-7.2l141.2-232.516C427.299,244.501,436,212.401,436,180 C436,80.7,355.302,0,256,0z M256,270c-50.398,0-90-40.8-90-90c0-49.501,40.499-90,90-90s90,40.499,90,90 C346,228.9,306.999,270,256,270z"/>
<path fill="#15153A" d="M256,0v90c49.501,0,90,40.499,90,90c0,48.9-39.001,90-90,90v241.991 c5.119,0.119,10.383-2.335,13.3-7.375L410.5,272.1c16.799-27.599,25.5-59.699,25.5-92.1C436,80.7,355.302,0,256,0z"/>
</svg>` });
const spotGoodIcon = L.divIcon({
    className: "",
    html: `<svg width="32" height="32" viewBox="0 0 512 512" transform="translate(-9 -25)">
<path fill="#FFFFFF" d="M 256 270 C 205.602 270 166 229.2 166 180 C 166 130.499 206.499 90 256 90 S 346 130.499 346 180 C 346 228.9 306.999 270 256 270 Z" />
<path fill="#699245" d="M256,0C156.698,0,76,80.7,76,180c0,33.6,9.302,66.301,27.001,94.501l140.797,230.414 c2.402,3.9,6.002,6.301,10.203,6.901c5.698,0.899,12.001-1.5,15.3-7.2l141.2-232.516C427.299,244.501,436,212.401,436,180 C436,80.7,355.302,0,256,0z M256,270c-50.398,0-90-40.8-90-90c0-49.501,40.499-90,90-90s90,40.499,90,90 C346,228.9,306.999,270,256,270z"/>
<path fill="#4E772A" d="M256,0v90c49.501,0,90,40.499,90,90c0,48.9-39.001,90-90,90v241.991 c5.119,0.119,10.383-2.335,13.3-7.375L410.5,272.1c16.799-27.599,25.5-59.699,25.5-92.1C436,80.7,355.302,0,256,0z"/>
</svg>` });
const spotBestIcon = L.divIcon({
    className: "",
    html: `<svg viewBox="0 0 490.001 490.001" width="32" height="32" transform="translate(-12 -12)">
    <g>
        <circle style="fill:#FEB247;" cx="245" cy="245.001" r="245"/>
        <path style="fill:#FFE26B;" d="M488.334,216.33c-2.01,17.34-5.84,34.13-11.29,50.17c-7.54,22.2-18.18,42.97-31.41,61.8   c-44.31,63.11-117.65,104.36-200.63,104.36c-82.97,0-156.31-41.25-200.63-104.35c-13.23-18.83-23.87-39.6-31.41-61.81   c-5.45-16.04-9.28-32.83-11.29-50.17C15.864,94.53,119.394,0,245.004,0S474.144,94.53,488.334,216.33z"/>
        <path style="fill:#EF297B;" d="M475.824,327.34c-15.32,42.95-42.3,80.37-77.12,108.45c-102.09-12.71-205.31-12.71-307.4,0   c-34.82-28.08-61.8-65.5-77.12-108.45C166.984,300.99,323.034,301,475.824,327.34z"/>
        <polygon style="fill:#C61567;" points="429.724,391.443 337.194,429.685 152.807,429.685 60.277,391.443 103.939,337.946    317.006,307.647 405.947,338.923  "/>
        <path style="fill:#456D9E;" d="M245,27.68c-22.764,0-49.097-24.256-69.638-17.586c-21.289,6.913-28.283,42.244-46.003,55.14   c-17.898,13.025-53.616,8.849-66.642,26.746c-12.896,17.72,2.025,50.338-4.887,71.627c-6.67,20.541-38.134,38.054-38.134,60.819   c0,22.764,31.465,40.277,38.134,60.818c6.913,21.289-8.009,53.907,4.887,71.627c13.025,17.898,48.744,13.721,66.642,26.746   c17.72,12.896,24.714,48.228,46.003,55.14c20.541,6.67,46.873-17.586,69.638-17.586c22.764,0,49.097,24.256,69.638,17.586   c21.289-6.913,28.283-42.244,46.003-55.14c17.898-13.025,53.616-8.849,66.642-26.746c12.896-17.72-2.025-50.338,4.887-71.627   c6.67-20.541,38.134-38.054,38.134-60.819c0-22.764-31.465-40.277-38.134-60.818c-6.913-21.289,8.009-53.907-4.887-71.627   c-13.025-17.898-48.744-13.721-66.642-26.746c-17.72-12.896-24.714-48.228-46.003-55.14C294.097,3.425,267.765,27.68,245,27.68z"/>
        <path style="fill:#43CAED;" d="M400.774,224.43c0,81.42-62.47,148.25-142.09,155.17c-4.51,0.4-9.07,0.6-13.68,0.6   c-86.03,0-155.78-69.74-155.78-155.77s69.75-155.78,155.78-155.78c4.61,0,9.17,0.2,13.68,0.6   C338.304,76.17,400.774,143.01,400.774,224.43z"/>
        <path style="fill:#8EE7FE;" d="M400.774,224.43c0,81.42-62.47,148.25-142.09,155.17c-79.62-6.92-142.09-73.75-142.09-155.17   c0-81.42,62.47-148.26,142.09-155.18C338.304,76.17,400.774,143.01,400.774,224.43z"/>
        <path style="fill:#F2F4FF;" d="M254.25,110.103l14.267,28.908c1.502,3.044,4.407,5.154,7.766,5.642l31.902,4.636   c8.46,1.229,11.838,11.626,5.716,17.593l-23.084,22.502c-2.431,2.37-3.54,5.784-2.966,9.13l5.449,31.773   c1.445,8.426-7.399,14.851-14.966,10.873L249.8,226.159c-3.005-1.58-6.595-1.58-9.599,0l-28.534,15.001   c-7.567,3.978-16.411-2.447-14.966-10.873l5.449-31.773c0.574-3.346-0.535-6.76-2.966-9.13L176.1,166.882   c-6.122-5.967-2.744-16.364,5.716-17.593l31.902-4.636c3.359-0.488,6.264-2.598,7.766-5.642l14.267-28.908   C239.535,102.437,250.466,102.437,254.25,110.103z"/>
        <path style="fill:#FD5B67;" d="M429.724,391.443c-122.225-25.646-247.222-25.646-369.447,0   c-5.657-38.97-11.315-77.941-16.972-116.911c133.455-28.001,269.936-28.001,403.391,0   C441.039,313.502,435.381,352.473,429.724,391.443z"/>
        <path style="fill:#EF297B;" d="M152.744,376.98c-30.94,3.2-61.79,8.02-92.47,14.46c-5.65-38.97-11.31-77.94-16.97-116.91   c12.63-2.65,25.3-5.05,37.98-7.2h0.01C86.464,311.05,101.814,371.98,152.744,376.98z"/>
        <g>
            <path style="fill:#F2F4FF;" d="M99.344,287.24c-0.517-2.936,2.611-5.052,6.132-5.635c7.803-1.296,15.62-2.482,23.448-3.559    c12.68-1.758,24.95,0.716,26.581,16.305c0.962,9.001-2.163,15.323-8.027,18.583c7.438,1.772,12.761,5.558,13.906,16.533    c0.081,0.768,0.162,1.537,0.243,2.306c1.747,17.138-7.201,24.245-19.611,25.924c-7.786,1.05-15.561,2.219-23.321,3.508    c-3.838,0.639-6.614-1-7.015-3.284C107.568,334.361,103.456,310.8,99.344,287.24z M119.028,311.177    c4.367-0.679,8.738-1.322,13.113-1.929c6.318-0.875,8.885-5.074,8.183-10.665c-0.714-5.692-4.762-8.755-10.885-7.905    c-4.435,0.617-8.865,1.269-13.293,1.957C117.107,298.816,118.068,304.996,119.028,311.177z M137.311,345.64    c6.817-0.943,10.403-5.04,9.379-13.37c-0.073-0.584-0.145-1.168-0.218-1.753c-1.051-8.541-5.605-11.111-12.666-10.134    c-4.354,0.604-8.703,1.244-13.049,1.919c1.305,8.399,2.611,16.797,3.916,25.196C128.882,346.844,133.095,346.224,137.311,345.64z"/>
            <path style="fill:#F2F4FF;" d="M198.296,306.091c5.949-0.342,11.9-0.617,17.854-0.828c3.057-0.107,4.901,2.6,4.987,5.581    c0.072,2.539-1.347,5.557-4.588,5.671c-5.871,0.208-11.741,0.48-17.608,0.817c0.424,7.384,0.847,14.767,1.271,22.15    c10.623-0.609,21.255-1.002,31.89-1.179c2.935-0.048,4.658,2.917,4.69,6.338c0.029,2.981-1.379,6.192-4.482,6.243    c-13.163,0.219-26.323,0.774-39.464,1.666c-3.207,0.215-6.427-1.087-6.655-4.058c-1.813-23.811-3.626-47.62-5.438-71.431    c-0.23-2.972,3.077-4.774,6.628-5.015c14.517-0.986,29.051-1.599,43.591-1.84c3.435-0.057,5.06,3.135,5.089,6.113    c0.035,3.422-1.748,6.419-4.881,6.469c-11.388,0.189-22.773,0.61-34.147,1.262C197.453,291.397,197.875,298.744,198.296,306.091z"/>
            <path style="fill:#F2F4FF;" d="M292.368,330.662c1.041-16.777-36.299-13.068-36.078-38.974    c0.135-16.459,15.944-21.875,30.081-21.153c7.241,0.295,23.181,2.952,22.595,10.25c-0.197,2.531-2.505,7.442-6.817,7.145    c-3.716-0.24-6.215-4.643-16.371-5.157c-8.704-0.417-13.765,2.656-13.922,7.946c-0.402,13.42,37.819,10.789,35.421,39.535    c-1.311,15.745-12.99,22.939-28.204,22.267c-14.448-0.641-25.461-7.977-25.437-14.39c0.026-3.089,3.036-7.699,6.575-7.629    c4.684,0.108,7.528,8.626,18.981,9.097C285.935,339.889,291.957,337.272,292.368,330.662z"/>
            <path style="fill:#F2F4FF;" d="M386.71,281.93c3.398,0.574,4.402,4.118,3.869,7.159c-0.593,3.371-2.911,6.098-6.014,5.577    c-5.812-0.979-11.631-1.897-17.458-2.752c-3.063,20.859-6.127,41.718-9.19,62.577c-0.438,2.948-4.292,3.942-7.814,3.461    c-3.633-0.502-6.962-2.482-6.59-5.439c2.672-20.913,5.344-41.825,8.017-62.738c-5.878-0.751-11.76-1.439-17.649-2.066    c-3.119-0.331-4.63-3.474-4.279-6.99c0.305-3.073,2.222-6.216,5.644-5.853C352.45,276.695,369.613,279.05,386.71,281.93z"/>
        </g>
    </g>
    </svg>`
});


function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getDirections(from, to) {
    if (from.lat) from = `${from.lat},${from.lng}`;
    if (to.lat) to = `${to.lat},${to.lng}`;

    const url = `/directions?origin=${from}&destination=${to}&key=AIzaSyCNuB_TCqMwIYt253DPeRNOBBHesRO1DQk`;
    const response = await fetch(url);
    const json = await response.json();
    return json;
}

function App() {
    const ref = useRef();
    const map = useRef();
    const [spot, setSpot] = useState();
    const [marker, setMarker] = useState();

    const [showDistance, setShowDistance] = useState(false);

    const [locationCircle, setLocationCircle] = useState();
    const locationDistanceInput = useInput(50000, {
        onInput: (e) => {
            locationCircle.setRadius(e.target.value)
        }
    });
    const polylineRef = useRef();
    const [distanceType, distanceTypeRefs] = useRadio(["distance", "drive"], "distance");
    console.log(distanceType);
    useEffect(() => {
        if (locationCircle) {
            if (polylineRef.current) {
                map.current.removeLayer(polylineRef.current);
            }

            locationCircle.setRadius(locationDistanceInput.value);

            let bestScore = 0;
            let bestItem;
            for (const item of markersTree.all()) {
                const itemLatLng = item.marker.getLatLng();
                const inside = locationCircle.isInside(itemLatLng)
                if (!inside)
                    item.marker._icon.classList.add("saturate30");
                else {
                    item.marker._icon.classList.remove("saturate30");
                    if (item.spot.score > bestScore) {
                        bestScore = item.spot.score;
                        bestItem = item;
                    }
                }
            }

            if (bestItem) {
                const bestSpot = bestItem.spot;
                const bestMarker = bestItem.marker;
                const bestLatLng = bestMarker.getLatLng();
                (async function () {
                    const weather = await getHistory(bestSpot);
                    setSpot({ spot: bestSpot, weather });
                    setMarker(bestMarker);

                    const x = await getDirections(
                        locationCircle.getLatLng(),
                        bestLatLng);

                    let points = [];
                    let start = x.routes[0].legs[0].start_location;
                    points.push([start.lat, start.lng]);
                    for (const p of x.routes[0].legs[0].steps) {
                        points.push([
                            p.end_location.lat,
                            p.end_location.lng]);
                    }

                    if (polylineRef.current) {
                        map.current.removeLayer(polylineRef.current);
                    }
                    polylineRef.current = L.polyline(
                        points,
                        { color: 'red' })
                        .addTo(map.current).snakeIn();

                    polylineRef.current.on('snakeend', async e => {
                        bestMarker.bounce({
                            duration: 500,
                            height: 30,
                            loop: 2
                        });
                    });
                })();
            }
        }
    }, [locationDistanceInput.value, locationCircle]);

    useEffect(() => {
        if (!ref.current) return;
        if (map.current) return;

        map.current = L.map(ref.current).setView([39.50, -98.35], 4);
        const provider = new OpenStreetMapProvider();
        const searchControl = new SearchControl({
            provider: provider,
            style: "bar",
            position: "topright",
            autoClose: true,
            keepResult: true
        });
        map.current.addControl(searchControl);
        map.current.on('geosearch/showlocation', async e => {
            const near = knn(markersTree, e.location.x, e.location.y, 20);
            let bestScore = 0;
            let bestMarker;
            let bestSpot;
            for (const m of near) {
                if (m.spot.score > bestScore) {
                    bestScore = m.spot.score;
                    bestMarker = m.marker;
                    bestSpot = m.spot;
                }
            }

            console.log(bestSpot);
            const weather = await getHistory(bestSpot);
            setSpot({ spot: bestSpot, weather });
            setMarker(bestMarker);



            const circle = L.greatCircle(L.latLng(e.location.y, e.location.x),
                10000,
                { fill: 'red' }).addTo(map.current);
            setLocationCircle(circle);
            setShowDistance(true);
        });


        let mapLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        });
        mapLayer.addTo(map.current);
        var baseMaps = {
            "Map": mapLayer,
        };
        var overlayMaps = {
            "Clouds": L.tileLayer("https://tile.openweathermap.org/map/clouds_new/{z}/{x}/{y}.png?appid=7c5cef09fcfe08e6eb62d06c3f6ad76d", {}),
            "Precipitation": L.tileLayer("https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=7c5cef09fcfe08e6eb62d06c3f6ad76d", {}),
            "Pressure": L.tileLayer("https://tile.openweathermap.org/map/pressure_new/{z}/{x}/{y}.png?appid=7c5cef09fcfe08e6eb62d06c3f6ad76d", {}),
            "Temperature": L.tileLayer("https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png?appid=7c5cef09fcfe08e6eb62d06c3f6ad76d", {}),
            "Wind": L.tileLayer("https://tile.openweathermap.org/map/wind_new/{z}/{x}/{y}.png?appid=7c5cef09fcfe08e6eb62d06c3f6ad76d", {}),
        };
        L.control.layers(baseMaps, overlayMaps).addTo(map.current);

        var markerIcon = L.icon({
            iconUrl: 'markerWave.png',
            shadowUrl: 'leaf-shadow.png',

            iconSize: [32, 32], // size of the icon
            shadowSize: [50, 64], // size of the shadow
            iconAnchor: [22, 94], // point of the icon which will correspond to marker's location
            shadowAnchor: [4, 62],  // the same for the shadow
            popupAnchor: [-3, -76] // point from which the popup should open relative to the iconAnchor
        });

        (async function () {
            spots = await getSpots();

            const points = spots.map(x => L.latLng(x.latitude, x.longitude));
            const bounds = L.latLngBounds(points);
            const bb = new BoundingBox(bounds);

            cluster.load(spots.map(x => ({ type: "Feature", geometry: { type: "Point", coordinates: [x.longitude, x.latitude] } })));
            const weatherInfo = await downloadWeatherData(map.current, cluster, [[[bb.getWest(), bb.getSouth(), bb.getEast(), bb.getNorth()], 0]], []);
            for (const item of weatherInfo) {
                tree.insert({
                    minX: item.coord.Lon,
                    maxX: item.coord.Lon,
                    minY: item.coord.Lat,
                    maxY: item.coord.Lat,
                    item
                });

            }

            let maxScore = 0;
            for (const spot of spots) {
                const near = knn(tree, spot.longitude, spot.latitude, 1)[0];
                spot.score = spotScore(levelName, ms2Knot(near.item.wind.speed))
                if (spot.score > maxScore) {
                    maxScore = spot.score;
                }
            }


            const icons = [spotBadIcon, spotOkIcon, spotGoodIcon, spotBestIcon];
            for (const spot of spots) {
                let iconIdx = spotScoreCategory(levelName, spot.score);
                if (spot.score == maxScore)
                    iconIdx = 3;

                const marker = L.marker([spot.latitude, spot.longitude], {
                    icon: icons[iconIdx],
                    offset: L.point(0, -200),
                    bouncemarker: true,
                })
                    .on("click", async e => {
                        const weather = await getHistory(spot);
                        setSpot({ spot, weather });
                        setMarker(marker);
                        centerLeafletMapOnMarker(map.current, e.target);
                    })
                    .addTo(map.current);

                markersTree.insert({
                    minX: spot.longitude,
                    maxX: spot.longitude,
                    minY: spot.latitude,
                    maxY: spot.latitude,
                    marker,
                    spot
                });
            }
        })();
    }, [ref.current]);
    const [level, setLevel] = useState(0);
    const changeLevel = () => {
        setLevel((level + 1) % 3);
    }
    let levelName = "Novice";
    if (level == 1) levelName = "Intermediate";
    else if (level == 2) levelName = "Expert";

    const bounceMarker = () => {
        marker.bounce({
            duration: 500,
            height: 100
        });
    }
    const zoomMarker = () => {
        centerLeafletMapOnMarker(map.current, marker);
    }
    return <>
        {showDistance && <div style="display:flex; position:absolute; width:400px; left: calc(50vw - 200px); top: 50px; z-index: 10;">
            <div>
                <div>
                    <input type="radio" name="distanceType" {...distanceTypeRefs[0]} /> <label>Distance</label>
                </div>
                <div>
                    <input type="radio" name="distanceType" {...distanceTypeRefs[1]} /> <label>Drive Time</label>
                </div>
            </div>
            <input type="range" min="1" max="100000" value="10000" style="width:220px;" {...locationDistanceInput} />
        </div>}
        <div class={`windInfo ` + (spot ? "full" : "empty")}>
            {spot && <>
                <div>
                    <div>
                        <div style="display: inline-block">
                            <div>{spot && spot.spot.spot_name}</div>
                            <div>{spot && spot.spot.county_name}</div>
                        </div>
                        {spot && <span onClick={bounceMarker} style="float:right">
                            <svg height="24" width="24" viewBox="0 0 512 512" class="saturateOnHover">
                                <g>
                                    <path d="m221 35v63h70v-63c0-19.33-15.67-35-35-35-19.33 0-35 15.67-35 35z" fill="#ffb454" />
                                    <path d="m291 35c0-19.33-15.67-35-35-35v98h35z" fill="#ff7d47" />
                                    <path d="m256 512c-46.869 0-85-38.131-85-85 0-8.284 6.716-15 15-15h140c8.284 0 15 6.716 15 15 0 46.869-38.131 85-85 85z" fill="#ffb454" />
                                    <path d="m326 412h-70v100c46.869 0 85-38.131 85-85 0-8.284-6.716-15-15-15z" fill="#ff7d47" />
                                    <path d="m391 276.377v-69.377c0-74.439-60.561-135-135-135s-135 60.561-135 135v69.377c0 27.351-3.922 54.513-11.517 80.623l97.678 30h97.678l97.678-30c-7.595-26.109-11.517-53.271-11.517-80.623z" fill="#fff16b" />
                                    <path d="m402.517 357c-7.595-26.109-11.517-53.271-11.517-80.623v-69.377c0-74.439-60.561-135-135-135v315h48.839z" fill="#ffb454" />
                                    <path d="m429.023 419.558c-11.305-19.784-20.179-40.806-26.507-62.558h-293.033c-6.327 21.752-15.201 42.774-26.507 62.558-2.653 4.642-2.634 10.346.05 14.971h345.947c2.685-4.625 2.703-10.329.05-14.971z" fill="#ffb454" />
                                    <path d="m429.023 419.558c-11.305-19.784-20.179-40.806-26.507-62.558h-146.516v77.529h172.974c2.684-4.625 2.702-10.329.049-14.971z" fill="#ff7d47" />
                                    <g fill="#e2dff4">
                                        <path d="m470.68 334.64c-3.839 0-7.677-1.464-10.606-4.394-5.858-5.858-5.858-15.355 0-21.213 14.139-14.139 21.926-32.973 21.926-53.033s-7.787-38.894-21.926-53.033c-5.858-5.858-5.858-15.355 0-21.213 5.857-5.858 15.355-5.858 21.213 0 19.806 19.805 30.713 46.173 30.713 74.246s-10.907 54.441-30.713 74.246c-2.929 2.929-6.768 4.394-10.607 4.394z" />
                                        <path d="m428.254 292.213c-3.839 0-7.678-1.464-10.606-4.394-5.858-5.858-5.858-15.355 0-21.213 2.833-2.833 4.394-6.6 4.394-10.607s-1.561-7.773-4.394-10.607c-5.858-5.858-5.858-15.355 0-21.213 5.857-5.858 15.355-5.858 21.213 0 17.546 17.545 17.546 46.094 0 63.64-2.929 2.93-6.768 4.394-10.607 4.394z" />
                                    </g>
                                    <g fill="#f9f9f9">
                                        <path d="m41.32 334.64c-3.839 0-7.678-1.464-10.606-4.394-19.807-19.805-30.714-46.173-30.714-74.246s10.907-54.441 30.713-74.246c5.858-5.858 15.355-5.857 21.213 0 5.858 5.858 5.858 15.355 0 21.213-14.139 14.139-21.926 32.973-21.926 53.033s7.787 38.894 21.926 53.033c5.858 5.858 5.858 15.355 0 21.213-2.928 2.929-6.767 4.394-10.606 4.394z" />
                                        <path d="m83.746 292.213c-3.839 0-7.678-1.464-10.606-4.394-17.546-17.545-17.546-46.094 0-63.64 5.857-5.858 15.355-5.858 21.213 0s5.858 15.355 0 21.213c-2.833 2.833-4.394 6.6-4.394 10.607s1.561 7.773 4.394 10.607c5.858 5.858 5.858 15.355 0 21.213-2.929 2.93-6.768 4.394-10.607 4.394z" />
                                    </g>
                                    <path d="m436 442h-360c-8.284 0-15-6.716-15-15s6.716-15 15-15h360c8.284 0 15 6.716 15 15s-6.716 15-15 15z" fill="#fff16b" />
                                    <path d="m436 412h-180v30h180c8.284 0 15-6.716 15-15s-6.716-15-15-15z" fill="#ffb454" />
                                </g>
                            </svg>
                        </span>}
                        {spot && <span onClick={zoomMarker} style="float:right">
                            <svg height="24" width="24" viewBox="0 0 512 512" class="saturateOnHover">
                                <g>
                                    <path d="m363.077 7.5v40.407h101.016v101.016h40.407v-121.22c0-11.158-9.045-20.203-20.203-20.203z" fill="#3d4fc3" />
                                    <path d="m148.923 7.5v40.407h-101.016v101.016h-40.407v-121.22c0-11.158 9.045-20.203 20.203-20.203z" fill="#3d4fc3" />
                                    <path d="m363.077 504.5v-40.406h101.016v-101.017h40.407v121.22c0 11.158-9.045 20.203-20.203 20.203z" fill="#3d4fc3" />
                                    <path d="m148.923 504.5v-40.406h-101.016v-101.017h-40.407v121.22c0 11.158 9.045 20.203 20.203 20.203z" fill="#3d4fc3" /></g><g><circle cx="256" cy="256" fill="#e4f6ff" r="171.728" />
                                    <path d="m364.7 123.056c24.237 29.607 38.784 67.453 38.784 108.7 0 94.843-76.885 171.728-171.728 171.728-41.247 0-79.093-14.547-108.7-38.784 31.492 38.471 79.348 63.027 132.944 63.027 94.843 0 171.728-76.885 171.728-171.728 0-53.595-24.557-101.451-63.028-132.943z" fill="#e4f6ff" />
                                    <circle cx="256" cy="256" fill="#dd5790" r="34.346" />
                                    <path d="m484.3 0h-32.96c-4.143 0-7.5 3.358-7.5 7.5s3.357 7.5 7.5 7.5h32.96c7.003 0 12.7 5.697 12.7 12.7v113.72h-25.41v-93.51c0-4.142-3.357-7.5-7.5-7.5h-93.51v-25.41h45.66c4.143 0 7.5-3.358 7.5-7.5s-3.357-7.5-7.5-7.5h-53.16c-4.143 0-7.5 3.358-7.5 7.5v40.41c0 4.142 3.357 7.5 7.5 7.5h93.51v93.51c0 4.142 3.357 7.5 7.5 7.5h40.41c4.143 0 7.5-3.358 7.5-7.5v-121.22c0-15.274-12.426-27.7-27.7-27.7z" />
                                    <path d="m7.5 156.423h40.406c4.143 0 7.5-3.358 7.5-7.5v-93.516h93.517c4.143 0 7.5-3.358 7.5-7.5v-40.407c0-4.142-3.357-7.5-7.5-7.5h-121.22c-15.275 0-27.703 12.428-27.703 27.703v121.22c0 4.142 3.357 7.5 7.5 7.5zm7.5-128.72c0-7.004 5.698-12.703 12.703-12.703h113.72v25.407h-93.517c-4.143 0-7.5 3.358-7.5 7.5v93.516h-25.406z" />
                                    <path d="m504.5 355.577h-40.406c-4.143 0-7.5 3.358-7.5 7.5v93.516h-93.517c-4.143 0-7.5 3.358-7.5 7.5v40.407c0 4.142 3.357 7.5 7.5 7.5h121.22c15.275 0 27.703-12.428 27.703-27.703v-121.22c0-4.142-3.357-7.5-7.5-7.5zm-7.5 128.72c0 7.004-5.698 12.703-12.703 12.703h-113.72v-25.407h93.517c4.143 0 7.5-3.358 7.5-7.5v-93.516h25.406z" />
                                    <path d="m148.92 456.59h-22.64c-4.143 0-7.5 3.358-7.5 7.5s3.357 7.5 7.5 7.5h15.14v25.41h-113.72c-7.003 0-12.7-5.697-12.7-12.7v-113.72h25.41v93.51c0 4.142 3.357 7.5 7.5 7.5h43.27c4.143 0 7.5-3.358 7.5-7.5s-3.357-7.5-7.5-7.5h-35.77v-93.51c0-4.142-3.357-7.5-7.5-7.5h-40.41c-4.143 0-7.5 3.358-7.5 7.5v121.22c0 15.274 12.426 27.7 27.7 27.7h121.22c4.143 0 7.5-3.358 7.5-7.5v-40.41c0-4.142-3.358-7.5-7.5-7.5z" />
                                    <path d="m435.062 263.5h43.173c4.143 0 7.5-3.358 7.5-7.5s-3.357-7.5-7.5-7.5h-43.173c-3.843-92.873-78.688-167.718-171.562-171.562v-43.174c0-4.142-3.357-7.5-7.5-7.5s-7.5 3.358-7.5 7.5v43.17c-43.574 1.796-84.631 19.2-116.312 49.484-2.994 2.862-3.101 7.609-.239 10.604s7.608 3.102 10.604.239c30.68-29.326 70.955-45.481 113.408-45.491.013 0 .026.002.039.002s.026-.002.039-.002c90.523.021 164.166 73.661 164.191 164.183 0 .016-.002.031-.002.046s.002.031.002.046c-.025 90.522-73.668 164.162-164.191 164.183-.013 0-.026-.002-.039-.002s-.026.002-.039.002c-90.523-.021-164.166-73.661-164.191-164.183 0-.016.002-.031.002-.046 0-.017-.002-.032-.002-.049.01-33.501 10.044-65.724 29.02-93.187 2.355-3.408 1.501-8.08-1.906-10.434-3.41-2.355-8.08-1.5-10.434 1.907-19.305 27.94-30.128 60.386-31.522 94.264h-43.163c-4.143 0-7.5 3.358-7.5 7.5s3.357 7.5 7.5 7.5h43.173c3.844 92.873 78.688 167.718 171.562 171.562v43.174c0 4.142 3.357 7.5 7.5 7.5s7.5-3.358 7.5-7.5v-43.174c92.874-3.844 167.719-78.689 171.562-171.562z" />
                                    <path d="m256 214.154c-23.074 0-41.846 18.772-41.846 41.846s18.771 41.846 41.846 41.846 41.846-18.772 41.846-41.846-18.772-41.846-41.846-41.846zm0 68.692c-14.803 0-26.846-12.043-26.846-26.846s12.043-26.846 26.846-26.846 26.846 12.043 26.846 26.846-12.043 26.846-26.846 26.846z" />
                                    <path d="m338.252 181.248c0-4.142-3.357-7.5-7.5-7.5h-34.346c-4.143 0-7.5 3.358-7.5 7.5s3.357 7.5 7.5 7.5h26.846v26.845c0 4.142 3.357 7.5 7.5 7.5s7.5-3.358 7.5-7.5z" />
                                    <path d="m215.594 173.748h-34.346c-4.143 0-7.5 3.358-7.5 7.5v34.345c0 4.142 3.357 7.5 7.5 7.5s7.5-3.358 7.5-7.5v-26.845h26.846c4.143 0 7.5-3.358 7.5-7.5s-3.358-7.5-7.5-7.5z" />
                                    <path d="m330.752 288.907c-4.143 0-7.5 3.358-7.5 7.5v26.845h-26.846c-4.143 0-7.5 3.358-7.5 7.5s3.357 7.5 7.5 7.5h34.346c4.143 0 7.5-3.358 7.5-7.5v-34.345c0-4.142-3.357-7.5-7.5-7.5z" />
                                    <path d="m173.748 330.752c0 4.142 3.357 7.5 7.5 7.5h34.346c4.143 0 7.5-3.358 7.5-7.5s-3.357-7.5-7.5-7.5h-26.846v-26.845c0-4.142-3.357-7.5-7.5-7.5s-7.5 3.358-7.5 7.5z" />
                                </g>
                            </svg>
                        </span>}
                    </div>
                </div>
                <div>Score: {spot && spotScore(levelName, ms2Knot(spot.weather.current.wind_speed))}</div>
                <div>{spot && spot.weather.current.wind_deg} - {spot && degreeToWindText(spot.weather.current.wind_deg)} - {spot && spot.weather.current.wind_speed}</div>
                <WindRose weather={spot && spot.weather} />
            </>}
        </div>
        <div style="position:absolute; width:64; left:0; top:80px; padding:10px; z-index: 10;">
            <img src="logo.png" style="width: 64px" />
            <div style="background:white" onClick={changeLevel}>
                <img src={`level${level}.png`} style="width: 64px" />
                <span>{levelName}</span>
            </div>
            <div>
                <div>Weather</div>
            </div>
        </div>
        <div ref={ref} style="width:100%;height:100%;z-index:0" ></div>
    </>;
}

hydrate(<App />, document.getElementById("app"));