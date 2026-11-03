// The route contract: W1-SHELL writes parse(hash) and format(route) in this folder.

export type ViewId = 'overview' | 'pipeline' | 'sessions' | 'stats' | 'errors' | 'runners' | 'teams';

// The keys that the hash query keeps (#stats/spend?range=7d&src=slack). The router drops the others.
export type QueryKey = 'range' | 'metric' | 'src';

// The hash is #view/tab/sel/rid. On Teams the hash is #teams/<team>/<tab>/<id>: sel is the team
// ('' for All teams, 'new' for New team), tab is the team tab, and rid is a routine id.
export type Route = {
  view: ViewId;
  tab: string;
  sel: string;
  rid: string;
  query: Partial<Record<QueryKey, string>>;
};
