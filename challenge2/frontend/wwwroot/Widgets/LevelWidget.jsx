import { h, Fragment } from 'preact';

export default function LevelWidget({ level, onNewLevel, onNewPosition }) {
    const changeLevel = () => {
        if (onNewLevel)
            onNewLevel((level + 1) % 3);
    }
    const centerAtMe = (e) => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(pos => {
                if (onNewPosition)
                    onNewPosition({
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude
                    });
            });
        }
    };
    return <div class="box" style="padding-left:0px;width:54px; left:18px; top:80px; z-index:1">
        <div style="background:white" onClick={changeLevel}>
            <img src={`level${level}.svg`} style="width: 64px" />
        </div>
        {navigator.geolocation && <div onClick={centerAtMe} style="padding: 10px 0px 0px 10px;font-size:0.7em; text-align: center; cursor: pointer">
            Best Near Me!
        </div>}
    </div>;
}