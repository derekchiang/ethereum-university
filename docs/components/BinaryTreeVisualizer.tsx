import { useState, useRef } from 'react'
import styles from './BinaryTreeVisualizer.module.css'

// ─── Types ────────────────────────────────────────────────────────────────────

type TreeNode = StemNode | InternalNode | null

interface StemNode {
  type: 'stem'
  id: number
  stem: number
  values: { sub: number; val: string }[]
}

interface InternalNode {
  type: 'internal'
  id: number
  left: TreeNode
  right: TreeNode
}

type StepKind = 'init' | 'traverse' | 'create' | 'update' | 'split_recurse' | 'split_place' | 'done'

interface Step {
  kind: StepKind
  msg: string
  pathBits: (0 | 1)[]
}

// ─── Demo insertions ──────────────────────────────────────────────────────────
// Using 1-byte stems for visual clarity. EIP-7864 uses 31-byte stems —
// the algorithm is identical.

interface Ins { stem: number; sub: number; val: string }

const DEMO: Ins[] = [
  { stem: 0xA0, sub: 0x01, val: '0xf00d…' },  // 10100000  empty tree
  { stem: 0x20, sub: 0x02, val: '0xbeef…' },  // 00100000  bit[0] differs → split at root
  { stem: 0x80, sub: 0x03, val: '0xcafe…' },  // 10000000  bit[2] differs from 0xA0 → deeper split
  { stem: 0xA0, sub: 0x04, val: '0xdead…' },  // same stem as #1 → update existing StemNode
  { stem: 0x60, sub: 0x05, val: '0x1337…' },  // 01100000  bit[1] differs from 0x20 → split left branch
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

const hex2   = (n: number) => '0x' + n.toString(16).padStart(2, '0').toUpperCase()
const bin8   = (n: number) => n.toString(2).padStart(8, '0')
const getBit = (byte: number, d: number): 0 | 1 => ((byte >>> (7 - d)) & 1) as 0 | 1

// ─── Algorithm (mirrors spec's _insert / _split_leaf) ────────────────────────

function insertWithSteps(
  root: TreeNode,
  ins: Ins,
  nextId: () => number,
): { newRoot: TreeNode; steps: Step[] } {
  const steps: Step[] = []
  const bits: (0 | 1)[] = []

  const addStep = (kind: StepKind, msg: string) =>
    steps.push({ kind, msg, pathBits: [...bits] })

  function insert(node: TreeNode, d: number): TreeNode {
    if (node === null) {
      addStep('create', `Empty node → create StemNode(${hex2(ins.stem)}).`)
      return { type: 'stem', id: nextId(), stem: ins.stem, values: [{ sub: ins.sub, val: ins.val }] }
    }

    if (node.type === 'stem') {
      if (node.stem === ins.stem) {
        addStep('update',
          `StemNode(${hex2(ins.stem)}) found — same stem. ` +
          `Add value at subindex ${hex2(ins.sub)}.`)
        return {
          ...node,
          values: [...node.values.filter(v => v.sub !== ins.sub), { sub: ins.sub, val: ins.val }],
        }
      }
      addStep('split_recurse',
        `StemNode(${hex2(node.stem)}) found — different stem from ${hex2(ins.stem)}. Must split.`)
      return doSplit(node, d)
    }

    // InternalNode: branch on current bit
    const bit = getBit(ins.stem, d)
    addStep('traverse',
      `InternalNode at depth ${d}: bit[${d}] = ${bit} → go ${bit === 0 ? '← left' : '→ right'}.`)
    bits.push(bit)
    const result: TreeNode = bit === 0
      ? { ...node, left:  insert(node.left,  d + 1) }
      : { ...node, right: insert(node.right, d + 1) }
    bits.pop()
    return result
  }

  // mirrors _split_leaf: walks down until the two stems diverge
  function doSplit(existing: StemNode, d: number): TreeNode {
    const eb = getBit(existing.stem, d)
    const nb = getBit(ins.stem, d)

    if (eb === nb) {
      addStep('split_recurse',
        `Bit[${d}]: both ${hex2(ins.stem)} and ${hex2(existing.stem)} share bit=${nb}. ` +
        `Create InternalNode here, recurse to bit[${d + 1}].`)
      const child = doSplit(existing, d + 1)
      const id = nextId()
      return nb === 0
        ? { type: 'internal', id, left: child, right: null }
        : { type: 'internal', id, left: null,  right: child }
    }

    addStep('split_place',
      `Bit[${d}]: ${hex2(ins.stem)} has ${nb}, ${hex2(existing.stem)} has ${eb} — stems diverge. ` +
      `New StemNode goes ${nb === 0 ? '← left' : '→ right'}.`)
    const newStem: StemNode = {
      type: 'stem', id: nextId(), stem: ins.stem, values: [{ sub: ins.sub, val: ins.val }],
    }
    const id = nextId()
    return nb === 0
      ? { type: 'internal', id, left: newStem,  right: existing }
      : { type: 'internal', id, left: existing, right: newStem }
  }

  addStep('init', `Insert stem=${hex2(ins.stem)} (${bin8(ins.stem)}), subindex=${hex2(ins.sub)}.`)
  const newRoot = insert(root, 0)
  addStep('done', 'Insertion complete. Tree updated.')
  return { newRoot, steps }
}

// ─── Tree rendering ───────────────────────────────────────────────────────────

function NodeView({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  if (node === null) return <span className={styles.nullNode}>∅</span>

  if (node.type === 'stem') {
    return (
      <div className={styles.stemNode}>
        <div className={styles.stemRow}>
          <span className={styles.tagStem}>Stem</span>
          <span className={styles.stemHex}>{hex2(node.stem)}</span>
          <span className={styles.stemBin}>{bin8(node.stem)}</span>
        </div>
        {node.values.map(v => (
          <div key={v.sub} className={styles.leafRow}>
            <span className={styles.leafSub}>[{hex2(v.sub)}]</span>
            <span className={styles.leafVal}>{v.val}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className={styles.internalNode}>
      <div className={styles.internalRow}>
        <span className={styles.tagInternal}>Internal</span>
        <span className={styles.bitInfo}>splits on bit {depth}</span>
      </div>
      <div className={styles.branches}>
        {([0, 1] as const).map(b => (
          <div key={b} className={styles.branch}>
            <span className={`${styles.branchBit} ${b === 0 ? styles.bit0 : styles.bit1}`}>{b}</span>
            <div className={styles.branchBody}>
              <NodeView node={b === 0 ? node.left : node.right} depth={depth + 1} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

function kindCls(kind: StepKind): string {
  switch (kind) {
    case 'traverse':      return styles.kindTraverse
    case 'create':        return styles.kindCreate
    case 'update':        return styles.kindUpdate
    case 'split_recurse': return styles.kindSplit
    case 'split_place':   return styles.kindSplit
    case 'done':          return styles.kindDone
    default:              return styles.kindInit
  }
}

export default function BinaryTreeVisualizer() {
  const [tree, setTree]     = useState<TreeNode>(null)
  const [idx, setIdx]       = useState(0)
  const [pending, setPending] = useState<{
    ins: Ins; steps: Step[]; stepIdx: number; newTree: TreeNode
  } | null>(null)
  const idRef = useRef(0)

  const nextIns = idx < DEMO.length ? DEMO[idx] : null
  const isLast  = pending !== null && pending.stepIdx === pending.steps.length - 1
  const curStep = pending?.steps[pending.stepIdx]

  // Show the updated tree on the final "done" step so the user sees it before dismissing
  const displayTree = pending && isLast ? pending.newTree : tree

  function startNext() {
    if (!nextIns || pending) return
    const { newRoot, steps } = insertWithSteps(tree, nextIns, () => ++idRef.current)
    setPending({ ins: nextIns, steps, stepIdx: 0, newTree: newRoot })
    setIdx(i => i + 1)
  }

  function advance() {
    if (!pending) return
    if (!isLast) {
      setPending(p => p && { ...p, stepIdx: p.stepIdx + 1 })
    } else {
      setTree(pending.newTree)
      setPending(null)
    }
  }

  function reset() {
    setTree(null); setIdx(0); setPending(null); idRef.current = 0
  }

  return (
    <div className={styles.widget}>
      <div className={styles.mainRow}>

        {/* Left: tree */}
        <div className={styles.treePanel}>
          <div className={styles.panelHeader}>Binary Tree</div>
          <div className={styles.treeScroll}>
            {displayTree === null
              ? <span className={styles.emptyMsg}>empty</span>
              : <NodeView node={displayTree} />
            }
          </div>
        </div>

        {/* Right: insertion + steps */}
        <div className={styles.stepPanel}>
          <div className={styles.panelHeader}>
            {pending ? `Inserting key ${idx} / ${DEMO.length}` : nextIns ? 'Next key' : 'Complete'}
          </div>
          <div className={styles.stepContent}>

            {pending ? (<>
              <div className={styles.keyBox}>
                <div className={styles.keyRow}>
                  <span className={styles.keyLbl}>stem</span>
                  <span className={styles.keyHex}>{hex2(pending.ins.stem)}</span>
                  <span className={styles.keyBin}>{bin8(pending.ins.stem)}</span>
                </div>
                <div className={styles.keyRow}>
                  <span className={styles.keyLbl}>sub</span>
                  <span className={styles.keyHex}>{hex2(pending.ins.sub)}</span>
                </div>
              </div>

              {curStep && (
                <div className={`${styles.stepMsg} ${kindCls(curStep.kind)}`}>
                  {curStep.msg}
                </div>
              )}

              {curStep && curStep.pathBits.length > 0 && (
                <div className={styles.pathRow}>
                  <span className={styles.pathLbl}>path</span>
                  {curStep.pathBits.map((b, i) => (
                    <span key={i} className={b === 0 ? styles.pBit0 : styles.pBit1}>{b}</span>
                  ))}
                </div>
              )}

              <div className={styles.stepCounter}>
                step {pending.stepIdx + 1} / {pending.steps.length}
              </div>
            </>) : nextIns ? (<>
              <div className={styles.previewHex}>{hex2(nextIns.stem)}</div>
              <div className={styles.previewBin}>{bin8(nextIns.stem)}</div>
            </>) : (
              <div className={styles.allDone}>All {DEMO.length} keys inserted.</div>
            )}

          </div>
        </div>

      </div>

      <div className={styles.controls}>
        <button className={styles.btnGhost} onClick={reset}>Reset</button>
        {pending
          ? <button className={styles.btnPrimary} onClick={advance}>
              {isLast ? 'Apply ✓' : 'Step →'}
            </button>
          : <button className={styles.btnPrimary} onClick={startNext} disabled={!nextIns}>
              {nextIns ? 'Next →' : '✓ Done'}
            </button>
        }
      </div>
    </div>
  )
}
