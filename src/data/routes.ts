export interface NavRoute {
  name: string;
  path: string;
  colorClass: string;
  badgeLabel?: string;
}

export const MAIN_ROUTES: NavRoute[] = [
  {
    name: "HOME",
    path: "/",
    colorClass: "bg-google-blue text-primary-foreground hover:bg-blue-600",
  },
  {
    name: "ABOUT",
    path: "/about",
    colorClass: "bg-foreground text-background hover:bg-foreground/90",
  },
  {
    name: "TEAM",
    path: "/team",
    colorClass: "bg-google-red text-primary-foreground hover:bg-red-600",
  },
  {
    name: "EVENTS",
    path: "/events",
    colorClass: "bg-google-yellow text-foreground hover:bg-yellow-400",
  },
  {
    name: "GALLERY",
    path: "/gallery",
    colorClass: "bg-google-green text-primary-foreground hover:bg-emerald-600",
  },
];

export const FOOTER_QUICK_LINKS = [
  { name: "Home", href: "/" },
  { name: "About", href: "/about" },
  { name: "Team", href: "/team" },
  { name: "Events", href: "/events" },
  { name: "Gallery", href: "/gallery" },
];

// The former forum's (and college's) social accounts were removed; Sophia Forum's own accounts are added once confirmed.
export const SOCIAL_LINKS: { name: string; href: string; bgClass: string; icon: string }[] = [];
