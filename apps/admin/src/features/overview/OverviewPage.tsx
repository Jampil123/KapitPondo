/**
 * apps/admin/src/features/overview/OverviewPage.tsx — the System-Wide
 * Dashboard: platform-level monitoring only.
 *   User statistics        — verified ring, total, then the rest in one band
 *   New this week          — registrations and new fund groups per day
 *   Fund group statistics  — donut + active / closed / archived
 *   Recent activity        — one timeline (verifications, suspensions,
 *                            registrations, new groups, admin actions)
 * Data: GET /admin/monitoring/dashboard (monitoring/dashboard.service.js).
 * Financial amounts are deliberately left off.
 */
import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Boxes, Search, Activity, ArrowRight, Check, X, Ban, RotateCcw, UserPlus, SlidersHorizontal,
} from 'lucide-react';
import { api } from '../../lib/api';

type FeedKind = 'verification' | 'suspension' | 'registration' | 'group' | 'system';
type FeedItem = {
  id: string; kind: FeedKind; action: string; target_type: string;
  target_name: string | null; actor_name: string | null; reason: string | null; created_at: string;
};
type Day = { date: string; registrations: number; groups: number };
type Dashboard = {
  users: { total: number; pending: number; verified: number; rejected: number; resubmission_required: number; suspended: number };
  groups: { total: number; active: number; closed: number; archived: number; suspended: number };
  activity: {
    window_days: number;
    daily: Day[];
    new_registrations: { count: number };
    new_groups: { count: number };
    feed: FeedItem[];
  };
};

// Matches services/api monitoring.service.js `search()`.
type SearchMember = { id: string; full_name?: string; email?: string; phone?: string; verification_status?: string };
type SearchGroupHit = { id: string; name: string; fund_code?: string; status?: string };
type SearchAuditHit = { id: string; action: string; target_type?: string; created_at: string };
type SearchResults = { members: SearchMember[]; groups: SearchGroupHit[]; audit: SearchAuditHit[] };

// Chart series — validated for lightness, chroma, CVD separation and 3:1
// contrast on the card surface (dataviz validate_palette.js).
const SERIES = { registrations: '#0B5F8A', groups: '#2E9BD6' } as const;
const GROUP_COLORS = { active: '#2F7D5A', closed: '#8DB5A2', archived: '#FFFFFF' } as const;
const FEED_ROWS = 6;

const FILTERS: { key: 'all' | FeedKind; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'verification', label: 'Verifications' },
  { key: 'suspension', label: 'Suspensions' },
  { key: 'system', label: 'System' },
];

const TONE: Record<string, string> = {
  ok: 'bg-success-bg text-success',
  warn: 'bg-warning-bg text-warning',
  danger: 'bg-danger-bg text-danger',
  accent: 'bg-surface-alt text-brand-dark',
  muted: 'bg-surface-alt text-secondary',
};

// What a system-audit action reads as after the admin's name.
const SYSTEM_VERB: Record<string, string> = {
  'config.updated': 'updated system configuration',
  'announcement.published': 'published an announcement',
  'announcement.saved': 'saved an announcement',
  'announcement.deleted': 'deleted an announcement',
  'policy.published': 'published a policy',
  'policy.drafted': 'drafted a policy',
  'policy.draft_deleted': 'deleted a policy draft',
};

// Title, subtitle label, icon and tone for one feed entry.
function present(e: FeedItem): { title: string; label: string; icon: ComponentType<{ size?: number }>; tone: string } {
  const name = e.target_name ?? 'Unknown';
  switch (e.action) {
    case 'account.verified': return { title: `${name} was verified`, label: 'Account verification', icon: Check, tone: 'ok' };
    case 'account.rejected': return { title: `${name} verification rejected`, label: 'Account verification', icon: X, tone: 'warn' };
    case 'account.resubmission_requested': return { title: `${name} asked to re-submit ID`, label: 'Account verification', icon: RotateCcw, tone: 'warn' };
    case 'account.suspended': return { title: `${name} was suspended`, label: 'Suspension', icon: Ban, tone: 'danger' };
    case 'account.reinstated': return { title: `${name} was reinstated`, label: 'Suspension', icon: RotateCcw, tone: 'ok' };
    case 'group.suspended': return { title: `Fund group ${name} suspended`, label: 'Suspension', icon: Ban, tone: 'danger' };
    case 'group.reinstated': return { title: `Fund group ${name} reinstated`, label: 'Suspension', icon: RotateCcw, tone: 'ok' };
    case 'member.registered': return { title: `${name} registered`, label: 'New registration', icon: UserPlus, tone: 'accent' };
    case 'group.created': return { title: `New fund group: ${name}`, label: 'Fund group', icon: Boxes, tone: 'accent' };
    default: {
      const verb = SYSTEM_VERB[e.action] ?? e.action.replace(/[._]/g, ' ');
      return { title: `${e.actor_name ?? 'Admin'} ${verb}`, label: 'System', icon: SlidersHorizontal, tone: 'muted' };
    }
  }
}

function relTime(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return '—';
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return 'Yesterday';
  if (day < 30) return `${day} days ago`;
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function initials(n?: string | null) { return (n ?? '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'; }

function Overline({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">{children}</div>;
}

// Progress ring for the verified share of users.
function Ring({ pct }: { pct: number }) {
  const r = 30; const c = 2 * Math.PI * r;
  return (
    <svg width="76" height="76" viewBox="0 0 76 76" className="shrink-0" role="img" aria-label={`${pct}% verified`}>
      <circle cx="38" cy="38" r={r} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="8" />
      <circle cx="38" cy="38" r={r} fill="none" stroke="#9CC9DB" strokeWidth="8" strokeLinecap="round"
        strokeDasharray={`${(pct / 100) * c} ${c}`} transform="rotate(-90 38 38)" />
      <text x="38" y="38" textAnchor="middle" style={{ fontSize: 15, fontWeight: 700, fill: '#fff' }}>{pct}%</text>
      <text x="38" y="51" textAnchor="middle" style={{ fontSize: 8.5, fill: 'rgba(255,255,255,0.6)' }}>verified</text>
    </svg>
  );
}

// Fund groups split into segments, 2px gaps between them.
function Donut({ parts, total }: { parts: { value: number; color: string }[]; total: number }) {
  const r = 38; const c = 2 * Math.PI * r;
  const shown = parts.filter((p) => p.value > 0);
  const gap = shown.length > 1 ? 2 : 0;
  let offset = 0;
  return (
    <svg width="104" height="104" viewBox="0 0 104 104" className="shrink-0" role="img" aria-label={`${total} fund groups`}>
      <circle cx="52" cy="52" r={r} fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="12" />
      {total > 0 && shown.map((p, i) => {
        const len = (p.value / total) * c;
        const el = (
          <circle key={i} cx="52" cy="52" r={r} fill="none" stroke={p.color} strokeWidth="12"
            strokeDasharray={`${Math.max(len - gap, 0)} ${c - Math.max(len - gap, 0)}`} strokeDashoffset={-offset} transform="rotate(-90 52 52)" />
        );
        offset += len;
        return el;
      })}
      <text x="52" y="55" textAnchor="middle" style={{ fontSize: 24, fontWeight: 700, fill: 'var(--color-ink)' }}>{total}</text>
      <text x="52" y="69" textAnchor="middle" style={{ fontSize: 9, fill: 'var(--color-secondary)' }}>total groups</text>
    </svg>
  );
}

function BandStat({ label, value, color, to }: { label: string; value: number | undefined; color: string; to: string }) {
  return (
    <Link to={to} className="min-w-0 px-6 border-l border-white/10 hover:opacity-80">
      <div className="text-2xl font-bold" style={{ color }}>{value ?? '—'}</div>
      <div className="text-xs text-white/75 mt-0.5 whitespace-nowrap">{label}</div>
    </Link>
  );
}

// Grouped bars — registrations and new fund groups per day — with a per-bar
// hover tooltip. Thin marks, rounded tops anchored to the baseline.
function WeekChart({ days }: { days: Day[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((d) => Math.max(d.registrations, d.groups)));
  const H = 84;
  const today = days[days.length - 1]?.date;
  const weekday = (iso: string) => new Date(`${iso}T12:00:00+08:00`).toLocaleDateString('en-PH', { weekday: 'short', timeZone: 'Asia/Manila' });
  const bar = (v: number) => (v === 0 ? 2 : Math.max(4, (v / max) * H));

  return (
    <div className="relative">
      <div className="grid grid-cols-7 items-end border-b border-line" style={{ height: H + 4 }}>
        {days.map((d, i) => (
          <div key={d.date} className="relative flex items-end justify-center gap-0.5 h-full cursor-default"
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <div className="w-3.5 rounded-t" style={{ height: bar(d.registrations), background: d.registrations ? SERIES.registrations : 'var(--color-line)' }} />
            <div className="w-3.5 rounded-t" style={{ height: bar(d.groups), background: d.groups ? SERIES.groups : 'var(--color-line)' }} />
            {hover === i && (
              <div className="absolute bottom-full mb-1.5 z-10 whitespace-nowrap rounded-lg bg-ink text-white text-[11px] px-2.5 py-1.5 shadow-lg pointer-events-none">
                <div className="font-semibold mb-0.5">{new Date(`${d.date}T12:00:00+08:00`).toLocaleDateString('en-PH', { weekday: 'long', month: 'short', day: 'numeric' })}</div>
                <div>{d.registrations} registration{d.registrations === 1 ? '' : 's'}</div>
                <div>{d.groups} fund group{d.groups === 1 ? '' : 's'}</div>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 mt-2">
        {days.map((d) => (
          <div key={d.date} className={`text-center text-[11px] ${d.date === today ? 'font-semibold text-ink' : 'text-secondary'}`}>{weekday(d.date)}</div>
        ))}
      </div>
    </div>
  );
}

export function OverviewPage() {
  const nav = useNavigate();
  const [d, setD] = useState<Dashboard | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | FeedKind>('all');

  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResults | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!searchOpen) return;
    function onClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [searchOpen]);

  // Debounced global search — scans members, groups, and the audit log via
  // GET /admin/search (services/api monitoring.service.js `search()`).
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      // Clearing stale results when the term gets too short.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const r = await api.get<SearchResults>(`/admin/search?q=${encodeURIComponent(term)}`);
        setResults(r);
      } catch {
        setResults({ members: [], groups: [], audit: [] });
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  async function load() {
    try { setD(await api.get<Dashboard>('/admin/monitoring/dashboard')); setLoadErr(null); }
    catch (e) { setLoadErr((e as Error).message || 'Could not load the dashboard.'); }
  }
  // Standard data-fetch-on-mount effect; the setState calls inside `load` are
  // async (after the awaited request resolves), not synchronous in the effect body.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, []);

  const u = d?.users;
  const g = d?.groups;
  const a = d?.activity;
  const verifiedPct = u && u.total ? Math.round((u.verified / u.total) * 100) : 0;
  const feed = useMemo(
    () => (a?.feed ?? []).filter((e) => filter === 'all' || e.kind === filter).slice(0, FEED_ROWS),
    [a, filter],
  );

  return (
    // @container: the grids below react to the width the sidebar leaves us.
    <div className="@container mx-auto max-w-8xl px-4 sm:px-8 pt-6 pb-8 space-y-5">

      <div className="relative max-w-[380px] mb-1" ref={searchRef}>
        <div className="flex items-center gap-2.5 bg-surface-alt rounded-xl px-3.5 py-2.5">
          <Search size={18} className="text-muted shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setSearchOpen(true)}
            placeholder="Search users, groups, activity…"
            className="w-full bg-transparent text-sm text-ink placeholder:text-muted outline-none"
          />
        </div>

        {searchOpen && query.trim().length >= 2 ? (
          <div className="absolute left-0 right-0 top-full mt-2 rounded-xl bg-surface border border-line shadow-lg overflow-hidden z-20 max-h-96 overflow-y-auto">
            {searching ? (
              <div className="px-4 py-6 text-center text-sm text-muted">Searching…</div>
            ) : !results || (results.members.length === 0 && results.groups.length === 0 && results.audit.length === 0) ? (
              <div className="px-4 py-6 text-center text-sm text-muted">No results for "{query.trim()}".</div>
            ) : (
              <>
                {results.members.length > 0 && (
                  <div>
                    <div className="px-4 pt-3 pb-1 text-[11px] font-semibold text-muted uppercase tracking-wide">Users</div>
                    {results.members.map((r) => (
                      <button key={r.id} onClick={() => { setSearchOpen(false); nav('/verifications?view=all'); }}
                              className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-alt">
                        <div className="w-8 h-8 rounded-full bg-surface-alt text-brand-dark flex items-center justify-center text-[11px] font-semibold shrink-0">{initials(r.full_name)}</div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] text-ink truncate">{r.full_name ?? 'Unnamed'}</div>
                          <div className="text-[11px] text-muted truncate">{r.email ?? r.phone ?? ''}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {results.groups.length > 0 && (
                  <div>
                    <div className="px-4 pt-3 pb-1 text-[11px] font-semibold text-muted uppercase tracking-wide border-t border-line">Groups</div>
                    {results.groups.map((r) => (
                      <button key={r.id} onClick={() => { setSearchOpen(false); nav(`/groups/${r.id}`); }}
                              className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-alt">
                        <div className="w-8 h-8 rounded-lg bg-surface-alt text-brand-dark flex items-center justify-center shrink-0"><Boxes size={15} /></div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] text-ink truncate">{r.name}</div>
                          <div className="text-[11px] text-muted truncate">{r.fund_code ?? ''}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {results.audit.length > 0 && (
                  <div>
                    <div className="px-4 pt-3 pb-1 text-[11px] font-semibold text-muted uppercase tracking-wide border-t border-line">Activity</div>
                    {results.audit.map((r) => (
                      <button key={r.id} onClick={() => { setSearchOpen(false); nav('/audit'); }}
                              className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-alt">
                        <div className="w-8 h-8 rounded-lg bg-surface-alt text-brand-dark flex items-center justify-center shrink-0"><Activity size={15} /></div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] text-ink truncate">{r.action.replace(/[._]/g, ' ')}</div>
                          <div className="text-[11px] text-muted truncate">{new Date(r.created_at).toLocaleString('en-PH', { month: 'short', day: 'numeric' })}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        ) : null}
      </div>

      {loadErr && !d ? <div className="rounded-lg bg-danger-bg text-danger text-sm px-3 py-2">{loadErr}</div> : null}

      {/* User statistics */}
      <section className="rounded-2xl bg-[#2A3E4B] text-white px-6 py-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[15px] font-semibold">User statistics</h2>
          <Link to="/verifications?view=all" className="flex items-center gap-1 text-xs font-semibold text-white/80 hover:text-white">View all users <ArrowRight size={13} /></Link>
        </div>
        <div className="flex flex-wrap items-center gap-y-4">
          <Link to="/verifications?view=all" className="flex items-center gap-4 pr-6 hover:opacity-90">
            <Ring pct={verifiedPct} />
            <div>
              <div className="text-4xl font-bold leading-none">{u?.total ?? '—'}</div>
              <div className="text-xs text-white/75 mt-1.5">Total registered users</div>
            </div>
          </Link>
          <BandStat label="Verified users" value={u?.verified} color="#9FE0C0" to="/verifications?view=all&status=verified" />
          <BandStat label="Pending verifications" value={u?.pending} color="#F5CF8A" to="/verifications?tab=pending" />
          <BandStat label="Rejected verifications" value={u?.rejected} color="#F3A3A3" to="/verifications?tab=rejected" />
          <BandStat label="Suspended accounts" value={u?.suspended} color="#C9D6DE" to="/verifications?view=suspended" />
        </div>
      </section>

      <div className="grid grid-cols-1 @4xl:grid-cols-[1.15fr_1fr] gap-5 items-start">
        <div className="space-y-5">
          {/* New this week */}
          <section className="rounded-2xl bg-surface border border-line px-6 py-5">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <Overline>System activity</Overline>
                <h2 className="text-[15px] font-semibold text-ink mt-0.5">New this week</h2>
              </div>
              {/* Legend — totals for the week beside each series' swatch. */}
              <div className="flex items-center gap-4 text-xs text-secondary">
                <Link to="/verifications?view=all" className="flex items-center gap-1.5 hover:text-ink">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: SERIES.registrations }} />
                  <span className="text-base font-bold text-ink">{a?.new_registrations.count ?? '—'}</span> registrations
                </Link>
                <Link to="/groups" className="flex items-center gap-1.5 hover:text-ink">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: SERIES.groups }} />
                  <span className="text-base font-bold text-ink">{a?.new_groups.count ?? '—'}</span> fund groups
                </Link>
              </div>
            </div>
            {a ? <WeekChart days={a.daily} /> : <div className="h-28" />}
          </section>

          {/* Fund group statistics */}
          <section className="rounded-2xl bg-success-bg px-6 py-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[15px] font-semibold text-ink">Fund group statistics</h2>
              <Link to="/groups" className="flex items-center gap-1 text-xs font-semibold text-ink hover:text-brand-dark">View all <ArrowRight size={13} /></Link>
            </div>
            <div className="flex items-center gap-7">
              <Donut total={g?.total ?? 0} parts={[
                { value: g?.active ?? 0, color: GROUP_COLORS.active },
                { value: g?.closed ?? 0, color: GROUP_COLORS.closed },
                { value: g?.archived ?? 0, color: GROUP_COLORS.archived },
              ]} />
              <div className="flex-1 divide-y divide-black/5">
                {([
                  ['Active fund groups', g?.active, GROUP_COLORS.active, '/groups?status=active'],
                  ['Closed fund groups', g?.closed, GROUP_COLORS.closed, '/groups?status=closed'],
                  ['Archived fund groups', g?.archived, GROUP_COLORS.archived, '/groups?status=archived'],
                ] as const).map(([label, value, color, to]) => (
                  <Link key={label} to={to} className="flex items-center justify-between py-2.5 text-[13px] text-ink hover:text-brand-dark">
                    <span className="flex items-center gap-2.5"><span className="w-2.5 h-2.5 rounded-full ring-1 ring-black/10" style={{ background: color }} />{label}</span>
                    <span className="font-semibold">{value ?? '—'}</span>
                  </Link>
                ))}
                {g?.suspended ? (
                  <Link to="/groups?status=suspended" className="flex items-center justify-between py-2.5 text-[13px] text-danger">
                    <span className="flex items-center gap-2.5"><Ban size={11} /> Suspended fund groups</span><span className="font-semibold">{g.suspended}</span>
                  </Link>
                ) : null}
              </div>
            </div>
          </section>
        </div>

        {/* Recent activity */}
        <section className="rounded-2xl bg-surface border border-line px-6 py-5">
          <Overline>System activity</Overline>
          <h2 className="text-[15px] font-semibold text-ink mt-0.5 mb-3">Recent activity</h2>
          <div className="flex flex-wrap gap-2 mb-4">
            {FILTERS.map((f) => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${filter === f.key ? 'bg-ink text-white' : 'bg-surface-alt text-secondary hover:text-ink'}`}>
                {f.label}
              </button>
            ))}
          </div>

          {feed.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted">Nothing here yet.</div>
          ) : (
            <ol className="relative">
              {feed.map((e, i) => {
                const p = present(e);
                return (
                  <li key={e.id} className="relative flex gap-3 pb-4 last:pb-0" title={e.reason ?? undefined}>
                    {i < feed.length - 1 && <span className="absolute left-[15px] top-8 bottom-0 w-px bg-line" aria-hidden />}
                    <span className={`relative z-[1] w-8 h-8 shrink-0 rounded-full flex items-center justify-center ${TONE[p.tone]}`}><p.icon size={15} /></span>
                    <div className="min-w-0 pt-0.5">
                      <div className="text-[13px] font-semibold text-ink truncate">{p.title}</div>
                      <div className="text-[11px] text-muted">{p.label} · {relTime(e.created_at)}</div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          <Link to="/audit" className="inline-flex items-center gap-1 mt-5 text-xs font-semibold text-ink hover:text-brand-dark">View all activity <ArrowRight size={13} /></Link>
        </section>
      </div>
    </div>
  );
}
