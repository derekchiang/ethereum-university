import { useEffect, useRef, useState } from 'react'
import styles from './EvmVisualizer.module.css'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Instr {
  pc: number
  op: string
  args: string[]
}

interface Step {
  pc: number
  op: string
  stack: string[]
}

// ─── Pyodide singleton ────────────────────────────────────────────────────────
// One Pyodide instance is shared across all EvmVisualizer mounts on the page.

const PYODIDE_CDN = 'https://cdn.jsdelivr.net/pyodide/v0.29.3/full/pyodide.js'

let _py: any = null
let _pyPromise: Promise<any> | null = null

/** Inject the Pyodide <script> tag and wait for it to load. */
function loadPyodideScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof (window as any).loadPyodide === 'function') {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = PYODIDE_CDN
    script.onload  = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Pyodide script'))
    document.head.appendChild(script)
  })
}

async function getPy(): Promise<any> {
  if (_py) return _py
  if (!_pyPromise) {
    _pyPromise = (async () => {
      await loadPyodideScript()
      const py = await (window as any).loadPyodide()
      const src = await fetch('/evm.py').then(r => {
        if (!r.ok) throw new Error(`Cannot load /evm.py (HTTP ${r.status})`)
        return r.text()
      })
      py.runPython(src)
      _py = py
      return py
    })()
  }
  return _pyPromise
}

function callPy(fn: string, input: string): any {
  _py.globals.set('_input', input)
  return JSON.parse(_py.runPython(`import json; json.dumps(${fn}(_input))`))
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns how many items at the top of `curr` are not in `prev`. */
function countNewTop(prev: string[], curr: string[]): number {
  let shared = 0
  while (shared < prev.length && shared < curr.length && prev[shared] === curr[shared]) shared++
  return curr.length - shared
}

// ─── Default program ─────────────────────────────────────────────────────────

const DEFAULT_OPCODES = `PUSH1 0x05
PUSH1 0x03
ADD
PUSH1 0x02
MUL
STOP`

// ─── Component ────────────────────────────────────────────────────────────────

export default function EvmVisualizer() {
  const [pyReady, setPyReady] = useState(false)
  const [mode, setMode]       = useState<'edit' | 'run'>('edit')
  const [opText, setOpText]   = useState(DEFAULT_OPCODES)
  const [instrs, setInstrs]   = useState<Instr[]>([])
  const [steps, setSteps]     = useState<Step[]>([])
  const [cursor, setCursor]   = useState(0)
  const [animDir, setAnimDir] = useState<'fwd' | 'bwd'>('fwd')
  const [animVer, setAnimVer] = useState(0)   // bumped on each navigate to replay CSS animations
  const [playing, setPlaying] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const instrListRef = useRef<HTMLUListElement>(null)

  // Boot Pyodide once
  useEffect(() => {
    getPy().then(() => setPyReady(true)).catch(e => setError(String(e)))
  }, [])

  // Auto-play: each tick fires a navigate after a delay
  useEffect(() => {
    if (!playing) return
    if (cursor >= steps.length - 1) { setPlaying(false); return }
    const t = setTimeout(() => {
      setAnimDir('fwd')
      setAnimVer(v => v + 1)
      setCursor(c => c + 1)
    }, 700)
    return () => clearTimeout(t)
  }, [playing, cursor, steps.length])

  // Scroll active instruction into view after each cursor change
  useEffect(() => {
    if (mode !== 'run') return
    instrListRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [cursor, mode])

  function run() {
    setError(null)
    try {
      const parsed = callPy('parse', opText) as Instr[]
      const traced = callPy('trace', opText) as Step[]
      setInstrs(parsed)
      setSteps(traced)
      setCursor(0)
      setAnimDir('fwd')
      setAnimVer(v => v + 1)
      setPlaying(false)
      setMode('run')
    } catch (e: any) {
      setError(e.message ?? String(e))
    }
  }

  function navigate(next: number, dir: 'fwd' | 'bwd') {
    if (next < 0 || next >= steps.length) return
    setAnimDir(dir)
    setAnimVer(v => v + 1)
    setCursor(next)
  }

  // ── Derived values ─────────────────────────────────────────────────────────

  const step      = steps[cursor]
  const prevStack = cursor > 0 ? steps[cursor - 1].stack : []
  const currStack = step?.stack ?? []
  const newCount  = countNewTop(prevStack, currStack)
  const display   = [...currStack].reverse()  // top of stack first

  // ── Edit mode ──────────────────────────────────────────────────────────────

  if (mode === 'edit') {
    return (
      <div className={styles.widget}>
        <div className={styles.editWrapper}>
          <textarea
            className={styles.textarea}
            value={opText}
            onChange={e => setOpText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run() }}
            spellCheck={false}
            rows={8}
            placeholder={'PUSH1 0x05\nPUSH1 0x03\nADD'}
          />
          <div className={styles.editBar}>
            <span className={error ? styles.errorMsg : styles.statusMsg}>
              {error ?? (pyReady ? 'Ready' : 'Loading Python runtime…')}
            </span>
            <button
              className={styles.btnPrimary}
              onClick={run}
              disabled={!pyReady}
            >
              {pyReady ? 'Run →' : '…'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Run mode ───────────────────────────────────────────────────────────────

  return (
    <div className={styles.widget}>
      <div className={styles.runLayout}>

        <div className={styles.columns}>

          {/* Left: instruction list */}
          <div className={styles.instrCol}>
            <div className={styles.colHeader}>
              <span>Instructions</span>
              <button
                className={styles.btnGhost}
                onClick={() => { setPlaying(false); setMode('edit') }}
              >
                Edit
              </button>
            </div>
            <ul className={styles.instrList} ref={instrListRef}>
              {instrs.map(instr => (
                <li
                  key={instr.pc}
                  className={`${styles.instrRow}${instr.pc === step?.pc ? ' ' + styles.instrActive : ''}`}
                  data-active={instr.pc === step?.pc ? 'true' : undefined}
                >
                  <span className={styles.instrPc}>
                    {`0x${instr.pc.toString(16).padStart(4, '0')}`}
                  </span>
                  <span className={styles.instrOp}>{instr.op}</span>
                  <span className={styles.instrArgs}>{instr.args.join(' ')}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Right: stack */}
          <div className={styles.stackCol}>
            <div className={styles.colHeader}>Stack</div>
            <div className={styles.stackList}>
              {display.length === 0
                ? <span className={styles.stackEmpty}>empty</span>
                : display.map((val, i) => {
                    const isNew = i < newCount
                    // New items get a version-stamped key so React remounts them
                    // and the CSS animation replays. Stable items keep a
                    // position-from-bottom key so React reuses their element.
                    const key = isNew
                      ? `new-v${animVer}-i${i}`
                      : `pos${currStack.length - 1 - i}`
                    const anim = isNew
                      ? (animDir === 'fwd' ? styles.stackEnterFwd : styles.stackEnterBwd)
                      : ''
                    return (
                      <div key={key} className={`${styles.stackItem} ${anim}`}>
                        <span className={styles.stackPos}>{i === 0 ? 'top' : String(i)}</span>
                        <span className={styles.stackVal}>{val}</span>
                      </div>
                    )
                  })
              }
            </div>
          </div>

        </div>

        {/* Controls */}
        <div className={styles.controls}>
          <button
            className={styles.btnGhost}
            onClick={() => navigate(cursor - 1, 'bwd')}
            disabled={cursor === 0}
          >
            ← Prev
          </button>
          <span className={styles.stepCount}>{cursor + 1} / {steps.length}</span>
          <button
            className={styles.btnGhost}
            onClick={() => navigate(cursor + 1, 'fwd')}
            disabled={cursor === steps.length - 1}
          >
            Next →
          </button>
          <button
            className={`${styles.btnPrimary}${playing ? ' ' + styles.btnStop : ''}`}
            onClick={() => setPlaying(p => !p)}
          >
            {playing ? '⏸' : '▶'}
          </button>
        </div>

      </div>
    </div>
  )
}
