# Arquivos de legenda usados nos testes

Os arquivos são cópias sem alteração das fontes abaixo. Cada pasta traz a licença original.

| Pasta  | Origem                                                                                                                                                                                   | Licença                               |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `wpt/` | [web-platform-tests, `webvtt/parsing/file-parsing/support`](https://github.com/web-platform-tests/wpt/tree/422734d7fd906113ab2e8a929e115bbcdfa5b341/webvtt/parsing/file-parsing/support) | BSD de 3 cláusulas (`wpt/LICENSE.md`) |

Os arquivos `.test` do web-platform-tests guardam o WebVTT depois da linha `===`, com caracteres
especiais escritos como no Python (`\r`, `\x00`). Os testes decodificam esse trecho do mesmo jeito
que o `tools/build.py` do projeto original.
