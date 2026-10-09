import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OptionsApp, type OptionsServices } from '../src/options/App';
import { DEFAULT_SETTINGS, sanitizeSettings, type Settings } from '../src/utils/settings';

function makeServices(overrides: Partial<OptionsServices> = {}) {
  let stored: Settings = { ...DEFAULT_SETTINGS, disabledHosts: [] };
  return {
    loadSettings: vi.fn(async () => stored),
    saveSettings: vi.fn(async (s: Settings) => (stored = sanitizeSettings(s))),
    ...overrides,
  };
}

describe('Options', () => {
  it('turns highlighting off and disables the dependent toggle', async () => {
    const services = makeServices();
    render(<OptionsApp services={services} />);
    const highlight = await screen.findByRole('switch', { name: 'Highlight CVE IDs' });
    await userEvent.click(highlight);
    expect(services.saveSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({ highlightEnabled: false }),
    );
    expect(screen.getByRole('switch', { name: /Securin card on hover/ })).toBeDisabled();
    expect(await screen.findByRole('status')).toHaveTextContent('Saved');
  });

  it('adds and removes excluded sites, validating input', async () => {
    const services = makeServices();
    render(<OptionsApp services={services} />);
    const input = await screen.findByLabelText('Site to exclude');
    await userEvent.type(input, 'not a host{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a site name');
    await userEvent.clear(input);
    await userEvent.type(input, 'https://Docs.Example.com/page{Enter}');
    expect(await screen.findByText('docs.example.com')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove docs.example.com' }));
    expect(screen.queryByText('docs.example.com')).not.toBeInTheDocument();
  });

  it('reverts and reports when saving fails', async () => {
    const services = makeServices({
      saveSettings: vi.fn(async () => Promise.reject(new Error('x'))),
    });
    render(<OptionsApp services={services} />);
    const badge = await screen.findByRole('switch', { name: /CVE count/ });
    await userEvent.click(badge);
    expect(await screen.findByRole('status')).toHaveTextContent('Couldn’t save');
    expect(screen.getByRole('switch', { name: /CVE count/ })).toBeChecked();
  });

  it('shows an error when settings cannot be loaded', async () => {
    render(
      <OptionsApp
        services={makeServices({ loadSettings: () => Promise.reject(new Error('x')) })}
      />,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('couldn’t be loaded');
  });
});
