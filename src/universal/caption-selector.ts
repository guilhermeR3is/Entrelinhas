const PLAIN_NAME = /^[a-zA-Z][\w-]*$/;
const GENERATED_PREFIX = /^(css|sc|jsx|svelte|emotion|styled)-/i;
const TWO_DIGITS = /\d.*\d/;
const STATE_CLASS =
  /^(is-|has-)?(active|hidden|visible|show|showing|open|current|focus|hover|selected)$/i;

export function captionSelector(clicked: Element): string | null {
  const page = clicked.ownerDocument;
  const line = ownPart(clicked);
  if (line.startsWith('#')) return line;

  let scope: string | null = null;
  for (let ancestor = clicked.parentElement; ancestor; ancestor = ancestor.parentElement) {
    if (ancestor === page.body || ancestor === page.documentElement) break;
    const part = ownPart(ancestor);
    if (part !== ancestor.localName) {
      scope = part;
      break;
    }
  }
  if (line === clicked.localName && scope === null) return null;

  const selector = scope ? `${scope} ${line}` : line;
  return Array.from(page.querySelectorAll(selector)).includes(clicked) ? selector : null;
}

function ownPart(element: Element): string {
  if (isStableName(element.id)) return `#${element.id}`;
  const classes = Array.from(element.classList).filter(isStableName);
  return element.localName + classes.map((name) => `.${name}`).join('');
}

function isStableName(name: string): boolean {
  return (
    PLAIN_NAME.test(name) &&
    !GENERATED_PREFIX.test(name) &&
    !TWO_DIGITS.test(name) &&
    !STATE_CLASS.test(name)
  );
}
