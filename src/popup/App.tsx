import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { BrandMark } from '../shared/BrandMark';
import { compareCveIds, type CveId } from '../utils/cve';
import { filterCveIds, parseSearchQuery } from '../utils/search';
import { isHostDisabled, type Settings } from '../utils/settings';
import type { PageState, PopupServices } from './services';

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

  const open = async (id: string) => {
    setActionError(null);
    const ok = await services.openCve(id).catch(() => false);
    if (!ok) setActionError(`Couldn't open ${id}. Try again.`);
  };

  const copy = async (id: CveId) => {
    const ok = await services.copy(id).catch(() => false);
    if (ok) {
      setCopied(id);
      setAnnounce(`Copied ${id}`);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(null), 1500);
    } else {
      setActionError(`Couldn't copy ${id}. Your browser blocked clipboard access.`);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!query.trim()) {
      setSearchError('Enter a CVE ID, for example CVE-2017-0143.');
      return;
    }
    const id = parseSearchQuery(query);
    if (!id) {
      setSearchError(
        `"${query.trim().slice(0, 40)}" isn't a valid CVE ID. Use the form CVE-2017-0143.`,
      );
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
      <header className="masthead">
        <div className="brand">
          <BrandMark />
          <span className="brand-name">Securin Signals</span>
        </div>
        <PageSummary page={page} count={detected.length} />
      </header>

      <form className="search" onSubmit={onSubmit} role="search" noValidate>
        <label htmlFor="cve-search" className="visually-hidden">
          Look up a CVE
        </label>
        <input
          id="cve-search"
          type="text"
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          autoFocus
          placeholder="Enter a CVE ID"
          value={query}
          maxLength={64}
          aria-invalid={searchError ? true : undefined}
          aria-describedby={searchError ? errorId : undefined}
          onChange={(e) => {
            setQuery(e.target.value);
            setSearchError(null);
          }}
        />
        <button type="submit" className="btn-primary">
          Open
        </button>
      </form>
      {searchError && (
        <p id={errorId} className="field-error" role="alert">
          {searchError}
        </p>
      )}

      <main className="results" aria-busy={page.status === 'loading'}>
        <Results
          page={page}
          detected={detected}
          visible={visible}
          query={query}
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

      <footer className="footer">
        {host && settings ? (
          <label className="switch">
            <input
              type="checkbox"
              role="switch"
              checked={siteHighlightOn && settings.highlightEnabled}
              disabled={!settings.highlightEnabled}
              onChange={() => void toggleSite()}
            />
            <span className="switch-track" aria-hidden="true" />
            <span className="switch-label">
              {settings.highlightEnabled ? (
                <>
                  Highlight on <span className="host">{host}</span>
                </>
              ) : (
                'Highlighting is off in Settings'
              )}
            </span>
          </label>
        ) : (
          <span />
        )}
        <button type="button" className="btn-link" onClick={() => services.openOptions()}>
          Settings
        </button>
      </footer>
      <div className="visually-hidden" aria-live="polite">
        {announce}
      </div>
    </div>
  );
}

function PageSummary({ page, count }: { page: Loadable; count: number }) {
  let text: string;
  switch (page.status) {
    case 'loading':
      text = 'Checking this page…';
      break;
    case 'ready':
      text =
        count === 0
          ? 'No CVEs on this page'
          : `${count} ${count === 1 ? 'CVE' : 'CVEs'} on this page`;
      break;
    default:
      text = 'This page can’t be checked';
  }
  return (
    <p className="summary" aria-live="polite">
      {page.status === 'ready' && count > 0 ? (
        <>
          <span className="summary-count">{count}</span> {count === 1 ? 'CVE' : 'CVEs'} on this page
        </>
      ) : (
        text
      )}
    </p>
  );
}

interface ResultsProps {
  page: Loadable;
  detected: CveId[];
  visible: CveId[];
  query: string;
  copied: CveId | null;
  onOpen(id: CveId): void;
  onCopy(id: CveId): void;
  onRetry(): void;
}

function Results({
  page,
  detected,
  visible,
  query,
  copied,
  onOpen,
  onCopy,
  onRetry,
}: ResultsProps) {
  if (page.status === 'loading') {
    return (
      <ul className="list" aria-label="Loading detected CVEs">
        {[0, 1, 2].map((i) => (
          <li key={i} className="row skeleton" aria-hidden="true">
            <span className="skeleton-bar" />
          </li>
        ))}
      </ul>
    );
  }
  if (page.status === 'unavailable') {
    return (
      <div className="state">
        <p className="state-title">Detection isn&rsquo;t running on this tab</p>
        <p className="state-body">
          Browser pages and the Chrome Web Store can&rsquo;t be scanned. On other sites, reload the
          tab once after installing. You can still look up a CVE above.
        </p>
      </div>
    );
  }
  if (page.status === 'error') {
    return (
      <div className="state">
        <p className="state-title">Couldn&rsquo;t read CVEs from this page</p>
        <button type="button" className="btn-secondary" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }
  if (detected.length === 0) {
    return (
      <div className="state">
        <p className="state-title">No CVE IDs found here</p>
        <p className="state-body">
          When a page mentions an identifier like CVE-2017-0143, it shows up in this list. To look
          one up now, type it above.
        </p>
      </div>
    );
  }
  if (visible.length === 0) {
    return (
      <div className="state">
        <p className="state-body">
          None of the CVEs on this page match &ldquo;{query.trim()}&rdquo;.
          {parseSearchQuery(query) && ' Press Enter to open it in Securin Signals.'}
        </p>
      </div>
    );
  }
  return (
    <ul className="list" aria-label="CVEs detected on this page">
      {visible.map((id) => (
        <li key={id} className="row">
          <span className="cve-id">{id}</span>
          <button
            type="button"
            className="btn-icon"
            onClick={() => onCopy(id)}
            aria-label={copied === id ? `Copied ${id}` : `Copy ${id}`}
            title={copied === id ? 'Copied' : 'Copy ID'}
          >
            {copied === id ? <CheckIcon /> : <CopyIcon />}
          </button>
          <button
            type="button"
            className="btn-open"
            onClick={() => onOpen(id)}
            aria-label={`Open ${id} in Securin Signals`}
          >
            Open
            <ExternalIcon />
          </button>
        </li>
      ))}
    </ul>
  );
}

const iconProps = {
  width: 14,
  height: 14,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
};

function CopyIcon() {
  return (
    <svg {...iconProps}>
      <path d="M5.5 5.5h7v7h-7z" />
      <path d="M3.5 10.5v-7h7" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg {...iconProps}>
      <path d="m3.5 8.5 3 3 6-7" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg {...iconProps} width={12} height={12}>
      <path d="M9 3h4v4" />
      <path d="M13 3 7.5 8.5" />
      <path d="M11 9.5V13H3V5h3.5" />
    </svg>
  );
}
