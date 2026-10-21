const LOAD_EVENTS = ['emptied', 'loadstart'];
export const AFTER_LOAD_MS = 1000;

type Activation = { readonly isActive: boolean };

export class SpeedChoice {
  private readonly listeners = new AbortController();
  private loadedAtMs = -Infinity;

  constructor(
    video: HTMLVideoElement,
    private readonly activation: Activation | undefined,
    private readonly now: () => number = () => performance.now(),
  ) {
    for (const type of LOAD_EVENTS) {
      video.addEventListener(
        type,
        () => {
          this.loadedAtMs = this.now();
        },
        { signal: this.listeners.signal },
      );
    }
  }

  personChangedSpeed(): boolean {
    return this.activation?.isActive === true && this.now() - this.loadedAtMs >= AFTER_LOAD_MS;
  }

  stop(): void {
    this.listeners.abort();
  }
}
