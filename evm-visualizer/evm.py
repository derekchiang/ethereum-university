# =============================================================================
#  EVM Visualizer — Python Backend
#
#  Implement `disassemble` and `trace` below.
#  The dummy data lets the UI run end-to-end before you've written any real
#  EVM logic. Replace the DUMMY DATA block in each function with your
#  implementation when you're ready.
#
#  This file is loaded at runtime by Pyodide (Python-in-WASM), so standard
#  library modules (json, struct, etc.) are available, but third-party
#  packages are not unless you explicitly load them via Pyodide.
# =============================================================================


def parse(opcode_text: str) -> list:
    """
    Parse opcode assembly text into a list of instructions with byte offsets.

    Parameters
    ----------
    opcode_text : str
        One opcode per line, e.g.:
            PUSH1 0x05
            PUSH1 0x03
            ADD
        Lines starting with '#' and blank lines are ignored.

    Returns
    -------
    list of dict, ordered by PC, each with:
        pc   : int   — byte offset of this instruction in the bytecode
        op   : str   — opcode mnemonic, e.g. "PUSH1"
        args : list  — operand tokens as strings, e.g. ["0x05"]
                       empty list for opcodes with no operand
    """
    PUSH_SIZES = {f'PUSH{n}': n for n in range(1, 33)}

    instructions = []
    pc = 0

    for line in opcode_text.strip().splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        parts = line.split()
        op    = parts[0].upper()
        args  = parts[1:]
        instructions.append({"pc": pc, "op": op, "args": args})
        pc += 1 + PUSH_SIZES.get(op, 0)

    return instructions


def trace(opcode_text: str) -> list:
    """
    Execute opcode assembly text step-by-step and return an execution trace.

    Parameters
    ----------
    opcode_text : str
        Same format as accepted by parse() — one opcode per line.

    Returns
    -------
    list of dict — one entry per executed instruction, each with:
        pc            : int   — program counter of the instruction that ran
        op            : str   — opcode mnemonic
        stack         : list  — stack state AFTER this instruction executes;
                                index 0 = bottom of stack, last index = top
                                values are lowercase hex strings, e.g. "0x05"
        gas_used      : int   — gas consumed by this instruction
        gas_remaining : int   — gas remaining after this instruction

    Implementation hints
    --------------------
    1. Call parse(opcode_text) to get the instruction list
    2. Initialise state: stack = [], gas = 10_000
    3. Loop over instructions:
         a. Dispatch to an opcode handler (add, push, pop, dup, swap, …)
         b. Deduct gas for the opcode
         c. Append a snapshot dict to the results list
    4. Stop on STOP, RETURN, REVERT, or end of instructions
    5. Represent stack values as lowercase hex with "0x" prefix:
         hex(value)  →  "0x5"   (Python built-in)
         or for zero-padded:  f"0x{value:064x}"  for 32-byte EVM words
    """
    # ── DUMMY DATA ────────────────────────────────────────────────────────────
    # Each step shows the stack state AFTER that instruction ran.
    return [
        {"pc": 0, "op": "PUSH1", "stack": ["0x05"],               "gas_used": 3, "gas_remaining": 9997},
        {"pc": 2, "op": "PUSH1", "stack": ["0x05", "0x03"],        "gas_used": 3, "gas_remaining": 9994},
        {"pc": 4, "op": "ADD",   "stack": ["0x08"],                "gas_used": 3, "gas_remaining": 9991},
        {"pc": 5, "op": "PUSH1", "stack": ["0x08", "0x02"],        "gas_used": 3, "gas_remaining": 9988},
        {"pc": 7, "op": "MUL",   "stack": ["0x10"],                "gas_used": 5, "gas_remaining": 9983},
        {"pc": 8, "op": "STOP",  "stack": ["0x10"],                "gas_used": 0, "gas_remaining": 9983},
    ]
