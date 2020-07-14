import RBush from 'rbush';
import Supercluster from 'supercluster';

let cluster = new Supercluster();
let tree = new RBush();
let markersTree = new RBush();
let spots;

export default function get() {
    return {
        get cluster() { return cluster; },
        get tree() { return tree; },
        get markersTree() { return markersTree; },
        get spots() { return spots; },

        set cluster(x) { return cluster = x; },
        set tree(x) { return tree = x; },
        set markersTree(x) { return markersTree = x; },
        set spots(x) { return spots = x; },

    }
}