import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../api/client.js';
import { getApiError } from '../utils/format.js';

export default function useApiData(path, params, fallbackError = 'Unable to load data.') {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const paramsKey = JSON.stringify(params ?? {});
  const fallbackRef = useRef(fallbackError);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    api
      .get(path, { params: JSON.parse(paramsKey) })
      .then((response) => {
        if (!cancelled) {
          setData(response.data);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(getApiError(err, fallbackRef.current));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [path, paramsKey, version]);

  const reload = useCallback(() => setVersion((value) => value + 1), []);

  return { data, loading, error, reload, setData };
}

export function useDebouncedValue(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
