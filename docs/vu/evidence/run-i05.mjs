// Yeu cau barem: "Luu vi tri trang/DONG doc do". Kiem tren khung 1280x600 (laptop nho)
// de trang thuc su dai hon man hinh, luc do "dong" moi co y nghia.
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { Cdp, Page, browserWs, launchChrome, sleep } from './cdp.mjs'

const EV = import.meta.dirname
const APP = 'http://localhost:5173/'
const BOOK = 'b00c00000000000000000029'
const redis = (...a) => execFileSync('docker', ['exec', 'dl_redis', 'redis-cli', '-n', '4', ...a], { encoding: 'utf8' }).trim()
const log = []
const step = (n, d) => { log.push({ n, d }); console.log(`[${log.length}] ${n}${d ? ' -> ' + d : ''}`) }
const SMALL = { width: 1280, height: 600, deviceScaleFactor: 1, mobile: false }

const openReader = async (cdp) => {
  const p = await Page.create(cdp, APP)
  await p.send('Emulation.setDeviceMetricsOverride', SMALL)
  await p.waitFor('!!document.querySelector(".site-nav button")', { label: 'app render' })
  await p.waitFor('!document.body.textContent.includes("Đang kiểm tra phiên")', { label: 'kiem tra phien xong' })
  await p.clickText('.site-nav button', 'Đọc sách')
  await p.waitFor(`!!document.querySelector('select[aria-label="Chọn sách"] option[value="${BOOK}"]')`)
  await p.select('select[aria-label="Chọn sách"]', BOOK)
  await p.waitFor('!!document.querySelector(".reader-chapter-banner")')
  return p
}

const chrome = launchChrome(`${EV}/chrome-profile2`)
let cdp
try {
  cdp = await Cdp.open(await browserWs())
  const userId = JSON.parse(execFileSync('docker', ['exec', 'dl_mongodb', 'mongosh',
    'mongodb://admin:admin123@localhost:27017/digital_library_uiev?authSource=admin', '--quiet',
    '--eval', 'JSON.stringify({id: db.users.findOne({username:"vu_i01"})._id.toHexString()})'], { encoding: 'utf8' }).trim()).id
  const KEY = `progress:${userId}:${BOOK}`

  let p = await openReader(cdp)
  const geo = await p.eval(`
    const a = document.querySelector('.reader-text');
    return {viewport: innerHeight, docH: document.body.scrollHeight,
            lineHeight: Math.round(parseFloat(getComputedStyle(a).lineHeight))};`)
  step('Khung do', `man hinh cao ${geo.viewport}px, trang cao ${geo.docH}px, moi dong ${geo.lineHeight}px`)

  await p.eval('window.scrollTo(0, document.body.scrollHeight); return true')
  await sleep(800)
  const ui = (await p.eval('document.querySelector(".save-status").textContent')).trim()
  step('UI bao dang o dong nao', ui || '(chua luu lan nao)')
  await p.shot(`${EV}/16-dong-khac-0.png`)

  await p.close()
  await sleep(1000)
  const saved = redis('HGETALL', KEY).split('\n').join(' ')
  const line = Number(redis('HGET', KEY, 'line'))
  const page = redis('HGET', KEY, 'page')
  step('Redis sau khi dong tab', saved)
  step('Ghi duoc "dong" khac 0?', line > 0 ? `DAT (trang ${page}, dong ${line})` : `KHONG DAT (line=${line})`)

  p = await openReader(cdp)
  await sleep(900)
  const back = await p.eval(`
    const a = document.querySelector('.reader-text');
    return {scrollY: Math.round(scrollY), articleTop: Math.round(a.getBoundingClientRect().top),
            banner: document.querySelector('.reader-chapter-banner').textContent,
            note: document.querySelector('.resume-bar')?.textContent ?? ''};`)
  step('Thong bao khoi phuc', back.note)
  step('Vi tri sau khi mo lai', back.banner)
  const expected = Math.round(line * geo.lineHeight)
  const actual = 160 - back.articleTop
  step('Cuon lai dung dong?', `can ${expected}px tu dau vung van ban, thuc te ${actual}px, lech ${Math.abs(expected - actual)}px`)
  step('KET QUA "trang/dong"', Math.abs(expected - actual) <= geo.lineHeight ? 'DAT' : 'KHONG DAT')
  await p.shot(`${EV}/17-khoi-phuc-dung-dong.png`)
  await p.close()
} catch (err) {
  step('LOI', err.message); console.error(err); process.exitCode = 1
} finally {
  writeFileSync(`${EV}/i05-log.json`, JSON.stringify(log, null, 2))
  try { await cdp?.send('Browser.close') } catch {}
  chrome.kill()
}
