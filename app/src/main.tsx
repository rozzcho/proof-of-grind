import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { SolanaProvider } from './providers/SolanaProvider'
// after SolanaProvider so it overrides wallet-adapter styles
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SolanaProvider>
      <App />
    </SolanaProvider>
  </StrictMode>,
)
