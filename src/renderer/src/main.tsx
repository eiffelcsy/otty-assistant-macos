import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Bubble } from './bubble/Bubble'
import { Panel } from './panel/Panel'
import { Quick } from './quick/Quick'
import './styles.css'

const view = new URLSearchParams(location.search).get('view') ?? 'panel'
document.documentElement.dataset.view = view

createRoot(document.getElementById('root')!).render(
  <StrictMode>{view === 'bubble' ? <Bubble /> : view === 'quick' ? <Quick /> : <Panel />}</StrictMode>
)
