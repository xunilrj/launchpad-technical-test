import { h, hydrate, Fragment } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import flickity from 'flickity';
import useInput from "./useInput.js";
import useAsync from "./useAsync.js";

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function Flickity({ children }) {
    const ref = useRef();
    useEffect(() => {
        new flickity(ref.current, {
            cellAlign: 'left',
            contain: true
        });
    })
    return <div class="carousel" ref={ref}>
        {children}
    </div>;
}

function App() {
    const searchInput = useInput("");
    const [
        errorSearch,
        executeSearch,
        pendingSearch,
        valueSearch,
    ] = useAsync(async () => {
        const q = searchInput.value;
        const res = await fetch(`/search?q=${q}`);
        const json = await res.json();
        return json;
    }, false);
    console.log(valueSearch);
    return <>
        <label>Subject:</label>
        <input {...searchInput} />
        <button onClick={executeSearch}>Search</button>
        <div>
            {pendingSearch && <span>Loading...</span>}
            {valueSearch && <Flickity>
                {valueSearch.images
                    .map(x => <div class="carousel-cell"><img src={x.url} style="width:100%" /></div>)}
            </Flickity>}
        </div>

    </>
}

hydrate(<App />, document.getElementById("app"));