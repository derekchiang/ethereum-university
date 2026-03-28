import { Fragment, useState } from 'react'
import styles from './StateMachineVisualizer.module.css'

// ─── Data ─────────────────────────────────────────────────────────────────────

const INITIAL_STATE: Record<string, number> = {
  Alice: 100,
  Bob: 50,
  Carol: 0,
}

interface Block {
  number: number
  txs: string[]
  changes: Record<string, number>
}

const BLOCKS: Block[] = [
  {
    number: 1,
    txs: ['Alice → Bob: 20 ETH'],
    changes: { Alice: -20, Bob: +20 },
  },
  {
    number: 2,
    txs: ['Bob → Carol: 10 ETH'],
    changes: { Bob: -10, Carol: +10 },
  },
  {
    number: 3,
    txs: ['Carol → Alice: 5 ETH', 'Bob → Alice: 15 ETH'],
    changes: { Carol: -5, Bob: -15, Alice: +20 },
  },
  {
    number: 4,
    txs: ['Alice → Carol: 30 ETH'],
    changes: { Alice: -30, Carol: +30 },
  },
]

// ─── Component ────────────────────────────────────────────────────────────────

export default function StateMachineVisualizer() {
  const [worldState, setWorldState] = useState<Record<string, number>>({ ...INITIAL_STATE })
  const [history, setHistory]       = useState<number[]>([])
  const [animVer, setAnimVer]       = useState(0)
  const [changed, setChanged]       = useState<Set<string>>(new Set())
  const [latestBlock, setLatest]    = useState<number | null>(null)
  const [processing, setProcessing] = useState(false)

  const nextBlock = history.length < BLOCKS.length ? BLOCKS[history.length] : null

  function processNext() {
    if (!nextBlock || processing) return
    setProcessing(true)

    setTimeout(() => {
      const newState = { ...worldState }
      const newChanged = new Set<string>()
      for (const [acct, delta] of Object.entries(nextBlock.changes)) {
        newState[acct] = (newState[acct] ?? 0) + delta
        newChanged.add(acct)
      }
      setWorldState(newState)
      setChanged(newChanged)
      setAnimVer(v => v + 1)
      setHistory(h => [...h, nextBlock.number])
      setLatest(nextBlock.number)
      setProcessing(false)
    }, 350)
  }

  function reset() {
    setWorldState({ ...INITIAL_STATE })
    setHistory([])
    setAnimVer(0)
    setChanged(new Set())
    setLatest(null)
    setProcessing(false)
  }

  return (
    <div className={styles.widget}>

      {/* Formula header */}
      <div className={styles.formula}>
        <span className={styles.formulaS}>S</span>
        <span className={styles.formulaOp}> + </span>
        <span className={styles.formulaI}>I</span>
        <span className={styles.formulaOp}> ──── STF ────→ </span>
        <span className={styles.formulaS}>S′</span>
      </div>

      {/* Top row: World State | Input */}
      <div className={styles.topRow}>

        {/* World State */}
        <div className={styles.panel}>
          <div className={styles.panelHeader}>World State</div>
          <div className={styles.accountList}>
            {Object.entries(worldState).map(([name, balance]) => (
              <div
                key={`${name}-v${animVer}`}
                className={`${styles.accountRow}${changed.has(name) ? ' ' + styles.accountFlash : ''}`}
              >
                <span className={styles.accountName}>{name}</span>
                <span className={styles.accountBalance}>{balance} ETH</span>
              </div>
            ))}
          </div>
        </div>

        {/* Input block */}
        <div className={styles.panel}>
          <div className={styles.panelHeader}>Input</div>
          <div className={styles.inputContent}>
            {nextBlock ? (
              <div className={`${styles.blockCard}${processing ? ' ' + styles.blockProcessing : ''}`}>
                <div className={styles.blockNum}>Block #{nextBlock.number}</div>
                {nextBlock.txs.map((tx, i) => (
                  <div key={i} className={styles.txRow}>{tx}</div>
                ))}
              </div>
            ) : (
              <div className={styles.noMore}>no more blocks</div>
            )}
          </div>
        </div>

      </div>

      {/* History */}
      <div className={styles.historySection}>
        <div className={styles.historyLabel}>History</div>
        <div className={styles.historyChain}>
          <div className={styles.histBlock}>Genesis</div>
          {history.map((num) => (
            <Fragment key={num}>
              <span className={styles.chainArrow}>→</span>
              <div className={`${styles.histBlock}${latestBlock === num ? ' ' + styles.histBlockNew : ''}`}>
                #{num}
              </div>
            </Fragment>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className={styles.controls}>
        <button className={styles.btnGhost} onClick={reset}>
          Reset
        </button>
        <button
          className={styles.btnPrimary}
          onClick={processNext}
          disabled={!nextBlock || processing}
        >
          {processing ? '…' : 'Next →'}
        </button>
      </div>

    </div>
  )
}
