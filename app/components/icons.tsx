// Small inline SVG icon components (no icon library).
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;
const base = (props: P) => ({
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  ...props,
});

export const IconOverview = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="3" width="7" height="9" rx="1" />
    <rect x="14" y="3" width="7" height="5" rx="1" />
    <rect x="14" y="12" width="7" height="9" rx="1" />
    <rect x="3" y="16" width="7" height="5" rx="1" />
  </svg>
);

export const IconSecurity = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);

export const IconCost = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v10M9.5 9.5a2.5 2 0 0 1 2.5-1.5c1.4 0 2.5.7 2.5 1.8 0 2.4-5 1.2-5 3.6 0 1.1 1.1 1.8 2.5 1.8a2.5 2 0 0 0 2.5-1.5" />
  </svg>
);

export const IconEnergy = (p: P) => (
  <svg {...base(p)}>
    <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" />
  </svg>
);

export const IconAudit = (p: P) => (
  <svg {...base(p)}>
    <path d="M9 3h6l2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5l2-2z" />
    <path d="M9 8h6M9 12h6M9 16h4" />
  </svg>
);

export const IconMenu = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

export const IconSearch = (p: P) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </svg>
);

export const IconChevron = (p: P) => (
  <svg {...base(p)}>
    <path d="M9 6l6 6-6 6" />
  </svg>
);

export const IconClose = (p: P) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const IconLeaf = (p: P) => (
  <svg {...base(p)}>
    <path d="M11 20A7 7 0 0 1 4 13c0-5 4-9 16-9 0 12-4 16-9 16z" />
    <path d="M9 17c3-3 5-5 8-7" />
  </svg>
);

export const IconAlert = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3l9 16H3l9-16z" />
    <path d="M12 10v4M12 17h.01" />
  </svg>
);

export const IconBucket = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 7h14l-1.5 12.5a1 1 0 0 1-1 .5H7.5a1 1 0 0 1-1-.5L5 7z" />
    <path d="M4 7h16M9 4h6" />
  </svg>
);

export const IconDatabase = (p: P) => (
  <svg {...base(p)}>
    <ellipse cx="12" cy="6" rx="8" ry="3" />
    <path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
  </svg>
);

export const IconVm = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="4" width="18" height="13" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </svg>
);

export const IconStorage = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="5" width="18" height="5" rx="1" />
    <rect x="3" y="14" width="18" height="5" rx="1" />
    <path d="M7 7.5h.01M7 16.5h.01" />
  </svg>
);

export const IconCheck = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 13l4 4L19 7" />
  </svg>
);

export const IconClock = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

export const IconInfo = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </svg>
);

export const IconRules = (p: P) => (
  <svg {...base(p)}>
    <path d="M9 3H5a2 2 0 0 0-2 2v4" />
    <path d="M15 3h4a2 2 0 0 1 2 2v4" />
    <path d="M9 21H5a2 2 0 0 1-2-2v-4" />
    <path d="M15 21h4a2 2 0 0 0 2-2v-4" />
    <path d="M9 9h6v6H9z" />
  </svg>
);

export const IconAgents = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="8" r="3.2" />
    <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
    <path d="M19 7l1.5-1.5M5 7L3.5 5.5" />
  </svg>
);

export const IconThreats = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-4z" />
    <path d="M12 8v5" />
    <path d="M12 16h.01" />
  </svg>
);

export const IconWorkflows = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="3" width="6" height="6" rx="1" />
    <rect x="15" y="15" width="6" height="6" rx="1" />
    <path d="M9 6h6a3 3 0 0 1 3 3v6" />
  </svg>
);

import type { ResourceType } from "@/app/lib/types";
export function ResourceIcon({
  type,
  ...p
}: { type: ResourceType } & P) {
  switch (type) {
    case "bucket":
      return <IconBucket {...p} />;
    case "database":
      return <IconDatabase {...p} />;
    case "vm":
      return <IconVm {...p} />;
    case "storage":
      return <IconStorage {...p} />;
    default:
      return <IconStorage {...p} />;
  }
}
