import { useCallback, useEffect, useState } from 'preact/hooks';

export default function useAsync(asyncFunction, immediate = true) {
    const [pending, setPending] = useState(false);
    const [value, setValue] = useState(null);
    const [error, setError] = useState(null);

    const execute = useCallback(() => {
        setError(null);
        setPending(true);
        setValue(null);

        return asyncFunction()
            .then((response) => setValue(response))
            .catch((err) => setError(err))
            .finally(() => setPending(false));
    }, [asyncFunction]);

    useEffect(() => {
        if (immediate) {
            execute();
        }
    }, [execute, immediate]);

    return [
        error, execute, pending, value,
    ];
};