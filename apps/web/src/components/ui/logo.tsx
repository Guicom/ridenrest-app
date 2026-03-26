interface LogoProps {
  className?: string;
  iconOnly?: boolean;
}

export function Logo({ className, iconOnly = false }: LogoProps) {
  if (iconOnly) {
    return (
      <svg
        viewBox="0 0 220 160"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-label="Ride'n'Rest"
      >
        <g transform="translate(20, 0)">
          <path
            d="M 48 112 C 48 56, 80 48, 96 48 S 144 48, 160 48 C 184 48, 184 88, 160 88 S 104 88, 96 88 C 80 88, 80 128, 104 128 C 132 128, 160 128, 188 128"
            stroke="#4A7C44"
            strokeWidth="14"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <circle cx="144" cy="48" r="11" fill="#b4c9b1" />
          <circle cx="196" cy="128" r="13" fill="#b4c9b1" />
        </g>
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 950 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Ride'n'Rest"
    >
      <g transform="translate(20, 0)">
        <path
          d="M 48 112 C 48 56, 80 48, 96 48 S 144 48, 160 48 C 184 48, 184 88, 160 88 S 104 88, 96 88 C 80 88, 80 128, 104 128 C 132 128, 160 128, 188 128"
          stroke="#4A7C44"
          strokeWidth="14"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <circle cx="144" cy="48" r="11" fill="#b4c9b1" />
        <circle cx="196" cy="128" r="13" fill="#b4c9b1" />
      </g>
      <text
        x="250"
        y="130"
        fill="#4A7C44"
        fontSize="130"
        fontFamily="Inter, system-ui, -apple-system, sans-serif"
        fontWeight="100"
        letterSpacing="0.05em"
      >
        Ride&apos;n&apos;Rest
      </text>
    </svg>
  );
}
