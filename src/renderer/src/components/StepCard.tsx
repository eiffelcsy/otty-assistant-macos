import { useState } from 'react'
import type { Step, StepCard as Card } from '../../../shared/types'
import { Icon } from './Icon'

/** The button's words. With no app to act in, only what works anywhere gets one. */
function buttonLabel(step: Step, app?: string): string | null {
  const a = step.action
  if (!a || step.manual) return null
  switch (a.kind) {
    case 'copy':
      return 'Copy'
    case 'open':
      return 'Open'
    case 'paste':
      if (!app) return 'Copy'
      return a.mode === 'insert' ? `Paste into ${app}` : `Replace in ${app}`
    case 'menu':
      return app ? `Click ${a.path.join(' › ')}` : null
    case 'keys':
      return app ? 'Press for me' : null
  }
}

function StepRow({ answerId, step, index, current, app, stuck }: { answerId: string; step: Step; index: number; current: boolean; app?: string; stuck: boolean }) {
  const [sure, setSure] = useState(false)
  const [working, setWorking] = useState(false)
  const label = buttonLabel(step, app)

  const press = async () => {
    if (step.risky && !sure) return setSure(true)
    setSure(false)
    setWorking(true)
    await window.otty.runStep(answerId, index, step.risky ? true : undefined)
    setWorking(false)
  }

  return (
    <li className={`step${step.done ? ' step--done' : ''}${current ? ' step--current' : ''}`}>
      <button
        className="step__tick"
        role="checkbox"
        aria-checked={!!step.done}
        aria-label={`Step ${index + 1}: ${step.done ? 'done' : 'not done'}`}
        onClick={() => void window.otty.tickStep(answerId, index, !step.done)}
      >
        {step.done ? <Icon name="check" /> : index + 1}
      </button>
      <div className="step__body">
        <div className="step__text">{step.text}</div>
        {step.action?.kind === 'keys' && <kbd className="step__keys">{step.action.combo}</kbd>}
        {(step.action?.kind === 'paste' || step.action?.kind === 'copy') && <code className="step__paste">{step.action.text}</code>}
        {label && !step.done && (
          <div className="step__row">
            <button className={`btn btn--small ${step.risky ? 'btn--warn' : 'btn--soft'}`} disabled={working} onClick={press}>
              {sure ? 'Sure?' : label}
            </button>
            {sure && (
              <button className="btn btn--small btn--soft" onClick={() => setSure(false)}>
                No
              </button>
            )}
          </div>
        )}
        {step.note && <div className="step__note">{step.note}</div>}
        {current && stuck && (
          <div className="step__row">
            <button className="btn btn--small btn--soft" onClick={() => void window.otty.tickStep(answerId, index, true)}>
              Done
            </button>
            <button className="btn btn--small btn--soft" onClick={() => void window.otty.checkStep(answerId, index)}>
              Done, check it
            </button>
            <button className="step__stuck" onClick={() => void window.otty.stuckOnStep(answerId, index)}>
              I’m stuck
            </button>
          </div>
        )}
      </div>
    </li>
  )
}

/** A checklist under an answer. The model proposes; nothing happens until the user presses a button. */
export function StepCard({ answerId, card, stuck = true }: { answerId: string; card: Card; stuck?: boolean }) {
  const done = card.steps.filter((s) => s.done).length
  const current = card.steps.findIndex((s) => !s.done)
  return (
    <div className="step-card">
      <div className="step-card__head">
        <span className="step-card__title">{card.title}</span>
        <span className="step-card__count">
          {done} of {card.steps.length}
        </span>
      </div>
      <ol className="step-list">
        {card.steps.map((s, i) => (
          <StepRow key={i} answerId={answerId} step={s} index={i} current={i === current} app={card.app?.name} stuck={stuck} />
        ))}
      </ol>
    </div>
  )
}
