import { useEffect } from 'preact/hooks';
import L from 'leaflet';
import BoundingBox from 'boundingbox';

export async function getSpots() {
    const url = "spots.json";
    const response = await fetch(url, { mode: 'cors' });
    const json = await response.json();
    return json;
}

async function getWeather(map) {
    const mapbb = new BoundingBox(map.getBounds());
    return getWeatherBB(mapbb, 15);
}

export async function getWeatherBB(mapbb, zoom) {
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

export async function getWeatherHistory(spot) {
    const url = `onecall?lat=${spot.latitude}&lon=${spot.longitude}&exclude=minutily&appid=7c5cef09fcfe08e6eb62d06c3f6ad76d`;
    const response = await fetch(url, { mode: 'cors' });
    const json = await response.json();
    return json;
}

export function degreeToWindText(d) {
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

export function ms2Knot(ms) {
    return 1.9438445 * ms;
}

export function spotScore(level, windSpeed) {
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

export function spotScoreCategory(level, score) {
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

export function clusterBB(cluster, id) {
    const leaves = cluster.getLeaves(id, 1000);
    const points = leaves.map(x => L.latLng(x.geometry.coordinates[1], x.geometry.coordinates[0]));
    const bounds = L.latLngBounds(points);
    const bb = new BoundingBox(bounds);
    return bb;
}

export async function downloadWeatherData(map, cluster, q, weathers) {
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

export async function getDirections(from, to) {
    if (from.lat) from = `${from.lat},${from.lng}`;
    if (to.lat) to = `${to.lat},${to.lng}`;

    const url = `/directions?origin=${from}&destination=${to}&key=AIzaSyCNuB_TCqMwIYt253DPeRNOBBHesRO1DQk`;
    const response = await fetch(url);
    const json = await response.json();
    return json;
}

export function getLevelName(level) {
    let levelName = "Novice";
    if (level == 1) levelName = "Intermediate";
    else if (level == 2) levelName = "Expert";
    return levelName;
}

export function useAsyncEffect(f, key) {
    useEffect(() => {
        f();
    }, key);
}