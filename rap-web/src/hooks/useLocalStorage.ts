import { useState, useEffect } from 'react';

function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((val: T) => T)) => void] {
  // State to store our value
  const [storedValue, setStoredValue] = useState<T>(initialValue);

  // Effect to read from local storage when the key changes or on initial mount
  useEffect(() => {
    if (typeof window === 'undefined' || !key) { // Added !key check
      setStoredValue(initialValue); // Reset to initialValue if key is invalid
      return;
    }
    try {
      const item = window.localStorage.getItem(key);
      setStoredValue(item ? JSON.parse(item) : initialValue);
    } catch (error) {
      console.error(error);
      setStoredValue(initialValue);
    }
  }, [key, initialValue]); // Depend on key and initialValue

  // Effect to update local storage when the storedValue changes
  useEffect(() => {
    if (typeof window === 'undefined' || !key) { // Added !key check
      return;
    }
    try {
      window.localStorage.setItem(key, JSON.stringify(storedValue));
    } catch (error) {
      console.error(error);
    }
  }, [key, storedValue]);

  return [storedValue, setStoredValue];
}

export default useLocalStorage;