import { useState } from 'react'
import styles from './EmbeddingVisualizer.module.css'

// ─── Types ────────────────────────────────────────────────────────────────────

type RegionKey = 'basic_data' | 'code_hash' | 'reserved' | 'storage' | 'code'

interface RegionInfo {
  label: string
  range: string
  description: string
  note?: string
  fields?: { name: string; size: string; value: string }[]
}

// ─── Region definitions ───────────────────────────────────────────────────────

const REGIONS: Record<RegionKey, RegionInfo> = {
  basic_data: {
    label: 'Basic Data',
    range: '0x00',
    description:
      'All core account fields packed into one 32-byte value: version, code_size, nonce, and balance.',
    note:
      'Packing them together means a single branch opening reads all account metadata — a key witness-size win over the MPT.',
    fields: [
      { name: 'version',   size: '1 B',  value: '0' },
      { name: 'reserved',  size: '4 B',  value: '—' },
      { name: 'code_size', size: '3 B',  value: '1 024' },
      { name: 'nonce',     size: '8 B',  value: '42' },
      { name: 'balance',   size: '16 B', value: '1.5 ETH' },
    ],
  },
  code_hash: {
    label: 'Code Hash',
    range: '0x01',
    description: 'keccak256 of the account\'s bytecode.',
    note: 'EMPTY_CODE_HASH (0x56e8…) for EOAs with no deployed code.',
  },
  reserved: {
    label: 'Reserved',
    range: '0x02 – 0x3F',
    description: '62 subindices reserved for future protocol use.',
    note: 'Holding this space now means layout extensions won\'t need a tree restructure.',
  },
  storage: {
    label: 'Header Storage',
    range: '0x40 – 0x7F',
    description:
      'The first 64 storage slots (slots 0–63), co-located with the account header on the same stem.',
    note:
      'Contracts that only use a handful of slots pay no extra branch-opening cost. Slots 64+ spill to overflow stems.',
  },
  code: {
    label: 'Code Chunks',
    range: '0x80 – 0xFF',
    description:
      'The first 128 bytecode chunks (31 bytes of code per chunk). Byte 0 of each chunk encodes how many leading bytes are PUSHDATA.',
    note: 'Chunks 128+ spill to overflow stems at tree_index 1, 2, …',
  },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getRegion(sub: number): RegionKey {
  if (sub === 0) return 'basic_data'
  if (sub === 1) return 'code_hash'
  if (sub < 64)  return 'reserved'
  if (sub < 128) return 'storage'
  return 'code'
}

function isFilled(sub: number, sc: number, cc: number): boolean {
  if (sub === 0 || sub === 1) return true
  if (sub >= 64  && sub < 128) return (sub - 64)  < sc
  if (sub >= 128)              return (sub - 128) < cc
  return false
}

// Static class maps to avoid dynamic property access on CSS module object
const REGION_CLS: Record<RegionKey, string> = {
  basic_data: styles.regionBasicData,
  code_hash:  styles.regionCodeHash,
  reserved:   styles.regionReserved,
  storage:    styles.regionStorage,
  code:       styles.regionCode,
}

const DOT_CLS: Record<RegionKey, string> = {
  basic_data: styles.dotBasicData,
  code_hash:  styles.dotCodeHash,
  reserved:   styles.dotReserved,
  storage:    styles.dotStorage,
  code:       styles.dotCode,
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EmbeddingVisualizer() {
  const [storageCount, setStorageCount] = useState(0)
  const [codeCount,    setCodeCount]    = useState(0)
  const [hovered,  setHovered]  = useState<RegionKey | null>(null)
  const [selected, setSelected] = useState<RegionKey | null>(null)

  // Selected takes priority; hovered is the fallback
  const active = selected ?? hovered

  const storageOverflow = Math.max(0, storageCount - 64)
  const codeOverflow    = Math.max(0, codeCount    - 128)

  // Storage overflow: first stem has subindices 64–255 (192 slots), rest have 256 each
  const storageStems: { start: number; end: number }[] = []
  if (storageOverflow > 0) {
    let remaining = storageOverflow
    let slotBase  = 64
    // First overflow stem: only subindices 64–255 are available (192 slots)
    const firstCapacity = 192
    const firstCount = Math.min(remaining, firstCapacity)
    storageStems.push({ start: slotBase, end: slotBase + firstCount - 1 })
    remaining -= firstCount
    slotBase  += firstCount
    // Subsequent overflow stems: 256 slots each
    while (remaining > 0) {
      const count = Math.min(remaining, 256)
      storageStems.push({ start: slotBase, end: slotBase + count - 1 })
      remaining -= count
      slotBase  += count
    }
  }

  // Code overflow: 128 chunks per overflow stem (tree_index 1, 2, …)
  const codeStems: { start: number; end: number; treeIndex: number }[] = []
  if (codeOverflow > 0) {
    let remaining = codeOverflow
    let chunkBase = 128
    let treeIdx   = 1
    while (remaining > 0) {
      const count = Math.min(remaining, 128)
      codeStems.push({ start: chunkBase, end: chunkBase + count - 1, treeIndex: treeIdx })
      remaining -= count
      chunkBase += count
      treeIdx++
    }
  }

  function toggleSelected(region: RegionKey) {
    setSelected(s => s === region ? null : region)
  }

  function reset() {
    setStorageCount(0); setCodeCount(0)
    setSelected(null);  setHovered(null)
  }

  return (
    <div className={styles.widget}>

      {/* Account header */}
      <div className={styles.accountBar}>
        <div className={styles.accountRow}>
          <span className={styles.acctLabel}>account</span>
          <span className={styles.acctAddr}>0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045</span>
        </div>
        <div className={styles.accountRow}>
          <span className={styles.acctLabel}>stem</span>
          <span className={styles.acctStem}>tree_hash(addr ∥ 0)[0:31]</span>
        </div>
      </div>

      {/* Main row: grid | info */}
      <div className={styles.mainRow}>

        {/* Left: 16×16 subindex grid */}
        <div className={styles.gridPanel}>
          <div className={styles.panelHeader}>
            Subindex Map
            <span className={styles.panelNote}>256 slots per stem</span>
          </div>

          <div className={styles.gridWrap} onMouseLeave={() => setHovered(null)}>
            <div className={styles.grid}>
              {Array.from({ length: 256 }, (_, sub) => {
                const region  = getRegion(sub)
                const filled  = isFilled(sub, storageCount, codeCount)
                const isActive = active === region && region !== 'reserved'
                return (
                  <div
                    key={sub}
                    className={[
                      styles.cell,
                      REGION_CLS[region],
                      filled ? styles.cellFilled : styles.cellEmpty,
                      isActive ? styles.cellActive : '',
                    ].join(' ')}
                    onMouseEnter={() => region !== 'reserved' && setHovered(region)}
                    onClick={() => toggleSelected(region)}
                    title={`0x${sub.toString(16).padStart(2, '0').toUpperCase()}`}
                  />
                )
              })}
            </div>
          </div>

          {/* Legend */}
          <div className={styles.legend}>
            {(Object.keys(REGIONS) as RegionKey[]).map(key => (
              <button
                key={key}
                className={[
                  styles.legendBtn,
                  selected === key ? styles.legendActive : '',
                  key === 'reserved' ? styles.legendReserved : '',
                ].join(' ')}
                onClick={() => toggleSelected(key)}
              >
                <span className={`${styles.legendDot} ${DOT_CLS[key]}`} />
                {REGIONS[key].label}
              </button>
            ))}
          </div>
        </div>

        {/* Right: region info */}
        <div className={styles.infoPanel}>
          <div className={styles.panelHeader}>
            {active ? REGIONS[active].label : 'Region Info'}
          </div>
          <div className={styles.infoContent}>
            {active ? (
              <>
                <div className={styles.infoRange}>{REGIONS[active].range}</div>
                <p className={styles.infoDesc}>{REGIONS[active].description}</p>
                {REGIONS[active].fields && (
                  <div className={styles.fieldTable}>
                    {REGIONS[active].fields!.map(f => (
                      <div key={f.name} className={styles.fieldRow}>
                        <span className={styles.fieldName}>{f.name}</span>
                        <span className={styles.fieldSize}>{f.size}</span>
                        <span className={styles.fieldVal}>{f.value}</span>
                      </div>
                    ))}
                  </div>
                )}
                {REGIONS[active].note && (
                  <p className={styles.infoNote}>{REGIONS[active].note}</p>
                )}
              </>
            ) : (
              <p className={styles.infoPrompt}>
                Hover or click a region in the grid to see what is stored there.
              </p>
            )}
          </div>
        </div>

      </div>

      {/* Overflow stems */}
      {(storageStems.length > 0 || codeStems.length > 0) && (
        <div className={styles.overflowSection}>
          <div className={styles.overflowTitle}>Overflow Stems</div>
          <p className={styles.overflowExplain}>
            The header stem only has 64 storage slots (0x40–0x7F) and 128 code chunk slots
            (0x80–0xFF). Once those fill up, the remaining data must live on a <em>new stem</em>{' '}
            derived from the same address. Each overflow stem holds up to 256 values.
          </p>
          <div className={styles.overflowList}>
            {storageStems.map((s, i) => (
              <div key={`s${i}`} className={`${styles.overflowStem} ${styles.overflowStemStorage}`}>
                <div className={styles.overflowStemTop}>
                  <span className={styles.overflowTag}>Storage overflow #{i + 1}</span>
                  <span className={styles.overflowRange}>slots {s.start}–{s.end}</span>
                  <span className={styles.overflowCount}>({s.end - s.start + 1} slots)</span>
                </div>
                <div className={styles.overflowFormula}>
                  stem = tree_hash(addr ∥ (MAIN_STORAGE_OFFSET + {s.start}))[0:31]
                </div>
              </div>
            ))}
            {codeStems.map((s, i) => (
              <div key={`c${i}`} className={`${styles.overflowStem} ${styles.overflowStemCode}`}>
                <div className={styles.overflowStemTop}>
                  <span className={styles.overflowTag}>Code overflow #{i + 1}</span>
                  <span className={styles.overflowRange}>chunks {s.start}–{s.end}</span>
                  <span className={styles.overflowCount}>({s.end - s.start + 1} chunks)</span>
                </div>
                <div className={styles.overflowFormula}>
                  stem = tree_hash(addr ∥ {s.treeIndex})[0:31]
                  {'  '}
                  <span className={styles.overflowFormulaNote}>(tree_index = {s.treeIndex})</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className={styles.controls}>
        <div className={styles.capacityGroup}>
          <span className={styles.capacityLabel}>storage</span>
          <span className={storageCount > 64 ? styles.capacityFull : styles.capacityVal}>
            {Math.min(storageCount, 64)} / 64
          </span>
          {storageOverflow > 0 && (
            <span className={styles.capacitySpill}>+{storageOverflow} overflow</span>
          )}
        </div>
        <div className={styles.capacityGroup}>
          <span className={styles.capacityLabel}>code</span>
          <span className={codeCount > 128 ? styles.capacityFull : styles.capacityVal}>
            {Math.min(codeCount, 128)} / 128
          </span>
          {codeOverflow > 0 && (
            <span className={styles.capacitySpill}>+{codeOverflow} overflow</span>
          )}
        </div>
        <div className={styles.controlsBtns}>
          <button className={styles.btnGhost} onClick={reset}>Reset</button>
          <button className={styles.btnStorage} onClick={() => setStorageCount(c => c + 8)}>
            + Storage ×8
          </button>
          <button className={styles.btnCode} onClick={() => setCodeCount(c => c + 16)}>
            + Code ×16
          </button>
        </div>
      </div>

    </div>
  )
}
