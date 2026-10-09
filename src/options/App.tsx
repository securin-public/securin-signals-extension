import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { BrandMark } from '../shared/BrandMark';
import { normalizeHost, type Settings } from '../utils/settings';

export interface OptionsServices {
  loadSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<Settings>;
}

type SaveState = 'idle' | 'saved' | 'error';

export function OptionsApp({ services }: { services: OptionsServices }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [hostInput, setHostInput] = useState('');
  const [hostError, setHostError] = useState<string | null>(null);
  const hostErrorId = useId();

  useEffect(() => {
    services.loadSettings().then(setSettings, () => setLoadFailed(true));
  }, [services]);

  const update = async (next: Settings) => {
    const previous = settings;
    setSettings(next);
    try {
      setSettings(await services.saveSettings(next));
      setSaveState('saved');
    } catch {
      setSettings(previous);
      setSaveState('error');
    }
  };

  if (loadFailed) {
    return (
      <Shell>
        <p role="alert" className="error">
          Settings couldn&rsquo;t be loaded. Reload this page to try again.
        </p>
      </Shell>
    );
  }
  if (!settings) {
    return (
      <Shell>
        <p aria-busy="true">Loading settings&hellip;</p>
      </Shell>
    );
  }

  const addHost = (e: FormEvent) => {
    e.preventDefault();
    const host = normalizeHost(hostInput);
    if (!host) {
      setHostError('Enter a site name like example.com.');
      return;
    }
    setHostError(null);
    setHostInput('');
    if (!settings.disabledHosts.includes(host)) {
      void update({ ...settings, disabledHosts: [...settings.disabledHosts, host] });
    }
  };

  return (
    <Shell>
      <section aria-labelledby="h-page">
        <h2 id="h-page">On webpages</h2>
        <Toggle
          label="Highlight CVE IDs"
          hint="Adds a subtle underline to CVE IDs. The popup lists them either way."
          checked={settings.highlightEnabled}
          onChange={(v) => void update({ ...settings, highlightEnabled: v })}
        />
        <Toggle
          label="Show the Open in Securin button on hover"
          hint="A small button appears next to a highlighted CVE when you point at it."
          checked={settings.inlineButtonEnabled}
          disabled={!settings.highlightEnabled}
          onChange={(v) => void update({ ...settings, inlineButtonEnabled: v })}
        />
        <Toggle
          label="Show the CVE count on the toolbar icon"
          checked={settings.badgeEnabled}
          onChange={(v) => void update({ ...settings, badgeEnabled: v })}
        />
      </section>

      <section aria-labelledby="h-sites">
        <h2 id="h-sites">Sites without highlighting</h2>
        <p className="hint">
          CVEs on these sites, and their subdomains, still appear in the popup but aren&rsquo;t
          highlighted on the page.
        </p>
        <form className="host-form" onSubmit={addHost} noValidate>
          <label htmlFor="host-input" className="visually-hidden">
            Site to exclude
          </label>
          <input
            id="host-input"
            type="text"
            placeholder="example.com"
            value={hostInput}
            maxLength={253}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={hostError ? true : undefined}
            aria-describedby={hostError ? hostErrorId : undefined}
            onChange={(e) => {
              setHostInput(e.target.value);
              setHostError(null);
            }}
          />
          <button type="submit" className="btn-secondary">
            Add site
          </button>
        </form>
        {hostError && (
          <p id={hostErrorId} className="error" role="alert">
            {hostError}
          </p>
        )}
        {settings.disabledHosts.length > 0 ? (
          <ul className="hosts">
            {settings.disabledHosts.map((h) => (
              <li key={h}>
                <span>{h}</span>
                <button
                  type="button"
                  className="btn-link"
                  aria-label={`Remove ${h}`}
                  onClick={() =>
                    void update({
                      ...settings,
                      disabledHosts: settings.disabledHosts.filter((x) => x !== h),
                    })
                  }
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">No sites excluded.</p>
        )}
      </section>

      <section aria-labelledby="h-privacy">
        <h2 id="h-privacy">Privacy</h2>
        <p className="hint">
          CVE detection runs entirely in your browser. Page content is never sent to Securin or
          anywhere else. The extension only opens{' '}
          <span className="code">https://www.securin.io/vulnerability-database/cve/&lt;ID&gt;</span>{' '}
          when you choose to look up a CVE. Settings sync through your browser profile.
        </p>
        <p className="hint">
          Keyboard: open the popup with <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> (change it at
          chrome://extensions/shortcuts).
        </p>
      </section>

      <p className="status" role="status" aria-live="polite">
        {saveState === 'saved' && 'Saved'}
        {saveState === 'error' && 'Couldn’t save. Check that Chrome sync storage is available.'}
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="page">
      <header className="masthead">
        <BrandMark size={28} />
        <h1>Securin Signals settings</h1>
      </header>
      <main className="content">{children}</main>
    </div>
  );
}

function Toggle(props: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange(value: boolean): void;
}) {
  const id = useId();
  return (
    <div className="toggle-row">
      <div>
        <label htmlFor={id} className="toggle-label">
          {props.label}
        </label>
        {props.hint && (
          <p className="hint" id={`${id}-hint`}>
            {props.hint}
          </p>
        )}
      </div>
      <span className="switch">
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={props.checked}
          disabled={props.disabled}
          aria-describedby={props.hint ? `${id}-hint` : undefined}
          onChange={(e) => props.onChange(e.target.checked)}
        />
        <span className="switch-track" aria-hidden="true" />
      </span>
    </div>
  );
}
