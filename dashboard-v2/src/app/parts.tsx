// Small shell parts: the icons, the section error boundary, and the formatters the shell needs.
import { Component, type ReactNode } from 'react';
import type { ViewId } from '../router/types';

const I = ({ d, size = 20 }: { d: ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);

export const VIEW_ICON: Record<ViewId, ReactNode> = {
  overview: <I d={<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />} />,
  pipeline: <I d={<><rect x="2" y="9" width="20" height="6" rx="3" /><circle cx="7" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="17" cy="12" r="1" /><path d="M6 5h12M6 19h12" /></>} />,
  sessions: <I d={<path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12z" />} />,
  stats: <I d={<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />} />,
  errors: <I d={<><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18h.01" /></>} />,
  runners: <I d={<><rect x="3" y="4" width="18" height="7" rx="1.5" /><rect x="3" y="13" width="18" height="7" rx="1.5" /><path d="M7 7.5h.01M7 16.5h.01" /></>} />,
  teams: <I d={<><circle cx="9" cy="8" r="3.5" /><path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2.5.6 4 2.8 4 6" /></>} />,
};
export const ICON = {
  theme: <I d={<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>} />,
  keys: <I d={<><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" /></>} />,
  find: <I d={<><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></>} />,
  search: <I size={16} d={<><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></>} />,
  side: <I size={18} d={<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></>} />,
  right: <I size={18} d={<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16" /></>} />,
};

type BoundaryProps = { children: ReactNode };
// The v1 safeRender: one section fails alone, and says how to recover.
export class Boundary extends Component<BoundaryProps, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    const e = this.state.error;
    return e ? (
      <div className="emptybox" role="alert">This section did not render: {e.message}. Reload, or run vm.sh rollback.</div>
    ) : (
      this.props.children
    );
  }
}
