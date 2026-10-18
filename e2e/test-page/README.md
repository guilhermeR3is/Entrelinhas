# Página de teste

Página local com um vídeo e uma legenda WebVTT, usada nos testes ponta a ponta. Para abrir no
navegador:

```sh
npm run test-page
```

e acesse http://localhost:4321.

O vídeo `clock.webm` foi gerado com o ffmpeg a partir do padrão de teste `testsrc2`, que desenha o
tempo e o número do quadro na imagem. Não usa material de terceiros.

```sh
ffmpeg -f lavfi -i testsrc2=duration=12:size=480x270:rate=10 \
  -c:v libvpx-vp9 -b:v 0 -crf 45 -row-mt 1 -an e2e/test-page/clock.webm
```

O formato é WebM com VP9 porque o Chromium usado pelo Playwright não inclui codecs proprietários
como o H.264.
