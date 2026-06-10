import React, { useState, useEffect } from 'react';
import { useAuth } from '@/features/auth';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faClock } from '@fortawesome/free-solid-svg-icons';

const SESSION_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds

export const SessionTimer: React.FC = () => {
  const { sessionStartTime, logout, cloudToken } = useAuth();
  const [remainingTime, setRemainingTime] = useState<number | null>(null);

  // Offline mode ("Continue Offline") uses "rap-local-token" as cloudToken — never expires
  const isOffline = cloudToken === "rap-local-token";

  useEffect(() => {
    if (isOffline || !sessionStartTime) {
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
  }, [sessionStartTime, logout, isOffline]);

  if (remainingTime === null) {
    return null;
  }

  const days = Math.floor(remainingTime / (1000 * 60 * 60 * 24));
  const hours = Math.floor((remainingTime / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((remainingTime / (1000 * 60)) % 60);

  let formattedTime = "";
  if (days > 0) {
    formattedTime = `${days}d ${hours}h ${minutes}m`;
  } else {
    const seconds = Math.floor((remainingTime / 1000) % 60);
    formattedTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  return (
    <div className="flex items-center px-4 py-2 text-sm text-gray-600 dark:text-gray-300">
      <FontAwesomeIcon icon={faClock} className="mr-2" />
      <span>Session expires in: {formattedTime}</span>
    </div>
  );
};
