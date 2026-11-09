/**
 * Adaptive-trigger effects: the raw bytes sent to the controller, and a little animation for each,
 * driven by how far the trigger is pulled. Drawn flat on a 2D canvas.
 */
export type EffectId = 'off' | 'light' | 'heavy' | 'pistol' | 'bow' | 'gun'

export const EFFECTS: Record<EffectId, { label: string; icon: string; hint: string; bytes: number[] }> = {
  off: { label: 'Livre', icon: '○', hint: 'Gatilho sem resistência.', bytes: [0x05] },
  light: { label: 'Mola leve', icon: '〰', hint: 'Resistência suave do começo ao fim.', bytes: [0x01, 0x30, 0x60] },
  heavy: { label: 'Mola dura', icon: '≋', hint: 'Resistência forte, do começo ao fim.', bytes: [0x01, 0x10, 0xff] },
  pistol: { label: 'Pistola', icon: '⌐', hint: 'Aperte até sentir o clique: o tiro sai nele.', bytes: [0x02, 0x40, 0x90, 0xff] },
  bow: { label: 'Arco', icon: '➶', hint: 'Puxe até o fim, segure e solte para atirar a flecha.', bytes: [0x02, 0x20, 0xc0, 0xc0] },
  gun: { label: 'Metralhadora', icon: '✸', hint: 'Segure o gatilho: ele vibra e a rajada não para.', bytes: [0x06, 0x0a, 0xff, 0x20] },
}

type Bit = { x: number; y: number; vx: number; vy: number; r: number; vr: number; life: number; kind: 'casing' | 'spark' | 'arrow' | 'tracer' }

export class EffectView {
  private g: CanvasRenderingContext2D
  private bits: Bit[] = []
  private armed = true
  private flash = 0
  private recoil = 0
  private lastShot = 0
  private peak = 0
  private shots = 0

  constructor(private canvas: HTMLCanvasElement) {
    this.g = canvas.getContext('2d')!
  }

  /** Returns how hard the 3D controller should jolt (one-off) and shake (continuous). */
  draw(effect: EffectId, value: number, accent: string, now: number): { kick: number; shake: number } {
    const { canvas: c, g } = this
    const dpr = devicePixelRatio || 1
    if (c.width !== c.clientWidth * dpr) { c.width = c.clientWidth * dpr; c.height = c.clientHeight * dpr }
    const W = c.clientWidth, H = c.clientHeight
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, W, H)
    const v = value / 255
    let kick = 0, shake = 0

    if (effect === 'pistol' || effect === 'gun') {
      const fire = () => {
        this.flash = 1
        this.recoil = effect === 'gun' ? 0.5 : 1
        this.shots++
        const mx = W * 0.78
        this.bits.push({ x: W * 0.42, y: H * 0.42, vx: -40 - Math.random() * 80, vy: -160 - Math.random() * 80, r: 0, vr: 12, life: 1.4, kind: 'casing' })
        this.bits.push({ x: mx, y: H * 0.44, vx: 900, vy: (Math.random() - 0.5) * 30, r: 0, vr: 0, life: 0.4, kind: 'tracer' })
        for (let i = 0; i < 6; i++) this.bits.push({ x: mx, y: H * 0.44, vx: 80 + Math.random() * 160, vy: (Math.random() - 0.5) * 160, r: 0, vr: 0, life: 0.25, kind: 'spark' })
      }
      if (effect === 'pistol') {
        if (this.armed && v > 0.6) { fire(); kick = 1; this.armed = false }
        if (v < 0.2) this.armed = true
      } else if (v > 0.15) {
        const gap = 110 - v * 70
        if (now - this.lastShot > gap) { fire(); this.lastShot = now; kick = 0.35 }
        shake = 0.4 + v * 0.8
      }
      this.gun(effect === 'gun', v, accent)
    } else if (effect === 'bow') {
      this.peak = Math.max(this.peak, v)
      if (this.peak > 0.55 && v < 0.12) {
        this.bits.push({ x: W * 0.3, y: H * 0.5, vx: 500 + this.peak * 900, vy: -30, r: 0, vr: 0, life: 1.2, kind: 'arrow' })
        this.shots++
        kick = 0.6
        this.peak = 0
      }
      if (v < 0.12) this.peak = Math.min(this.peak, 0.12)
      this.bow(v, accent)
    } else if (effect === 'light' || effect === 'heavy') {
      this.spring(v, effect === 'heavy', accent)
    } else {
      this.meter(v, accent)
    }

    this.particles(accent)
    g.fillStyle = 'rgba(232,236,243,.55)'
    g.font = '600 11px "Segoe UI Variable", system-ui'
    g.textAlign = 'right'
    g.fillText(`${Math.round(v * 100)}%`, W - 10, 18)
    if (this.shots && effect !== 'off' && effect !== 'light' && effect !== 'heavy') g.fillText(`${this.shots} ${effect === 'bow' ? 'flechas' : 'tiros'}`, W - 10, H - 10)
    return { kick, shake }
  }

  reset() {
    this.bits = []
    this.shots = 0
    this.peak = 0
    this.armed = true
  }

  private gun(auto: boolean, v: number, accent: string) {
    const { g } = this
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight
    this.recoil *= 0.8
    this.flash *= 0.6
    g.save()
    g.translate(W * 0.3 - this.recoil * 10, H * 0.5)
    g.rotate(-this.recoil * 0.12)
    g.fillStyle = '#2a2f3a'
    g.strokeStyle = '#3d4555'
    g.lineWidth = 1.5
    const L = auto ? W * 0.48 : W * 0.4
    // Slide and barrel.
    roundRect(g, -W * 0.12, -H * 0.14, L, H * 0.13, 4)
    if (auto) { roundRect(g, L - W * 0.14, -H * 0.11, W * 0.12, H * 0.07, 2); roundRect(g, W * 0.02, -H * 0.02, W * 0.07, H * 0.28, 3) }
    // Grip.
    g.save(); g.translate(-W * 0.09, 0); g.rotate(0.2); roundRect(g, 0, -H * 0.02, W * 0.08, H * 0.32, 4); g.restore()
    // Trigger guard and the trigger itself, pulled back with the real one.
    g.beginPath(); g.arc(W * 0.0, H * 0.04, H * 0.08, 0, Math.PI); g.stroke()
    g.fillStyle = accent
    g.save(); g.translate(W * 0.01 - v * W * 0.025, H * 0.03); g.rotate(v * 0.4); g.fillRect(-2, 0, 4, H * 0.08); g.restore()
    g.restore()
    if (this.flash > 0.05) {
      const x = W * 0.3 - this.recoil * 10 + L - W * 0.12, y = H * 0.5 - H * 0.075
      const grad = g.createRadialGradient(x, y, 0, x, y, 40 * this.flash)
      grad.addColorStop(0, 'rgba(255,240,200,1)')
      grad.addColorStop(0.4, 'rgba(255,170,60,.9)')
      grad.addColorStop(1, 'rgba(255,90,20,0)')
      g.fillStyle = grad
      g.beginPath()
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2, r = (i % 2 ? 14 : 34) * this.flash
        g.lineTo(x + Math.cos(a) * r * 1.4, y + Math.sin(a) * r)
      }
      g.fill()
    }
  }

  private bow(v: number, accent: string) {
    const { g } = this
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight
    const cx = W * 0.38, top = H * 0.12, bottom = H * 0.88
    const pull = v * W * 0.2
    g.strokeStyle = '#b98a55'
    g.lineWidth = 5
    g.lineCap = 'round'
    g.beginPath()
    g.moveTo(cx - 6 - v * 8, top)
    g.quadraticCurveTo(cx + 34 + v * 10, H / 2, cx - 6 - v * 8, bottom)
    g.stroke()
    g.strokeStyle = 'rgba(232,236,243,.85)'
    g.lineWidth = 1.5
    g.beginPath()
    g.moveTo(cx - 6 - v * 8, top)
    g.lineTo(cx - 6 - pull, H / 2)
    g.lineTo(cx - 6 - v * 8, bottom)
    g.stroke()
    if (v > 0.05 || !this.bits.some((b) => b.kind === 'arrow')) arrow(g, cx - 6 - pull, H / 2, W * 0.32, accent)
    if (v > 0.85) {
      g.fillStyle = 'rgba(255,255,255,.08)'
      g.fillRect(0, 0, W, H)
    }
  }

  private spring(v: number, heavy: boolean, accent: string) {
    const { g } = this
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight
    const x0 = W * 0.12, x1 = W * 0.88, y = H * 0.5
    const plunger = x0 + v * (x1 - x0) * 0.62
    g.fillStyle = '#20242d'
    roundRect(g, x0 - 8, y - H * 0.22, x1 - x0 + 16, H * 0.44, 10)
    g.strokeStyle = heavy ? '#ff8a5c' : accent
    g.lineWidth = heavy ? 3.5 : 2.5
    g.beginPath()
    const coils = 9
    for (let i = 0; i <= coils * 2; i++) {
      const x = plunger + ((x1 - plunger) * i) / (coils * 2)
      g.lineTo(x, y + (i % 2 ? -1 : 1) * H * 0.15)
    }
    g.stroke()
    g.fillStyle = '#cfd5e0'
    roundRect(g, x0 - 4, y - 6, plunger - x0 + 4, 12, 4)
    roundRect(g, plunger - 6, y - H * 0.18, 12, H * 0.36, 4)
    g.fillStyle = 'rgba(232,236,243,.6)'
    g.font = '600 11px "Segoe UI Variable", system-ui'
    g.textAlign = 'left'
    g.fillText(heavy ? 'mola dura' : 'mola leve', x0, H - 10)
  }

  private meter(v: number, accent: string) {
    const { g } = this
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight
    g.fillStyle = '#20242d'
    roundRect(g, W * 0.1, H * 0.42, W * 0.8, H * 0.16, 8)
    g.fillStyle = accent
    roundRect(g, W * 0.1, H * 0.42, Math.max(W * 0.8 * v, 0.1), H * 0.16, 8)
  }

  private particles(accent: string) {
    const { g } = this
    const H = this.canvas.clientHeight
    const dt = 1 / 60
    this.bits = this.bits.filter((b) => (b.life -= dt) > 0)
    for (const b of this.bits) {
      b.x += b.vx * dt
      b.y += b.vy * dt
      b.r += b.vr * dt
      if (b.kind === 'casing') {
        b.vy += 700 * dt
        if (b.y > H - 12) { b.y = H - 12; b.vy *= -0.35; b.vx *= 0.6; b.vr *= 0.5 }
        g.save(); g.translate(b.x, b.y); g.rotate(b.r); g.fillStyle = '#e0b04a'; g.fillRect(-4, -2, 8, 4); g.restore()
      } else if (b.kind === 'spark') {
        g.fillStyle = `rgba(255,200,90,${b.life * 4})`
        g.fillRect(b.x, b.y, 2, 2)
      } else if (b.kind === 'tracer') {
        g.strokeStyle = `rgba(255,220,140,${b.life * 2.5})`
        g.lineWidth = 2
        g.beginPath(); g.moveTo(b.x - 40, b.y); g.lineTo(b.x, b.y); g.stroke()
      } else {
        b.vy += 120 * dt
        arrow(g, b.x, b.y, this.canvas.clientWidth * 0.32, accent, Math.atan2(b.vy, b.vx))
      }
    }
  }
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  g.roundRect(x, y, w, h, r)
  g.fill()
}

function arrow(g: CanvasRenderingContext2D, tailX: number, y: number, len: number, accent: string, angle = 0) {
  g.save()
  g.translate(tailX, y)
  g.rotate(angle)
  g.strokeStyle = '#d8dce4'
  g.lineWidth = 2.5
  g.beginPath(); g.moveTo(0, 0); g.lineTo(len, 0); g.stroke()
  g.fillStyle = '#d8dce4'
  g.beginPath(); g.moveTo(len + 10, 0); g.lineTo(len - 2, -5); g.lineTo(len - 2, 5); g.fill()
  g.fillStyle = accent
  g.beginPath(); g.moveTo(0, 0); g.lineTo(10, -6); g.lineTo(16, -6); g.lineTo(8, 0); g.lineTo(16, 6); g.lineTo(10, 6); g.fill()
  g.restore()
}
