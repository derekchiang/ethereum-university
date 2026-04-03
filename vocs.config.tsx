import { defineConfig } from 'vocs'

export default defineConfig({
  title: 'Ethereum University',
  description: 'A practical guide to Ethereum and the EVM.',
  sidebar: [
    { text: 'Introduction', link: '/' },
    {
      text: 'Part 1 — The State Transition Function (STF)',
      items: [
        { text: 'Chapter 1: Ethereum as an Abstract Machine', link: '/chapter-1' },
        { text: 'Chapter 2: The World State', link: '/chapter-2' },
        { text: 'Chapter 3: State Transition Function' },
      ],
    },
    {
      text: 'Part 2 — Ethereum Virtual Machine (EVM)',
      items: [
        { text: 'Chapter 4: Stack Machine' },
      ],
    },
    {
      text: 'Part 3 — Peer-to-peer (P2P) Network',
      items: [
        { text: 'Chapter 5: The Public Mempool' },
      ],
    },
  ],
})
