// Small inline icons, sized by font-size and coloured by currentColor.

import type { ReactNode } from "react";

type IconProps = { className?: string; title?: string };

function Svg({ className, title, children, viewBox = "0 0 24 24" }: IconProps & { children: ReactNode; viewBox?: string }) {
  return (
    <svg
      className={`icon ${className ?? ""}`}
      viewBox={viewBox}
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
}

export const CheckIcon = (p: IconProps) => (
  <Svg {...p} viewBox="0 0 16 11">
    <path d="M1.5 5.8 5 9.2 11.5 1.8" />
  </Svg>
);

export const DoubleCheckIcon = (p: IconProps) => (
  <Svg {...p} viewBox="0 0 18 11">
    <path d="M1.5 5.8 5 9.2 11.5 1.8M8.2 8.4l.8.8 6.5-7.4" />
  </Svg>
);

export const ClockIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
);

export const AlertIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v5M12 16.5v.01" />
  </Svg>
);

export const SearchIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Svg>
);

export const SendIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 12 20 4l-4 16-4-7-8-1Z" />
    <path d="m12 13 8-9" />
  </Svg>
);

export const BackIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 5 8 12l7 7" />
  </Svg>
);

export const LogoutIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10" />
  </Svg>
);

export const BotIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="8" width="14" height="11" rx="3" />
    <path d="M12 4v4M9 13v.01M15 13v.01M9.5 16h5" />
  </Svg>
);

export const ChatIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12Z" />
  </Svg>
);
