import React from 'react';

// Circular timer: the ring drains as the clock runs down and turns red,
// pulsing, in the last five seconds.
export default function CountdownRing({ value, total, size = 92 }) {
  const safeTotal = total > 0 ? total : 1;
  const ratio = Math.max(0, Math.min(1, value / safeTotal));
  const radius = size / 2 - 8;
  const circumference = 2 * Math.PI * radius;
  const urgent = value <= 5 && value > 0;

  return (
    <div className={`countdown-ring${urgent ? ' urgent' : ''}`} style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="#fff" stroke="rgba(0,0,0,0.12)" strokeWidth="8"
        />
        <circle
          className="countdown-ring-progress"
          cx={size / 2} cy={size / 2} r={radius}
          fill="none"
          stroke={urgent ? '#e21b3c' : '#26890c'}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="countdown-ring-value">{value}</span>
    </div>
  );
}
