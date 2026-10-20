export interface SiteShortcut {
  key: string;
  shift: boolean | null;
  use: string | null;
}

export const YOUTUBE_SHORTCUTS: readonly SiteShortcut[] = [
  { key: 'k', shift: null, use: 'pausar ou continuar' },
  { key: 'j', shift: null, use: 'voltar 10 segundos' },
  { key: 'l', shift: null, use: 'avançar 10 segundos' },
  { key: 'm', shift: null, use: 'tirar ou devolver o som' },
  { key: 'f', shift: null, use: 'abrir a tela cheia' },
  { key: 'c', shift: null, use: 'ligar ou desligar a legenda' },
  { key: 'i', shift: null, use: 'abrir o miniplayer' },
  { key: 't', shift: null, use: null },
  { key: 'w', shift: null, use: 'mover a câmera em vídeos 360°' },
  { key: 'a', shift: null, use: 'mover a câmera em vídeos 360°' },
  { key: 's', shift: null, use: 'mover a câmera em vídeos 360°' },
  { key: 'd', shift: null, use: 'mover a câmera em vídeos 360°' },
  { key: 'n', shift: true, use: 'passar para o próximo vídeo' },
  { key: 'p', shift: true, use: 'voltar para o vídeo anterior' },
];
