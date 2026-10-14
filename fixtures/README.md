# Fixtures

`fixtures/out/` is generated and gitignored. Rebuild the Russian talking-head
fixture with:

```bash
bash scripts/ru/make-ru-fixture.sh          # add --force to regenerate
```

It needs macOS `say` with the ru_RU voice «Milena». Each word is synthesized on
its own, so `transcript.synthetic.json` has exact word times (an ElevenLabs-shaped
response, not an ASR result) and `expected.json` lists what S2 must cut: the
pauses, «Э-э-э…» and the retake «Например, агенты экономят время. Стоп, ещё раз.»
