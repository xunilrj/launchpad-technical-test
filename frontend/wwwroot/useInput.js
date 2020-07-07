import { useState, useEffect } from 'preact/hooks';

export default function useInput(initialValue, opts = {}) {
    const [value, setValue] = useState(initialValue);

    function onChange(e) {
        const newValue = e.target.value;
        let shouldUpdate = true;
        if (typeof opts.validate === "function") shouldUpdate = opts.validate(newValue, value);
        if (shouldUpdate) setValue(newValue);
    }

    useEffect(() => setValue(initialValue), [initialValue]);
    return { value, onChange };
}