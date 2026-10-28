// I01: doc den trang cuoi, dong tab, mo lai cung tai khoan -> phai khoi phuc dung trang.
// Chay trong Chrome that qua CDP. Sandbox: Mongo digital_library_uiev + Redis DB3.
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { Cdp, Page, browserWs, launchChrome, sleep } from './cdp.mjs'

const EV = import.meta.dirname
const APP = 'http://localhost:5173/'
const BOOK = 'b00c00000000000000000029' // Hanh trinh di tim tuong lai cua loai nguoi (chuong dai nhat)
const CHAPTER = 2
const USER = 'vu_i01'
const PASS = 'doan123456'

const redis = (...args) =>
  execFileSync('docker', ['exec', 'dl_redis', 'redis-cli', '-n', '3', ...args], { encoding: 'utf8' }).trim()

const log = []
const step = (name, detail) => { log.push({ name, detail }); console.log(`[${log.length}] ${name}${detail ? ' -> ' + detail : ''}`) }

const chrome = launchChrome(`${EV}/chrome-profile`)
let cdp
try {
  cdp = await Cdp.open(await browserWs())
  step('Chrome headless=new mo cong CDP')

  // ---------- Dang ky + dang nhap ----------
  let p = await Page.create(cdp, APP)
  await p.waitFor('!!document.querySelector(".site-nav button")', { label: 'app render' })
  await p.clickText('.site-nav button', 'Tài khoản')
  await p.waitFor('!!document.querySelector(".tabs button")')
  await p.shot(`${EV}/01-tai-khoan.png`)

  await p.clickText('.tabs button', 'Đăng ký')
  await p.waitFor('document.querySelectorAll(".form input").length === 5')
  await p.type('.form input', 0, USER)
  await p.type('.form input', 1, 'vu.i01@huit.edu.vn')
  await p.type('.form input', 2, 'Vu I01')
  await p.type('.form input', 3, PASS)
  await p.type('.form input', 4, PASS)
  await p.shot(`${EV}/02-form-dang-ky.png`)
  await p.clickText('.form button', 'Tạo tài khoản')
  await p.waitFor('!!document.querySelector(".success-text")', { label: 'thong bao dang ky' })
  step('Dang ky qua UI', await p.eval('document.querySelector(".success-text").textContent'))

  await p.type('.form input', 0, USER)
  await p.type('.form input', 1, PASS)
  await p.clickText('.form button', 'Đăng nhập')
  await p.waitFor('!!document.querySelector(".user-box")', { label: 'da dang nhap' })
  step('Dang nhap', await p.eval('document.querySelector(".user-name").textContent'))
  await p.shot(`${EV}/03-da-dang-nhap.png`)

  const userId = JSON.parse(
    execFileSync('docker', ['exec', 'dl_mongodb', 'mongosh',
      'mongodb://admin:admin123@localhost:27017/digital_library_uiev?authSource=admin',
      '--quiet', '--eval', `JSON.stringify({id: db.users.findOne({username:"${USER}"})._id.toHexString()})`],
      { encoding: 'utf8' }).trim()).id
  step('userId trong Mongo', userId)

  const KEY = `progress:${userId}:${BOOK}`
  step('Hash truoc khi doc', `${KEY} = ${redis('HGETALL', KEY) || '(chua co)'}`)

  // ---------- Mo sach, lat den trang cuoi chuong 2 ----------
  await p.clickText('.site-nav button', 'Đọc sách')
  await p.waitFor('!!document.querySelector(\'select[aria-label="Chọn sách"] option[value="' + BOOK + '"]\')', { label: 'danh sach sach' })
  await p.select('select[aria-label="Chọn sách"]', BOOK)
  await p.waitFor('!!document.querySelector(".reader-chapter-banner")', { label: 'mo sach' })
  step('Mo sach lan dau', await p.eval('document.querySelector(".reader-chapter-banner").textContent'))
  step('Co resume-bar luc moi doc?', String(await p.eval('!!document.querySelector(".resume-bar")')))
  await p.shot(`${EV}/04-mo-sach-lan-dau.png`)

  await p.select('select[aria-label="Chọn chương"]', CHAPTER)
  await p.waitFor(`document.querySelector(".reader-chapter-banner").textContent.includes("Chương ${CHAPTER}")`)

  const totalPages = await p.eval('Number(document.querySelector(".page-indicator").textContent.match(/\\/\\s*(\\d+)/)[1])')
  step('So trang cua chuong ' + CHAPTER, String(totalPages))

  for (let i = 1; i < totalPages; i++) {
    await p.clickText('.reader-pager button', 'Trang sau')
    await p.waitFor(`document.querySelector(".page-indicator").textContent.includes("Trang ${i + 1} /")`, { label: `trang ${i + 1}` })
  }
  await p.waitFor('(document.querySelector(".save-status")||{}).textContent?.includes("Đã lưu")', { label: 'bao da luu' })
  const bannerBefore = await p.eval('document.querySelector(".reader-chapter-banner").textContent')
  step('Vi tri truoc khi dong tab', bannerBefore)
  step('Trang thai luu tren UI', await p.eval('document.querySelector(".save-status").textContent'))
  await p.shot(`${EV}/05-truoc-khi-dong-tab.png`)
  const hashBefore = redis('HGETALL', KEY).split('\n').join(' ')
  step('Hash Redis truoc khi dong tab', hashBefore)
  step('Request /api da gui', JSON.stringify(p.net.filter((n) => /progress|read/.test(n.url))))
  if (p.console.length) step('Console loi/canh bao', JSON.stringify(p.console))

  // ---------- Dong tab that ----------
  await p.close()
  step('Da dong tab (Target.closeTarget)')
  await sleep(600)

  // ---------- Mo tab moi, cung profile => cung localStorage/phien ----------
  p = await Page.create(cdp, APP)
  await p.waitFor('!!document.querySelector(".user-box")', { label: 'phien con song sau khi mo lai' })
  step('Mo lai: con dang nhap', await p.eval('document.querySelector(".user-name").textContent'))
  await p.clickText('.site-nav button', 'Đọc sách')
  await p.waitFor('!!document.querySelector(\'select[aria-label="Chọn sách"] option[value="' + BOOK + '"]\')')
  await p.select('select[aria-label="Chọn sách"]', BOOK)
  await p.waitFor('!!document.querySelector(".reader-chapter-banner")', { label: 'mo lai sach' })
  await p.waitFor('!!document.querySelector(".resume-bar")', { label: 'thong bao tiep tuc' })
  const resumeNote = await p.eval('document.querySelector(".resume-bar").textContent')
  const bannerAfter = await p.eval('document.querySelector(".reader-chapter-banner").textContent')
  step('Thong bao khoi phuc', resumeNote)
  step('Vi tri sau khi mo lai', bannerAfter)
  await p.shot(`${EV}/06-sau-khi-mo-lai.png`)

  const I01_MAIN = bannerAfter.includes(`Chương ${CHAPTER}`) && bannerAfter.includes(`Trang ${totalPages} /`)
  step('I01 luong chinh', I01_MAIN ? 'DAT' : 'KHONG DAT')

  // ---------- Ca bien: dong tab NGAY khi PUT dang gui (keepalive) ----------
  await p.clickText('.reader-pager button', 'Trang trước')
  await p.waitFor(`document.querySelector(".page-indicator").textContent.includes("Trang ${totalPages - 1} /")`)
  const inflight = await p.eval('document.querySelector(".save-status").textContent')
  await p.close() // khong cho PUT xong
  step('Lat ve trang ' + (totalPages - 1) + ' roi dong tab ngay', `save-status luc dong = "${inflight}"`)
  await sleep(1500)
  const hashInflight = redis('HGETALL', KEY).split('\n').join(' ')
  step('Hash Redis sau khi dong tab giua luc gui', hashInflight)
  step('I01 ca bien keepalive', hashInflight.includes(String(totalPages - 1)) ? 'DAT' : 'KHONG DAT')

  // ---------- Doi chieu: trang 30 co mo duoc khong? ----------
  redis('HSET', KEY, 'chapter', String(CHAPTER), 'page', '30', 'line', '0')
  step('Dat cung tay Hash ve trang 30 (mo phong kich ban demo)', redis('HGETALL', KEY).split('\n').join(' '))
  p = await Page.create(cdp, APP)
  await p.waitFor('!!document.querySelector(".user-box")')
  await p.clickText('.site-nav button', 'Đọc sách')
  await p.waitFor('!!document.querySelector(\'select[aria-label="Chọn sách"] option[value="' + BOOK + '"]\')')
  await p.select('select[aria-label="Chọn sách"]', BOOK)
  await p.waitFor('!!document.querySelector(".resume-bar")')
  const note30 = await p.eval('document.querySelector(".resume-bar").textContent')
  const banner30 = await p.eval('document.querySelector(".reader-chapter-banner").textContent')
  step('Thong bao noi gi', note30)
  step('Thuc te hien thi', banner30)
  step('Trang 30 co mo duoc?', banner30.includes('Trang 30 /') ? 'CO' : 'KHONG - bi ket xuong trang cuoi')
  await p.shot(`${EV}/07-kich-ban-trang-30.png`)
  await p.close()
} catch (err) {
  step('LOI', err.message)
  console.error(err)
  process.exitCode = 1
} finally {
  writeFileSync(`${EV}/i01-log.json`, JSON.stringify(log, null, 2))
  try { await cdp?.send('Browser.close') } catch { /* dong roi */ }
  chrome.kill()
}
