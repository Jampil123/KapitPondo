import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { LayoutDashboard, Users, Boxes, Activity, BarChart3, MessageSquareWarning, SlidersHorizontal } from 'lucide-react';
import kapitlogo from '../../assets/images/KapitPondoL.png';
import type { AdminMe } from '../../context/AdminAuthContext';
import { Tooltip } from '../ui/Tooltip';
import { AccountMenu } from './AccountMenu';
import { SidebarControl, type SidebarMode } from './SidebarControl';

export type SidebarBadges = { pending_verifications: number | null; new_complaints: number | null };
type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean; badgeKey?: keyof SidebarBadges };

const HOME_NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/verifications', label: 'Users', icon: Users, badgeKey: 'pending_verifications' },
  { to: '/groups', label: 'Fund Groups', icon: Boxes },
  { to: '/audit', label: 'Activity', icon: Activity },
  { to: '/complaints', label: 'Complaints', icon: MessageSquareWarning, badgeKey: 'new_complaints' },
  { to: '/reports', label: 'Reports & Analytics', icon: BarChart3 },
  { to: '/system-config', label: 'Configuration', icon: SlidersHorizontal },
];


function NavSection({ title, items, badges, expanded, showTooltips }: {
  title: string;
  items: NavItem[];
  badges: SidebarBadges;
  expanded: boolean;
  showTooltips: boolean;
}) {
  return (
    <div className="mb-5">
      {expanded ? (
        <div className="px-3.5 mb-2 text-[11px] font-semibold tracking-wider text-white/40 uppercase whitespace-nowrap">{title}</div>
      ) : (
        <div className="h-2" />
      )}
      <div className="space-y-1.5">
        {items.map((n) => {
          const badge = n.badgeKey ? badges[n.badgeKey] : null;
          return (
            <Tooltip key={n.to} label={badge ? `${n.label} (${badge})` : n.label} disabled={!showTooltips}>
              <NavLink to={n.to} end={n.end}
                className={({ isActive }) =>
                  `flex items-center rounded-xl py-3 text-sm transition-colors ${expanded ? 'gap-3 px-3.5' : 'justify-center px-0'} ${
                    isActive ? 'bg-brand text-white font-semibold' : 'text-white/60 hover:bg-white/5'
                  }`
                }>
                {({ isActive }) => (
                  <>
                    <span className="relative shrink-0 flex items-center justify-center">
                      <n.icon size={20} color={isActive ? '#fff' : 'rgba(255, 255, 255, 0.62)'} />
                      {!expanded && badge ? (
                        <span className="absolute -top-1 -right-1.5 w-2.5 h-2.5 rounded-full bg-brand ring-2 ring-[#2A3E4B]" />
                      ) : null}
                    </span>
                    {expanded ? (
                      <>
                        <span className="flex-1 whitespace-nowrap">{n.label}</span>
                        {badge ? (
                          <span className="min-w-5 h-5 px-1.5 rounded-full bg-brand text-white text-[11px] font-semibold flex items-center justify-center">
                            {badge}
                          </span>
                        ) : null}
                      </>
                    ) : null}
                  </>
                )}
              </NavLink>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}

type SidebarProps = {
  badges: SidebarBadges;
  admin: AdminMe | null;
  onSignOut: () => void | Promise<void>;
};

const MODE_KEY = 'kp.admin.sidebarMode';

function readMode(): SidebarMode {
  try {
    const v = localStorage.getItem(MODE_KEY);
    if (v === 'expanded' || v === 'collapsed' || v === 'hover') return v;
  } catch { /* storage unavailable */ }
  return 'expanded';
}

export function Sidebar({ badges, admin, onSignOut }: SidebarProps) {
  const [mode, setModeState] = useState<SidebarMode>(readMode);
  const [hovering, setHovering] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [controlOpen, setControlOpen] = useState(false);
  // The account menu needs the full width to render, so it expands in any mode.
  const expanded = mode === 'expanded' || menuOpen || (mode === 'hover' && (hovering || controlOpen));
  // Hover mode already reveals labels by expanding, so tooltips are only for pinned-collapsed.
  const showTooltips = mode === 'collapsed' && !expanded;

  function setMode(next: SidebarMode) {
    setModeState(next);
    try { localStorage.setItem(MODE_KEY, next); } catch { /* storage unavailable */ }
  }

  return (
    <aside
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      className="sticky top-0 h-screen shrink-0 flex flex-col text-white overflow-hidden transition-[width] duration-200 ease-in-out"
      style={{ width: expanded ? 248 : 72, background: '#2A3E4B' }}
    >
      <div className={`flex items-center pt-6 pb-7 ${expanded ? 'gap-3 pl-6 pr-4' : 'flex-col gap-2 px-0'}`}>
        <img src={kapitlogo} alt="KapitPondo" className="w-10 h-10 shrink-0 object-contain" />
        {expanded ? (
          <div className="flex-1 min-w-0 whitespace-nowrap">
            <div className="text-base font-bold">KapitPondo</div>
            <div className="text-[11px] text-white/50">Admin Console</div>
          </div>
        ) : null}
        <SidebarControl mode={mode} onModeChange={setMode} onOpenChange={setControlOpen} />
      </div>

      <nav className="flex-1 px-3.5 overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <NavSection title="Home" items={HOME_NAV} badges={badges} expanded={expanded} showTooltips={showTooltips} />
      </nav>

      <div className="px-3.5 pb-5">
        <AccountMenu admin={admin} onSignOut={onSignOut} expanded={expanded} showTooltip={showTooltips} onOpenChange={setMenuOpen} />
      </div>
    </aside>
  );
}
