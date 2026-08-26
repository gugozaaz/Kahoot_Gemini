import { useEffect, useRef, useState } from 'react';
import { api } from './api';

// Replaces the old Socket.IO push events with HTTP polling.
// Polls fast while a question is live, slower in static phases,
// and stops once the game is over. `injectState` lets action
// responses (which already carry fresh state) skip the next poll.
export function useGameState({ pin, role, token, enabled }) {
  const [state, setStateRaw] = useState(null);
  const [error, setError] = useState(null);
  const stateRef = useRef(null);

  const injectState = (fresh) => {
    stateRef.current = fresh;
    setStateRaw(fresh);
  };

  useEffect(() => {
    if (!enabled || !pin || !token) return undefined;

    let cancelled = false;
    let timer;
    stateRef.current = null;
    setStateRaw(null);
    setError(null);

    const intervalFor = (s) => {
      if (!s) return 700;
      if (s.status === 'QUESTION_ACTIVE' || s.status === 'QUESTION_PREVIEW') return 700;
      if (s.status === 'GAME_OVER') return 0; // game finished, stop polling
      return 1500;
    };

    const tick = async () => {
      let wait = 1500;
      try {
        const next = await api.getGameState({ pin, role, token });
        if (cancelled) return;
        setError(null);
        const prev = stateRef.current;
        // Skip re-render when nothing changed (static phases don't bump version)
        if (!prev || prev.version !== next.version || prev.currentIndex !== next.currentIndex) {
          injectState(next);
        }
        wait = intervalFor(next);
      } catch (err) {
        if (cancelled) return;
        setError(err);
        wait = err.status >= 500 ? 2000 : intervalFor(stateRef.current);
      }
      if (!cancelled && wait > 0) timer = setTimeout(tick, wait);
    };

    tick();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pin, role, token, enabled]);

  return { state, error, injectState };
}
