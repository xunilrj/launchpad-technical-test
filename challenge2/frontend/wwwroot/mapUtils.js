import { useEffect, useRef } from 'preact/hooks';
import L from 'leaflet';
import BoundingBox from 'boundingbox';
import RBush from 'rbush';
import knn from 'rbush-knn';
import Supercluster from 'supercluster';
import { SearchControl, OpenStreetMapProvider } from 'leaflet-geosearch';
import '@skyraptor/leaflet.bouncemarker';
import './greatCircle.js';
import 'leaflet.polyline.snakeanim';
import getGlobals from './globals.js';
import {
    getSpots,
    getWeatherHistory,
    ms2Knot,
    spotScore,
    spotScoreCategory,
    downloadWeatherData,
    getDirections,
} from './utils.js';
import { spotBadIcon, spotOkIcon, spotGoodIcon, spotBestIcon } from './icons.js';

export function centerLeafletMapOnMarker(map, marker, dlat = 0.04, dlng = 0.1, zoom = 12) {
    let ll = marker.getLatLng();
    map.setView({ lat: ll.lat + dlat, lng: ll.lng + dlng }, zoom);
}

export function updateMarkersAsInsideOrOutside(locationCircle) {
    let bestScore = 0;
    let bestItem;
    let markersTree = getGlobals().markersTree;
    for (const item of markersTree.all()) {
        const itemLatLng = item.marker.getLatLng();
        const inside = locationCircle ? locationCircle.isInside(itemLatLng) : true;
        if (!inside) {
            item.marker._icon.classList.add("inactiveMarker");
        } else {
            item.marker._icon.classList.remove("inactiveMarker");
            if (item.spot.score > bestScore) {
                bestScore = item.spot.score;
                bestItem = item;
            }
        }
    }

    return bestItem;
}

export async function getSpotWeatherAndRoute(spot, marker, circle) {
    const weather = await getWeatherHistory(spot);
    const directions = await getDirections(
        circle.getLatLng(),
        marker.getLatLng());

    let polyline;
    if (directions && directions.routes
        && directions.routes[0]
        && directions.routes[0].legs
        && directions.routes[0].legs[0]) {

        let points = [];
        let start = directions.routes[0].legs[0].start_location;
        points.push([start.lat, start.lng]);

        for (const p of directions.routes[0].legs[0].steps) {
            points.push([p.end_location.lat, p.end_location.lng]);
        }

        polyline = L.polyline(points, { color: 'red' })
    }

    return [weather, polyline];
}

export function useLeafletPolyline(map) {
    const ref = useRef();
    return (x, opts) => {
        let v;

        let leafletMap = map;
        if (map.current) leafletMap = map.current;

        if (ref.current) leafletMap.removeLayer(ref.current);
        if (x) ref.current = x.addTo(leafletMap);

        if (ref.current && opts && opts.snakeIn) {
            ref.current = ref.current.snakeIn(opts.snakeIn);
            v = new Promise((ok, rej) => {
                ref.current.on('snakeend', ok);
            });
        }

        return v;
    }
}

export function bestSpotNearAt(at) {
    let lat = at[0];
    let lng = at[1];
    if (at.lat) lat = at.lat;
    if (at.y) lat = at.y;
    if (at.lng) lng = at.lng;
    if (at.long) lng = at.long;
    if (at.x) lng = at.x;

    const near = knn(getGlobals().markersTree, lng, lat, 20);
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
    return {
        score: bestScore,
        marker: bestMarker,
        spot: bestSpot
    };
}

export async function loadAndScoreSpots(levelName, map, onClickMarker) {
    getGlobals().spots = await getSpots();

    const points = getGlobals().spots.map(x => L.latLng(x.latitude, x.longitude));
    const bounds = L.latLngBounds(points);
    const bb = new BoundingBox(bounds);

    getGlobals().cluster = new Supercluster();
    getGlobals().cluster.load(getGlobals().spots.map(x => ({
        type: "Feature",
        geometry: {
            type: "Point",
            coordinates: [x.longitude, x.latitude]
        }
    })));
    const weatherInfo = await downloadWeatherData(map.current, getGlobals().cluster, [
        [[bb.getWest(), bb.getSouth(), bb.getEast(), bb.getNorth()], 0]],
        []
    );
    for (const item of weatherInfo) {
        getGlobals().tree.insert({
            minX: item.coord.Lon,
            maxX: item.coord.Lon,
            minY: item.coord.Lat,
            maxY: item.coord.Lat,
            item
        });
    }

    let maxScore = 0;
    for (const spot of getGlobals().spots) {
        const near = knn(getGlobals().tree, spot.longitude, spot.latitude, 1)[0];
        spot.score = spotScore(levelName, ms2Knot(near.item.wind.speed))
        if (spot.score > maxScore) {
            maxScore = spot.score;
        }
    }

    let leafletMap = map;
    if (map.current) leafletMap = map.current;
    for (const item of getGlobals().markersTree.all()) {
        leafletMap.removeLayer(item.marker);
    }
    getGlobals().markersTree = new RBush();

    const icons = [spotBadIcon, spotOkIcon, spotGoodIcon, spotBestIcon];
    for (const spot of getGlobals().spots) {
        let iconIdx = spotScoreCategory(levelName, spot.score);
        if (spot.score == maxScore)
            iconIdx = 3;

        const marker = L.marker([spot.latitude, spot.longitude], {
            icon: icons[iconIdx],
            offset: L.point(0, -200),
            bouncemarker: true,
        })
            .on("click", e => {
                if (onClickMarker)
                    onClickMarker(spot, marker);
            })
            .addTo(leafletMap);

        getGlobals().markersTree.insert({
            minX: spot.longitude,
            maxX: spot.longitude,
            minY: spot.latitude,
            maxY: spot.latitude,
            marker,
            spot
        });
    }
}

export function useMap({ onPopupOpen, onPopupClose, onShowLocation, onLayerRemove }) {
    const ref = useRef();
    const map = useRef();

    const onPopupOpenRef = useRef();
    const onPopupCloseRef = useRef();
    const onShowLocationRef = useRef();
    const onLayerRemoveRef = useRef();

    onPopupOpenRef.current = onPopupOpen;
    onPopupCloseRef.current = onPopupClose;
    onShowLocationRef.current = onShowLocation;
    onLayerRemoveRef.current = onLayerRemove;

    useEffect(() => {
        if (!ref.current) return;
        if (map.current) return;

        map.current = L.map(ref.current)
            .setView([39.50, -98.35], 4); //USA centered

        const provider = new OpenStreetMapProvider();
        const searchControl = new SearchControl({
            provider: provider,
            style: "bar",
            autoClose: true,
            keepResult: true,
            showPopup: false,
            marker: {
                icon: new L.Icon.Default(),
                draggable: false,
                topWidget: "distance",
                searchMarker: true
            },
        });
        map.current.addControl(searchControl);
        map.current.on("popupopen", (e) => {
            if (onPopupOpenRef.current)
                onPopupOpenRef.current(e);
        });
        map.current.on("popupclose", (e) => {
            if (onPopupCloseRef.current)
                onPopupCloseRef.current(e);
        });
        map.current.on('geosearch/showlocation', (e) => {
            if (onShowLocationRef.current)
                onShowLocationRef.current(e);
        });
        map.current.on('layerremove', e => {
            if (onLayerRemoveRef.current)
                onLayerRemoveRef.current(e);
        });

        let mapLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {});
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
    }, [ref.current]);

    return [ref, map];
}