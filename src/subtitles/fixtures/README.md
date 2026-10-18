# Arquivos de legenda usados nos testes

Os arquivos são cópias sem alteração das fontes abaixo.

| Pasta     | Origem                                                                                                                                                                                   | Licença                                                                               |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `wpt/`    | [web-platform-tests, `webvtt/parsing/file-parsing/support`](https://github.com/web-platform-tests/wpt/tree/422734d7fd906113ab2e8a929e115bbcdfa5b341/webvtt/parsing/file-parsing/support) | BSD de 3 cláusulas (`wpt/LICENSE.md`)                                                 |
| `sintel/` | Legenda em inglês do filme Sintel, baixada de [durian.blender.org](https://durian.blender.org/wp-content/content/subtitles/sintel_en.srt)                                                | CC BY 3.0, conforme abaixo                                                            |
| `imsc/`   | [w3c/imsc-tests, `imsc1/ttml/timing`](https://github.com/w3c/imsc-tests/tree/14dfb6787275b5f568cae66fcae581652fb390b8/imsc1/ttml/timing)                                                 | Licença dupla do W3C para testes; usada aqui a BSD de 3 cláusulas (`imsc/LICENSE.md`) |

Os arquivos `.test` do web-platform-tests guardam o WebVTT depois da linha `===`, com caracteres
especiais escritos como no Python (`\r`, `\x00`). Os testes decodificam esse trecho do mesmo jeito
que o `tools/build.py` do projeto original.

Sintel: © copyright Blender Foundation | durian.blender.org. Licença
[Creative Commons Attribution 3.0](https://creativecommons.org/licenses/by/3.0/).
