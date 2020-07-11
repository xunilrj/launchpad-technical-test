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
            }
        }
    }, []);

    return { ref, value, onChange };
}