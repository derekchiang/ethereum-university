import { defineConfig } from 'vocs'

export default defineConfig({
  title: 'Ethereum University',
  description: 'A practical guide to Ethereum and the EVM.',
  sidebar: [
    { text: 'Introduction', link: '/' },
    {
      text: 'Part I — The State Transition Function (STF)',
      items: [
        { text: 'Chapter 1: Ethereum as an Abstract Machine', link: '/chapter-1' },
      ],
    },
  ],
})
