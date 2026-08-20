import type { SVGProps } from 'react';

/**
 * The tab bar icons from the docs/ prototype (docs/screens/events-screen.html,
 * docs/index.html's nav()) — reproduced as inline SVG so the app's nav matches the mockup
 * pixel-for-pixel instead of substituting the nearest lucide icon. "Me" keeps its lucide
 * icon; the mockup draws it as an avatar initial, which doesn't apply here.
 */
function navIconProps(props: SVGProps<SVGSVGElement>): SVGProps<SVGSVGElement> {
  return {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    ...props,
  };
}

export function DiscoverIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" {...navIconProps(props)}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4v3M12 17v3M4 12h3M17 12h3" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    </svg>
  );
}

export function EventsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" {...navIconProps(props)}>
      <rect x="3.5" y="5" width="17" height="15" rx="3" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  );
}

export function ChatsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" {...navIconProps(props)}>
      <path d="M20.5 12a8 8 0 1 1-3.2-6.4" />
      <path d="M4 20l1.6-4" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}

export function ActivityIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" {...navIconProps(props)}>
      <path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6" />
      <path d="M10.5 20a2 2 0 0 0 3 0" />
    </svg>
  );
}
