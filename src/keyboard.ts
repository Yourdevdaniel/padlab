/**
 * Keyboard test on an ABNT2 layout: each key lights while held and stays marked once tested.
 * Counts how many keys register at once (rollover) and flags chatter: a key that bounces back
 * down a few milliseconds after it was released.
 */
type K = [code: string, label: string, width?: number]
const GAP = (w: number): K => ['', '', w]
const letters = (s: string): K[] => [...s].map((c) => [`Key${c}`, c])
const digits: K[] = [...'1234567890'].map((d) => [`Digit${d}`, d])

const MAIN: K[][] = [
  [['Escape', 'Esc'], GAP(1), ...[1, 2, 3, 4].map((n): K => [`F${n}`, `F${n}`]), GAP(0.5), ...[5, 6, 7, 8].map((n): K => [`F${n}`, `F${n}`]), GAP(0.5), ...[9, 10, 11, 12].map((n): K => [`F${n}`, `F${n}`])],
  [['Backquote', "'"], ...digits, ['Minus', '-'], ['Equal', '='], ['Backspace', '⌫', 2]],
  [['Tab', 'Tab', 1.5], ...letters('QWERTYUIOP'), ['BracketLeft', '´'], ['BracketRight', '['], ['Enter', 'Enter', 1.5]],
  [['CapsLock', 'Caps', 1.75], ...letters('ASDFGHJKL'), ['Semicolon', 'Ç'], ['Quote', '~'], ['Backslash', ']'], ['Enter', '', 1.25]],
  [['ShiftLeft', 'Shift', 1.25], ['IntlBackslash', '\\'], ...letters('ZXCVBNM'), ['Comma', ','], ['Period', '.'], ['Slash', ';'], ['IntlRo', '/'], ['ShiftRight', 'Shift', 1.75]],
  [['ControlLeft', 'Ctrl', 1.25], ['MetaLeft', 'Win', 1.25], ['AltLeft', 'Alt', 1.25], ['Space', '', 6.25], ['AltRight', 'AltGr', 1.25], ['MetaRight', 'Win', 1.25], ['ContextMenu', 'Menu', 1.25], ['ControlRight', 'Ctrl', 1.25]],
]
const NAV: K[][] = [
  [['PrintScreen', 'PrtSc'], ['ScrollLock', 'ScrLk'], ['Pause', 'Pause']],
  [['Insert', 'Ins'], ['Home', 'Home'], ['PageUp', 'PgUp']],
  [['Delete', 'Del'], ['End', 'End'], ['PageDown', 'PgDn']],
  [GAP(3)],
  [GAP(1), ['ArrowUp', '↑'], GAP(1)],
  [['ArrowLeft', '←'], ['ArrowDown', '↓'], ['ArrowRight', '→']],
]
const NUM: K[][] = [
  [GAP(4)],
  [['NumLock', 'Num'], ['NumpadDivide', '/'], ['NumpadMultiply', '*'], ['NumpadSubtract', '-']],
  [['Numpad7', '7'], ['Numpad8', '8'], ['Numpad9', '9'], ['NumpadAdd', '+']],
  [['Numpad4', '4'], ['Numpad5', '5'], ['Numpad6', '6'], ['NumpadComma', '.']],
  [['Numpad1', '1'], ['Numpad2', '2'], ['Numpad3', '3'], ['NumpadEnter', '↵']],
  [['Numpad0', '0', 2], ['NumpadDecimal', ','], GAP(1)],
]

export function mountKeyboard(root: HTMLElement, isActive: () => boolean) {
  root.innerHTML = `
    <div class="kb-head">
      <div><h1>Teclado</h1><p class="muted">Aperte cada tecla. Ela acende enquanto está pressionada e fica marcada depois de testada.</p></div>
      <dl class="kb-stats">
        <dt>Testadas</dt><dd id="kbTested">0</dd>
        <dt>Juntas agora</dt><dd id="kbNow">0</dd>
        <dt>Máximo juntas</dt><dd id="kbMax">0</dd>
        <dt>Repique</dt><dd id="kbChatter">0</dd>
      </dl>
    </div>
    <div class="kb">
      <div class="kb-block" data-block="main"></div>
      <div class="kb-block" data-block="nav"></div>
      <div class="kb-block" data-block="num"></div>
    </div>
    <div class="kb-foot">
      <div class="card kb-last"><h2>Última tecla</h2><div id="kbLast" class="muted">—</div></div>
      <button class="ghost" id="kbReset">Zerar teste</button>
      <p class="note">Para testar rollover (ghosting), segure várias teclas juntas: o "Máximo juntas" mostra quantas o teclado entrega. Repique é uma tecla que volta a apertar sozinha logo depois de solta, sinal de switch gasto. A tecla Fn e a tecla Win (que abre o menu Iniciar) não chegam ao app.</p>
    </div>`

  const keys = new Map<string, HTMLElement[]>()
  const draw = (block: string, rows: K[][]) => {
    const el = root.querySelector(`[data-block=${block}]`)!
    for (const row of rows) {
      const r = document.createElement('div')
      r.className = 'kb-row'
      for (const [code, label, w = 1] of row) {
        const k = document.createElement('div')
        k.className = code ? 'kb-key' : 'kb-gap'
        k.style.setProperty('--w', String(w))
        k.textContent = label
        if (code) keys.set(code, [...(keys.get(code) ?? []), k])
        r.append(k)
      }
      el.append(r)
    }
  }
  draw('main', MAIN)
  draw('nav', NAV)
  draw('num', NUM)

  const down = new Set<string>()
  const tested = new Set<string>()
  const released = new Map<string, number>()
  let max = 0
  let chatter = 0
  const $ = (id: string) => root.querySelector('#' + id)!
  const stats = () => {
    $('kbTested').textContent = `${tested.size} de ${keys.size}`
    $('kbNow').textContent = String(down.size)
    $('kbMax').textContent = String(max)
    $('kbChatter').innerHTML = chatter ? `<span class="warn">${chatter}</span>` : '0'
  }

  addEventListener('keydown', (e) => {
    if (!isActive()) return
    e.preventDefault()
    if (e.repeat) return
    const now = performance.now()
    const bounced = now - (released.get(e.code) ?? -1e9) < 30
    if (bounced) chatter++
    down.add(e.code)
    tested.add(e.code)
    max = Math.max(max, down.size)
    for (const k of keys.get(e.code) ?? []) {
      k.classList.add('on', 'tested')
      if (bounced) k.classList.add('bad')
    }
    $('kbLast').innerHTML = `<b>${e.key === ' ' ? 'Espaço' : e.key}</b> <span class="muted">${e.code}${e.location ? ` · ${['', 'esquerda', 'direita', 'numérico'][e.location]}` : ''}</span>`
    stats()
  })
  addEventListener('keyup', (e) => {
    if (!isActive()) return
    e.preventDefault()
    down.delete(e.code)
    released.set(e.code, performance.now())
    for (const k of keys.get(e.code) ?? []) k.classList.remove('on')
    stats()
  })
  // Keys held while the window loses focus never send keyup.
  addEventListener('blur', () => {
    down.clear()
    root.querySelectorAll('.kb-key.on').forEach((k) => k.classList.remove('on'))
    stats()
  })
  $('kbReset').addEventListener('click', () => {
    tested.clear()
    max = chatter = 0
    root.querySelectorAll('.kb-key').forEach((k) => k.classList.remove('tested', 'bad'))
    stats()
  })
  stats()
}
