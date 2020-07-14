import { h, Fragment } from 'preact';
import { useEffect } from 'preact/hooks';
import '@skyraptor/leaflet.bouncemarker';
import '../greatCircle.js';
import 'leaflet.polyline.snakeanim';

export default function DistanceWidget({ visible, distanceType, distanceTypeRefs, locationDistanceInput, onDistanceChanged }) {
    useEffect(() => {
        if (visible) {
            let bars = Array.from(document.getElementsByClassName("leaflet-geosearch-bar"));
            for (const bar of bars) {
                bar.style.cssText = "display: none";
            }

            return () => {
                let bars = Array.from(document.getElementsByClassName("leaflet-geosearch-bar"));
                for (const bar of bars) {
                    bar.style.cssText = "";
                }
            }
        }
    }, [visible]);

    const distanceChanged = (e) => {
        locationDistanceInput.onChange(e);
        if (onDistanceChanged)
            onDistanceChanged(e.target.value, false);
    }
    const distanceChanging = (e) => {
        if (onDistanceChanged)
            onDistanceChanged(e.target.value, true);
    }
    return <div id="distanceForm" class="box" style={`position:absolute; width:225px;  left: 88px; top: 18px; z-index: 1; ${!visible ? "display: none" : ""}`}>
        <input type="radio" name="distanceType" {...distanceTypeRefs[0]} />
        <label style="Background: white">Distance</label>
        <input type="radio" name="distanceType" {...distanceTypeRefs[1]} />
        <label>Drive Time</label>
        <input type="range" min="1" max="100000" value="10000" style="width:220px;" {...locationDistanceInput} onChange={distanceChanged} onInput={distanceChanging} />
    </div>;
}