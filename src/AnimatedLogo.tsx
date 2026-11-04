import { useId } from "react";

// The original glyphs stay intact: each is clipped from the approved artwork
// and animated independently over the same TV with its screen cleared.
// Animate small HTML layers: WebKit can composite their transforms without
// repainting the full filtered SVG on every frame. No additional image assets.
const letters = [
  { x: 250, width: 153 },
  { x: 404, width: 149 },
  { x: 554, width: 152 },
  { x: 707, width: 151 },
];

export default function AnimatedLogo({ active }: { active: boolean }) {
  const id = useId().replace(/:/g, "");
  if (!active)
    return <img src="/scdr-tv-logo.webp" alt="" width="768" height="768" />;
  return (
    <span className="animated-logo" aria-hidden="true">
      <img src="/scdr-tv-screen.webp" alt="" width="768" height="768" />
      {letters.map((letter, i) => (
        <span
          key={i}
          className="logo-letter"
          style={{
            animationDelay: `${i * -0.12}s`,
            left: `${(letter.x / 1254) * 100}%`,
            top: `${(495 / 1254) * 100}%`,
            width: `${(letter.width / 1254) * 100}%`,
            height: `${(342 / 1254) * 100}%`,
          }}
        >
          <svg
            viewBox={`${letter.x} 495 ${letter.width} 342`}
            width="100%"
            height="100%"
          >
            <defs>
              <filter id={`${id}-white-${i}`} colorInterpolationFilters="sRGB">
                <feColorMatrix
                  type="matrix"
                  values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  1 1 1 0 -2"
                />
              </filter>
            </defs>
            <image
              href="/scdr-tv-logo.webp"
              width="1254"
              height="1254"
              filter={`url(#${id}-white-${i})`}
            />
          </svg>
        </span>
      ))}
    </span>
  );
}
