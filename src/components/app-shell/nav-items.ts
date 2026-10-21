import {
  Building2,
  DoorOpen,
  FileText,
  LayoutDashboard,
  type LucideIcon,
  MessageSquare,
  PoundSterling,
  Settings,
  UserPlus,
  ShieldCheck,
  Wrench,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Shown but not clickable until the feature is built. */
  comingSoon?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Properties", href: "/properties", icon: Building2 },
  { label: "Occupancy", href: "/occupancy", icon: DoorOpen },
  { label: "Onboarding", href: "/applicants", icon: UserPlus },
  { label: "Tenancies", href: "/tenancies", icon: FileText, comingSoon: true },
  { label: "Rent", href: "/rent", icon: PoundSterling, comingSoon: true },
  { label: "Compliance", href: "/compliance", icon: ShieldCheck, comingSoon: true },
  { label: "Maintenance", href: "/maintenance", icon: Wrench, comingSoon: true },
  { label: "Messages", href: "/messages", icon: MessageSquare },
  { label: "Settings", href: "/settings", icon: Settings },
];
