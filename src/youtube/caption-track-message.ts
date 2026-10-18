import * as z from 'zod/mini';

const CaptionTrackMessage = z.object({
  source: z.literal('projeto-bilingue:caption-track'),
  videoId: z.string().check(z.minLength(1)),
  lang: z.nullable(z.string()),
  kind: z.nullable(z.string()),
  translatedTo: z.nullable(z.string()),
  body: z.string(),
});

export type CaptionTrackMessage = z.infer<typeof CaptionTrackMessage>;

export function readCaptionTrackMessage(data: unknown): CaptionTrackMessage | null {
  const message = CaptionTrackMessage.safeParse(data);
  return message.success ? message.data : null;
}
