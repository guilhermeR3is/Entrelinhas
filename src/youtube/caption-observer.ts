const LINE_SELECTOR = '.caption-visual-line';

export function observeScreenCaptions(
  container: Element,
  onText: (text: string) => void,
): MutationObserver {
  let shownText = '';
  const readScreen = () => {
    const text = Array.from(container.querySelectorAll(LINE_SELECTOR), (line) =>
      line.textContent.trim(),
    )
      .filter((line) => line !== '')
      .join('\n');
    if (text === shownText) return;
    shownText = text;
    onText(text);
  };

  const observer = new MutationObserver(readScreen);
  observer.observe(container, { childList: true, subtree: true, characterData: true });
  readScreen();
  return observer;
}
