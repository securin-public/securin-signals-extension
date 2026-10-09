import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { parseVtiResponse } from '../src/api/signals';
import { App } from '../src/popup/App';
import type { PageState, PopupServices } from '../src/popup/services';
import type { CveId } from '../src/utils/cve';
import type { SignalsResponse } from '../src/utils/messages';
import { DEFAULT_SETTINGS, type Settings } from '../src/utils/settings';
import vtiFixture from './fixtures/vti-CVE-2017-0143.json';

function makeServices(
  page: PageState | Promise<PageState>,
  overrides: Partial<PopupServices> = {},
  initial: Partial<Settings> = {},
) {
  let settings: Settings = { ...DEFAULT_SETTINGS, disabledHosts: [], ...initial };
  const services: PopupServices = {
    getPageCves: vi.fn(() => Promise.resolve(page)),
    openCve: vi.fn(async () => true),
    getSignals: vi.fn(async (id: CveId): Promise<SignalsResponse> => ({
      type: 'SIGNALS',
      cveId: id,
      state: 'not-found',
      signals: null,
    })),
    copy: vi.fn(async () => true),
    loadSettings: vi.fn(async () => settings),
    saveSettings: vi.fn(async (s: Settings) => (settings = s)),
    openOptions: vi.fn(),
    ...overrides,
  };
  return services;
}

const ready = (ids: string[], host: string | null = 'example.com'): PageState => ({
  status: 'ready',
  cveIds: ids as CveId[],
  host,
});

const rowButton = (id: string) =>
  screen.findByRole('button', { name: new RegExp(`^Open ${id} in Securin Signals`) });

describe('Popup', () => {
  it('shows a loading state, then the unique detected CVEs sorted newest first', async () => {
    let resolve!: (p: PageState) => void;
    const services = makeServices(new Promise<PageState>((r) => (resolve = r)));
    render(<App services={services} />);
    expect(screen.getByText('Scanning…')).toBeInTheDocument();

    resolve(ready(['CVE-2017-0143', 'CVE-2021-44228']));
    const list = await screen.findByRole('list', { name: 'CVEs detected on this page' });
    const items = within(list)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(items[0]).toContain('CVE-2021-44228');
    expect(items[1]).toContain('CVE-2017-0143');
    expect(screen.getByText('2 CVEs')).toBeInTheDocument();
  });

  it('opens the exact CVE when its row is clicked', async () => {
    const services = makeServices(ready(['CVE-2017-0143']));
    render(<App services={services} />);
    await userEvent.click(await rowButton('CVE-2017-0143'));
    expect(services.openCve).toHaveBeenCalledWith('CVE-2017-0143');
  });

  it('copies a CVE and confirms', async () => {
    const services = makeServices(ready(['CVE-2017-0143']));
    render(<App services={services} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Copy CVE-2017-0143' }));
    expect(services.copy).toHaveBeenCalledWith('CVE-2017-0143');
    expect(await screen.findByRole('button', { name: 'Copied CVE-2017-0143' })).toBeInTheDocument();
  });

  it('opens settings from the header', async () => {
    const services = makeServices(ready([]));
    render(<App services={services} />);
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(services.openOptions).toHaveBeenCalled();
  });

  it('shows the empty state when no CVEs are present', async () => {
    render(<App services={makeServices(ready([]))} />);
    expect(await screen.findByText('No CVE IDs on this page')).toBeInTheDocument();
    expect(screen.getByText('0 CVEs')).toBeInTheDocument();
  });

  it('explains when detection is unavailable on the tab', async () => {
    render(<App services={makeServices({ status: 'unavailable' })} />);
    expect(await screen.findByText('This tab can’t be scanned')).toBeInTheDocument();
  });

  it('offers a retry on error', async () => {
    const services = makeServices({ status: 'error' });
    render(<App services={services} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(services.getPageCves).toHaveBeenCalledTimes(2);
  });

  it('shows an error if the page request rejects', async () => {
    const services = makeServices(ready([]), {
      getPageCves: vi.fn(() => Promise.reject(new Error('boom'))),
    });
    render(<App services={services} />);
    expect(await screen.findByText('Couldn’t read CVEs from this page')).toBeInTheDocument();
  });
});

describe('Popup signals', () => {
  const okSignals = (id: CveId): SignalsResponse => ({
    type: 'SIGNALS',
    cveId: id,
    state: 'ok',
    signals: {
      ...parseVtiResponse(structuredClone(vtiFixture), 'CVE-2017-0143' as CveId)!,
      cveId: id,
    },
  });

  it('shows the risk score and key signals for each row', async () => {
    const services = makeServices(ready(['CVE-2017-0143']), {
      getSignals: vi.fn(async (id: CveId) => okSignals(id)),
    });
    render(<App services={services} />);
    expect(await screen.findByText('9.14')).toBeInTheDocument();
    expect(screen.getByText('Critical')).toBeInTheDocument();
    for (const flag of ['CISA KEV', 'Exploit', 'Ransomware']) {
      expect(screen.getByText(flag)).toBeInTheDocument();
    }
    expect(
      screen.getByRole('button', {
        name: 'Open CVE-2017-0143 in Securin Signals, risk 9.14 Critical, CISA KEV, Exploit, Ransomware',
      }),
    ).toBeInTheDocument();
  });

  it('marks CVEs Securin has no record for', async () => {
    render(<App services={makeServices(ready(['CVE-2017-0143']))} />);
    expect(await screen.findByText('No score')).toBeInTheDocument();
  });

  it('loads at most three rows at a time', async () => {
    const ids = Array.from({ length: 8 }, (_, i) => `CVE-2020-${1000 + i}`);
    let inFlight = 0;
    let peak = 0;
    const getSignals = vi.fn(async (id: CveId) => {
      peak = Math.max(peak, ++inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return okSignals(id);
    });
    render(<App services={makeServices(ready(ids), { getSignals })} />);
    await waitFor(() => expect(getSignals).toHaveBeenCalledTimes(8));
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('does not request signals when they are turned off', async () => {
    const services = makeServices(ready(['CVE-2017-0143']), {}, { signalsEnabled: false });
    render(<App services={services} />);
    await rowButton('CVE-2017-0143');
    await new Promise((r) => setTimeout(r, 20));
    expect(services.getSignals).not.toHaveBeenCalled();
    expect(screen.queryByText('No score')).not.toBeInTheDocument();
  });
});

describe('Popup manual search', () => {
  it('opens a valid CVE typed in any case with Enter', async () => {
    const services = makeServices(ready([]));
    render(<App services={services} />);
    await userEvent.type(screen.getByLabelText('Look up a CVE'), 'cve-2021-44228{Enter}');
    expect(services.openCve).toHaveBeenCalledWith('CVE-2021-44228');
  });

  it('suggests opening a typed CVE that is not on the page', async () => {
    const services = makeServices(ready(['CVE-2017-0143']));
    render(<App services={services} />);
    await userEvent.type(screen.getByLabelText('Look up a CVE'), '2021-44228');
    await userEvent.click(
      screen.getByRole('button', { name: 'Open CVE-2021-44228 in Securin Signals' }),
    );
    expect(services.openCve).toHaveBeenCalledWith('CVE-2021-44228');
  });

  it('opens the only filtered match on Enter', async () => {
    const services = makeServices(ready(['CVE-2017-0143', 'CVE-2021-44228']));
    render(<App services={services} />);
    await rowButton('CVE-2017-0143');
    await userEvent.type(screen.getByLabelText('Look up a CVE'), '4422{Enter}');
    expect(services.openCve).toHaveBeenCalledWith('CVE-2021-44228');
  });

  it('rejects malformed input with an accessible error and does not navigate', async () => {
    const services = makeServices(ready([]));
    render(<App services={services} />);
    const input = screen.getByLabelText('Look up a CVE');
    await userEvent.type(input, 'https://evil.example{Enter}');
    expect(services.openCve).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('isn’t a valid CVE ID');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    await userEvent.type(input, 'x');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('asks for input when submitted empty', async () => {
    const services = makeServices(ready([]));
    render(<App services={services} />);
    await userEvent.type(screen.getByLabelText('Look up a CVE'), '{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a CVE ID');
    expect(services.openCve).not.toHaveBeenCalled();
  });

  it('filters the detected list and clears the search', async () => {
    render(<App services={makeServices(ready(['CVE-2017-0143', 'CVE-2021-44228']))} />);
    await rowButton('CVE-2017-0143');
    const input = screen.getByLabelText('Look up a CVE');
    await userEvent.type(input, '4422');
    expect(screen.queryByText('CVE-2017-0143')).not.toBeInTheDocument();
    expect(screen.getByText('CVE-2021-44228')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(input).toHaveValue('');
    expect(screen.getByText('CVE-2017-0143')).toBeInTheDocument();
  });

  it('says when nothing matches', async () => {
    render(<App services={makeServices(ready(['CVE-2017-0143']))} />);
    await rowButton('CVE-2017-0143');
    await userEvent.type(screen.getByLabelText('Look up a CVE'), 'zzz');
    expect(screen.getByText('No CVEs on this page match “zzz”.')).toBeInTheDocument();
  });

  it('reports a failure to open', async () => {
    const services = makeServices(ready([]), { openCve: vi.fn(async () => false) });
    render(<App services={services} />);
    await userEvent.type(screen.getByLabelText('Look up a CVE'), 'CVE-2017-0143{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t open CVE-2017-0143');
  });
});

describe('Popup site toggle', () => {
  it('disables and re-enables highlighting for the current host', async () => {
    const services = makeServices(ready(['CVE-2017-0143'], 'docs.example.com'));
    render(<App services={services} />);
    const toggle = await screen.findByRole('switch', {
      name: /Highlight CVEs on docs.example.com/,
    });
    expect(toggle).toBeChecked();
    await userEvent.click(toggle);
    expect(services.saveSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({ disabledHosts: ['docs.example.com'] }),
    );
    await waitFor(() => expect(screen.getByRole('switch')).not.toBeChecked());
    await userEvent.click(screen.getByRole('switch'));
    expect(services.saveSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({ disabledHosts: [] }),
    );
  });
});
