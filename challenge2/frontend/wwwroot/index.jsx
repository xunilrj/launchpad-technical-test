import { h, hydrate, Fragment } from 'preact';
import render from 'preact-render-to-string';
import { useEffect, useRef, useState } from 'preact/hooks';
import L from 'leaflet';
import BoundingBox from 'boundingbox';
import RBush from 'rbush';
import knn from 'rbush-knn';
import useInput from './useInput.js';

const tree = new RBush();

async function getSpots() {
    const url = "spots.json";
    const response = await fetch(url, { mode: 'cors' });
    const json = await response.json();
    return json;
}

async function getWeather(map, bb) {
    const mapbb = new BoundingBox(map.getBounds());
    const distance = mapbb.diagonalDistance({ unit: 'km' });
    if (distance < 500) {
        const mapbbstring = mapbb.toLonLatString();
        const url = `weather?bbox=${mapbbstring},15&appid=7c5cef09fcfe08e6eb62d06c3f6ad76d`;
        const response = await fetch(url, { mode: 'cors' });
        const json = await response.json();
        return json;
    } else {
        return null;
    }
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

function WindRoseArc(o) {
    return d3.svg.arc()
        .startAngle(function (d) { return (d.d - o.width) * Math.PI / 180; })
        .endAngle(function (d) { return (d.d + o.width) * Math.PI / 180; })
        .innerRadius(o.from)
        .outerRadius(function (d) { return o.to(d) });
};

function ms2Knot(ms) {
    return 1.9438445 * ms;
}

function WindRose({ weather }) {
    console.log(weather);
    let cx = 150;
    let cy = 100;
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
        <input type="checkbox" {...showNowInput} /><span>Show now</span>
        <svg width="100%" height="100%">

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

function App() {
    const ref = useRef();
    const map = useRef();
    const [spot, setSpot] = useState();
    useEffect(() => {
        if (!ref.current) return;
        if (map.current) return;

        map.current = L.map(ref.current).setView([39.50, -98.35], 4);
        map.current.on("zoomend", async (...args) => {
            const r = await getWeather(map.current);
            console.log(r);

            if (r) {
                for (const item of r.list) {
                    tree.insert({
                        minX: item.coord.Lon,
                        maxX: item.coord.Lon,
                        minY: item.coord.Lat,
                        maxY: item.coord.Lat,
                        item
                    });

                    const iconId = item.weather[0].icon;
                    var icon = L.icon({
                        iconUrl: `http://openweathermap.org/img/wn/${iconId}.png`,
                    });
                    L.marker([item.coord.Lat, item.coord.Lon], { icon })
                        .addTo(map.current);

                }

            }

        });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map.current);
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
            const spots = await getSpots();
            for (const spot of spots) {
                const marker = L.marker([spot.latitude, spot.longitude])
                    .on("click", async x => {
                        const weather = await getHistory(spot);
                        setSpot({ spot, weather });
                    })
                    .addTo(map.current);
                marker.bindPopup(() => {
                    //[{"minX":-117.61,"maxX":-117.61,"minY":33.43,"maxY":33.43,
                    //"item":{"id":5391791,"dt":1594473343,"name":"San Clemente",
                    //"coord":{"Lon":-117.61,"Lat":33.43},
                    //"main":{"temp":18.54,"feels_like":20.48,"temp_min":17.78,
                    //"temp_max":19.44,"pressure":1014,"humidity":96},
                    //"wind":{"speed":1.16,"deg":306},"rain":null,"snow":null,
                    //"clouds":{"today":19},"weather":[{"id":801,"main":"Clouds",
                    //"description":"few clouds","icon":"02d"}]}}]
                    const near = knn(tree, spot.longitude, spot.latitude, 1)[0];
                    const el = <div>
                        <div>{spot.spot_name}</div>
                        <div>{spot.county_name}</div>
                        <div>{spot.latitude}</div>
                        <div>{spot.longitude}</div>
                        <div></div>
                        {/* <div>{near.item.name}</div>
                        <div>{near.item.main.temp_min}</div>
                        <div>{near.item.main.temp_max}</div>
                        <div>{near.item.main.temp}</div>
                        <div>{near.item.main.pressure}</div>
                        <div>{near.item.main.humidity}</div>
                        <div>{near.item.wind.speed}</div>
                        <div>{near.item.wind.deg}</div>
                        <div>{near.item.rain}</div>
                        <div>{near.item.snow}</div>
                        <div>{near.item.clouds.today}</div> */}
                        <div>{JSON.stringify(near)}</div>
                    </div>;
                    console.log();
                    //`${} - ${} - [${},${}]\n${}`;
                    return render(el);
                });
            }

            const points = spots.map(x => L.latLng(x.latitude, x.longitude));
            const bounds = L.latLngBounds(points);
            const bb = new BoundingBox(bounds);
            L.geoJSON(bb.toGeoJSON()).addTo(map.current);
            const weather = await getWeather(map.current, bb);
        })();
    }, [ref.current]);
    const [level, setLevel] = useState(0);
    const changeLevel = () => {
        setLevel((level + 1) % 3);
    }
    let levelName = "Novice";
    if (level == 1) levelName = "Intermediate";
    else if (level == 2) levelName = "Expert";

    console.log(spot)

    return <>
        <div style="position:absolute; width:400px; height:300px; left:50%; top: 0, padding:10px; z-index: 10; background: white">
            <div>spot</div>
            <div>{spot && spot.spot.spot_name}</div>
            <div>{spot && spot.spot.county_name}</div>
            {/* <div>{spot && spot.spot.latitude}</div>
            <div>{spot && spot.spot.longitude}</div> */}
            <div></div>
            <div>{spot && spot.weather.current.temp}</div>
            <div>{spot && spot.weather.current.jumidity}</div>

            <div>{spot && spot.weather.current.wind_deg} - {spot && degreeToWindText(spot.weather.current.wind_deg)}</div>
            <div>{spot && spot.weather.current.wind_speed}</div>
            <WindRose weather={spot && spot.weather} />
        </div>
        <div style="position:absolute; width:64; right:0; padding:10px; z-index: 10;">
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