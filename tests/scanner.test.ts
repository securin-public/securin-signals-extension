import { CveScanner, MAX_TRACKED_MATCHES, type RangeSink } from '../src/content/scanner';
import { EXTENSION_UI_ATTR } from '../src/content/exclusions';

function setBody(html: string): void {
  // Test fixture only; production code never parses HTML strings.
  // eslint-disable-next-line no-restricted-properties
  document.body.innerHTML = html;
}

class RecordingSink implements RangeSink {
  ranges = new Set<Range>();
  add(r: Range) {
    this.ranges.add(r);
  }
  delete(r: Range) {
    this.ranges.delete(r);
  }
  texts() {
    return [...this.ranges].map((r) => r.toString());
  }
}

afterEach(() => {
  document.body.replaceChildren();
  document.designMode = 'off';
});

describe('CveScanner: DOM scanning', () => {
  it('finds, normalizes and deduplicates CVEs across the page', () => {
    setBody(`
      <h1>Advisory for cve-2017-0143</h1>
      <p>Related: CVE-2021-44228 and <strong>CVE-2017-0143</strong>.</p>
      <ul><li>Cve-2021-45046</li></ul>`);
    const scanner = new CveScanner(document);
    expect(scanner.scan(document.body)).toBe(true);
    expect(scanner.getCveIds()).toEqual(['CVE-2017-0143', 'CVE-2021-44228', 'CVE-2021-45046']);
    expect(scanner.matches()).toHaveLength(4);
  });

  it('creates ranges covering exactly the matched text without mutating the DOM', () => {
    setBody('<p id="p">See CVE-2017-0143 now</p>');
    const before = document.body.cloneNode(true) as HTMLElement;
    const sink = new RecordingSink();
    const scanner = new CveScanner(document);
    scanner.setSink(sink);
    scanner.scan(document.body);
    expect(sink.texts()).toEqual(['CVE-2017-0143']);
    expect(document.body.isEqualNode(before)).toBe(true);
  });

  it('replays existing ranges when a sink is attached later', () => {
    setBody('<p>CVE-2017-0143</p>');
    const scanner = new CveScanner(document);
    scanner.scan(document.body);
    const sink = new RecordingSink();
    scanner.setSink(sink);
    expect(sink.texts()).toEqual(['CVE-2017-0143']);
  });

  it('resolves the match at a text offset', () => {
    setBody('<p id="p">x CVE-2017-0143 y</p>');
    const scanner = new CveScanner(document);
    scanner.scan(document.body);
    const text = document.getElementById('p')!.firstChild!;
    expect(scanner.matchAt(text, 5)?.id).toBe('CVE-2017-0143');
    expect(scanner.matchAt(text, 0)).toBeNull();
  });

  it('caps tracked matches on pathological pages', () => {
    const p = document.createElement('p');
    p.textContent = Array.from(
      { length: MAX_TRACKED_MATCHES + 50 },
      (_, i) => `CVE-2020-${String(10000 + i)}`,
    ).join(' ');
    document.body.append(p);
    const scanner = new CveScanner(document);
    scanner.scan(document.body);
    expect(scanner.matches()).toHaveLength(MAX_TRACKED_MATCHES);
  });
});

describe('CveScanner: excluded elements', () => {
  it.each([
    ['script', '<script>var x = "CVE-2017-0143";</script>'],
    ['style', '<style>/* CVE-2017-0143 */</style>'],
    ['noscript', '<noscript>CVE-2017-0143</noscript>'],
    ['template', '<template><p>CVE-2017-0143</p></template>'],
    ['textarea', '<textarea>CVE-2017-0143</textarea>'],
    ['select/option', '<select><option>CVE-2017-0143</option></select>'],
    ['contenteditable', '<div contenteditable="true"><p>CVE-2017-0143</p></div>'],
    ['contenteditable (empty attr)', '<div contenteditable><span>CVE-2017-0143</span></div>'],
    ['role=textbox', '<div role="textbox">CVE-2017-0143</div>'],
    ['extension UI', `<div ${EXTENSION_UI_ATTR}>CVE-2017-0143</div>`],
  ])('ignores text inside %s', (_name, html) => {
    setBody(html);
    const scanner = new CveScanner(document);
    scanner.scan(document.body);
    expect(scanner.getCveIds()).toEqual([]);
  });

  it('ignores input values and password fields', () => {
    setBody('<input value="CVE-2017-0143"><input type="password" value="CVE-2017-0144">');
    const scanner = new CveScanner(document);
    scanner.scan(document.body);
    expect(scanner.getCveIds()).toEqual([]);
  });

  it('scans contenteditable="false" islands normally', () => {
    setBody('<div contenteditable="false">CVE-2017-0143</div>');
    const scanner = new CveScanner(document);
    scanner.scan(document.body);
    expect(scanner.getCveIds()).toEqual(['CVE-2017-0143']);
  });

  it('detects CVEs in links and code blocks without altering them', () => {
    setBody(
      '<a id="a" href="https://nvd.nist.gov/vuln/detail/CVE-2017-0143">CVE-2017-0143</a>' +
        '<pre><code>CVE-2021-44228</code></pre>',
    );
    const html = document.body.cloneNode(true);
    const scanner = new CveScanner(document);
    scanner.scan(document.body);
    expect(scanner.getCveIds()).toEqual(['CVE-2017-0143', 'CVE-2021-44228']);
    expect(document.body.isEqualNode(html)).toBe(true);
    expect(document.getElementById('a')!.getAttribute('href')).toBe(
      'https://nvd.nist.gov/vuln/detail/CVE-2017-0143',
    );
  });

  it('refuses to scan a subtree rooted inside an excluded region', () => {
    setBody('<div contenteditable="true"><p id="inner">CVE-2017-0143</p></div>');
    const scanner = new CveScanner(document);
    expect(scanner.scan(document.getElementById('inner')!)).toBe(false);
    expect(scanner.scan(document.getElementById('inner')!.firstChild!)).toBe(false);
    expect(scanner.getCveIds()).toEqual([]);
  });

  it('scans nothing when the document is in design mode', () => {
    setBody('<p id="p">CVE-2017-0143</p>');
    document.designMode = 'on';
    const scanner = new CveScanner(document);
    scanner.scan(document.getElementById('p')!.firstChild!);
    expect(scanner.getCveIds()).toEqual([]);
  });
});

describe('CveScanner: incremental updates', () => {
  it('re-evaluates a changed text node', () => {
    setBody('<p id="p">CVE-2017-0143</p>');
    const scanner = new CveScanner(document);
    const sink = new RecordingSink();
    scanner.setSink(sink);
    scanner.scan(document.body);
    const text = document.getElementById('p')!.firstChild as Text;
    text.data = 'Now CVE-2021-44228';
    expect(scanner.scan(text)).toBe(true);
    expect(scanner.getCveIds()).toEqual(['CVE-2021-44228']);
    expect(sink.texts()).toEqual(['CVE-2021-44228']);
  });

  it('drops a tracked node whose text no longer mentions a CVE when its parent is rescanned', () => {
    setBody('<p id="p">CVE-2017-0143</p>');
    const scanner = new CveScanner(document);
    scanner.scan(document.body);
    (document.getElementById('p')!.firstChild as Text).data = 'patched';
    expect(scanner.scan(document.getElementById('p')!)).toBe(true);
    expect(scanner.getCveIds()).toEqual([]);
  });

  it('prunes removed nodes and keeps counts for remaining duplicates', () => {
    setBody('<p id="a">CVE-2017-0143</p><p id="b">CVE-2017-0143</p>');
    const scanner = new CveScanner(document);
    const sink = new RecordingSink();
    scanner.setSink(sink);
    scanner.scan(document.body);
    document.getElementById('a')!.remove();
    expect(scanner.prune()).toBe(false); // still present via #b
    expect(scanner.getCveIds()).toEqual(['CVE-2017-0143']);
    expect(sink.ranges.size).toBe(1);
    document.getElementById('b')!.remove();
    expect(scanner.prune()).toBe(true);
    expect(scanner.getCveIds()).toEqual([]);
    expect(sink.ranges.size).toBe(0);
  });

  it('does not double count when the same subtree is scanned twice', () => {
    setBody('<p>CVE-2017-0143</p>');
    const scanner = new CveScanner(document);
    scanner.scan(document.body);
    expect(scanner.scan(document.body)).toBe(false);
    expect(scanner.matches()).toHaveLength(1);
  });

  it('destroy() removes every range from the sink', () => {
    setBody('<p>CVE-2017-0143 CVE-2017-0144</p>');
    const scanner = new CveScanner(document);
    const sink = new RecordingSink();
    scanner.setSink(sink);
    scanner.scan(document.body);
    scanner.destroy();
    expect(sink.ranges.size).toBe(0);
    expect(scanner.getCveIds()).toEqual([]);
  });
});
