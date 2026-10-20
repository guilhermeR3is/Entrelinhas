export function coverVideo(box: HTMLElement, video: HTMLVideoElement): ResizeObserver {
  const place = () => {
    box.style.position = 'absolute';
    box.style.pointerEvents = 'none';
    box.style.left = `${String(video.offsetLeft)}px`;
    box.style.top = `${String(video.offsetTop)}px`;
    box.style.width = `${String(video.offsetWidth)}px`;
    box.style.height = `${String(video.offsetHeight)}px`;
  };
  const observer = new ResizeObserver(place);
  observer.observe(video);
  place();
  return observer;
}
