import Svg, { Circle, Path, Rect } from "react-native-svg";
import { color as c } from "@/theme";

/** Same stroke icon set as the design canvas (24×24, 1.8 stroke, round caps). */
const shapes = {
  home: [<Path key="a" d="M3 11l9-7 9 7" />, <Path key="b" d="M5 10v10h14V10" />],
  pay: [<Path key="a" d="M7 7h12l-4-4" />, <Path key="b" d="M17 17H5l4 4" />],
  list: [<Path key="a" d="M9 6h11M9 12h11M9 18h11M4 6h1M4 12h1M4 18h1" />],
  target: [<Circle key="a" cx="12" cy="12" r="9" />, <Circle key="b" cx="12" cy="12" r="5" />, <Circle key="c" cx="12" cy="12" r="1" />],
  user: [<Circle key="a" cx="12" cy="8" r="4" />, <Path key="b" d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />],
  back: [<Path key="a" d="M15 6l-6 6 6 6" />],
  bell: [<Path key="a" d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z" />, <Path key="b" d="M10 20a2 2 0 0 0 4 0" />],
  check: [<Path key="a" d="M5 12l5 5 9-10" />],
  x: [<Path key="a" d="M6 6l12 12M18 6L6 18" />],
  clock: [<Circle key="a" cx="12" cy="12" r="9" />, <Path key="b" d="M12 7v5l3 2" />],
  chev: [<Path key="a" d="M9 6l6 6-6 6" />],
  eye: [<Path key="a" d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />, <Circle key="b" cx="12" cy="12" r="3" />],
  eyeOff: [<Path key="a" d="M3 3l18 18" />, <Path key="b" d="M10.6 6.1A10 10 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3.2 3.9M6.6 7.6C3.8 9.4 2 12 2 12s3.5 6 10 6a9.7 9.7 0 0 0 4.2-.9" />],
  lock: [<Rect key="a" x="5" y="11" width="14" height="10" rx="2" />, <Path key="b" d="M8 11V7a4 4 0 0 1 8 0v4" />],
  id: [<Rect key="a" x="3" y="5" width="18" height="14" rx="2" />, <Circle key="b" cx="9" cy="12" r="2.5" />, <Path key="c" d="M14 10h4M14 14h4" />],
  bank: [<Path key="a" d="M3 10l9-6 9 6" />, <Path key="b" d="M5 10v8M10 10v8M14 10v8M19 10v8M3 20h18" />],
  card: [<Rect key="a" x="3" y="6" width="18" height="12" rx="2" />, <Path key="b" d="M3 10h18" />],
  wallet: [<Path key="a" d="M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4z" />, <Path key="b" d="M4 7l12-3v3" />, <Circle key="c" cx="16" cy="13.5" r="1" />],
  plus: [<Path key="a" d="M12 5v14M5 12h14" />],
  face: [<Path key="a" d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" />, <Path key="b" d="M9 10h.01M15 10h.01" />, <Path key="c" d="M9 15c1.5 1.3 4.5 1.3 6 0" />],
  logout: [<Path key="a" d="M15 4h4v16h-4" />, <Path key="b" d="M10 8l-4 4 4 4M6 12h10" />],
  shield: [<Path key="a" d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />, <Path key="b" d="M9 12l2 2 4-4" />],
  del: [<Path key="a" d="M9 5h11v14H9l-6-7z" />, <Path key="b" d="M12 9l5 6M17 9l-5 6" />],
  search: [<Circle key="a" cx="11" cy="11" r="7" />, <Path key="b" d="M20 20l-4-4" />],
  phone: [<Rect key="a" x="7" y="3" width="10" height="18" rx="2" />, <Path key="b" d="M11 18h2" />],
  in: [<Path key="a" d="M17 7L7 17M7 9v8h8" />],
  out: [<Path key="a" d="M7 17L17 7M9 7h8v8" />],
  alert: [<Path key="a" d="M12 3l9 16H3z" />, <Path key="b" d="M12 10v4M12 17h.01" />],
  refresh: [<Path key="a" d="M20 11a8 8 0 1 0-2.3 5.7" />, <Path key="b" d="M20 5v6h-6" />],
} as const;

export type IconName = keyof typeof shapes;

export function Icon({ name, size = 24, color = c.ink, strokeWidth = 1.8 }: { name: IconName; size?: number; color?: string; strokeWidth?: number }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessible={false}
    >
      {shapes[name]}
    </Svg>
  );
}
