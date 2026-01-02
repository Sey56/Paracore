import { useState, useEffect, useCallback } from 'react';

function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((val: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === 'undefined') {
      return initialValue;
    }
    try {
      const item = window.localStorage.getItem(key);
      if (item === null) return initialValue;
      // Try to parse it as JSON, but fall back to the raw string if it fails
      try {
        return JSON.parse(item);
      } catch (e) {
        return item as T; // It's not JSON, so return it as-is
      }
    } catch (error) {
      console.error(error);
      return initialValue;
    }
  });

  const setValue = useCallback((value: T | ((val: T) => T)) => {
    setStoredValue(prev => {
      try {
        const valueToStore = value instanceof Function ? value(prev) : value;
        if (typeof window !== 'undefined') {
          if (typeof valueToStore === 'string') {
            window.localStorage.setItem(key, valueToStore);
          } else {
            window.localStorage.setItem(key, JSON.stringify(valueToStore));
          }
        }
        return valueToStore;
      } catch (error) {
        console.error(error);
        return prev;
      }
    });
  }, [key]);

  return [storedValue, setValue];
}

export default useLocalStorage;
