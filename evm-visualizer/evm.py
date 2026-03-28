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


def disassemble(bytecode_hex: str) -> list:
    """
    Parse raw bytecode and return a list of disassembled instructions.

    Parameters
    ----------
    bytecode_hex : str
        Hex-encoded bytecode, with or without "0x" prefix.
        e.g. "6005600301" or "0x6005600301"

    Returns
    -------
    list of dict, ordered by PC, each with:
        pc   : int   — byte offset of this instruction in the bytecode
        op   : str   — opcode mnemonic, e.g. "PUSH1"
        args : list  — operand bytes as hex strings, e.g. ["0x05"]
                       empty list for opcodes with no immediate operand

    Implementation hints
    --------------------
    1. Strip "0x" prefix; decode bytes with:  data = bytes.fromhex(hex_str)
    2. Walk the bytes, looking up each byte in an OPCODES table
    3. PUSH1–PUSH32 (0x60–0x7f) consume the following N bytes as an
       immediate operand; advance pc by 1 + N
    4. All other opcodes advance pc by 1
    """
    # ── DUMMY DATA ────────────────────────────────────────────────────────────
    # Represents:  PUSH1 5 | PUSH1 3 | ADD | PUSH1 2 | MUL | STOP
    # i.e. (5 + 3) * 2 = 16 = 0x10
    return [
        {"pc": 0, "op": "PUSH1", "args": ["0x05"]},
        {"pc": 2, "op": "PUSH1", "args": ["0x03"]},
        {"pc": 4, "op": "ADD",   "args": []},
        {"pc": 5, "op": "PUSH1", "args": ["0x02"]},
        {"pc": 7, "op": "MUL",   "args": []},
        {"pc": 8, "op": "STOP",  "args": []},
    ]


def trace(bytecode_hex: str) -> list:
    """
    Execute bytecode step-by-step and return an execution trace.

    Parameters
    ----------
    bytecode_hex : str
        Hex-encoded bytecode, with or without "0x" prefix.

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
    1. Parse bytecode:  data = bytes.fromhex(bytecode_hex.removeprefix("0x"))
    2. Initialise state: pc = 0, stack = [], gas = 10_000
    3. Loop:
         a. Read opcode byte at data[pc]
         b. Dispatch to an opcode handler (add, push, pop, dup, swap, …)
         c. Deduct gas for the opcode
         d. Append a snapshot dict to the results list
         e. Advance pc (remember PUSH1–PUSH32 skip extra bytes)
    4. Stop on STOP (0x00), RETURN (0xf3), REVERT (0xfd),
       or when pc >= len(data)
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
