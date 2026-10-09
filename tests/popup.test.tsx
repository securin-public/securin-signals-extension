import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/popup/App';
import type { PageState, PopupServices } from '../src/popup/services';
import type { CveId } from '../src/utils/cve';
import { DEFAULT_SETTINGS, type Settings } from '../src/utils/settings';

function makeServices(
  page: PageState | Promise<PageState>,
  overrides: Partial<PopupServices> = {},
) {
  let settings: Settings = { ...DEFAULT_SETTINGS, disabledHosts: [] };
  const services: PopupServices = {
    getPageCves: vi.fn(() => Promise.resolve(page)),
    openCve: vi.fn(async () => true),
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

describe('Popup', () => {
  it('shows a loading state, then the unique detected CVEs sorted newest first', async () => {
    let resolve!: (p: PageState) => void;
    const services = makeServices(new Promise<PageState>((r) => (resolve = r)));
    render(<App services={services} />);
    expect(screen.getByText('Checking this page…')).toBeInTheDocument();

    resolve(ready(['CVE-2017-0143', 'CVE-2021-44228']));
    const list = await screen.findByRole('list', { name: 'CVEs detected on this page' });
    const items = within(list)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(items[0]).toContain('CVE-2021-44228');
    expect(items[1]).toContain('CVE-2017-0143');
    expect(screen.getByText(/CVEs on this page/)).toHaveTextContent('2 CVEs on this page');
  });

  it('opens the exact CVE from the list', async () => {
    const services = makeServices(ready(['CVE-2017-0143']));
    render(<App services={services} />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Open CVE-2017-0143 in Securin Signals' }),
    );
    expect(services.openCve).toHaveBeenCalledWith('CVE-2017-0143');
  });

  it('copies a CVE and confirms', async () => {
    const services = makeServices(ready(['CVE-2017-0143']));
    render(<App services={services} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Copy CVE-2017-0143' }));
    expect(services.copy).toHaveBeenCalledWith('CVE-2017-0143');
    expect(await screen.findByRole('button', { name: 'Copied CVE-2017-0143' })).toBeInTheDocument();
  });

  it('shows the empty state when no CVEs are present', async () => {
    render(<App services={makeServices(ready([]))} />);
    expect(await screen.findByText('No CVE IDs found here')).toBeInTheDocument();
    expect(screen.getByText('No CVEs on this page')).toBeInTheDocument();
  });

  it('explains when detection is unavailable on the tab', async () => {
    render(<App services={makeServices({ status: 'unavailable' })} />);
    expect(await screen.findByText(/Detection isn.t running on this tab/)).toBeInTheDocument();
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
    expect(await screen.findByText(/Couldn.t read CVEs from this page/)).toBeInTheDocument();
  });
});

describe('Popup manual search', () => {
  it('opens a valid CVE typed in any case', async () => {
    const services = makeServices(ready([]));
    render(<App services={services} />);
    await userEvent.type(screen.getByLabelText('Look up a CVE'), 'cve-2021-44228{Enter}');
    expect(services.openCve).toHaveBeenCalledWith('CVE-2021-44228');
  });

  it('accepts the bare YYYY-NNNN form', async () => {
    const services = makeServices(ready([]));
    render(<App services={services} />);
    await userEvent.type(screen.getByLabelText('Look up a CVE'), '2017-0143');
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(services.openCve).toHaveBeenCalledWith('CVE-2017-0143');
  });

  it('rejects malformed input with an accessible error and does not navigate', async () => {
    const services = makeServices(ready([]));
    render(<App services={services} />);
    const input = screen.getByLabelText('Look up a CVE');
    await userEvent.type(input, 'https://evil.example{Enter}');
    expect(services.openCve).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent("isn't a valid CVE ID");
    expect(input).toHaveAttribute('aria-invalid', 'true');
    await userEvent.type(input, 'x');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('asks for input when submitted empty', async () => {
    const services = makeServices(ready([]));
    render(<App services={services} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a CVE ID');
    expect(services.openCve).not.toHaveBeenCalled();
  });

  it('filters the detected list as the user types', async () => {
    render(<App services={makeServices(ready(['CVE-2017-0143', 'CVE-2021-44228']))} />);
    await screen.findByText('CVE-2017-0143');
    await userEvent.type(screen.getByLabelText('Look up a CVE'), '4422');
    expect(screen.queryByText('CVE-2017-0143')).not.toBeInTheDocument();
    expect(screen.getByText('CVE-2021-44228')).toBeInTheDocument();
  });

  it('only offers "Press Enter" when the unmatched query is a valid CVE', async () => {
    render(<App services={makeServices(ready(['CVE-2017-0143']))} />);
    await screen.findByText('CVE-2017-0143');
    const input = screen.getByLabelText('Look up a CVE');
    await userEvent.type(input, 'nope');
    expect(screen.getByText(/None of the CVEs/)).not.toHaveTextContent('Press Enter');
    await userEvent.clear(input);
    await userEvent.type(input, 'CVE-2021-44228');
    expect(screen.getByText(/None of the CVEs/)).toHaveTextContent('Press Enter');
  });

  it('reports a failure to open', async () => {
    const services = makeServices(ready([]), { openCve: vi.fn(async () => false) });
    render(<App services={services} />);
    await userEvent.type(screen.getByLabelText('Look up a CVE'), 'CVE-2017-0143{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't open CVE-2017-0143");
  });
});

describe('Popup site toggle', () => {
  it('disables and re-enables highlighting for the current host', async () => {
    const services = makeServices(ready(['CVE-2017-0143'], 'docs.example.com'));
    render(<App services={services} />);
    const toggle = await screen.findByRole('switch');
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
