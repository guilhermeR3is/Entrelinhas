import { type Cue, SubtitleFormatError } from './cue';

const TTML = 'http://www.w3.org/ns/ttml';
const PARAMETER = 'http://www.w3.org/ns/ttml#parameter';
const XML = 'http://www.w3.org/XML/1998/namespace';
const CLOCK_TIME = /^(\d{2,}):(\d{2}):(\d{2})(?:(\.\d+)|:(\d{2,})(?:\.(\d+))?)?$/;
const OFFSET_TIME = /^(\d+(?:\.\d+)?)(h|ms|m|s|f|t)$/;
const TIMING_ATTRIBUTES = ['begin', 'end', 'dur'];

type Interval = { startMs: number; endMs: number };
type FrameTiming = { frameRate: number; subFrameRate: number; tickRate: number };
type Fragment = { kind: 'text'; text: string } | { kind: 'space' } | { kind: 'break' };
type ParseContext = { timing: FrameTiming; lang: string; cues: Cue[] };

export function parseTtml(source: string, lang: string): Cue[] {
  const document = new DOMParser().parseFromString(source, 'application/xml');
  const root = document.documentElement;
  if (document.getElementsByTagName('parsererror').length > 0 || !isTtml(root, 'tt')) {
    throw new SubtitleFormatError('The file is not a TTML document');
  }

  const timeBase = root.getAttributeNS(PARAMETER, 'timeBase');
  if (timeBase !== null && timeBase !== 'media') {
    throw new SubtitleFormatError(`TTML time base "${timeBase}" is not supported`);
  }

  const context: ParseContext = { timing: frameTiming(root), lang, cues: [] };
  const body = Array.from(root.children).find((element) => isTtml(element, 'body'));
  if (body) {
    collectCues(body, { startMs: 0, endMs: Infinity }, preservesSpace(root, false), context);
  }
  return context.cues;
}

function collectCues(
  element: Element,
  parent: Interval,
  inheritedPreserve: boolean,
  context: ParseContext,
): void {
  rejectSequentialTiming(element);
  const interval = activeInterval(element, parent, context.timing);
  if (!interval) return;

  const preserve = preservesSpace(element, inheritedPreserve);
  if (isTtml(element, 'p')) {
    const fragments: Fragment[] = [];
    appendText(element, preserve, fragments);
    const text = render(fragments);
    if (text !== '')
      context.cues.push({ id: context.cues.length, ...interval, text, lang: context.lang });
    return;
  }

  for (const child of Array.from(element.children)) {
    if (isTtml(child, 'div') || isTtml(child, 'p')) collectCues(child, interval, preserve, context);
  }
}

function activeInterval(element: Element, parent: Interval, timing: FrameTiming): Interval | null {
  const begin = timeAttribute(element, 'begin', timing);
  const end = timeAttribute(element, 'end', timing);
  const dur = timeAttribute(element, 'dur', timing);

  const startMs = parent.startMs + (begin ?? 0);
  const endMs = Math.min(
    parent.endMs,
    end === null ? Infinity : parent.startMs + end,
    dur === null ? Infinity : startMs + dur,
  );
  return startMs < endMs ? { startMs, endMs } : null;
}

function timeAttribute(element: Element, name: string, timing: FrameTiming): number | null {
  const expression = element.getAttribute(name);
  if (expression === null) return null;

  const milliseconds = parseTimeExpression(expression.trim(), timing);
  if (milliseconds === null) {
    throw new SubtitleFormatError(`Invalid TTML time expression "${expression}"`);
  }
  return milliseconds;
}

function parseTimeExpression(expression: string, timing: FrameTiming): number | null {
  const clock = CLOCK_TIME.exec(expression);
  if (clock) {
    const [, hours = '', minutes = '', seconds = '', fraction = '', frames = '0', subFrames = '0'] =
      clock;
    if (Number(minutes) > 59 || Number(seconds) > 59) return null;

    const frameSeconds =
      (Number(frames) + Number(subFrames) / timing.subFrameRate) / timing.frameRate;
    const totalSeconds =
      Number(hours) * 3600 +
      Number(minutes) * 60 +
      Number(seconds) +
      Number(fraction) +
      frameSeconds;
    return Math.round(totalSeconds * 1000);
  }

  const offset = OFFSET_TIME.exec(expression);
  if (!offset) return null;

  const [, count = '', metric = ''] = offset;
  const secondsPerUnit: Record<string, number> = {
    h: 3600,
    m: 60,
    s: 1,
    ms: 0.001,
    f: 1 / timing.frameRate,
    t: 1 / timing.tickRate,
  };
  const unit = secondsPerUnit[metric];
  return unit === undefined ? null : Math.round(Number(count) * unit * 1000);
}

function frameTiming(root: Element): FrameTiming {
  const declaredFrameRate = positiveNumber(root.getAttributeNS(PARAMETER, 'frameRate'));
  const [numerator = 0, denominator = 0] = (
    root.getAttributeNS(PARAMETER, 'frameRateMultiplier') ?? ''
  )
    .trim()
    .split(/\s+/)
    .map(Number);
  const multiplier = numerator > 0 && denominator > 0 ? numerator / denominator : 1;

  const frameRate = (declaredFrameRate ?? 30) * multiplier;
  const subFrameRate = positiveNumber(root.getAttributeNS(PARAMETER, 'subFrameRate')) ?? 1;
  const tickRate =
    positiveNumber(root.getAttributeNS(PARAMETER, 'tickRate')) ??
    (declaredFrameRate === null ? 1 : frameRate * subFrameRate);
  return { frameRate, subFrameRate, tickRate };
}

function positiveNumber(value: string | null): number | null {
  const number = Number(value);
  return value !== null && number > 0 ? number : null;
}

function appendText(element: Element, preserve: boolean, fragments: Fragment[]): void {
  for (const node of Array.from(element.childNodes)) {
    if (node.nodeType === node.TEXT_NODE || node.nodeType === node.CDATA_SECTION_NODE) {
      appendCharacters(node.textContent ?? '', preserve, fragments);
    } else if (isElement(node) && isTtml(node, 'br')) {
      fragments.push({ kind: 'break' });
    } else if (isElement(node) && isTtml(node, 'span')) {
      rejectSequentialTiming(node);
      if (TIMING_ATTRIBUTES.some((name) => node.hasAttribute(name))) {
        throw new SubtitleFormatError('Timed TTML spans are not supported');
      }
      appendText(node, preservesSpace(node, preserve), fragments);
    }
  }
}

function appendCharacters(characters: string, preserve: boolean, fragments: Fragment[]): void {
  if (preserve) {
    fragments.push({ kind: 'text', text: characters });
    return;
  }
  for (const piece of characters.split(/([ \t\r\n]+)/)) {
    if (piece === '') continue;
    fragments.push(/^[ \t\r\n]/.test(piece) ? { kind: 'space' } : { kind: 'text', text: piece });
  }
}

function render(fragments: Fragment[]): string {
  let text = '';
  let pendingSpace = false;
  for (const fragment of fragments) {
    if (fragment.kind === 'space') {
      pendingSpace = text !== '' && !text.endsWith('\n');
    } else if (fragment.kind === 'break') {
      text += '\n';
      pendingSpace = false;
    } else {
      text += (pendingSpace ? ' ' : '') + fragment.text;
      pendingSpace = false;
    }
  }
  return text.replace(/^\n+|\n+$/g, '');
}

function rejectSequentialTiming(element: Element): void {
  if (element.getAttribute('timeContainer') === 'seq') {
    throw new SubtitleFormatError('Sequential TTML timing is not supported');
  }
}

function preservesSpace(element: Element, inherited: boolean): boolean {
  const space = element.getAttributeNS(XML, 'space');
  return space === null ? inherited : space === 'preserve';
}

function isElement(node: Node): node is Element {
  return node.nodeType === node.ELEMENT_NODE;
}

function isTtml(element: Element, localName: string): boolean {
  return element.namespaceURI === TTML && element.localName === localName;
}
