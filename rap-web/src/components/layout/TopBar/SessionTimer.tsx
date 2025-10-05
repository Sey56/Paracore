import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faClock } from '@fortawesome/free-solid-svg-icons';

const SESSION_DURATION = 8 * 60 * 60 * 1000; // 8 hours in milliseconds

export const SessionTimer: React.FC = () => {
  const { sessionStartTime, logout } = useAuth();
  const [remainingTime, setRemainingTime] = useState<number | null>(null);

  useEffect(() => {
    if (!sessionStartTime) {
      setRemainingTime(null);
      return;
    }

    const expirationTime = sessionStartTime + SESSION_DURATION;

    const intervalId = setInterval(() => {
      const now = new Date().getTime();
      const timeLeft = expirationTime - now;

      if (timeLeft <= 0) {
        setRemainingTime(0);
        clearInterval(intervalId);
        logout();
      } else {
        setRemainingTime(timeLeft);
      }
    }, 1000);

    return () => clearInterval(intervalId);
  }, [sessionStartTime, logout]);

  if (remainingTime === null) {
    return null;
  }

  const hours = Math.floor((remainingTime / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((remainingTime / (1000 * 60)) % 60);
  const seconds = Math.floor((remainingTime / 1000) % 60);

  const formattedTime = [
    hours.toString().padStart(2, '0'),
    minutes.toString().padStart(2, '0'),
    seconds.toString().padStart(2, '0'),
  ].join(':');

  return (
    <div className="flex items-center px-4 py-2 text-sm text-gray-600 dark:text-gray-300">
      <FontAwesomeIcon icon={faClock} className="mr-2" />
      <span>Session expires in: {formattedTime}</span>
    </div>
  );
};
