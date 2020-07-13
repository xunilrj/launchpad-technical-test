import { useState, useEffect, useRef } from 'preact/hooks';

export default function useInput(initialValue, opts = {}) {
    const [value, setValue] = useState(initialValue);

    function onChange(e) {
        let newValue = e.target.value;
        if (e.target.type == "checkbox")
            newValue = e.target.checked;

        let shouldUpdate = true;
        if (typeof opts.validate === "function")
            shouldUpdate = opts.validate(newValue, value);
        if (shouldUpdate)
            setValue(newValue);
    }

    const ref = useRef();
    useEffect(() => {
        if (ref.current) {
            if (ref.current.type == "checkbox") {
                ref.current.checked = !!value;
            } else {
                ref.current.value = value;
            }
        }
    }, []);

    return { ref, value, onChange, onInput: opts.onInput };
}

export function useRadio(items, initialValue) {
    const [value, setValue] = useState(initialValue);
    function onChange(e) {
        setValue(e.target.value);
    }
    const refs = items.map(x => {
        const ref = useRef();
        return { ref, value: x, onChange };
    })
    useEffect(() => {
        const initialSelected = refs
            .filter(x => x.ref.current)
            .find(x => x.ref.current.value == value);
        if (initialSelected)
            initialSelected.ref.current.checked = true;
    }, refs.map(x => x.ref.current));
    return [value, refs];
}