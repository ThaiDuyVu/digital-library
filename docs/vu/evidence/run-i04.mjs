// Hoi quy 2 loi vua sua: (1) PUT song song ghi de vi tri moi, (2) khoi phuc "dong" trong trang.
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { Cdp, Page, browserWs, launchChrome, sleep } from './cdp.mjs'

const EV = import.meta.dirname
const APP = 'http://localhost:5173/'
const BOOK = 'b00c00000000000000000029'
const USER = 'vu_i01'
const PASS = 'doan123456'
const TARGET = 30
const LINE = 3

const redis = (...a) => execFileSync('docker', ['exec', 'dl_redis', 'redis-cli', '-n', '4', ...a], { encoding: 'utf8' }).trim()
const log = []
const step = (n, d) => { log.push({ n, d }); console.log(`[${log.length}] ${n}${d ? ' -> ' + d : ''}`) }

const chrome = launchChrome(`${EV}/chrome-profile2`)
let cdp
try {
  cdp = await Cdp.open(await browserWs())
  let p = await Page.create(cdp, APP)
  await p.waitFor('!!document.querySelector(".site-nav button")')
  // Doi AuthProvider kiem tra phien xong roi moi biet can dang nhap hay khong
  await p.waitFor('!document.body.textContent.includes("Đang kiểm tra phiên")', { label: 'kiem tra phien xong' })
  if (!(await p.eval('!!document.querySelector(".user-box")'))) {
    await p.clickText('.site-nav button', 'Tài khoản')
    await p.waitFor('document.querySelectorAll(".form input").length === 2')
    await p.type('.form input', 0, USER)
    await p.type('.form input', 1, PASS)
    await p.clickText('.form button', 'Đăng nhập')
    await p.waitFor('!!document.querySelector(".user-box")')
  }
  const userId = JSON.parse(execFileSync('docker', ['exec', 'dl_mongodb', 'mongosh',
    'mongodb://admin:admin123@localhost:27017/digital_library_uiev?authSource=admin', '--quiet',
    '--eval', `JSON.stringify({id: db.users.findOne({username:"${USER}"})._id.toHexString()})`], { encoding: 'utf8' }).trim()).id
  const KEY = `progress:${userId}:${BOOK}`
  redis('DEL', KEY)
  step('Xoa tien trinh cu trong sandbox DB4', KEY)

  await p.clickText('.site-nav button', 'Đọc sách')
  await p.waitFor(`!!document.querySelector('select[aria-label="Chọn sách"] option[value="${BOOK}"]')`)
  await p.select('select[aria-label="Chọn sách"]', BOOK)
  await p.waitFor('!!document.querySelector(".reader-chapter-banner")')

  // --- (1) Lat that nhanh roi nhay toi trang 30, KHONG cho giua chung ---
  for (let i = 0; i < 5; i++) await p.clickText('.reader-pager button', 'Trang sau')
  await p.eval(`
    const el = document.querySelector('.reader-jump input');
    const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
    s.call(el, '${TARGET}'); el.dispatchEvent(new Event('input', {bubbles:true})); return true;`)
  await p.waitFor(`document.querySelector(".page-indicator").textContent.includes("Trang ${TARGET} /")`)
  await p.waitFor('(document.querySelector(".save-status")||{}).textContent?.includes("Đã lưu")')
  await sleep(500)
  const afterRace = redis('HGETALL', KEY).split('\n').join(' ')
  const racePage = redis('HGET', KEY, 'page')
  step('Redis sau khi lat nhanh + nhay trang', afterRace)
  step('(1) PUT song song khong con ghi de', racePage === String(TARGET) ? `DAT (page=${racePage})` : `KHONG DAT (page=${racePage})`)

  // --- (2) Cuon toi khoi thu 4 de sinh "dong" khac 0 ---
  const blockCount = await p.eval(`document.querySelectorAll('.reader-text p, .reader-text h4').length`)
  const line = Math.min(LINE, blockCount - 1)
  step('So khoi van ban cua trang 30', `${blockCount} -> cuon toi khoi thu ${line + 1}`)
  await p.eval(`document.querySelectorAll('.reader-text p, .reader-text h4')[${line}].scrollIntoView({block:'start'}); return true`)
  await sleep(800)
  step('Trang thai luu tren UI', (await p.eval('document.querySelector(".save-status").textContent')).trim())
  await p.shot(`${EV}/14-trang-30-dong-4.png`)
  await p.close()
  await sleep(1000)
  const saved = redis('HGETALL', KEY).split('\n').join(' ')
  const savedLine = redis('HGET', KEY, 'line')
  step('Redis sau khi dong tab', saved)
  step('Ghi duoc "dong" khac 0?', Number(savedLine) > 0 ? `DAT (line=${savedLine})` : `KHONG DAT (line=${savedLine})`)

  // --- Mo lai: dung trang 30 va cuon toi dung dong ---
  p = await Page.create(cdp, APP)
  await p.waitFor('!!document.querySelector(".user-box")')
  await p.clickText('.site-nav button', 'Đọc sách')
  await p.waitFor(`!!document.querySelector('select[aria-label="Chọn sách"] option[value="${BOOK}"]')`)
  await p.select('select[aria-label="Chọn sách"]', BOOK)
  await p.waitFor('!!document.querySelector(".resume-bar")')
  await sleep(500)
  step('Thong bao khoi phuc', await p.eval('document.querySelector(".resume-bar").textContent'))
  step('Vi tri sau khi mo lai', await p.eval('document.querySelector(".reader-chapter-banner").textContent'))
  const vis = await p.eval(`
    const n = document.querySelectorAll('.reader-text p, .reader-text h4')[${savedLine}];
    const r = n.getBoundingClientRect();
    return {top: Math.round(r.top), trongManHinh: r.top > -50 && r.top < window.innerHeight};`)
  step('(2) Dong da luu co nam trong man hinh khong', `top=${vis.top}px -> ${vis.trongManHinh ? 'DAT' : 'KHONG DAT'}`)
  await p.shot(`${EV}/15-mo-lai-trang-30-dung-dong.png`)
  if (p.console.length) step('Console loi/canh bao', JSON.stringify(p.console))
  await p.close()
} catch (err) {
  step('LOI', err.message); console.error(err); process.exitCode = 1
} finally {
  writeFileSync(`${EV}/i04-log.json`, JSON.stringify(log, null, 2))
  try { await cdp?.send('Browser.close') } catch { /* dong roi */ }
  chrome.kill()
}
