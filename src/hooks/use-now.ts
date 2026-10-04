import { useEffect, useState } from 'react';

/** The current time, refreshed every 10 seconds (so "due" counts and greetings stay current). */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);
  return now;
}
