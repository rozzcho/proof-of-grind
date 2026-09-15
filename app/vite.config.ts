import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vite.dev/config/
export default defineConfig({
  // web3.js v1 needs Buffer in the browser
  plugins: [react(), nodePolyfills({ include: ['buffer'], globals: { Buffer: true } })],
})
