export type GroupTab = 'home' | 'messages' | 'profile' | 'more';

const SCREEN_TABS: Record<string, GroupTab> = { messages: 'messages', profile: 'profile', more: 'more' };

// expo-router pathnames omit the (app) group: "/<groupId>" is Home, "/<groupId>/more" is a tab, anything deeper is not.
export function activeGroupTab(pathname: string): GroupTab | null {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 1) return 'home';
  if (segments.length === 2) return SCREEN_TABS[segments[1]] ?? null;
  return null;
}
