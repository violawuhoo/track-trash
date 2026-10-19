import type { StickerColor } from '@haola/game-core';

const COLOR_VAR: Record<StickerColor, string> = {
  orange: 'var(--orange)',
  mint: 'var(--mint)',
  purple: 'var(--purple)',
  pink: 'var(--pink)',
  yellow: 'var(--yellow)',
};

/** 60 个物品图标收敛到 30 个几何形状，靠配色区分。 */
const SHAPE_OF: Record<string, string> = {
  tape: 'ring',
  tape2: 'ring',
  wrench: 'wrench',
  manual: 'sheet',
  homework: 'sheet',
  paper: 'sheet',
  wastepaper: 'sheet',
  menu: 'sheet',
  cert: 'sheet',
  birthproof: 'sheet',
  note: 'sheet',
  map: 'sheet',
  halfplan: 'sheet',
  sandwich: 'stack',
  bar: 'stack',
  cake: 'stack',
  battery: 'cell',
  battery2: 'cell',
  plunger: 'rod',
  joystick: 'rod',
  screw: 'bolt',
  sock: 'cloth',
  lottery: 'card',
  poker: 'card',
  antigrav: 'arrow',
  fuel: 'flask',
  theoryfuel: 'flask',
  taste: 'cloud',
  smoke: 'cloud',
  failedtaste: 'cloud',
  cloud: 'cloud',
  mood: 'sun',
  awkward: 'drop',
  sweat: 'drop',
  rock: 'rock',
  glitter: 'star',
  sparkle: 'star',
  wire: 'wire',
  bracket: 'bracket',
  signal: 'signal',
  windbreak: 'shield',
  shield: 'shield',
  bed: 'bed',
  bedframe: 'bed',
  tent: 'tent',
  shelter: 'tent',
  door: 'door',
  doorway: 'door',
  doorplate: 'door',
  bowl: 'bowl',
  hopefood: 'bowl',
  ration: 'bowl',
  optimistic: 'engine',
  engine: 'engine',
  spinner: 'engine',
  socialengine: 'engine',
  spiral: 'engine',
  speaker: 'engine',
  lostafternoon: 'clock',
  clock: 'clock',
  shop: 'shop',
  shopfront: 'shop',
  sign: 'sign',
  ks_shop: 'sign',
  person: 'person',
  fakecustomer: 'person',
  hands: 'hands',
  clapper: 'hands',
  blob: 'blob',
  blob2: 'blob',
  unclear: 'blob',
  unclear2: 'blob',
  gum: 'blob',
  question: 'question',
  halfget: 'question',
  scribble: 'scribble',
  alienink: 'scribble',
  aura: 'wave',
  wave: 'wave',
  complexmood: 'wave',
  alienmood: 'wave',
  dice: 'dice',
  gambler: 'dice',
  badge: 'badge',
  ks_signal: 'badge',
  medal: 'badge',
  ks_ship: 'badge',
  brick: 'brick',
  ks_shelter: 'brick',
  broken: 'broken',
  ks_fail: 'broken',
  candle: 'candle',
  ks_birthday: 'candle',
};

function shape(name: string, fill: string): JSX.Element {
  switch (name) {
    case 'ring':
      return (
        <>
          <circle cx="24" cy="24" r="13" fill={fill} />
          <circle cx="24" cy="24" r="5" fill="var(--paper)" />
        </>
      );
    case 'wrench':
      return (
        <>
          <path d="M14 34 30 18" />
          <path d="M27 15a7 7 0 1 0 9 9l-4-4 4-4z" fill={fill} />
          <circle cx="13" cy="35" r="4" fill={fill} />
        </>
      );
    case 'sheet':
      return (
        <>
          <path d="M12 10h17l7 7v21H12z" fill={fill} />
          <path d="M29 10v7h7" />
          <path d="M18 24h12M18 30h9" />
        </>
      );
    case 'stack':
      return (
        <>
          <path d="M10 19h28l-3 14H13z" fill={fill} />
          <path d="M13 19c4-7 18-7 22 0" />
          <path d="M17 26h14" />
        </>
      );
    case 'cell':
      return (
        <>
          <rect x="13" y="9" width="22" height="30" rx="5" fill={fill} />
          <path d="M20 9V6h8v3" />
          <path d="M20 20l4 4-4 6" />
        </>
      );
    case 'rod':
      return (
        <>
          <path d="M14 36 32 14" />
          <circle cx="35" cy="11" r="6" fill={fill} />
          <path d="M10 32l6 6" />
        </>
      );
    case 'bolt':
      return (
        <>
          <path d="M24 8l12 7v18l-12 7-12-7V15z" fill={fill} />
          <path d="M19 24h10M24 19v10" />
        </>
      );
    case 'cloth':
      return (
        <>
          <path d="M14 12h10l-2 12 10 4-2 8H13z" fill={fill} />
          <path d="M20 12v8" />
        </>
      );
    case 'card':
      return (
        <>
          <rect x="10" y="14" width="20" height="26" rx="3" fill={fill} transform="rotate(-8 20 27)" />
          <rect x="20" y="10" width="20" height="26" rx="3" fill="var(--paper)" />
          <path d="M26 17l4 5-4 5" />
        </>
      );
    case 'arrow':
      return (
        <>
          <path d="M24 40V14" />
          <path d="M14 24l10-11 10 11" fill={fill} />
        </>
      );
    case 'flask':
      return (
        <>
          <path d="M18 8h12v10l7 18a5 5 0 0 1-5 6H16a5 5 0 0 1-5-6l7-18z" fill={fill} />
          <path d="M14 28h20" />
        </>
      );
    case 'cloud':
      return (
        <>
          <path d="M12 30a7 7 0 0 1 2-13 9 9 0 0 1 17 2 6 6 0 0 1 1 11z" fill={fill} />
          <path d="M18 36h4M28 36h4" />
        </>
      );
    case 'sun':
      return (
        <>
          <circle cx="24" cy="24" r="9" fill={fill} />
          <path d="M24 7v5M24 36v5M7 24h5M36 24h5M12 12l4 4M32 32l4 4M36 12l-4 4M16 32l-4 4" />
        </>
      );
    case 'drop':
      return (
        <>
          <path d="M24 8c7 9 11 14 11 20a11 11 0 0 1-22 0c0-6 4-11 11-20z" fill={fill} />
          <path d="M20 31a4 4 0 0 0 4 4" />
        </>
      );
    case 'rock':
      return (
        <>
          <path d="M11 30l5-13 9-6 12 7 3 12-9 8H18z" fill={fill} />
          <path d="M20 19l4 7-3 5" />
        </>
      );
    case 'star':
      return (
        <path
          d="M24 8l4.6 9.6 10.4 1.4-7.6 7.4 1.9 10.6L24 32l-9.3 5 1.9-10.6L9 19l10.4-1.4z"
          fill={fill}
        />
      );
    case 'wire':
      return (
        <>
          <path d="M10 18c6 0 6 12 12 12s6-12 12-12" fill="none" />
          <circle cx="10" cy="18" r="3" fill={fill} />
          <circle cx="34" cy="18" r="3" fill={fill} />
        </>
      );
    case 'bracket':
      return (
        <>
          <path d="M14 12v24h22" fill="none" />
          <path d="M14 24h12" />
        </>
      );
    case 'signal':
      return (
        <>
          <circle cx="24" cy="34" r="4" fill={fill} />
          <path d="M15 27a13 13 0 0 1 18 0M9 20a22 22 0 0 1 30 0" />
        </>
      );
    case 'shield':
      return (
        <>
          <path d="M24 8l13 5v12c0 9-6 13-13 16-7-3-13-7-13-16V13z" fill={fill} />
          <path d="M18 24l4 4 8-9" />
        </>
      );
    case 'bed':
      return (
        <>
          <path d="M9 34V18M9 28h30v6M9 22h13v6" fill="none" />
          <rect x="12" y="12" width="9" height="6" rx="3" fill={fill} />
        </>
      );
    case 'tent':
      return (
        <>
          <path d="M24 9 44 39H4z" fill={fill} />
          <path d="M24 24l7 15M24 24l-7 15" />
        </>
      );
    case 'door':
      return (
        <>
          <rect x="13" y="8" width="22" height="33" rx="2" fill={fill} />
          <circle cx="29" cy="25" r="2.5" fill="var(--ink)" />
        </>
      );
    case 'bowl':
      return (
        <>
          <path d="M8 24h32a16 16 0 0 1-32 0z" fill={fill} />
          <path d="M18 18c0-4 3-4 3-8M27 18c0-4 3-4 3-8" />
        </>
      );
    case 'engine':
      return (
        <>
          <circle cx="24" cy="24" r="13" fill={fill} />
          <circle cx="24" cy="24" r="4" />
          <path d="M24 11v4M24 33v4M11 24h4M33 24h4" />
        </>
      );
    case 'clock':
      return (
        <>
          <circle cx="24" cy="24" r="15" fill={fill} />
          <path d="M24 15v10l7 4" />
        </>
      );
    case 'shop':
      return (
        <>
          <path d="M8 20l4-10h24l4 10z" fill={fill} />
          <path d="M11 20v20h26V20" />
          <path d="M20 40V28h8v12" />
        </>
      );
    case 'sign':
      return (
        <>
          <rect x="8" y="12" width="32" height="16" rx="3" fill={fill} />
          <path d="M16 32v10M32 32v10" />
        </>
      );
    case 'person':
      return (
        <>
          <circle cx="24" cy="16" r="7" fill={fill} />
          <path d="M10 40c2-9 8-13 14-13s12 4 14 13" fill={fill} />
        </>
      );
    case 'hands':
      return (
        <>
          <path d="M10 30l6-12M38 30l-6-12" />
          <circle cx="12" cy="35" r="5" fill={fill} />
          <circle cx="36" cy="35" r="5" fill={fill} />
        </>
      );
    case 'blob':
      return (
        <>
          <path d="M14 20c0-8 8-12 15-9s9 12 6 19-13 9-18 4-6-8-3-14z" fill={fill} />
          <circle cx="21" cy="23" r="1.6" fill="var(--ink)" />
          <circle cx="29" cy="25" r="1.6" fill="var(--ink)" />
        </>
      );
    case 'question':
      return (
        <>
          <path d="M16 17a8 8 0 1 1 10 8c-2 1-2 3-2 5" fill="none" />
          <circle cx="24" cy="37" r="2.6" fill={fill} />
        </>
      );
    case 'scribble':
      return (
        <>
          <path d="M10 20c6-10 8 10 14 0s8 10 14 0" />
          <path d="M10 32c6-10 8 10 14 0s8 10 14 0" />
        </>
      );
    case 'wave':
      return (
        <>
          <path d="M8 28c5-10 9 10 14 0s9 10 14 0" stroke={fill} />
          <path d="M8 20c5-10 9 10 14 0s9 10 14 0" />
        </>
      );
    case 'dice':
      return (
        <>
          <rect x="10" y="10" width="28" height="28" rx="6" fill={fill} />
          <circle cx="18" cy="18" r="2.2" fill="var(--ink)" />
          <circle cx="30" cy="30" r="2.2" fill="var(--ink)" />
          <circle cx="24" cy="24" r="2.2" fill="var(--ink)" />
        </>
      );
    case 'badge':
      return (
        <>
          <circle cx="24" cy="21" r="12" fill={fill} />
          <path d="M18 31l-3 11 9-4 9 4-3-11" />
        </>
      );
    case 'brick':
      return (
        <>
          <rect x="8" y="16" width="32" height="18" rx="3" fill={fill} />
          <path d="M8 25h32M20 16v9M28 25v9" />
        </>
      );
    case 'broken':
      return (
        <>
          <circle cx="24" cy="22" r="12" fill={fill} />
          <path d="M24 12l-5 9 7 3-5 8" stroke="var(--paper)" />
          <path d="M18 33l-3 9 9-4 9 4-3-9" />
        </>
      );
    case 'candle':
      return (
        <>
          <path d="M18 22h12v18H18z" fill={fill} />
          <path d="M24 22V14" />
          <path d="M24 6c3 4 3 6 0 8-3-2-3-4 0-8z" fill="var(--yellow)" />
        </>
      );
    default:
      return <circle cx="24" cy="24" r="12" fill={fill} />;
  }
}

interface Props {
  icon: string;
  color: StickerColor;
  size?: number;
}

export function ItemIcon({ icon, color, size = 40 }: Props) {
  const name = SHAPE_OF[icon] ?? 'blob';
  return (
    <svg
      className="item__icon"
      viewBox="0 0 48 48"
      width={size}
      height={size}
      aria-hidden="true"
      style={{ width: size, height: size, flex: '0 0 auto' }}
    >
      <g
        stroke="var(--ink)"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        {shape(name, COLOR_VAR[color])}
      </g>
    </svg>
  );
}
