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

`plain-video.html` mostra o mesmo vídeo sem nenhuma legenda; os testes carregam nele o arquivo
`lesson.srt`, escrito à mão, como faria quem baixa uma legenda separada.

`framed-player.html` põe a página `native-tracks.html` dentro de um iframe, sempre pelo endereço
`localhost`. Aberta por `localhost`, o player é da mesma origem da página; aberta por `127.0.0.1`, a
página de fora não foi ativada e a extensão não deve entrar no player.
