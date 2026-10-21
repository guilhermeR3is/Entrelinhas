const ON_TOP_STYLE = {
  inset: '0',
  margin: '0',
  border: '0',
  padding: '0',
  background: 'none',
  overflow: 'visible',
};

export interface VideoCover {
  disconnect(): void;
}

export function coverVideo(box: HTMLElement, video: HTMLVideoElement): VideoCover {
  const page = video.ownerDocument;
  let onTop = false;

  const putOnTop = (wanted: boolean) => {
    if (wanted === onTop) return;
    onTop = wanted;
    box.classList.toggle('video-fullscreen', wanted);
    if (wanted) {
      box.setAttribute('popover', 'manual');
      for (const [property, value] of Object.entries(ON_TOP_STYLE)) {
        box.style.setProperty(property, value);
      }
      box.showPopover();
    } else {
      box.hidePopover();
      box.removeAttribute('popover');
      for (const property of Object.keys(ON_TOP_STYLE)) box.style.removeProperty(property);
    }
  };

  const place = () => {
    const alone = page.fullscreenElement === video;
    putOnTop(alone && box.isConnected);
    box.style.position = alone ? 'fixed' : 'absolute';
    box.style.pointerEvents = 'none';
    box.style.left = alone ? '0px' : `${String(video.offsetLeft)}px`;
    box.style.top = alone ? '0px' : `${String(video.offsetTop)}px`;
    box.style.width = alone ? '100vw' : `${String(video.offsetWidth)}px`;
    box.style.height = alone ? '100vh' : `${String(video.offsetHeight)}px`;
  };
  const observer = new ResizeObserver(place);
  observer.observe(video);
  page.addEventListener('fullscreenchange', place);
  place();

  return {
    disconnect() {
      observer.disconnect();
      page.removeEventListener('fullscreenchange', place);
      if (box.isConnected) putOnTop(false);
    },
  };
}
