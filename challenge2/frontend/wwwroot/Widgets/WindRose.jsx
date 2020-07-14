import { h, Fragment } from 'preact';
import useInput from '../useInput.js';
import {
    degreeToWindText,
    ms2Knot,
} from '../utils.js';

export default function WindRose({ weather }) {
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
        <div>
            <input type="checkbox" {...showNowInput} /><span>Show Current Wind</span>
        </div>
    </div>;
}