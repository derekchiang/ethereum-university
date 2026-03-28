// main.js — EVM Visualizer frontend
// Loads evm.py via Pyodide, wires up controls, drives GSAP animations.

// ─── State ─────────────────────────────────────────────────────────────────────

let pyodide    = null;
let steps      = [];   // execution trace from Python  (one dict per step)
let disasm     = [];   // disassembled instructions from Python
let stepIndex  = -1;
let playTimer  = null;

const PLAY_SPEED_MS = 700;

// ─── DOM refs ──────────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

const el = {
    overlay:    $('loading-overlay'),
    loadText:   $('loading-text'),
    input:      $('bytecode-input'),
    runBtn:     $('run-btn'),
    prevBtn:    $('prev-btn'),
    nextBtn:    $('next-btn'),
    playBtn:    $('play-btn'),
    resetBtn:   $('reset-btn'),
    stepCount:  $('step-counter'),
    opcode:     $('info-opcode'),
    gasUsed:    $('info-gas-used'),
    gasLeft:    $('info-gas-remaining'),
    stackDepth: $('info-stack-depth'),
    stack:      $('stack-container'),
    bytecode:   $('bytecode-list'),
};

// ─── Boot ──────────────────────────────────────────────────────────────────────

async function boot() {
    try {
        pyodide = await loadPyodide();

        const src = await fetch('./evm.py').then(r => {
            if (!r.ok) throw new Error(`Could not load evm.py (HTTP ${r.status})`);
            return r.text();
        });
        pyodide.runPython(src);

        el.overlay.classList.add('hidden');
        el.runBtn.disabled = false;
        el.input.focus();
    } catch (err) {
        el.loadText.textContent = `Error: ${err.message}`;
    }
}

// ─── Python bridge ──────────────────────────────────────────────────────────────

function callPy(fn, text) {
    // Pass argument via globals to avoid any string-escaping issues.
    pyodide.globals.set('_input', text);
    return JSON.parse(
        pyodide.runPython(`import json; json.dumps(${fn}(_input))`)
    );
}

// ─── Run ───────────────────────────────────────────────────────────────────────

function run() {
    stopPlay();
    const text = el.input.value.trim();
    if (!text) return;

    try {
        disasm = callPy('parse', text);
        steps  = callPy('trace', text);
    } catch (err) {
        alert(`EVM error:\n\n${err.message}`);
        return;
    }

    if (!steps.length) return;

    renderDisasm();
    setStep(0, 'forward');

    el.playBtn.disabled  = false;
    el.resetBtn.disabled = false;
}

// ─── Disassembly panel ─────────────────────────────────────────────────────────

function renderDisasm() {
    el.bytecode.innerHTML = '';
    disasm.forEach(instr => {
        const li = document.createElement('li');
        li.id    = `pc-${instr.pc}`;
        li.append(
            mkSpan('instr-pc',   `0x${instr.pc.toString(16).padStart(4, '0')}`),
            mkSpan('instr-op',   instr.op),
            mkSpan('instr-args', instr.args.join(' ')),
        );
        el.bytecode.appendChild(li);
    });
}

// ─── Step ──────────────────────────────────────────────────────────────────────

function setStep(idx, direction) {
    if (idx < 0 || idx >= steps.length) return;

    const prevStack = stepIndex >= 0 ? steps[stepIndex].stack : [];
    stepIndex = idx;
    const step = steps[idx];

    // Info panel
    el.stepCount.textContent  = `${idx + 1} / ${steps.length}`;
    el.opcode.textContent     = step.op;
    el.gasUsed.textContent    = step.gas_used.toLocaleString();
    el.gasLeft.textContent    = step.gas_remaining.toLocaleString();
    el.stackDepth.textContent = step.stack.length;

    // Highlight active instruction
    document.querySelectorAll('.instr-line--active')
        .forEach(e => e.classList.remove('instr-line--active'));
    const activeLine = document.getElementById(`pc-${step.pc}`);
    if (activeLine) {
        activeLine.classList.add('instr-line--active');
        // Flash the row with GSAP
        gsap.fromTo(activeLine,
            { backgroundColor: 'rgba(56, 139, 253, 0.25)' },
            { backgroundColor: 'rgba(56, 139, 253, 0.12)', duration: 0.45, ease: 'power2.out' }
        );
        activeLine.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    // Stack animation
    animateStack(prevStack, step.stack, direction);

    // Button states
    el.prevBtn.disabled = idx === 0;
    el.nextBtn.disabled = idx === steps.length - 1;
}

// ─── Stack animation ───────────────────────────────────────────────────────────

/**
 * Animate the stack from `prev` state to `curr` state.
 *
 * Strategy:
 *  1. Find the stable bottom prefix (items unchanged by this instruction).
 *  2. Animate outgoing items (top of prev that aren't in curr).
 *  3. Once exits are done, rebuild the DOM and animate incoming items.
 *
 * Direction 'forward'  → exits fly up, enters drop in with green flash.
 * Direction 'backward' → exits drop down, enters rise up (neutral colour).
 *
 * Both arrays: index 0 = bottom of stack, last index = top.
 */
function animateStack(prev, curr, direction = 'forward') {
    // Find longest common bottom prefix
    let shared = 0;
    while (shared < prev.length && shared < curr.length && prev[shared] === curr[shared]) {
        shared++;
    }
    const numNew     = curr.length - shared;
    const numRemoved = prev.length - shared;

    // Existing DOM items are rendered top-first, so items-to-remove are the
    // first `numRemoved` children in the container.
    const existingItems = [...el.stack.querySelectorAll('.stack-item')];
    const toRemove      = existingItems.slice(0, numRemoved);

    const rebuild = () => {
        el.stack.innerHTML = '';

        if (curr.length === 0) {
            const empty = document.createElement('div');
            empty.className   = 'stack-empty';
            empty.textContent = 'empty';
            el.stack.appendChild(empty);
            return;
        }

        // Render top-first
        const display = [...curr].reverse();

        display.forEach((val, i) => {
            const isNew = i < numNew;
            const item  = document.createElement('div');
            item.className = 'stack-item';

            // Position label: 'top', then depth index downward
            item.append(
                mkSpan('stack-pos', i === 0 ? 'top' : String(i)),
                mkSpan('stack-val', val),
            );
            el.stack.appendChild(item);

            if (isNew) {
                const fromY = direction === 'forward' ? -18 : 18;
                const tl    = gsap.timeline();

                tl.from(item, {
                    y:        fromY,
                    opacity:  0,
                    duration: 0.28,
                    delay:    i * 0.05,
                    ease:     'back.out(1.4)',
                });

                if (direction === 'forward') {
                    // Green flash: push
                    tl.fromTo(item,
                        { backgroundColor: '#1a3a24', borderColor: '#3fb950' },
                        { backgroundColor: '#161b22', borderColor: '#30363d', duration: 0.55 },
                        `<`   // start at same time as the from-tween
                    );
                } else {
                    // Subtle blue flash: backward step / undo
                    tl.fromTo(item,
                        { backgroundColor: '#0d2033', borderColor: '#58a6ff' },
                        { backgroundColor: '#161b22', borderColor: '#30363d', duration: 0.45 },
                        `<`
                    );
                }
            }
        });
    };

    if (toRemove.length > 0) {
        const exitY = direction === 'forward' ? -14 : 14;
        gsap.to(toRemove, {
            y:         exitY,
            opacity:   0,
            duration:  0.16,
            stagger:   0.04,
            ease:      'power2.in',
            onComplete: rebuild,
        });
    } else {
        rebuild();
    }
}

// ─── Controls ──────────────────────────────────────────────────────────────────

function stopPlay() {
    if (!playTimer) return;
    clearInterval(playTimer);
    playTimer = null;
    el.playBtn.textContent = '▶ Play';
    el.playBtn.classList.remove('playing');
}

function togglePlay() {
    if (playTimer) {
        stopPlay();
        return;
    }
    el.playBtn.textContent = '⏸ Pause';
    el.playBtn.classList.add('playing');

    playTimer = setInterval(() => {
        if (stepIndex >= steps.length - 1) {
            stopPlay();
        } else {
            setStep(stepIndex + 1, 'forward');
        }
    }, PLAY_SPEED_MS);
}

// ─── Keyboard shortcuts ────────────────────────────────────────────────────────

document.addEventListener('keydown', e => {
    if (e.target === el.input) return;   // don't intercept while typing hex
    if (e.key === 'ArrowRight' || e.key === 'l') setStep(stepIndex + 1, 'forward');
    if (e.key === 'ArrowLeft'  || e.key === 'h') setStep(stepIndex - 1, 'backward');
    if (e.key === ' ') { e.preventDefault(); togglePlay(); }
    if (e.key === 'r') { stopPlay(); setStep(0, 'forward'); }
});

// ─── Event wiring ──────────────────────────────────────────────────────────────

el.runBtn.addEventListener('click',  run);
el.prevBtn.addEventListener('click', () => setStep(stepIndex - 1, 'backward'));
el.nextBtn.addEventListener('click', () => setStep(stepIndex + 1, 'forward'));
el.playBtn.addEventListener('click', togglePlay);
el.resetBtn.addEventListener('click', () => { stopPlay(); setStep(0, 'forward'); });
el.input.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run(); });

// ─── Utility ───────────────────────────────────────────────────────────────────

function mkSpan(cls, text) {
    const s = document.createElement('span');
    s.className   = cls;
    s.textContent = text;
    return s;
}

// ─── Go ────────────────────────────────────────────────────────────────────────

boot();
