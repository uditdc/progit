/* Hash-based navigation, ungit-style: #/repository?path=<abs repo path> */

import React from 'react';

export type Route = { page: 'home' } | { page: 'repo'; path: string };

export function parseHash(hash: string): Route {
  const m = /^#\/repository\??(.*)$/.exec(hash);
  if (m) {
    const path = new URLSearchParams(m[1]).get('path');
    if (path) return { page: 'repo', path };
  }
  return { page: 'home' };
}

export function repoHash(path: string): string {
  return '#/repository?path=' + encodeURIComponent(path);
}

export function navigateToRepo(path: string): void {
  window.location.hash = repoHash(path);
}

export function navigateHome(): void {
  window.location.hash = '#/';
}

export function useRoute(): Route {
  const [route, setRoute] = React.useState<Route>(() => parseHash(window.location.hash));
  React.useEffect(() => {
    const h = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  return route;
}

/* ---- recent repositories (home screen) ---- */

export interface RecentRepo {
  path: string;
  name: string;
  at: number;
}

const RECENT_KEY = 'progit_recent';
const RECENT_MAX = 12;

export function getRecentRepos(): RecentRepo[] {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as RecentRepo[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function pushRecentRepo(path: string, name: string): void {
  const list = getRecentRepos().filter((r) => r.path !== path);
  list.unshift({ path, name, at: Date.now() });
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
}

export function removeRecentRepo(path: string): void {
  localStorage.setItem(RECENT_KEY, JSON.stringify(getRecentRepos().filter((r) => r.path !== path)));
}
