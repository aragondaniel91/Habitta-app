import type { ReactNode, SVGProps } from 'react';

export type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & { size?: number };

type IconBaseProps = IconProps & { children: ReactNode };

function IconBase({ children, size = 20, ...props }: IconBaseProps) {
  return (
    <svg
      {...props}
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      {children}
    </svg>
  );
}

const strokeProps = {
  stroke: 'currentColor',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  strokeWidth: 1.8,
};

export function HomeIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path {...strokeProps} d="m3 10 9-7 9 7" />
      <path {...strokeProps} d="M5 9.5V21h14V9.5M9 21v-7h6v7" />
    </IconBase>
  );
}

export function DashboardIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect {...strokeProps} height="7" rx="2" width="7" x="3" y="3" />
      <rect {...strokeProps} height="11" rx="2" width="7" x="14" y="3" />
      <rect {...strokeProps} height="7" rx="2" width="7" x="3" y="14" />
      <rect {...strokeProps} height="3" rx="1.5" width="7" x="14" y="18" />
    </IconBase>
  );
}

export function UnitsIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path {...strokeProps} d="M4 21V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16" />
      <path {...strokeProps} d="M2 21h20M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2" />
    </IconBase>
  );
}

export function PeopleIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle {...strokeProps} cx="9" cy="8" r="3" />
      <path
        {...strokeProps}
        d="M3.5 20a5.5 5.5 0 0 1 11 0M16 4.5a3 3 0 0 1 0 6M17 14a5 5 0 0 1 3.5 4.8"
      />
    </IconBase>
  );
}

export function FeesIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path {...strokeProps} d="M5 3h14v18l-3-2-4 2-4-2-3 2V3Z" />
      <path {...strokeProps} d="M8 8h8M8 12h8M8 16h4" />
    </IconBase>
  );
}

export function PaymentsIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect {...strokeProps} height="14" rx="3" width="20" x="2" y="5" />
      <path {...strokeProps} d="M2 10h20M6 15h4" />
    </IconBase>
  );
}

export function ExpensesIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle {...strokeProps} cx="12" cy="12" r="9" />
      <path
        {...strokeProps}
        d="M12 7v10M15 9.5c-.7-1-1.7-1.5-3-1.5-1.7 0-3 1-3 2.3 0 1.4 1.2 2 3.2 2.4 1.8.3 2.8 1 2.8 2.3 0 1.2-1.2 2-3 2-1.4 0-2.6-.5-3.3-1.5"
      />
    </IconBase>
  );
}

export function MaintenanceIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path
        {...strokeProps}
        d="M14.5 6.5a4 4 0 0 0-5-5l2.2 2.2-2.5 2.5L7 4a4 4 0 0 0 5 5l7.5 7.5a2.1 2.1 0 0 1-3 3L9 12"
      />
      <path {...strokeProps} d="m5.5 13.5-3 3a2.1 2.1 0 0 0 3 3l3-3M15 4l5-2-2 5" />
    </IconBase>
  );
}

export function ReportsIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path {...strokeProps} d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </IconBase>
  );
}

export function CommunityIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path {...strokeProps} d="M4 19v-8l8-6 8 6v8" />
      <path {...strokeProps} d="M8 19v-5h8v5M2 19h20" />
    </IconBase>
  );
}

export function VoteIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path {...strokeProps} d="M5 4h14v16H5zM8 8h8M8 12h5" />
      <path {...strokeProps} d="m8 16 1.8 1.8L13 14.5" />
    </IconBase>
  );
}

export function RequestsIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path
        {...strokeProps}
        d="M6 3h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-7l-5 3v-3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"
      />
      <path {...strokeProps} d="M8 8h8M8 12h5" />
    </IconBase>
  );
}

export function AnnouncementsIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path {...strokeProps} d="M4 13V9h4l9-4v12l-9-4H4Z" />
      <path {...strokeProps} d="m8 13 1 6H6l-1-6M20 8v6" />
    </IconBase>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle {...strokeProps} cx="12" cy="12" r="3" />
      <path
        {...strokeProps}
        d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"
      />
    </IconBase>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path {...strokeProps} d="M4 7h16M4 12h16M4 17h16" />
    </IconBase>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path {...strokeProps} d="m15 18-6-6 6-6" />
    </IconBase>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path {...strokeProps} d="m7 10 5 5 5-5" />
    </IconBase>
  );
}

export function LogOutIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path {...strokeProps} d="M10 17l5-5-5-5M15 12H3M15 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
    </IconBase>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path {...strokeProps} d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
    </IconBase>
  );
}

export function CheckCircleIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle {...strokeProps} cx="12" cy="12" r="9" />
      <path {...strokeProps} d="m8 12 2.5 2.5L16 9" />
    </IconBase>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path {...strokeProps} d="M5 12h14M14 7l5 5-5 5" />
    </IconBase>
  );
}
