import { h, hydrate, Fragment } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import L from 'leaflet';
import useInput, { useRadio } from './useInput.js';
import '@skyraptor/leaflet.bouncemarker';
import './greatCircle.js';
import 'leaflet.polyline.snakeanim';
import {
    getWeatherHistory,
    degreeToWindText,
    ms2Knot,
    spotScore,
    getLevelName,
    useAsyncEffect
} from './utils.js';
import {
    centerLeafletMapOnMarker,
    updateMarkersAsInsideOrOutside,
    getSpotWeatherAndRoute,
    useLeafletPolyline,
    bestSpotNearAt,
    loadAndScoreSpots,
    useMap
} from './mapUtils.js'
import WindRose from './Widgets/WindRose.jsx'
import DistanceWidget from './Widgets/DistanceWidget.jsx'
import LevelWidget from './Widgets/LevelWidget.jsx'

function App() {
    const [spot, setSpot] = useState();
    const [marker, setMarker] = useState();
    const [topWidget, setTopWidget] = useState("search");
    const [locationCircle, setLocationCircle] = useState();
    const locationDistanceInput = useInput(50000);
    const [ref, map] = useMap({
        onPopupOpen: e => {
            if (e.popup._source.options.topWidget) {
                setTopWidget(e.popup._source.options.topWidget)
            }
        },
        onPopupClose: e => {
            if (e.popup._source.options.topWidget) {
                setTopWidget("search")
            }
        },
        onShowLocation: async e => {
            const { spot, marker } = bestSpotNearAt(e.location);
            const weather = await getWeatherHistory(spot);
            setSpot({ spot, weather });
            setMarker(marker);

            if (locationCircle) {
                map.current.removeLayer(locationCircle);
            }

            const circle = L.greatCircle(L.latLng(e.location.y, e.location.x),
                locationDistanceInput.value,
                { fill: 'red' }).addTo(map.current);
            setLocationCircle(circle);
        },
        onLayerRemove: async e => {
            if (e.layer.options.searchMarker) {
                if (locationCircle) {
                    map.current.removeLayer(locationCircle);
                    setLocationCircle(null);
                }
            }
        }
    });

    const setRoutePolyline = useLeafletPolyline(map);
    const [distanceType, distanceTypeRefs]
        = useRadio(["distance", "drive"], "distance");
    const updateDistanceCircleAndRoute = async (distance, dragging) => {
        locationCircle.setRadius(distance);
    }
    useAsyncEffect(async () => {
        if (locationCircle) {
            const bestItem = updateMarkersAsInsideOrOutside(locationCircle);
            if (bestItem) {
                const bestSpot = bestItem.spot;
                const bestMarker = bestItem.marker;
                const [weather, polyline]
                    = await getSpotWeatherAndRoute(
                        bestSpot,
                        bestMarker,
                        locationCircle);
                setSpot({ spot: bestSpot, weather });
                setMarker(bestMarker);
                await setRoutePolyline(polyline, { snakeIn: {} });
                bestMarker.bounce({
                    duration: 500,
                    height: 30,
                    loop: 2
                });
            }
        } else {
            updateMarkersAsInsideOrOutside(null);
            setRoutePolyline(null);
            setSpot(null);
            setMarker(null);
        }
    }, [locationCircle, locationDistanceInput.value]);

    const [level, setLevel] = useState(0);
    const levelName = getLevelName();
    useEffect(() => {
        loadAndScoreSpots(levelName, map, async (spot, marker) => {
            const weather = await getWeatherHistory(spot);
            setSpot({ spot, weather });
            setMarker(marker);
            centerLeafletMapOnMarker(map.current, marker);
        });
    }, [level]);

    const bounceMarker = () => {
        marker.bounce({
            duration: 500,
            height: 100
        });
    }
    const zoomMarker = () => {
        centerLeafletMapOnMarker(map.current, marker);
    }
    const showBestAt = async (at) => {
        let { spot, marker } = bestSpotNearAt(at);

        let marker2 = L.marker([at.lat, at.lng], {
            icon: new L.Icon.Default(),
            draggable: false,
            topWidget: "distance",
            searchMarker: true
        }).addTo(map.current);
        centerLeafletMapOnMarker(map.current, marker2, 0, 0, 10);


        const weather = await getWeatherHistory(spot);
        setSpot({ spot, weather });
        setMarker(marker);

        if (locationCircle) {
            map.current.removeLayer(locationCircle);
        }

        const circle = L.greatCircle(L.latLng(at.lat, at.lng),
            locationDistanceInput.value,
            { fill: 'red' }).addTo(map.current);
        setLocationCircle(circle);
    };
    return <>
        <DistanceWidget visible={topWidget === "distance"}
            distanceType={distanceType}
            distanceTypeRefs={distanceTypeRefs}
            locationDistanceInput={locationDistanceInput}
            onDistanceChanged={updateDistanceCircleAndRoute} />
        <LevelWidget map={map} level={level} onNewLevel={setLevel} onNewPosition={showBestAt} />
        <div class={`windInfo box ` + (spot ? "full" : "empty")}>
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
        <div ref={ref} style="width:100%;height:100%;z-index:0" ></div>
    </>;
}

hydrate(<App />, document.getElementById("app"));