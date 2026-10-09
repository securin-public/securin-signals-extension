/**
 * Elements whose text must never be scanned or highlighted: executable/style
 * content, form controls, editable regions, embedded documents, and our own UI.
 */
export const EXTENSION_UI_ATTR = 'data-securin-signals-ui';

const EXCLUDED_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'TEMPLATE',
  'TEXTAREA',
  'INPUT',
  'SELECT',
  'OPTION',
  'IFRAME',
  'OBJECT',
  'EMBED',
  'CANVAS',
  'SVG',
  'MATH',
  'HEAD',
  'TITLE',
]);

const EXCLUDED_ANCESTOR_SELECTOR = [
  'script',
  'style',
  'noscript',
  'template',
  'textarea',
  'input',
  'select',
  'option',
  'iframe',
  'object',
  'embed',
  'canvas',
  'svg',
  'math',
  'head',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="textbox"]',
  `[${EXTENSION_UI_ATTR}]`,
].join(',');

/** Check a single element (not its ancestors). Used by the TreeWalker to prune subtrees. */
export function isExcludedElement(el: Element): boolean {
  if (EXCLUDED_TAGS.has(el.tagName.toUpperCase())) return true;
  if (el.hasAttribute(EXTENSION_UI_ATTR)) return true;
  if (el.getAttribute('role') === 'textbox') return true;
  const ce = el.getAttribute('contenteditable');
  if (ce !== null && ce !== 'false') return true;
  return (el as HTMLElement).isContentEditable === true;
}

/** Check whether a node sits anywhere inside an excluded region. */
export function isInExcludedRegion(node: Node): boolean {
  const doc = node.ownerDocument;
  if (doc?.designMode === 'on') return true;
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  if (!el) return true;
  return el.closest(EXCLUDED_ANCESTOR_SELECTOR) !== null;
}
