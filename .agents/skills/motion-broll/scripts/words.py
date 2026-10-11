"""SRT -> estimated word timestamps (spreads each cue across its characters; ~0.2s accuracy).
If faster-whisper is installed, prefer real word timestamps from the audio.
Reels Studio: a word-level JSON transcript ({"words":[{"text","start","end"}]}) is also
accepted and gives exact word times (one output line per 12 words).
usage: python3 words.py transcript.srt|transcript.json > words.txt"""
import sys, json
def ts(x):
    h,m,r=x.strip().split(':'); s,ms=r.replace('.',',').split(','); return int(h)*3600+int(m)*60+int(s)+int(ms)/1000
if sys.argv[1].endswith('.json'):
    W=[w for w in json.load(open(sys.argv[1],encoding='utf-8'))['words'] if w.get('type','word')=='word' and str(w.get('text','')).strip()]
    for i in range(0,len(W),12): print(' '.join(f"{float(w['start']):.2f}:{str(w['text']).strip()}" for w in W[i:i+12]))
    sys.exit(0)
for blk in open(sys.argv[1],encoding='utf-8').read().strip().split('\n\n'):
    L=blk.strip().split('\n')
    if len(L)<3 or '-->' not in L[1]: continue
    a,b=[ts(x) for x in L[1].split('-->')]; words=' '.join(L[2:]).split(); n=sum(len(w)+1 for w in words); c=0
    out=[]; c=0
    for w in words: out.append(f'{a+(b-a)*c/n:.2f}:{w}'); c+=len(w)+1
    print(' '.join(out))
