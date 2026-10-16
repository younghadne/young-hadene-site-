# Post-process the inlined critical CSS on /videos pages: Ninefold tokens only.
import re,sys
ALLOWED={'#131417','#1c1e22','#ece8e1','#8d9099','#79c043'}
def fix(css):
    roots=[m for m in re.finditer(r':root\s*\{([^{}]*)\}',css)]
    first=roots[0]
    decls=[d for d in first.group(1).split(';') if d.strip() and not re.search(r'#[0-9a-f]{3,8}\b|rgba?\(',d,re.I)]
    css=css[:first.start()]+':root{'+';'.join(decls)+'}'+css[first.end():]
    rep={'#8bd052':'#79C043','#6aab39':'#79C043','rgb(139, 209, 82)':'#79C043','rgb(185, 182, 176)':'#8D9099',
         'rgba(200, 16, 46, 0.3)':'rgba(121,192,67,0.3)','rgba(7, 7, 10, 0.72)':'transparent','rgba(255, 255, 255, 0.06)':'transparent',
         'backdrop-filter: blur(24px) saturate(1.2)':'backdrop-filter: none'}
    for a,b in rep.items(): css=css.replace(a,b)
    css=css.replace('rgb(121, 192, 67)','#79C043').replace('rgb(141, 144, 153)','#8D9099').replace('rgb(236, 232, 225)','#ECE8E1').replace('rgb(28, 30, 34)','#1C1E22').replace('rgb(19, 20, 23)','#131417')
    if '.nfv-arrow{font-family' not in css: css+='.nfv-arrow{font-family:var(--font-mono)}'
    return css
for p in sys.argv[1:]:
    s=open(p).read()
    m=re.search(r'(<style id="critical-css">)(.*?)(</style>)',s,re.S)
    css=fix(m.group(2))
    bad=sorted(set(c.lower() for c in re.findall(r'#[0-9a-fA-F]{3,8}\b',css))-ALLOWED)
    print(p,'leftover hex:',bad,'rgba:',sorted(set(re.findall(r'rgba?\([^)]*\)',css))))
    s=s[:m.start(2)]+css+s[m.end(2):]; open(p,'w').write(s)
