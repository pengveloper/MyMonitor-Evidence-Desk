# Field design fonts

Both fonts are SIL Open Font License 1.1. The license texts sit next to the files.

| File | Source (npm) | Path in the package |
| --- | --- | --- |
| `Newsreader.woff2` | `@fontsource-variable/newsreader@5.3.0` | `files/newsreader-latin-wght-normal.woff2` |
| `Newsreader-OFL.txt` | `@fontsource-variable/newsreader@5.3.0` | `LICENSE` |
| `pretendard/*.woff2` | `pretendard@1.3.9` | `dist/web/variable/woff2-dynamic-subset/` |
| `pretendard/pretendard.css` | `pretendard@1.3.9` | `dist/web/variable/pretendardvariable-dynamic-subset.css` |
| `Pretendard-OFL.txt` | `pretendard@1.3.9` | `dist/LICENSE.txt` |

`pretendard.css` changes two things only: the family is renamed to `MM Pretendard` so it never collides with a
system-installed Pretendard, and `url(./woff2-dynamic-subset/` becomes `url(./`. The browser downloads only the
subsets whose `unicode-range` a page uses.

Reproduce from an empty folder:

```bash
npm pack @fontsource-variable/newsreader@5.3.0 pretendard@1.3.9
mkdir nr pr && tar -xzf fontsource-variable-newsreader-5.3.0.tgz -C nr && tar -xzf pretendard-1.3.9.tgz -C pr
cp nr/package/files/newsreader-latin-wght-normal.woff2 Newsreader.woff2 && cp nr/package/LICENSE Newsreader-OFL.txt
mkdir -p pretendard && cp pr/package/dist/web/variable/woff2-dynamic-subset/*.woff2 pretendard/ && cp pr/package/dist/LICENSE.txt Pretendard-OFL.txt
sed -e "s#font-family: 'Pretendard Variable'#font-family: 'MM Pretendard'#g" -e "s#url(./woff2-dynamic-subset/#url(./#g" \
  pr/package/dist/web/variable/pretendardvariable-dynamic-subset.css > pretendard/pretendard.css
```
