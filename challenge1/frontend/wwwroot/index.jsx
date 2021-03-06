import { h, hydrate, Fragment } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import flickity from 'flickity';
import VanillaPicker from 'vanilla-picker';
import useInput from "./useInput.js";
import useAsync from "./useAsync.js";
import './loading-bar/loading-bar';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function useColorPicker(initialColor, onChange) {


    return [ref, color];
}

function usePrevious(state) {
    let ref = useRef(state);
    let tmp = ref.current;
    ref.current = state;
    return tmp;
}

function useProgressBar() {

}

function Flickity({ children }) {
    const ref = useRef();
    useEffect(() => {
        let flkty = new flickity(ref.current, {
            cellAlign: 'left',
            contain: true,
        });
        ref.current.style.height = "80vh";
    })
    return <div class="carousel" ref={ref} style="height:80vh">
        {children}
    </div>;
}

function getActiveElement() {
    return window.document.activeElement
}

function blackWhiteContrastColor([r, g, b]) {
    const textColor = r * 0.2126 + g * 0.7152 + b * 0.0722;
    return (textColor > 128) ? [0, 0, 0] : [255, 255, 255];
}

function cssColorRgb(property, [r, g, b]) {
    return `${property}:rgba(${r},${g},${b},255)`;

}

function ColorPicker({ color, onNewColor }) {
    const ref = useRef();
    const control = useRef();
    useEffect(() => {
        if (!control.current) {
            control.current = new VanillaPicker({
                parent: ref.current,
                color,
                alpha: false
            });
            control.current.onChange = function (color) {
                if (onNewColor)
                    onNewColor(color.rgba);
            };
        }
    }, [ref.current]);

    const contrastColor = blackWhiteContrastColor(color);
    const cssColor = cssColorRgb("color", contrastColor);
    return <div ref={ref} style="display:inline-block">
        <i class="fa fa-paint-brush" style={cssColor}></i>
    </div>;
}

function Search({ initialValue, color, executeSearch }) {
    const searchInput = useInput(initialValue);
    const inputRef = useRef();
    const open = useRef();
    const contrastColor = blackWhiteContrastColor(color);
    const cssColor = cssColorRgb("color", contrastColor);
    const cssBorderBottomColor = cssColorRgb("border-bottom-color", contrastColor);
    const ifEnterExecute = (e) => {
        if (e.key.toLowerCase() == "enter" && executeSearch) {
            e.target.blur();
            open.current = false;
            executeSearch(e.target.value);
        }
        return true;
    }
    return <>
        <input ref={inputRef} type="text"
            style={`${cssColor};${cssBorderBottomColor}`}
            placeholder="What're we looking for ?"
            onKeyDown={ifEnterExecute}
            {...searchInput} />
        <div id="button" onClick={() => {
            if (!open.current) {
                inputRef.current.focus();
                open.current = true;
            } else {
                inputRef.current.blur();
                open.current = false;
                if (executeSearch)
                    executeSearch(searchInput.value);
            }
        }} >
            <i class="fa fa-search" aria-hidden="true" style={cssColor}></i>
        </div>
    </>
}

function SearchProgress({ color, v, msg }) {
    const ref = useRef();
    const logRef = useRef();
    const barValue = useRef();
    useEffect(() => {
        if (ref.current) {
            barValue.current = new ldBar(ref.current, {
                path: "M213.149867,129.220267 C213.149867,118.843733 204.758756,110.603378 194.532978,110.603378 C189.498311,110.603378 184.918756,112.585956 181.562311,115.791644 C168.745244,106.635378 151.195022,100.6848 131.662222,99.9224889 L140.206933,59.9409778 L167.980089,65.8915556 C168.287289,72.9116444 174.084267,78.5578667 181.257956,78.5578667 C188.5824,78.5578667 194.532978,72.6072889 194.532978,65.28 C194.532978,57.9555556 188.5824,52.0049778 181.257956,52.0049778 C176.069689,52.0049778 171.490133,55.0570667 169.353956,59.4830222 L138.377956,52.9208889 C137.462044,52.7672889 136.546133,52.9208889 135.934578,53.3788444 C135.172267,53.8368 134.714311,54.5991111 134.563556,55.5150222 L125.100089,100.073244 C105.262933,100.6848 87.4083556,106.635378 74.4376889,115.945244 C71.0812444,112.739556 66.5016889,110.756978 61.4670222,110.756978 C51.0904889,110.756978 42.8501333,119.148089 42.8501333,129.373867 C42.8501333,137.002667 47.4268444,143.4112 53.8382222,146.312533 C53.5310222,148.141511 53.3802667,149.973333 53.3802667,151.958756 C53.3802667,180.644978 86.7996444,203.995022 128.001422,203.995022 C169.2032,203.995022 202.622578,180.798578 202.622578,151.958756 C202.622578,150.126933 202.468978,148.141511 202.164622,146.312533 C208.573156,143.4112 213.149867,136.849067 213.149867,129.220267 Z M85.2721778,142.495289 C85.2721778,135.170844 91.2227556,129.220267 98.5500444,129.220267 C105.874489,129.220267 111.825067,135.170844 111.825067,142.495289 C111.825067,149.819733 105.874489,155.773156 98.5500444,155.773156 C91.2227556,155.923911 85.2721778,149.819733 85.2721778,142.495289 Z M159.588978,177.746489 C150.432711,186.902756 133.036089,187.514311 128.001422,187.514311 C122.813156,187.514311 105.416533,186.749156 96.4110222,177.746489 C95.04,176.372622 95.04,174.236444 96.4110222,172.862578 C97.7848889,171.491556 99.9210667,171.491556 101.294933,172.862578 C107.094756,178.6624 119.303111,180.644978 128.001422,180.644978 C136.699733,180.644978 149.058844,178.6624 154.705067,172.862578 C156.078933,171.491556 158.215111,171.491556 159.588978,172.862578 C160.809244,174.236444 160.809244,176.372622 159.588978,177.746489 Z M157.1456,155.923911 C149.821156,155.923911 143.870578,149.973333 143.870578,142.648889 C143.870578,135.324444 149.821156,129.373867 157.1456,129.373867 C164.472889,129.373867 170.423467,135.324444 170.423467,142.648889 C170.423467,149.819733 164.472889,155.923911 157.1456,155.923911 Z",
                fill: "data:ldbar/res,bubble(#FF4500,#fff,50,1)",
                type: "fill",
            });
        }
        if (barValue.current) {
            barValue.current.set(v * 100);
        }
        if (logRef.current) {
            logRef.current.innerText = msg;
            logRef.current.animate([
                { opacity: 0, transform: "translateX(900%)", offset: 0 },
                { opacity: 1, transform: "translateX(0%)", offset: 0.3 },
                { opacity: 1, transform: "translateX(0%)", offset: 0.7 },
                { opacity: 0, transform: "translateX(-900%)", offset: 1 }
            ], {
                duration: 1000,
                iterations: 1,
            });
        }
    });
    const contrastColor = blackWhiteContrastColor(color || [0, 0, 0]);
    const cssColor = cssColorRgb("color", contrastColor);
    return <div class="Modal">
        <div class="Modal-content" ref={ref} />
        <div ref={logRef} style={"padding-top:10px;text-align:center;" + cssColor}>
            Let's see what we find...
        </div>
    </div>;
}

function App() {
    const [[color_r, color_g, color_b], setColor] = useState([0, 0, 0]);
    const [progress, setProgress] = useState({ v: 0, msg: "" });
    let [
        errorSearch,
        executeSearch,
        pendingSearch,
        valueSearch,
    ] = useAsync(async (q) => {
        const url = `/search?q=${q}&r=${color_r / 255.0}&g=${color_g / 255.0}&b=${color_b / 255.0}`;
        return new Promise((ok, rej) => {
            var source = new EventSource(url);
            source.onmessage = (e) => {
                const data = JSON.parse(e.data);
                if (data.v) setProgress(data);
                else if (data.images) {
                    source.close();
                    ok(data);
                }
            };
        })
    }, false);
    useEffect(() => {
        document.body.style.background = `rgba(${color_r},${color_g},${color_b},1)`;
    });
    return <>
        <div autocomplete="on" onSubmit={(e) => {
            executeSearch();
            return false;
        }} class={pendingSearch ? "is-blurred" : null}>
            <ColorPicker color={[color_r, color_g, color_b]}
                onNewColor={setColor} />
            <Search color={[color_r, color_g, color_b]}
                executeSearch={executeSearch} />
        </div>
        <div style="padding-top:50px;height:80vh">
            {pendingSearch && <SearchProgress {...progress} />}
            {valueSearch && <Flickity>
                {valueSearch.images
                    .map(x => <div class="carousel-cell"><img src={x.url} style="width:100%" /></div>)}
            </Flickity>}
        </div>

    </>
}

hydrate(<App />, document.getElementById("app"));