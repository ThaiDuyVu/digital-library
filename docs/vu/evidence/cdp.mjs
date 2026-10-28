// Driver Chrome qua DevTools Protocol, chi dung API co san cua Node 22 (global WebSocket).
// Khong cai them dependency nao.
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = Number(process.env.CDP_PORT || 9333)

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export function launchChrome(profileDir) {
  mkdirSync(profileDir, { recursive: true })
  const child = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--window-size=1440,1100',
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] })
  return child
}

export async function browserWs() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`)
      const j = await r.json()
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl
    } catch { /* chua len */ }
    await sleep(200)
  }
  throw new Error('Chrome khong mo duoc cong debug')
}

/** Mot ket noi CDP; gui lenh co/khong sessionId, va thu event theo session. */
export class Cdp {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    this.listeners = []
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id != null) {
        const p = this.pending.get(msg.id)
        if (p) {
          this.pending.delete(msg.id)
          msg.error ? p.reject(new Error(`${msg.error.message} <- ${p.method}`)) : p.resolve(msg.result)
        }
      } else {
        for (const fn of this.listeners) fn(msg)
      }
    })
  }

  static async open(url) {
    const ws = new WebSocket(url)
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true })
      ws.addEventListener('error', () => rej(new Error('WS loi')), { once: true })
    })
    return new Cdp(ws)
  }

  on(fn) { this.listeners.push(fn) }

  send(method, params = {}, sessionId) {
    const id = ++this.id
    const body = { id, method, params }
    if (sessionId) body.sessionId = sessionId
    this.ws.send(JSON.stringify(body))
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method })
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`timeout: ${method}`))
      }, 30000)
    })
  }
}

/** Mot tab: mo, chay JS, click that bang chuot, chup anh, dong. */
export class Page {
  constructor(cdp, targetId, sessionId) {
    this.cdp = cdp
    this.targetId = targetId
    this.sessionId = sessionId
    this.net = []
    this.console = []
  }

  static async create(cdp, url) {
    const { targetId } = await cdp.send('Target.createTarget', { url })
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
    const page = new Page(cdp, targetId, sessionId)
    cdp.on((msg) => {
      if (msg.sessionId !== sessionId) return
      if (msg.method === 'Network.requestWillBeSent') {
        const { request, requestId } = msg.params
        if (request.url.includes('/api/')) {
          page.net.push({ requestId, method: request.method, url: request.url.replace(/^https?:\/\/[^/]+/, ''), status: null })
        }
      }
      if (msg.method === 'Network.responseReceived') {
        const hit = page.net.find((n) => n.requestId === msg.params.requestId)
        if (hit) hit.status = msg.params.response.status
      }
      if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) {
        page.console.push(`${msg.params.type}: ${msg.params.args.map((a) => a.value ?? a.description).join(' ')}`)
      }
    })
    await page.send('Page.enable')
    await page.send('Runtime.enable')
    await page.send('Network.enable')
    return page
  }

  send(method, params) { return this.cdp.send(method, params, this.sessionId) }

  async goto(url) {
    await this.send('Page.navigate', { url })
    await this.waitFor('document.readyState === "complete"')
  }

  /** Chay bieu thuc JS trong trang, tra ve gia tri. */
  async eval(expr, awaitPromise = false) {
    const r = await this.send('Runtime.evaluate', {
      expression: `(() => { ${expr.includes('return') ? expr : `return (${expr})`} })()`,
      returnByValue: true,
      awaitPromise,
      userGesture: true,
    })
    if (r.exceptionDetails) throw new Error(`JS loi: ${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description ?? ''}`)
    return r.result.value
  }

  async waitFor(expr, { timeout = 15000, label = expr } = {}) {
    const t0 = Date.now()
    while (Date.now() - t0 < timeout) {
      try { if (await this.eval(expr)) return true } catch { /* trang dang doi */ }
      await sleep(120)
    }
    throw new Error(`Cho khong thay: ${label}`)
  }

  /** Click that: scroll vao khung roi ban su kien chuot o tam phan tu. */
  async clickText(selector, text) {
    const box = await this.eval(`
      const els = [...document.querySelectorAll(${JSON.stringify(selector)})];
      const el = els.find(e => (e.textContent || '').trim().includes(${JSON.stringify(text)}) && !e.disabled);
      if (!el) return null;
      el.scrollIntoView({block:'center'});
      const r = el.getBoundingClientRect();
      return {x: r.x + r.width/2, y: r.y + r.height/2};
    `)
    if (!box) throw new Error(`Khong thay phan tu ${selector} chua "${text}"`)
    await this.mouse(box.x, box.y)
    return true
  }

  async mouse(x, y) {
    const common = { x, y, button: 'left', clickCount: 1 }
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...common })
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...common })
  }

  /** Nhap text vao input bang su kien ban phim that. */
  async type(selector, index, value) {
    const ok = await this.eval(`
      const el = document.querySelectorAll(${JSON.stringify(selector)})[${index}];
      if (!el) return false;
      el.scrollIntoView({block:'center'}); el.focus(); return true;
    `)
    if (!ok) throw new Error(`Khong thay input ${selector}[${index}]`)
    await this.send('Input.insertText', { text: value })
  }

  /** Chon <select> controlled cua React: dat value qua native setter roi ban 'change'. */
  async select(selector, value) {
    const ok = await this.eval(`
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      setter.call(el, ${JSON.stringify(String(value))});
      el.dispatchEvent(new Event('input', {bubbles:true}));
      el.dispatchEvent(new Event('change', {bubbles:true}));
      return el.value === ${JSON.stringify(String(value))};
    `)
    if (!ok) throw new Error(`Khong chon duoc ${value} trong ${selector}`)
  }

  async shot(file) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
    writeFileSync(file, Buffer.from(data, 'base64'))
    return file
  }

  close() { return this.cdp.send('Target.closeTarget', { targetId: this.targetId }) }
}
