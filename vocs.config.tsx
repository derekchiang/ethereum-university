import { defineConfig } from 'vocs'

export default defineConfig({
  title: 'Ethereum University',
  description: 'A practical guide to Ethereum and the EVM.',
  sidebar: [
    { text: 'Introduction', link: '/' },
    {
      text: 'Part I — The EVM',
      items: [
        { text: 'Chapter 1: How the EVM Works', link: '/chapter-1' },
      ],
    },
  ],
})
