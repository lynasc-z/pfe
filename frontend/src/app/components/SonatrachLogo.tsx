export function SonatrachLogo({ className = "", size = "default" }: { className?: string; size?: "small" | "default" | "large" }) {
  const sizes = {
    small: { width: 120, height: 40 },
    default: { width: 180, height: 60 },
    large: { width: 240, height: 80 }
  };

  const { width, height } = sizes[size];

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 180 60"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Orange geometric blocks representing Sonatrach logo */}
      <rect x="0" y="8" width="28" height="44" fill="#FF6B00"/>
      <rect x="4" y="12" width="20" height="8" fill="white"/>
      <rect x="4" y="24" width="20" height="8" fill="white"/>
      <rect x="4" y="36" width="20" height="8" fill="white"/>

      {/* Text: SONATRACH */}
      <text
        x="38"
        y="40"
        fontFamily="Archivo, sans-serif"
        fontSize="20"
        fontWeight="700"
        fill="#0A0A0A"
        letterSpacing="0.5"
      >
        sonatrach
      </text>
    </svg>
  );
}
