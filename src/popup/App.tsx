import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import type { CveSignals, Severity } from '../api/signals';
import { BrandMark } from '../shared/BrandMark';
import { compareCveIds, type CveId } from '../utils/cve';
import { filterCveIds, parseSearchQuery } from '../utils/search';
import { isHostDisabled, type Settings } from '../utils/settings';
import type { PageState, PopupServices } from './services';
import { useSignals, type RowSignals } from './useSignals';

type Loadable = { status: 'loading' } | PageState;

export function App({ services }: { services: PopupServices }) {
  const [page, setPage] = useState<Loadable>({ status: 'loading' });
  const [settings, setSettings] = useState<Settings | null>(null);
  const [query, setQuery] = useState('');
  const [searchError, setSearchError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copied, setCopied] = useState<CveId | null>(null);
  const [announce, setAnnounce] = useState('');
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>();
  const errorId = useId();

  const load = useCallback(() => {
    setPage({ status: 'loading' });
    services.getPageCves().then(setPage, () => setPage({ status: 'error' }));
  }, [services]);

  useEffect(() => {
    load();
    services.loadSettings().then(setSettings, () => setSettings(null));
    return () => clearTimeout(copiedTimer.current);
  }, [load, services]);

  const detected = useMemo(
    () => (page.status === 'ready' ? [...page.cveIds].sort(compareCveIds) : []),
    [page],
  );
  const visible = useMemo(() => filterCveIds(detected, query), [detected, query]);
  const signals = useSignals(detected, settings?.signalsEnabled === true, services.getSignals);

  /** A valid ID typed in the search box that isn't already in the list. */
  const typedId = parseSearchQuery(query);
  const suggestion = typedId && !detected.includes(typedId) ? typedId : null;

  const open = async (id: string) => {
    setActionError(null);
    const ok = await services.openCve(id).catch(() => false);
    if (!ok) setActionError(`Couldn’t open ${id}. Try again.`);
  };

  const copy = async (id: CveId) => {
    const ok = await services.copy(id).catch(() => false);
    if (ok) {
      setCopied(id);
      setAnnounce(`Copied ${id}`);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(null), 1500);
    } else {
      setActionError(`Couldn’t copy ${id}. Your browser blocked clipboard access.`);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!query.trim()) {
      setSearchError('Enter a CVE ID, for example CVE-2017-0143.');
      return;
    }
    const id = typedId ?? (visible.length === 1 ? visible[0] : null);
    if (!id) {
      setSearchError(`That isn’t a valid CVE ID. Use the form CVE-2017-0143.`);
      return;
    }
    setSearchError(null);
    void open(id);
  };

  const host = page.status === 'ready' ? page.host : null;
  const siteHighlightOn = settings && host ? !isHostDisabled(settings, host) : true;

  const toggleSite = async () => {
    if (!settings || !host) return;
    const disabledHosts = siteHighlightOn
      ? [...settings.disabledHosts, host]
      : settings.disabledHosts.filter((h) => h !== host && !host.endsWith(`.${h}`));
    try {
      setSettings(await services.saveSettings({ ...settings, disabledHosts }));
    } catch {
      setActionError('Couldn’t save the setting. Try again.');
    }
  };

  return (
    <div className="popup">
      <header className="topbar">
        <div className="brand">
          <BrandMark size={20} />
          <h1 className="brand-name">Securin Signals</h1>
        </div>
        <button
          type="button"
          className="icon-btn"
          onClick={() => services.openOptions()}
          aria-label="Settings"
          title="Settings"
        >
          <SettingsIcon />
        </button>
      </header>

      <form className="search" onSubmit={onSubmit} role="search" noValidate>
        <label htmlFor="cve-search" className="visually-hidden">
          Look up a CVE
        </label>
        <div className={`search-field${searchError ? ' is-invalid' : ''}`}>
          <SearchIcon />
          <input
            id="cve-search"
            type="text"
            autoComplete="off"
            spellCheck={false}
            autoFocus
            placeholder="Look up a CVE ID"
            value={query}
            maxLength={64}
            aria-invalid={searchError ? true : undefined}
            aria-describedby={searchError ? errorId : undefined}
            onChange={(e) => {
              setQuery(e.target.value);
              setSearchError(null);
            }}
          />
          {query && (
            <button
              type="button"
              className="clear-btn"
              aria-label="Clear search"
              onClick={() => {
                setQuery('');
                setSearchError(null);
              }}
            >
              <CloseIcon />
            </button>
          )}
        </div>
        {searchError && (
          <p id={errorId} className="field-error" role="alert">
            {searchError}
          </p>
        )}
      </form>

      {suggestion && (
        <button type="button" className="suggestion" onClick={() => void open(suggestion)}>
          <span>
            Open <strong>{suggestion}</strong> in Securin Signals
          </span>
          <ExternalIcon />
        </button>
      )}

      <main className="results" aria-busy={page.status === 'loading'}>
        <SectionHeading page={page} count={detected.length} />
        <Results
          page={page}
          detected={detected}
          visible={visible}
          query={query}
          signals={signals}
          signalsOn={settings?.signalsEnabled === true}
          hasSuggestion={suggestion !== null}
          copied={copied}
          onOpen={(id) => void open(id)}
          onCopy={(id) => void copy(id)}
          onRetry={load}
        />
      </main>

      {actionError && (
        <p className="banner-error" role="alert">
          {actionError}
        </p>
      )}

      {host && settings && (
        <footer className="footer">
          <label className="switch">
            <span className="switch-label">
              {settings.highlightEnabled ? (
                <>
                  Highlight CVEs on <span className="host">{host}</span>
                </>
              ) : (
                'Highlighting is off in Settings'
              )}
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={siteHighlightOn && settings.highlightEnabled}
              disabled={!settings.highlightEnabled}
              onChange={() => void toggleSite()}
            />
            <span className="switch-track" aria-hidden="true" />
          </label>
        </footer>
      )}
      <div className="visually-hidden" aria-live="polite">
        {announce}
      </div>
    </div>
  );
}

function SectionHeading({ page, count }: { page: Loadable; count: number }) {
  if (page.status !== 'ready' && page.status !== 'loading') return null;
  return (
    <div className="section-head">
      <h2 className="section-title">On this page</h2>
      <span className="section-count" aria-live="polite">
        {page.status === 'loading' ? 'Scanning…' : `${count} ${count === 1 ? 'CVE' : 'CVEs'}`}
      </span>
    </div>
  );
}

interface ResultsProps {
  page: Loadable;
  detected: CveId[];
  visible: CveId[];
  query: string;
  signals: ReadonlyMap<CveId, RowSignals>;
  signalsOn: boolean;
  hasSuggestion: boolean;
  copied: CveId | null;
  onOpen(id: CveId): void;
  onCopy(id: CveId): void;
  onRetry(): void;
}

function Results(props: ResultsProps) {
  const { page, detected, visible, query } = props;
  if (page.status === 'loading') {
    return (
      <ul className="list" aria-label="Loading detected CVEs">
        {[0, 1, 2].map((i) => (
          <li key={i} className="skeleton-row" aria-hidden="true">
            <span className="skeleton-bar" />
            <span className="skeleton-pill" />
          </li>
        ))}
      </ul>
    );
  }
  if (page.status === 'unavailable') {
    return (
      <EmptyState title="This tab can’t be scanned">
        Extensions can’t read browser pages or the Chrome Web Store. On other sites, reload the tab
        once after installing. You can still look up a CVE above.
      </EmptyState>
    );
  }
  if (page.status === 'error') {
    return (
      <EmptyState title="Couldn’t read CVEs from this page">
        <button type="button" className="btn-secondary" onClick={props.onRetry}>
          Try again
        </button>
      </EmptyState>
    );
  }
  if (detected.length === 0) {
    return (
      <EmptyState title="No CVE IDs on this page">
        When a page mentions an ID like CVE-2017-0143, it appears here with its Securin signals.
      </EmptyState>
    );
  }
  if (visible.length === 0) {
    // The "Open CVE-…" suggestion already covers a valid typed ID.
    return props.hasSuggestion ? null : (
      <p className="no-match">No CVEs on this page match “{query.trim()}”.</p>
    );
  }
  return (
    <ul className="list" aria-label="CVEs detected on this page">
      {visible.map((id) => (
        <CveRow
          key={id}
          id={id}
          state={props.signalsOn ? props.signals.get(id) : undefined}
          copied={props.copied === id}
          onOpen={props.onOpen}
          onCopy={props.onCopy}
        />
      ))}
    </ul>
  );
}

function CveRow(props: {
  id: CveId;
  state: RowSignals | undefined;
  copied: boolean;
  onOpen(id: CveId): void;
  onCopy(id: CveId): void;
}) {
  const { id, state } = props;
  const s = state?.kind === 'ok' ? state.signals : null;
  return (
    <li className="row">
      <button
        type="button"
        className="row-main"
        onClick={() => props.onOpen(id)}
        aria-label={`Open ${id} in Securin Signals${s ? `, ${describe(s)}` : ''}`}
      >
        <span className="row-top">
          <span className="cve-id">{id}</span>
          <RiskBadge state={state} />
        </span>
        {s && <Flags s={s} />}
      </button>
      <button
        type="button"
        className="icon-btn row-copy"
        onClick={() => props.onCopy(id)}
        aria-label={props.copied ? `Copied ${id}` : `Copy ${id}`}
        title={props.copied ? 'Copied' : 'Copy ID'}
      >
        {props.copied ? <CheckIcon /> : <CopyIcon />}
      </button>
    </li>
  );
}

const sevClass = (s: Severity | null) => `sev-${s ? s.toLowerCase() : 'none'}`;

function RiskBadge({ state }: { state: RowSignals | undefined }) {
  if (!state) return null;
  if (state.kind === 'loading') return <span className="risk risk-loading" aria-hidden="true" />;
  if (state.kind !== 'ok' || state.signals.riskScore === null) {
    return <span className="risk-none">{state.kind === 'error' ? '' : 'No score'}</span>;
  }
  const { riskScore, riskSeverity } = state.signals;
  return (
    <span className={`risk ${sevClass(riskSeverity)}`} title="Securin Risk Score">
      <span className="risk-dot" aria-hidden="true" />
      {riskScore}
      {riskSeverity && <span className="risk-band">{riskSeverity}</span>}
    </span>
  );
}

function flagList(s: CveSignals): Array<[string, string]> {
  const flags: Array<[string, string]> = [];
  if (s.cisaKev) flags.push(['kev', 'CISA KEV']);
  else if (s.securinKev) flags.push(['kev', 'Securin KEV']);
  if (s.exploit) flags.push(['exploit', 'Exploit']);
  if (s.ransomware) flags.push(['ransomware', 'Ransomware']);
  if (s.zeroDay) flags.push(['zeroday', 'Zero Day']);
  if (s.trending) flags.push(['trending', 'Trending']);
  return flags;
}

function describe(s: CveSignals): string {
  const parts = [];
  if (s.riskScore !== null)
    parts.push(`risk ${s.riskScore}${s.riskSeverity ? ` ${s.riskSeverity}` : ''}`);
  parts.push(...flagList(s).map(([, label]) => label));
  return parts.join(', ');
}

/** Rows show the three most important signals; the hover card shows all. */
const MAX_ROW_FLAGS = 3;

function Flags({ s }: { s: CveSignals }) {
  const flags = flagList(s).slice(0, MAX_ROW_FLAGS);
  if (flags.length === 0) return null;
  return (
    <span className="flags">
      {flags.map(([cls, label]) => (
        <span key={cls} className={`flag flag-${cls}`}>
          {label}
        </span>
      ))}
    </span>
  );
}

function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      <div className="empty-body">{children}</div>
    </div>
  );
}

const iconProps = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
};

function SearchIcon() {
  return (
    <svg {...iconProps} className="search-icon">
      <circle cx="7" cy="7" r="4.5" />
      <path d="m10.5 10.5 3 3" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg {...iconProps} width={14} height={14}>
      <path d="m4 4 8 8M12 4l-8 8" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg {...iconProps}>
      <path d="M2.5 4.5h6M12 4.5h1.5M2.5 11.5h1.5M7.5 11.5h6" />
      <circle cx="10.25" cy="4.5" r="1.75" />
      <circle cx="5.75" cy="11.5" r="1.75" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg {...iconProps} width={14} height={14}>
      <path d="M5.5 5.5h7v7h-7z" />
      <path d="M3.5 10.5v-7h7" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg {...iconProps} width={14} height={14}>
      <path d="m3.5 8.5 3 3 6-7" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg {...iconProps} width={14} height={14}>
      <path d="M9 3h4v4" />
      <path d="M13 3 7.5 8.5" />
      <path d="M11 9.5V13H3V5h3.5" />
    </svg>
  );
}
