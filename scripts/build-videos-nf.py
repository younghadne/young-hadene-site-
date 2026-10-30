import re,html
R=open('videos.html',encoding='utf-8').read()
S=open('videos/shorts.html',encoding='utf-8').read()
def body(src):
    a=src.index('<section class="section" style="padding-top:120px;">'); b=src.index('</section>',a)+len('</section>'); return a,b
a,b=body(R); main=R[a:b]
intro=re.search(r'<h1>.*?</h1>\s*(<p>.*?</p>)',main,re.S).group(1)
keep=re.search(r'<h2>Keep Listening</h2>\s*(<p>.*?</p>)',main,re.S).group(1)
def sec(name,nxt):
    i=main.index(name); j=main.index(nxt,i); return main[i:j]
ent=re.compile(r'<h3 id="video-([^"]+)">(.*?)</h3>\s*<p><a href="([^"]+)" class="yt-facade" data-id="[^"]+"><img src="([^"]+)" alt="([^"]*)"[^>]*><br>(.*?)</a></p>\s*(?:<p>(.*?)</p>)?',re.S)
def parse(t): return [m.groups() for m in ent.finditer(t)]
feat=parse(sec('<h2>Featured Videos','<h2>Young Hadene Videos from 2026'))
y26=parse(sec('<h2>Young Hadene Videos from 2026','<h2>Young Hadene Videos from 2025'))
y25=parse(sec('<h2>Young Hadene Videos from 2025','<h2>Young Hadene Shorts'))
print(len(feat),len(y26),len(y25))
sh=[]
for m in re.finditer(r'<p><a href="(https://www.youtube.com/shorts/([^"]+))" class="yt-facade" data-id="[^"]+"><img src="([^"]+)" alt="([^"]*)"[^>]*><br>(.*?)</a></p>\s*(?:<p><em>(.*?)</em></p>)?',S,re.S):
    sh.append(m.groups())
print(len(sh))
def meta(d):
    if not d: return ''
    return '<p class="nfv-desc">'+re.sub(r'</?em>','',d)+'</p>'
def card(vid,title,href,img,alt,label,desc,anchor=True,lazy=True):
    idattr=f' id="video-{vid}"' if anchor else ''
    return (f'<li class="nfv-item"{idattr}><a class="nfv-card" href="{href}" data-id="{vid}">'
      f'<span class="nfv-thumb"><img src="https://i.ytimg.com/vi/{vid}/hqdefault.jpg" alt="{alt}" loading="lazy" decoding="async" width="480" height="360"></span>'
      f'<span class="nfv-title">{label}</span></a><h3 class="nfv-h3">{title}</h3>{meta(desc)}</li>')
def short(href,vid,img,alt,label,date):
    return (f'<li class="nfv-item"><a class="nfv-card" href="{href}" data-id="{vid}">'
      f'<span class="nfv-thumb"><img src="https://i.ytimg.com/vi/{vid}/hqdefault.jpg" alt="{alt}" loading="lazy" decoding="async" width="270" height="480"></span>'
      f'<span class="nfv-title">{label}</span></a>'+(f'<p class="nfv-desc">{date}</p>' if date else '')+'</li>')
def row(title,items,tall=False,rid=''):
    return (f'<section class="nfv-row{" nfv-tall" if tall else ""}" aria-label="{html.escape(title)}"><div class="nfv-row-head"><h2 class="nfv-h2">{title}</h2>'
      f'<div class="nfv-arrows"><button type="button" class="nfv-arrow" data-dir="-1" aria-label="Scroll {html.escape(title)} left">&#8592;</button><button type="button" class="nfv-arrow" data-dir="1" aria-label="Scroll {html.escape(title)} right">&#8594;</button></div></div>'
      f'<ul class="nfv-track">{"".join(items)}</ul></section>')
def billboard(vid,title,meta,more_href,h='h2'):
    return (f'<div class="nfv-bill"><div class="nfv-bill-media" data-id="{vid}"><img src="https://i.ytimg.com/vi/{vid}/maxresdefault.jpg" alt="Still from the Young Hadene {title} music video" width="1280" height="720" fetchpriority="high" decoding="async" onerror="this.onerror=null;this.src=\'https://i.ytimg.com/vi/{vid}/hqdefault.jpg\'"></div>'
      f'<div class="nfv-bill-panel"><p class="nf-meta">Featured video</p><{h} class="nfv-bill-title">{title}</{h}><p class="nf-meta nfv-bill-meta">{meta}</p>'
      f'<div class="nfv-bill-actions"><button type="button" class="nfv-btn nfv-btn-play" data-id="{vid}" aria-label="Play {title}"><span aria-hidden="true">&#9654;</span> Play</button><a class="nfv-btn nfv-btn-ghost" href="{more_href}">More videos</a></div></div></div>')
bro=[e for e in feat if e[0]=='VFVC_1pI8vM'][0]
cards=lambda L:[card(*e[:6],e[6]) for e in L]
shorts=[short(*s) for s in sh]
newmain=('<main class="nfv" id="main"><div class="nf-wrap nfv-wrap">'
 '<a href="/music" class="back-link">&#8592; Back to Music</a><h1 class="nfv-h1">Young Hadene Music Videos</h1>'
 f'<div class="nfv-intro">{intro}</div>'
 + billboard(bro[0],'Broken','OFFICIAL MUSIC VIDEO. TORONTO.','#music-videos')
 + '<div id="music-videos"></div>'+row('Music videos',cards(feat))
 + row('Shorts',shorts,True)
 + row('Latest',cards(y26)) + row('2025',cards(y25))
 + f'<div class="nfv-foot"><h2 class="nfv-h2">Keep Listening</h2>{keep}</div></div></main>')
R=R[:a]+newmain+R[b:]
open('videos.html','w',encoding='utf-8').write(R)
# shorts page
a,b=body(S); sm=S[a:b]
sintro=re.search(r'<h1>.*?</h1>\s*(<p>.*?</p>)',sm,re.S).group(1)
more=re.search(r'<h2>More From Young Hadene</h2>\s*(<p>.*?</p>)',sm,re.S).group(1)
# group by song h2
groups=[];
for g in re.finditer(r'<h2>(.*?)</h2>\s*<p>(Full video:.*?)</p>(.*?)(?=<h2>)',sm,re.S):
    items=[short(*m.groups()) for m in re.finditer(r'<p><a href="(https://www.youtube.com/shorts/([^"]+))" class="yt-facade" data-id="[^"]+"><img src="([^"]+)" alt="([^"]*)"[^>]*><br>(.*?)</a></p>\s*(?:<p><em>(.*?)</em></p>)?',g.group(3),re.S)]
    groups.append((g.group(1),g.group(2),items))
first=sh[0]
sn=('<main class="nfv" id="main"><div class="nf-wrap nfv-wrap"><a href="/videos" class="back-link">&#8592; Back to Videos</a><h1 class="nfv-h1">Young Hadene Shorts</h1>'
 f'<div class="nfv-intro">{sintro}</div>'
 + row('All shorts',shorts,True)
 + ''.join(f'<section class="nfv-group"><h2 class="nfv-h2">{t}</h2><p class="nfv-desc">{fv}</p><ul class="nfv-grid nfv-tall">{"".join(it)}</ul></section>' for t,fv,it in groups)
 + f'<div class="nfv-foot"><h2 class="nfv-h2">More From Young Hadene</h2>{more}</div></div></main>')
S=S[:a]+sn+S[b:]
open('videos/shorts.html','w',encoding='utf-8').write(S)
# homepage
I=open('index.html',encoding='utf-8').read()
i=I.index('<div class="nf-video">'); j=I.index('<!-- ===== ABOUT',i); j=I.rindex('</div>\n  </section>',i,j)
hp=(billboard(bro[0],'Broken','OFFICIAL MUSIC VIDEO. TORONTO.','/videos','h3')
 + row('Music videos',[card(*e[:6],None,anchor=False) for e in feat])
 + row('Latest',[card(*e[:6],None,anchor=False) for e in y26[:10]])
 + '<p style="margin-top:24px"><a class="nfv-btn nfv-btn-ghost" href="https://www.youtube.com/playlist?list=PLKcVKOEqHt-WbhdB_MueC7f8Ei5gGbz8U" target="_blank" rel="noopener">View Full Playlist on YouTube</a></p>\n    ')
I=I[:i]+hp+I[j:]
open('index.html','w',encoding='utf-8').write(I)
