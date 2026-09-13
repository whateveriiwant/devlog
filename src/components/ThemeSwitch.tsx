import { useState, type CSSProperties } from 'react';
import '../styles/theme-switch.css';

// Scene proportions follow https://designervsdeveloper.webflow.io/.
// Each layer stays in SVG/CSS so even the tiny header version remains sharp.
const stars = [
  [12, 19, 2.1],
  [25, 12, 2.8],
  [37, 23, 1.7],
  [52, 11, 2.9],
  [17, 32, 1.7],
  [31, 34, 2.1],
  [45, 31, 2.3],
  [59, 33, 1.8],
  [8, 35, 1],
  [23, 26, 0.9],
  [43, 18, 0.9],
];

export default function ThemeSwitch({
  dark,
  onToggle,
}: {
  dark: boolean;
  onToggle: () => void;
}) {
  const [journey, setJourney] = useState(0);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="다크 모드"
      title={dark ? '라이트 모드로 전환' : '다크 모드로 전환'}
      className="theme-switch"
      data-animated={journey > 0 ? 'true' : undefined}
      onClick={() => {
        setJourney((value) => value + 1);
        onToggle();
      }}
    >
      <span className="theme-switch__scene" aria-hidden="true">
        <span className="theme-switch__halos">
          <i />
          <i />
          <i />
        </span>
        <svg className="theme-switch__stars" viewBox="0 0 120 45" fill="none">
          {stars.map(([x, y, r], index) => (
            <path
              key={index}
              style={{ '--star-delay': `${index * 35}ms` } as CSSProperties}
              d={`M ${x} ${y - r} Q ${x + 0.18 * r} ${y - 0.18 * r} ${x + r} ${y} Q ${x + 0.18 * r} ${y + 0.18 * r} ${x} ${y + r} Q ${x - 0.18 * r} ${y + 0.18 * r} ${x - r} ${y} Q ${x - 0.18 * r} ${y - 0.18 * r} ${x} ${y - r} Z`}
            />
          ))}
        </svg>
        <svg
          className="theme-switch__clouds theme-switch__clouds--back"
          viewBox="0 0 120 45"
        >
          <path d="M-8 49C-6 36 6 33 15 37C20 29 30 30 35 36C42 25 52 26 57 32C65 24 72 25 77 28C80 19 88 16 97 20C95 5 112-4 129-1V52Z" />
        </svg>
        <svg
          className="theme-switch__clouds theme-switch__clouds--front"
          viewBox="0 0 120 45"
        >
          <path d="M-8 52C-3 43 5 40 14 43C21 35 33 35 40 41C48 33 56 34 62 40C67 36 73 37 77 40C82 32 92 31 98 34C98 27 103 24 108 25C107 11 117 6 127 9V52Z" />
        </svg>
        <span className="theme-switch__travellers" key={journey}>
          <svg className="theme-switch__balloon" viewBox="0 0 24 36">
            <path
              fill="#cb383d"
              d="M12 1C-3 1-2 17 5 23L9 27H15L19 23C26 17 27 1 12 1Z"
            />
            <path fill="#f3a630" d="M12 1C4 1 5 18 10 26H14C19 18 20 1 12 1Z" />
            <path fill="#f6d665" d="M12 2C10 7 10 20 12 26C14 20 14 7 12 2Z" />
            <path
              stroke="#6d4146"
              strokeWidth=".8"
              d="M8 25L9 31M16 25L15 31"
            />
            <rect x="8" y="30" width="8" height="5" rx="1.5" fill="#175274" />
            <rect
              x="7.5"
              y="29.5"
              width="9"
              height="1.6"
              rx=".8"
              fill="#286787"
            />
          </svg>
          <svg className="theme-switch__rocket" viewBox="0 0 24 40">
            <path
              className="theme-switch__flame"
              fill="#ff933d"
              d="M8 26Q5 33 12 40Q19 33 16 26Z"
            />
            <path fill="#ffe980" d="M10 26Q9 33 12 36Q15 33 14 26Z" />
            <path
              fill="#b92f46"
              d="M7 18Q0 20 1 30L8 27M17 18Q24 20 23 30L16 27"
            />
            <path fill="#e95960" d="M12 1Q4 8 6 27H18Q20 8 12 1Z" />
            <path fill="#f8ece4" d="M12 1Q8 5 7 10H17Q16 5 12 1Z" />
            <circle cx="12" cy="16" r="4" fill="#a82840" />
            <circle cx="12" cy="16" r="2.8" fill="#b6e3f0" />
            <path stroke="#ef98a0" strokeWidth="1" d="M8 12Q7 17 8 23" />
            <rect x="7" y="26" width="10" height="2" rx="1" fill="#9b2e41" />
          </svg>
        </span>
        <span className="theme-switch__orb">
          <span className="theme-switch__sun" />
          <span className="theme-switch__moon">
            <i />
            <i />
            <i />
          </span>
          <span className="theme-switch__orb-light" />
        </span>
        <span className="theme-switch__bezel" />
      </span>
    </button>
  );
}
