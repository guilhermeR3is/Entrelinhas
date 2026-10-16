export const logger = {
  error(message: string, error: unknown): void {
    if (import.meta.env.DEV) console.error(message, error);
  },
};
