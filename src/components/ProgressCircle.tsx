import './ProgressCircle.css';

interface ProgressCircleProps {
  startTime: number;
  size?: 'sm' | 'md';
}

export function ProgressCircle({ size = 'sm' }: ProgressCircleProps) {
  // SVG circle properties
  const dimensions = size === 'sm' ? 20 : 28;
  const strokeWidth = size === 'sm' ? 2.5 : 3;
  const radius = (dimensions - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Use CSS animation instead of JS state updates for reliability in production
  // Animation goes from 0% to 75% in 60s, then slowly to 98%
  const dashOffsetStart = circumference; // 0% progress
  const dashOffsetEnd = circumference * 0.02; // 98% progress

  return (
    <svg
      width={dimensions}
      height={dimensions}
      viewBox={`0 0 ${dimensions} ${dimensions}`}
      className="progress-circle-svg"
    >
      {/* Background ring */}
      <circle
        cx={dimensions / 2}
        cy={dimensions / 2}
        r={radius}
        fill="none"
        stroke="rgba(255, 255, 255, 0.25)"
        strokeWidth={strokeWidth}
      />
      {/* Progress ring - animated via CSS */}
      <circle
        cx={dimensions / 2}
        cy={dimensions / 2}
        r={radius}
        fill="none"
        stroke="white"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        className="progress-circle-ring"
        style={{
          '--circumference': circumference,
          '--dash-offset-start': dashOffsetStart,
          '--dash-offset-end': dashOffsetEnd,
        } as React.CSSProperties}
        transform={`rotate(-90 ${dimensions / 2} ${dimensions / 2})`}
      />
    </svg>
  );
}
