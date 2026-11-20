import asyncio, json, urllib.request, os
from playwright.async_api import async_playwright
# Uçdan-uca test: iki istifadəçi, ötürmə, ləğv, avtomatik sinxron, geri al, ayarlar, Excel, çıxış.
# Tələb: npm run dev (başqa terminalda), pip install playwright && playwright install chromium
# Excel testi üçün xlsx kitabxanası: XLSX_PATH=... (sheetjs xlsx.full.min.js) — yoxdursa CDN-dən yüklənir.
OUT=os.environ.get('E2E_OUT','dev/e2e-shots'); os.makedirs(OUT,exist_ok=True)
LIBS={'xlsx.full.min.js':os.environ['XLSX_PATH']} if os.environ.get('XLSX_PATH') else {}
def db(): return json.load(urllib.request.urlopen('http://localhost:8791'))
def tasks(): return {k[6:]:v for k,v in db()['docs'].items() if k.startswith('tasks/') and not v.get('_deleted')}
async def ctx_new(b):
    ctx=await b.new_context(viewport={'width':1440,'height':960},accept_downloads=True)
    async def route(r):
        u=r.request.url
        for k,f in LIBS.items():
            if u.endswith(k): return await r.fulfill(path=f,content_type='application/javascript')
        return await r.continue_()
    await ctx.route('**/*',route); return ctx
async def login(pg,u,p):
    await pg.goto('http://localhost:8765/'); await pg.wait_for_url('**/login.html')
    await pg.fill('#u',u); await pg.fill('#p',p); await pg.click('#go'); await pg.wait_for_url('http://localhost:8765/'); await pg.wait_for_timeout(800)
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        A=await ctx_new(b); pa=await A.new_page(); errs=[]
        pa.on('pageerror',lambda e: errs.append(str(e)))
        await pa.goto('http://localhost:8765/'); await pa.wait_for_timeout(500)
        await pa.fill('#u','Ecosystem'); await pa.fill('#p','yanlış'); await pa.click('#go'); await pa.wait_for_timeout(1200)
        await pa.screenshot(path=OUT+'/0-login.png'); print('login err:', await pa.inner_text('#err'))
        await pa.fill('#p','Ecosystem'); await pa.click('#go'); await pa.wait_for_url('http://localhost:8765/'); await pa.wait_for_timeout(1800)
        print('db tasks', len(tasks()), 'employees', sum(1 for k in db()['docs'] if k.startswith('employees/')))
        await pa.wait_for_timeout(500)
        await pa.screenshot(path=OUT+'/1-dashboard.png',full_page=True)
        # transfer in A
        await pa.click('[data-view=employees]'); await pa.wait_for_timeout(300)
        await pa.screenshot(path=OUT+'/2-employees.png')
        await pa.click('.emp-card[data-emp="Ülvi"]'); await pa.wait_for_timeout(300)
        await pa.click('#drawerBody [data-act=transfer] >> nth=0'); await pa.select_option('#trTo','Zümrüd'); await pa.fill('#trComment','balans')
        await pa.screenshot(path=OUT+'/3-transfer.png')
        await pa.click('#modalFoot .btn-primary'); await pa.wait_for_timeout(1200)
        t=tasks()['B-25']; logs=sorted([v for k,v in db()['docs'].items() if k.startswith('log/')],key=lambda x:x['_ts'])
        print('B-25 in db:', t['owner_after'], t['updated_by'], '| last log:', {k:logs[-1][k] for k in ('user','action','from','to','comment')})
        print('sync:', await pa.inner_text('#syncPill'))
        # user B sees it
        await pa.keyboard.press('Escape'); await pa.wait_for_timeout(300)
        await pa.click('[data-view=settings]'); await pa.wait_for_timeout(800)
        await pa.click('#addUserBtn'); await pa.fill('#usName','Aysel'); await pa.fill('#usPass','Gizli-Soz-2026!'); await pa.click('#modalFoot .btn-primary'); await pa.wait_for_timeout(1200)
        print('users:', (await pa.inner_text('#userList')).replace('\n',' | ')[:120])
        await pa.screenshot(path=OUT+'/7-settings.png')
        B=await ctx_new(b); pb=await B.new_page(); await login(pb,'aysel','Gizli-Soz-2026!')
        await pb.click('[data-view=tasks]'); await pb.fill('#tSearch','Kəsişmələrin yoxlanılması'); await pb.wait_for_timeout(300)
        print('B sees owner:', (await pb.inner_text('#taskTable'))[:300].replace('\n',' | '))
        # B cancels a task; A polls
        await pb.click('#taskTable [data-act=cancel] >> nth=0'); await pb.fill('#cnComment','avtomatlaşdırıldı'); await pb.click('#modalFoot .btn-primary'); await pb.wait_for_timeout(1200)
        await pa.keyboard.press('Escape'); await pa.wait_for_timeout(11500)  # avtomatik delta yoxlaması
        print('A sees B cancel via poll:', await pa.evaluate("JSON.parse(localStorage.getItem('wfp.cache.v2')).state.tasks.filter(t=>t.is_cancelled).length"))
        await pa.click('[data-view=log]'); await pa.wait_for_timeout(300)
        print('A log top:', (await pa.inner_text('#logList'))[:260].replace('\n',' | '))
        await pa.screenshot(path=OUT+'/4-log.png')
        # undo in B
        await pb.click('#undoBtn'); await pb.wait_for_timeout(1200)
        print('cancelled in db after undo:', sum(1 for v in tasks().values() if v.get('is_cancelled')))
        # settings norm
        await pa.click('[data-view=settings]'); await pa.fill('#sNorm','1900'); await pa.click('#saveNormBtn'); await pa.wait_for_timeout(1200)
        print('meta:', {k:v for k,v in db()['docs']['meta/main'].items()})
        # Məzuniyyət (ADR-008): effektiv norma = norma − gün × 8, ayarlarda saxlanır
        assert db()['docs']['meta/main'].get('vacation_days') in (None, '30'), db()['docs']['meta/main']  # yoxdursa default 30
        await pa.click('[data-view=dashboard]'); await pa.wait_for_timeout(300)
        explain = await pa.inner_text('#normExplain'); label = await pa.inner_text('#normLabel')
        print('norm label:', label, '|', explain)
        assert '240' in explain and '30' in explain and label.replace('.', '').replace(',', '').replace(' ', '').replace('\u202f', '') == str(1900 - 240), (label, explain)
        await pa.click('[data-view=settings]')
        await pa.fill('#sNorm','1922'); await pa.click('#saveNormBtn'); await pa.wait_for_timeout(1000)
        # export + import replace
        async with pa.expect_download() as d: await pa.click('#exportBtn')
        fp=OUT+'/exp.xlsx'; await (await d.value).save_as(fp)
        import openpyxl
        wb=openpyxl.load_workbook(fp); ws=wb['Tapşırıqlar']; hdr=[c.value for c in ws[1]]; ix=hdr.index('Ləğv edilib')
        exp_cancel=sum(1 for r in ws.iter_rows(min_row=2,values_only=True) if r[ix]=='Bəli')
        await pa.set_input_files('#importFile',fp); await pa.wait_for_timeout(400); await pa.select_option('#imMode','replace'); await pa.click('#modalFoot .btn-primary'); await pa.wait_for_timeout(2000)
        T=tasks(); print('after replace import:', len(T), 'cancelled', sum(1 for v in T.values() if v.get('is_cancelled')), 'export had', exp_cancel)
        print('calls sample:', db()['calls'][-6:])
        await pa.click('[data-view=tasks]'); await pa.wait_for_timeout(300)
        await pa.screenshot(path=OUT+'/5-tasks.png')
        await pa.set_viewport_size({'width':390,'height':844}); await pa.click('[data-view=dashboard]'); await pa.wait_for_timeout(600)
        await pa.screenshot(path=OUT+'/6-mobile.png')
        # logout
        await pa.set_viewport_size({'width':1440,'height':960}); await pa.click('#logoutBtn'); await pa.wait_for_url('**/login.html'); print('logout ok')
        print('ERRORS', errs)
        assert not errs, errs
        assert len(T)==341 and sum(1 for v in T.values() if v.get('is_cancelled'))==exp_cancel
        await b.close()
asyncio.run(main())
