import React, { useEffect, useState } from 'react';
import { sfx } from '../lib/sound';

// Floating mute button. The preference is stored in localStorage by sound.js,
// so it survives a refresh and applies to host and player screens alike.
export default function SoundToggle() {
  const [muted, setMuted] = useState(sfx.isMuted());

  useEffect(() => sfx.subscribe(setMuted), []);

  return (
    <button
      type="button"
      className="sound-toggle"
      onClick={() => {
        const next = sfx.toggleMute();
        if (!next) sfx.select();
      }}
      aria-label={muted ? 'Unmute sound' : 'Mute sound'}
      title={muted ? 'Unmute sound' : 'Mute sound'}
    >
      {muted ? '🔇' : '🔊'}
    </button>
  );
}
