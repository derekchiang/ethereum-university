import { useState, useEffect, useRef } from 'react'
import styles from './MerkleVisualizer.module.css'

// ─── Types ────────────────────────────────────────────────────────────────────

interface LeafDef  { sub: number; val: string; alt: string }
interface StemNode { type: 'stem';     id: number; stem: number; leaves: LeafDef[] }
interface INode    { type: 'internal'; id: number; left: TreeNode; right: TreeNode }
type TreeNode = StemNode | INode

type Sel =
  | { kind: 'internal'; id: number }
  | { kind: 'stem';     id: number }
  | { kind: 'leaf';     stemId: number; sub: number }
  | null

interface StemComp {
  leafHashes:  Map<number, string>  // sub → 64-char hex
  innerL:      string               // root of leaves[0..127]
  innerR:      string               // root of leaves[128..255]
  subtreeRoot: string               // hash(innerL || innerR)
  stemHash:    string               // hash(stem || 0x00 || subtreeRoot)
}

interface Computed {
  nodeHash: Map<number, string>   // all node ids → 64-char hex
  stems:    Map<number, StemComp> // stem ids → extra detail
}

// ─── Static tree (mirrors end-state of BinaryTreeVisualizer demo) ─────────────

const TREE: TreeNode = {
  type: 'internal', id: 0,
  left: {
    type: 'internal', id: 1,
    left:  { type: 'stem', id: 2, stem: 0x20,
             leaves: [{ sub: 0x02, val: '0xbeef…beef', alt: '0x1234…abcd' }] },
    right: { type: 'stem', id: 3, stem: 0x60,
             leaves: [{ sub: 0x05, val: '0x1337…1337', alt: '0xffff…0000' }] },
  },
  right: {
    type: 'internal', id: 4,
    left:  { type: 'stem', id: 5, stem: 0x80,
             leaves: [{ sub: 0x03, val: '0xcafe…cafe', alt: '0xdead…beef' }] },
    right: {
      type: 'stem', id: 6, stem: 0xa0,
      leaves: [
        { sub: 0x01, val: '0xf00d…f00d', alt: '0x0000…0001' },
        { sub: 0x04, val: '0xdead…dead', alt: '0x8888…8888' },
      ],
    },
  },
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ZERO_HEX = '00'.repeat(32)

// ─── Hash utilities ───────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const b = new Uint8Array(hex.length / 2)
  for (let i = 0; i < b.length; i++) b[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return b
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

async function sha256hex(data: Uint8Array): Promise<string> {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', data)))
}

// If both inputs are all-zero, return zero without hashing (empty-node short-circuit)
async function hashOrZero(l: string, r: string): Promise<string> {
  if (l === ZERO_HEX && r === ZERO_HEX) return ZERO_HEX
  const buf = new Uint8Array(64)
  buf.set(hexToBytes(l),  0)
  buf.set(hexToBytes(r), 32)
  return sha256hex(buf)
}

// ─── Hash computation ─────────────────────────────────────────────────────────

async function computeStem(node: StemNode, overrides: Map<string, string>): Promise<StemComp> {
  // Build 256-slot leaf hash array
  const leafHashes = new Map<number, string>()
  const slots = Array<string>(256).fill(ZERO_HEX)
  for (const lf of node.leaves) {
    const val = overrides.get(`${node.id}:${lf.sub}`) ?? lf.val
    const h = await sha256hex(new TextEncoder().encode(val))
    slots[lf.sub] = h
    leafHashes.set(lf.sub, h)
  }

  // Merkleize 256 → 1 levels
  // Capture innerL / innerR at the penultimate step (next.length === 2):
  //   innerL = root of leaves[0..127], innerR = root of leaves[128..255]
  let level = slots
  let innerL = ZERO_HEX, innerR = ZERO_HEX

  while (level.length > 1) {
    const next: string[] = []
    for (let i = 0; i < level.length; i += 2)
      next.push(await hashOrZero(level[i], level[i + 1]))
    if (next.length === 2) { innerL = next[0]; innerR = next[1] }
    level = next
  }

  // level[0] is now hash(innerL || innerR) = subtreeRoot
  const subtreeRoot = level[0]

  // stem_node_hash = hash(stem_byte || 0x00 || subtreeRoot)
  const input = new Uint8Array(34)
  input[0] = node.stem
  input[1] = 0x00
  input.set(hexToBytes(subtreeRoot), 2)
  const stemHash = await sha256hex(input)

  return { leafHashes, innerL, innerR, subtreeRoot, stemHash }
}

async function computeAll(
  node: TreeNode,
  overrides: Map<string, string>,
  out: Computed,
): Promise<string> {
  if (node.type === 'stem') {
    const sc = await computeStem(node, overrides)
    out.stems.set(node.id, sc)
    out.nodeHash.set(node.id, sc.stemHash)
    return sc.stemHash
  }
  const lh = await computeAll(node.left,  overrides, out)
  const rh = await computeAll(node.right, overrides, out)
  const buf = new Uint8Array(64)
  buf.set(hexToBytes(lh),  0)
  buf.set(hexToBytes(rh), 32)
  const h = await sha256hex(buf)
  out.nodeHash.set(node.id, h)
  return h
}

// ─── Tree utilities ───────────────────────────────────────────────────────────

function findNode(root: TreeNode, id: number): TreeNode | null {
  if (root.id === id) return root
  if (root.type === 'internal')
    return findNode(root.left, id) ?? findNode(root.right, id)
  return null
}

function pathToNode(root: TreeNode, id: number): number[] {
  function walk(node: TreeNode, acc: number[]): number[] | null {
    const p = [...acc, node.id]
    if (node.id === id) return p
    if (node.type === 'internal')
      return walk(node.left, p) ?? walk(node.right, p)
    return null
  }
  return walk(root, []) ?? []
}

// ─── Display helpers ──────────────────────────────────────────────────────────

const hex2 = (n: number) => n.toString(16).padStart(2, '0').toUpperCase()

function trunc(h: string): string {
  if (!h || h === ZERO_HEX) return '00…00'
  return h.slice(0, 6) + '…' + h.slice(-4)
}

// Explicit map avoids dynamic CSS module property access under strict TS
const COLOR_CLS: Record<string, string> = {
  farg1:    styles.farg1,
  farg2:    styles.farg2,
  farg3:    styles.farg3,
  farg4:    styles.farg4,
  fvResult: styles.fvResult,
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function FRow({ label, val, color }: { label: string; val: string; color: string }) {
  return (
    <div className={styles.fRow}>
      <span className={styles.fRowLabel}>{label}</span>
      <span className={COLOR_CLS[color] ?? styles.farg1}>{val}</span>
    </div>
  )
}

// ─── NodeView ─────────────────────────────────────────────────────────────────

interface NVProps {
  node:      TreeNode
  depth:     number
  computed:  Computed | null
  sel:       Sel
  cascading: Set<number>
  overrides: Map<string, string>
  onSelect:  (s: Sel) => void
  onFlip:    (stemId: number, sub: number) => void
}

function NodeView({ node, depth, computed, sel, cascading, overrides, onSelect, onFlip }: NVProps) {
  const isCascading = cascading.has(node.id)
  const hash = computed?.nodeHash.get(node.id)

  if (node.type === 'stem') {
    const isSelected = sel?.kind === 'stem' && sel.id === node.id
    return (
      <div className={[
        styles.stemNode,
        isSelected  ? styles.selStem   : '',
        isCascading ? styles.cascading : '',
      ].join(' ')}>
        <div className={styles.stemHeader} onClick={() => onSelect({ kind: 'stem', id: node.id })}>
          <span className={styles.tagStem}>Stem</span>
          <span className={styles.stemHex}>0x{hex2(node.stem)}</span>
          <span className={styles.nodeHashPreview}>{hash ? trunc(hash) : '…'}</span>
        </div>
        {node.leaves.map(lf => {
          const curVal     = overrides.get(`${node.id}:${lf.sub}`) ?? lf.val
          const lh         = computed?.stems.get(node.id)?.leafHashes.get(lf.sub)
          const isFlipped  = overrides.has(`${node.id}:${lf.sub}`)
          const isLeafSel  = sel?.kind === 'leaf' && sel.stemId === node.id && sel.sub === lf.sub
          return (
            <div
              key={lf.sub}
              className={[
                styles.leafRow,
                isLeafSel ? styles.selLeaf    : '',
                isFlipped ? styles.leafFlipped : '',
              ].join(' ')}
              onClick={() => onSelect({ kind: 'leaf', stemId: node.id, sub: lf.sub })}
            >
              <span className={styles.leafSub}>[{hex2(lf.sub)}]</span>
              <span className={styles.leafVal}>{curVal}</span>
              <span className={styles.leafHashPreview}>{lh ? trunc(lh) : '…'}</span>
              <button
                className={styles.btnFlip}
                onClick={e => { e.stopPropagation(); onFlip(node.id, lf.sub) }}
              >flip</button>
            </div>
          )
        })}
      </div>
    )
  }

  const isSelected = sel?.kind === 'internal' && sel.id === node.id
  return (
    <div className={[
      styles.internalNode,
      isSelected  ? styles.selInternal : '',
      isCascading ? styles.cascading   : '',
    ].join(' ')}>
      <div className={styles.internalHeader} onClick={() => onSelect({ kind: 'internal', id: node.id })}>
        <span className={styles.tagInternal}>{node.id === 0 ? 'Root' : 'Internal'}</span>
        <span className={styles.depthInfo}>depth {depth}</span>
        <span className={styles.nodeHashPreview}>{hash ? trunc(hash) : '…'}</span>
      </div>
      <div className={styles.branches}>
        {([0, 1] as const).map(b => (
          <div key={b} className={styles.branch}>
            <span className={`${styles.branchBit} ${b === 0 ? styles.bit0 : styles.bit1}`}>{b}</span>
            <div className={styles.branchBody}>
              <NodeView
                node={b === 0 ? node.left : node.right}
                depth={depth + 1}
                computed={computed}
                sel={sel}
                cascading={cascading}
                overrides={overrides}
                onSelect={onSelect}
                onFlip={onFlip}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── FormulaPanel ─────────────────────────────────────────────────────────────

interface FPProps {
  sel:      Sel
  computed: Computed | null
  overrides: Map<string, string>
}

function FormulaPanel({ sel, computed, overrides }: FPProps) {
  if (!sel) {
    return (
      <div className={styles.fPrompt}>
        <p>Click any node to see how its hash is computed.</p>
        <div className={styles.fSummary}>
          {([
            ['Leaf',     'hash( value )'],
            ['Stem',     'hash( stem ║ 0x00 ║ inner )'],
            ['Internal', 'hash( left ║ right )'],
            ['Empty',    '0x00 × 32  (no hash)'],
          ] as [string, string][]).map(([label, formula]) => (
            <div key={label} className={styles.fSummaryRow}>
              <span className={styles.fSummaryLabel}>{label}</span>
              <span className={styles.fSummaryFormula}>{formula}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!computed) return <div className={styles.fPrompt}>Computing…</div>

  // ── Leaf ───────────────────────────────────────────────────────────────────

  if (sel.kind === 'leaf') {
    const stemNode = findNode(TREE, sel.stemId)
    const lf = stemNode?.type === 'stem' ? stemNode.leaves.find(l => l.sub === sel.sub) : null
    if (!lf) return null
    const val = overrides.get(`${sel.stemId}:${sel.sub}`) ?? lf.val
    const lh  = computed.stems.get(sel.stemId)?.leafHashes.get(sel.sub) ?? ZERO_HEX
    return (
      <div className={styles.fBox}>
        <div className={styles.fTitle}>Leaf Hash</div>
        <div className={styles.fExpr}>
          <span className={styles.ffn}>hash</span>
          <span className={styles.fop}>(</span>
          <span className={styles.farg1}> value </span>
          <span className={styles.fop}>)</span>
        </div>
        <div className={styles.fRows}>
          <FRow label="value"     val={val}       color="farg1" />
          <FRow label="leaf_hash" val={trunc(lh)} color="fvResult" />
        </div>
        <p className={styles.fNote}>
          Each leaf value is hashed on its own. A leaf that was never set contributes
          0x00×32 — no hash call needed.
        </p>
      </div>
    )
  }

  // ── Stem ───────────────────────────────────────────────────────────────────

  if (sel.kind === 'stem') {
    const sc       = computed.stems.get(sel.id)
    const stemNode = findNode(TREE, sel.id)
    if (!sc || !stemNode || stemNode.type !== 'stem') return null
    return (
      <div className={styles.fBox}>
        <div className={styles.fTitle}>
          Stem Node Hash
          <span className={styles.fTitleSub}>0x{hex2(stemNode.stem)}</span>
        </div>

        <div className={styles.fStepWrap}>
          <span className={styles.fStepN}>①</span>
          <div>
            <div className={styles.fStepLabel}>merkleize 256 leaf hashes</div>
            <div className={styles.fExpr}>
              <span className={styles.farg4}>inner</span>
              <span className={styles.fop}> = </span>
              <span className={styles.ffn}>hash</span>
              <span className={styles.fop}>(</span>
              <span className={styles.farg1}> L₁₂₈ </span>
              <span className={styles.fop}>║</span>
              <span className={styles.farg2}> R₁₂₈ </span>
              <span className={styles.fop}>)</span>
            </div>
          </div>
        </div>

        <div className={styles.fStepWrap}>
          <span className={styles.fStepN}>②</span>
          <div>
            <div className={styles.fStepLabel}>bind stem bytes</div>
            <div className={styles.fExpr}>
              <span className={styles.ffn}>hash</span>
              <span className={styles.fop}>(</span>
              <span className={styles.farg3}> stem </span>
              <span className={styles.fop}>║</span>
              <span className={styles.fzero}> 0x00 </span>
              <span className={styles.fop}>║</span>
              <span className={styles.farg4}> inner </span>
              <span className={styles.fop}>)</span>
            </div>
          </div>
        </div>

        <div className={styles.fRows}>
          <FRow label="L₁₂₈"     val={trunc(sc.innerL)}      color="farg1" />
          <FRow label="R₁₂₈"     val={trunc(sc.innerR)}      color="farg2" />
          <FRow label="inner"     val={trunc(sc.subtreeRoot)} color="farg4" />
          <FRow label="stem"      val={`0x${hex2(stemNode.stem)}`} color="farg3" />
          <FRow label="stem_hash" val={trunc(sc.stemHash)}    color="fvResult" />
        </div>

        <p className={styles.fNote}>
          L₁₂₈ and R₁₂₈ are the merkle roots of leaf_hashes[0..127] and
          leaf_hashes[128..255]. Most leaves are unset (0x00×32), so their
          subtrees short-circuit to zero without hashing.
        </p>
        <p className={styles.fNote}>
          The stem bytes are bound in the <em>outer</em> hash (step&nbsp;②), not
          the inner one. This prevents swapping one stem's subtree under a
          different stem's key — the stem identity is cryptographically committed.
        </p>

        {stemNode.leaves.length > 0 && (
          <>
            <div className={styles.fSectionLabel}>non-empty leaves</div>
            {stemNode.leaves.map(lf => {
              const val = overrides.get(`${stemNode.id}:${lf.sub}`) ?? lf.val
              const lh  = sc.leafHashes.get(lf.sub) ?? ZERO_HEX
              return (
                <div key={lf.sub} className={styles.fRow}>
                  <span className={styles.fRowLabel}>[{hex2(lf.sub)}]</span>
                  <span className={styles.farg1}>{val}</span>
                  <span className={styles.fop}>&nbsp;→&nbsp;</span>
                  <span className={styles.fvResult}>{trunc(lh)}</span>
                </div>
              )
            })}
          </>
        )}
      </div>
    )
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  if (sel.kind === 'internal') {
    const node  = findNode(TREE, sel.id)
    if (!node || node.type !== 'internal') return null
    const nHash = computed.nodeHash.get(node.id)
    const lHash = computed.nodeHash.get(node.left.id)
    const rHash = computed.nodeHash.get(node.right.id)
    return (
      <div className={styles.fBox}>
        <div className={styles.fTitle}>{node.id === 0 ? 'Root' : 'Internal'} Node Hash</div>
        <div className={styles.fExpr}>
          <span className={styles.ffn}>hash</span>
          <span className={styles.fop}>(</span>
          <span className={styles.farg1}> left_hash </span>
          <span className={styles.fop}>║</span>
          <span className={styles.farg2}> right_hash </span>
          <span className={styles.fop}>)</span>
        </div>
        <div className={styles.fRows}>
          <FRow label="left_hash"  val={trunc(lHash  ?? ZERO_HEX)} color="farg1" />
          <FRow label="right_hash" val={trunc(rHash  ?? ZERO_HEX)} color="farg2" />
          <FRow label="node_hash"  val={trunc(nHash  ?? ZERO_HEX)} color="fvResult" />
        </div>
        <p className={styles.fNote}>
          Changing any descendant leaf changes that subtree's root, which changes
          this hash, and so on up to the root. The root hash is a fingerprint of
          the entire tree.
        </p>
      </div>
    )
  }

  return null
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MerkleVisualizer() {
  const [userSel,    setUserSel]    = useState<Sel>(null)
  const [cascadeSel, setCascadeSel] = useState<Sel>(null)
  const [overrides,  setOverrides]  = useState(() => new Map<string, string>())
  const [computed,   setComputed]   = useState<Computed | null>(null)
  const [cascading,  setCascading]  = useState(() => new Set<number>())
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  // Displayed selection: cascade auto-selection overrides user selection
  const sel = cascadeSel ?? userSel

  useEffect(() => {
    let alive = true
    const result: Computed = { nodeHash: new Map(), stems: new Map() }
    computeAll(TREE, overrides, result).then(() => {
      if (alive) setComputed({ ...result })
    })
    return () => { alive = false }
  }, [overrides])

  function clearTimers() {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }

  function handleFlip(stemId: number, sub: number) {
    const stemNode = findNode(TREE, stemId)
    if (!stemNode || stemNode.type !== 'stem') return
    const lf = stemNode.leaves.find(l => l.sub === sub)
    if (!lf) return

    const key = `${stemId}:${sub}`
    const cur = overrides.get(key) ?? lf.val
    setOverrides(prev => new Map(prev).set(key, cur === lf.alt ? lf.val : lf.alt))

    // Cascade animation: highlight stem → ancestors → root sequentially
    clearTimers()
    setCascading(new Set())
    setCascadeSel(null)

    const path = pathToNode(TREE, stemId).reverse()  // [stemId, …, rootId]

    path.forEach((id, i) => {
      const t = setTimeout(() => {
        setCascading(new Set([id]))
        const n = findNode(TREE, id)
        if (n) setCascadeSel(n.type === 'stem'
          ? { kind: 'stem', id }
          : { kind: 'internal', id })
      }, i * 380)
      timers.current.push(t)
    })

    const tEnd = setTimeout(() => {
      setCascading(new Set())
      setCascadeSel(null)
    }, path.length * 380 + 300)
    timers.current.push(tEnd)
  }

  function handleSelect(s: Sel) {
    clearTimers()
    setCascading(new Set())
    setCascadeSel(null)
    setUserSel(s)
  }

  function handleReset() {
    clearTimers()
    setOverrides(new Map())
    setUserSel(null)
    setCascadeSel(null)
    setCascading(new Set())
  }

  return (
    <div className={styles.widget}>
      <div className={styles.mainRow}>

        <div className={styles.treePanel}>
          <div className={styles.panelHeader}>Binary Tree</div>
          <div className={styles.treeScroll}>
            <NodeView
              node={TREE}
              depth={0}
              computed={computed}
              sel={sel}
              cascading={cascading}
              overrides={overrides}
              onSelect={handleSelect}
              onFlip={handleFlip}
            />
          </div>
        </div>

        <div className={styles.formulaPanel}>
          <div className={styles.panelHeader}>Hash Formula</div>
          <div className={styles.formulaScroll}>
            <FormulaPanel sel={sel} computed={computed} overrides={overrides} />
          </div>
        </div>

      </div>

      <div className={styles.controls}>
        <span className={styles.hint}>
          click a node to see its formula · flip a leaf to watch the cascade
        </span>
        <button className={styles.btnGhost} onClick={handleReset}>Reset</button>
      </div>
    </div>
  )
}
