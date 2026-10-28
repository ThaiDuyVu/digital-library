// Kiem chung mốc "Trang 30" cua barem sau khi chuyen sang phan trang ca cuon sach.
// Sandbox: Mongo digital_library_uiev + Redis DB4.
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { Cdp, Page, browserWs, launchChrome, sleep } from './cdp.mjs'

const EV = import.meta.dirname
const APP = 'http://localhost:5173/'
const BOOK = 'b00c00000000000000000029'
const USER = 'vu_i01'
const PASS = 'doan123456'
const TARGET = 30

const redis = (...a) => execFileSync('docker', ['exec', 'dl_redis', 'redis-cli', '-n', '4', ...a], { encoding: 'utf8' }).trim()
const log = []
const step = (n, d) => { log.push({ n, d }); console.log(`[${log.length}] ${n}${d ? ' -> ' + d : ''}`) }

const chrome = launchChrome(`${EV}/chrome-profile2`)
let cdp
try {
  cdp = await Cdp.open(await browserWs())

  let p = await Page.create(cdp, APP)
  await p.waitFor('!!document.querySelector(".site-nav button")')
  await p.clickText('.site-nav button', 'Tài khoản')
  await p.waitFor('document.querySelectorAll(".form input").length === 2')
  await p.type('.form input', 0, USER)
  await p.type('.form input', 1, PASS)
  await p.clickText('.form button', 'Đăng nhập')
  await p.waitFor('!!document.querySelector(".user-box")', { label: 'dang nhap' })
  const userId = JSON.parse(execFileSync('docker', ['exec', 'dl_mongodb', 'mongosh',
    'mongodb://admin:admin123@localhost:27017/digital_library_uiev?authSource=admin', '--quiet',
    '--eval', `JSON.stringify({id: db.users.findOne({username:"${USER}"})._id.toHexString()})`], { encoding: 'utf8' }).trim()).id
  const KEY = `progress:${userId}:${BOOK}`
  step('Dang nhap', `userId=${userId}`)

  await p.clickText('.site-nav button', 'Đọc sách')
  await p.waitFor(`!!document.querySelector('select[aria-label="Chọn sách"] option[value="${BOOK}"]')`)
  await p.select('select[aria-label="Chọn sách"]', BOOK)
  await p.waitFor('!!document.querySelector(".reader-chapter-banner")', { label: 'mo sach' })

  const total = await p.eval('Number(document.querySelector(".page-indicator").textContent.match(/\\/\\s*(\\d+)/)[1])')
  step('Tong so trang CA CUON', String(total))
  step('Mo lan dau', await p.eval('document.querySelector(".reader-chapter-banner").textContent'))
  await p.shot(`${EV}/11-mo-sach-phan-trang-ca-cuon.png`)

  // Doc toi trang 30: lat vai trang that roi dung o nhay trang
  for (let i = 0; i < 3; i++) {
    await p.clickText('.reader-pager button', 'Trang sau')
    await p.waitFor(`document.querySelector(".page-indicator").textContent.includes("Trang ${i + 2} /")`)
  }
  step('Lat tay 3 trang', await p.eval('document.querySelector(".page-indicator").textContent.trim()'))

  await p.eval(`
    const el = document.querySelector('.reader-jump input');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, '${TARGET}');
    el.dispatchEvent(new Event('input', {bubbles:true}));
    return true;`)
  await p.waitFor(`document.querySelector(".page-indicator").textContent.includes("Trang ${TARGET} /")`, { label: `trang ${TARGET}` })
  await p.waitFor('(document.querySelector(".save-status")||{}).textContent?.includes("Đã lưu")')
  step('Da toi trang 30', await p.eval('document.querySelector(".reader-chapter-banner").textContent'))

  // Cuon xuong de sinh "dong" khac 0 -> kiem tra yeu cau "vi tri trang/dong"
  await p.eval('window.scrollTo(0, document.body.scrollHeight * 0.55); return true')
  await sleep(900)
  const uiLine = await p.eval('document.querySelector(".save-status").textContent')
  step('Trang thai luu tren UI', uiLine.trim())
  await p.shot(`${EV}/12-trang-30-truoc-khi-dong.png`)
  step('Hash Redis truoc khi dong tab', redis('HGETALL', KEY).split('\n').join(' '))

  await p.close()
  step('Da dong tab')
  await sleep(900)
  step('Hash Redis sau khi dong tab', redis('HGETALL', KEY).split('\n').join(' '))

  // Mo lai -> phai tu mo dung Trang 30
  p = await Page.create(cdp, APP)
  await p.waitFor('!!document.querySelector(".user-box")')
  await p.clickText('.site-nav button', 'Đọc sách')
  await p.waitFor(`!!document.querySelector('select[aria-label="Chọn sách"] option[value="${BOOK}"]')`)
  await p.select('select[aria-label="Chọn sách"]', BOOK)
  await p.waitFor('!!document.querySelector(".resume-bar")', { label: 'thong bao tiep tuc' })
  const note = await p.eval('document.querySelector(".resume-bar").textContent')
  const banner = await p.eval('document.querySelector(".reader-chapter-banner").textContent')
  const scrolled = await p.eval('Math.round(window.scrollY)')
  step('Thong bao khoi phuc', note)
  step('Vi tri sau khi mo lai', banner)
  step('Da tu cuon xuong (scrollY)', String(scrolled))
  await p.shot(`${EV}/13-mo-lai-dung-trang-30.png`)
  step('KET QUA moc Trang 30', banner.includes(`Trang ${TARGET} /`) ? 'DAT' : 'KHONG DAT')
  if (p.console.length) step('Console loi/canh bao', JSON.stringify(p.console))
  await p.close()
} catch (err) {
  step('LOI', err.message); console.error(err); process.exitCode = 1
} finally {
  writeFileSync(`${EV}/i03-log.json`, JSON.stringify(log, null, 2))
  try { await cdp?.send('Browser.close') } catch { /* dong roi */ }
  chrome.kill()
}
