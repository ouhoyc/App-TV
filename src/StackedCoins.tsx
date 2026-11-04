import type { SVGProps } from "react";
export default function StackedCoins({
  size = 20,
  ...props
}: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={props["aria-label"] ? undefined : true}
      {...props}
    >
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v4c0 1.66 3.58 3 8 3s8-1.34 8-3V5M4 10v4c0 1.66 3.58 3 8 3s8-1.34 8-3v-4M4 15v4c0 1.66 3.58 3 8 3s8-1.34 8-3v-4" />
    </svg>
  );
}
