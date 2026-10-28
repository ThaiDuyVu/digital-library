// I02 chay lai tren reader moi (phan trang ca cuon): lat trang qua ranh gioi chuong
// van phai tang luot doc va BXH van phai nhay vi tri. Sandbox Redis DB4.
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { Cdp, Page, browserWs, launchChrome, sleep } from './cdp.mjs'

const EV = import.meta.dirname
const APP = 'http://localhost:5173/'
const BOOK = 'b00c00000000000000000029'
const RIVALS = [['6ad9aafea64520f313150512', 9], ['b00c00000000000000000001', 7], ['b00c00000000000000000002', 5]]
const redis = (...a) => execFileSync('docker', ['exec', 'dl_redis', 'redis-cli', '-n', '4', ...a], { encoding: 'utf8' }).trim()
const log = []
const step = (n, d) => { log.push({ n, d }); console.log(`[${log.length}] ${n}${d ? ' -> ' + d : ''}`) }
const TABLE = `return [...document.querySelectorAll('.rank-table tbody tr')].map((tr,i)=>({
  hang:i+1, ten:tr.querySelector('.book-title')?.textContent??'',
  diem:tr.querySelector('td.num')?.textContent??'', xuhuong:tr.querySelector('.col-trend')?.textContent?.trim()??''}));`

const chrome = launchChrome(`${EV}/chrome-profile2`)
let cdp
try {
  cdp = await Cdp.open(await browserWs())
  for (const [id, sc] of RIVALS) redis('ZADD', 'ranking:books', String(sc), id)
  redis('ZADD', 'ranking:books', '1', BOOK)
  const locks = redis('KEYS', 'read-lock:*').split('\n').filter(Boolean)
  if (locks.length) redis('DEL', ...locks)
  step('Moc dau ZSET sandbox', redis('ZREVRANGE', 'ranking:books', '0', '-1', 'WITHSCORES').split('\n').join(' '))

  const a = await Page.create(cdp, APP)
  await a.waitFor('!!document.querySelector(".site-nav button")')
  await a.waitFor('!document.body.textContent.includes("Đang kiểm tra phiên")')
  await a.clickText('.site-nav button', 'Thịnh hành')
  await a.waitFor('document.querySelectorAll(".rank-table tbody tr").length > 0')
  const before = await a.eval(TABLE)
  step('BXH truoc', JSON.stringify(before))
  await a.shot(`${EV}/18-bxh-truoc.png`)
  const rankBefore = before.findIndex((r) => r.ten.includes('Hành trình')) + 1

  const b = await Page.create(cdp, APP)
  await b.waitFor('!!document.querySelector(".site-nav button")')
  await b.waitFor('!document.body.textContent.includes("Đang kiểm tra phiên")')
  await b.clickText('.site-nav button', 'Đọc sách')
  await b.waitFor(`!!document.querySelector('select[aria-label="Chọn sách"] option[value="${BOOK}"]')`)
  await b.select('select[aria-label="Chọn sách"]', BOOK)
  await b.waitFor('!!document.querySelector(".reader-chapter-banner")')
  for (const ch of [2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    await b.select('select[aria-label="Chọn chương"]', ch)
    await b.waitFor(`document.querySelector(".reader-chapter-banner").textContent.includes("Chương ${ch}:")`, { label: `chuong ${ch}` })
    await sleep(220)
  }
  const reads = b.net.filter((n) => n.url.includes('/read?'))
  step('POST /read tu trinh duyet', `${reads.length} request, status ${[...new Set(reads.map((r) => r.status))].join('/')}`)
  step('ZSET sau khi doc', redis('ZREVRANGE', 'ranking:books', '0', '-1', 'WITHSCORES').split('\n').join(' '))
  await b.close()

  await a.clickText('.toolbar button', 'Tải lại')
  await a.waitFor(`document.querySelector('.rank-table tbody tr .book-title').textContent.includes('Hành trình')`, { label: 'len hang 1' })
  const after = await a.eval(TABLE)
  step('BXH sau', JSON.stringify(after))
  await a.shot(`${EV}/19-bxh-sau.png`)
  const rankAfter = after.findIndex((r) => r.ten.includes('Hành trình')) + 1
  step('Thu hang', `truoc=${rankBefore} sau=${rankAfter}`)
  step('I02 tren reader moi', rankAfter < rankBefore ? 'DAT' : 'KHONG DAT')
  await a.close()
} catch (err) {
  step('LOI', err.message); console.error(err); process.exitCode = 1
} finally {
  writeFileSync(`${EV}/i06-log.json`, JSON.stringify(log, null, 2))
  try { await cdp?.send('Browser.close') } catch {}
  chrome.kill()
}
