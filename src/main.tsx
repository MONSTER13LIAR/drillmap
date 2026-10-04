import { createRoot } from 'react-dom/client'
import { App } from './App'
import { startSmoothScroll } from './lib/smoothScroll'
import './styles.css'

startSmoothScroll()
createRoot(document.getElementById('root')!).render(<App />)
