import { useEffect, useRef, useState } from 'react';

// Animates a number from its previous value to `target` with an ease-out curve.
// Used for scores and vote counts so results feel like they are being tallied.
export function useCountUp(target, duration = 900) {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);

  useEffect(() => {
    const from = fromRef.current;
    const to = target;
    if (from === to) return undefined;

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced || duration <= 0) {
      fromRef.current = to;
      setValue(to);
      return undefined;
    }

    let raf;
    const startedAt = performance.now();
    const frame = (now) => {
      const t = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + (to - from) * eased));
      if (t < 1) {
        raf = requestAnimationFrame(frame);
      } else {
        fromRef.current = to;
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return value;
}

export default useCountUp;
