import type { useRouter } from 'expo-router';

type Router = ReturnType<typeof useRouter>;

// With no screen to return to (e.g. after a web refresh), '/' re-routes by session instead of dead-ending.
export function goBack(router: Pick<Router, 'canGoBack' | 'back' | 'replace'>) {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}
