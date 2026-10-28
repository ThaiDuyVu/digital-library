// I02: mo nhieu chuong -> score tang va THU HANG DOI tren web.
// Tab A giu nguyen trang BXH de cot "Xu huong" so sanh duoc truoc/sau; tab B la tab doc sach.
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { Cdp, Page, browserWs, launchChrome, sleep } from './cdp.mjs'

const EV = import.meta.dirname
const APP = 'http://localhost:5173/'
const BOOK = 'b00c00000000000000000029'
const TITLE = 'Hành trình đi tìm tương lai của loài người'
const RIVALS = [
  ['6ad9aafea64520f313150512', 9],
  ['b00c00000000000000000001', 7],
  ['b00c00000000000000000002', 5],
]

const redis = (...args) =>
  execFileSync('docker', ['exec', 'dl_redis', 'redis-cli', '-n', '3', ...args], { encoding: 'utf8' }).trim()

const log = []
const step = (name, detail) => { log.push({ name, detail }); console.log(`[${log.length}] ${name}${detail ? ' -> ' + detail : ''}`) }

// Bang xep hang tren UI: [{hang, ten, diem, xuhuong}]
const READ_TABLE = `
  return [...document.querySelectorAll('.rank-table tbody tr')].map((tr, i) => ({
    hang: i + 1,
    ten: tr.querySelector('.book-title')?.textContent ?? '',
    diem: tr.querySelector('td.num')?.textContent ?? '',
    xuhuong: tr.querySelector('.col-trend')?.textContent?.trim() ?? '',
  }));`

const chrome = launchChrome(`${EV}/chrome-profile`)
let cdp
try {
  cdp = await Cdp.open(await browserWs())

  // Dat lai rieng sandbox DB3 ve moc dau: doi chung 9/7/5, sach muc tieu 2, xoa khoa chong lap cua lan chay truoc.
  for (const [id, score] of RIVALS) redis('ZADD', 'ranking:books', String(score), id)
  redis('ZADD', 'ranking:books', '2', BOOK)
  const locks = redis('KEYS', 'read-lock:*').split('\n').filter(Boolean)
  if (locks.length) redis('DEL', ...locks)
  step('Xoa khoa chong lap cua lan chay truoc (chi sandbox DB3)', `${locks.length} khoa`)
  step('Nap doi chung vao ZSET sandbox', redis('ZREVRANGE', 'ranking:books', '0', '-1', 'WITHSCORES').split('\n').join(' '))

  // ---------- Tab A: trang bang xep hang ----------
  const a = await Page.create(cdp, APP)
  await a.waitFor('!!document.querySelector(".user-box")', { label: 'phien con song' })
  await a.clickText('.site-nav button', 'Thịnh hành')
  await a.waitFor('document.querySelectorAll(".rank-table tbody tr").length > 0', { label: 'bang xep hang' })
  const before = await a.eval(READ_TABLE)
  step('BXH truoc (UI)', JSON.stringify(before))
  await a.shot(`${EV}/08-bxh-truoc.png`)
  const rankBefore = before.findIndex((r) => r.ten.includes('Hành trình')) + 1

  // ---------- Tab B: mo lan luot cac chuong con lai ----------
  const b = await Page.create(cdp, APP)
  await b.waitFor('!!document.querySelector(".user-box")')
  await b.clickText('.site-nav button', 'Đọc sách')
  await b.waitFor(`!!document.querySelector('select[aria-label="Chọn sách"] option[value="${BOOK}"]')`)
  await b.select('select[aria-label="Chọn sách"]', BOOK)
  await b.waitFor('!!document.querySelector(".reader-chapter-banner")')

  for (const ch of [3, 4, 5, 6, 7, 8, 9, 10]) {
    await b.select('select[aria-label="Chọn chương"]', ch)
    await b.waitFor(`document.querySelector(".reader-chapter-banner").textContent.includes("Chương ${ch}:")`, { label: `chuong ${ch}` })
    await sleep(250)
  }
  const reads = b.net.filter((n) => n.url.includes('/read?'))
  step('POST /read da gui tu trinh duyet', `${reads.length} request, tat ca ${[...new Set(reads.map((r) => r.status))].join('/')}`)
  step('ZSET sau khi doc', redis('ZREVRANGE', 'ranking:books', '0', '-1', 'WITHSCORES').split('\n').join(' '))
  await b.shot(`${EV}/09-doc-nhieu-chuong.png`)

  // Mo lai dung chuong 10 ngay: khoa 60s phai chan, diem khong tang
  const scoreBeforeDup = redis('ZSCORE', 'ranking:books', BOOK)
  await b.select('select[aria-label="Chọn chương"]', 9)
  await b.waitFor('document.querySelector(".reader-chapter-banner").textContent.includes("Chương 9:")')
  await b.select('select[aria-label="Chọn chương"]', 10)
  await b.waitFor('document.querySelector(".reader-chapter-banner").textContent.includes("Chương 10:")')
  await sleep(600)
  const scoreAfterDup = redis('ZSCORE', 'ranking:books', BOOK)
  step('Chong tang lap 60s', `truoc=${scoreBeforeDup} sau khi mo lai chuong cu=${scoreAfterDup} -> ${scoreBeforeDup === scoreAfterDup ? 'DAT' : 'KHONG DAT'}`)
  await b.close()

  // ---------- Tab A: lam moi, cot Xu huong so voi lan truoc ----------
  await a.clickText('.toolbar button', 'Tải lại')
  await a.waitFor(`document.querySelector('.rank-table tbody tr .book-title').textContent.includes('Hành trình')`, { label: 'sach len dau bang' })
  const after = await a.eval(READ_TABLE)
  step('BXH sau (UI)', JSON.stringify(after))
  await a.shot(`${EV}/10-bxh-sau.png`)
  const rankAfter = after.findIndex((r) => r.ten.includes('Hành trình')) + 1

  step('Thu hang cua sach muc tieu', `truoc=${rankBefore} sau=${rankAfter}`)
  step('I02', rankAfter < rankBefore ? 'DAT - thu hang doi tren web' : 'KHONG DAT')
  if (a.console.length) step('Console loi/canh bao', JSON.stringify(a.console))
  await a.close()
} catch (err) {
  step('LOI', err.message)
  console.error(err)
  process.exitCode = 1
} finally {
  writeFileSync(`${EV}/i02-log.json`, JSON.stringify(log, null, 2))
  try { await cdp?.send('Browser.close') } catch { /* dong roi */ }
  chrome.kill()
}
