import { useEffect, useRef, useState } from 'react'
import type { AnswerLanguage, AppInfo, Capture, ChatEvent, ConfirmCard, ErrorKind, FileAttachment, MemoryNote, Receipt, StepCard, ToolChipInfo, UsedMemory, ChartCard } from '../../../shared/types'

export type ToolChip = ToolChipInfo

export type UiMessage =
  | {
      id: string
      role: 'user'
      text: string
      captures: Capture[]
      app: AppInfo | null
      language?: AnswerLanguage
      files?: FileAttachment[]
      hidden?: number
    }
  | {
      id: string
      role: 'assistant'
      text: string
      tools: ToolChip[]
      /** The card waiting for an answer, and when it appeared. */
      confirm?: { confirmId: string; card: ConfirmCard; since: number }
      receipts?: Receipt[]
      error?: string
      errorKind?: ErrorKind
      stopped?: boolean
      streaming: boolean
      /** Arrived in this window just now, not reopened: its Noted lines and receipts may move as they appear. */
      live?: boolean
      language?: AnswerLanguage
      memories?: MemoryNote[]
      used?: UsedMemory[]
      calc?: { expression: string; result: string }
      steps?: StepCard
      charts?: ChartCard[]
    }

export type Assistant = Extract<UiMessage, { role: 'assistant' }>

/** The conversation as main reports it. Shared by the panel and the quick view so they never drift apart. */
export function useChat(onReset?: () => void) {
  const [messages, setMessages] = useState<UiMessage[]>([])
  const [busy, setBusy] = useState(false)
  /** False for "Don't learn from this chat". */
  const [learn, setLearn] = useState(true)
  /** A message to scroll to, set when a search result reopens a chat. Cleared by the next question. */
  const [focusId, setFocusId] = useState<string | null>(null)
  /**
   * The box's words from main: a chat's draft when it opens, or what another window typed (D-62). `n` changes each
   * time, so the same words twice still arrive. A window that has focus is the one typing, so it ignores the echo.
   */
  const [draft, setDraft] = useState({ text: '', n: 0 })
  const resetRef = useRef(onReset)
  resetRef.current = onReset
  // Only the newest turn may end `busy`; a stopped turn's late 'done' must not.
  const currentId = useRef<string | null>(null)

  useEffect(
    () =>
      window.otty.onChatEvent((e: ChatEvent) => {
        if (e.type === 'reset') {
          setMessages([])
          setBusy(false)
          setFocusId(null)
          setLearn(true)
          setDraft((d) => ({ text: '', n: d.n + 1 }))
          currentId.current = null
          resetRef.current?.()
          return
        }
        if (e.type === 'load') {
          // Coming back to an answer still running: it picks up from here.
          setMessages(e.messages.map((m) => (m.role === 'assistant' ? { ...m, streaming: m.id === e.streaming } : m)))
          setFocusId(e.focusMessageId ?? null)
          setLearn(e.learn !== false)
          setDraft((d) => ({ text: e.draft ?? '', n: d.n + 1 }))
          setBusy(Boolean(e.streaming))
          currentId.current = e.streaming ?? null
          return
        }
        if (e.type === 'user') {
          const { type: _type, ...user } = e
          setMessages((ms) => [...ms, { ...user, role: 'user' }])
          setFocusId(null)
          setBusy(true)
          currentId.current = null
          return
        }

        if (e.type === 'learn') return setLearn(e.on)
        if (e.type === 'draft') {
          if (!document.hasFocus()) setDraft((d) => ({ text: e.text, n: d.n + 1 }))
          return
        }

        const patch = (fn: (m: Assistant) => Assistant) =>
          setMessages((ms) => ms.map((m) => (m.id === e.id && m.role === 'assistant' ? fn(m) : m)))

        switch (e.type) {
          case 'start':
            currentId.current = e.id
            setMessages((ms) => [...ms, { id: e.id, role: 'assistant', text: '', tools: [], streaming: true, language: e.language, live: true }])
            break
          case 'delta':
            patch((m) => ({ ...m, text: m.text + e.text }))
            break
          case 'calc':
            patch((m) => ({ ...m, text: `**${e.result}**`, calc: { expression: e.expression, result: e.result } }))
            break
          case 'steps':
            patch((m) => ({ ...m, steps: e.card }))
            break
          case 'chart':
            patch((m) => ({ ...m, charts: [...(m.charts ?? []), e.chart] }))
            break
          case 'memory-used':
            patch((m) => ({ ...m, used: e.used }))
            break
          case 'memory':
            patch((m) => {
              const notes = m.memories ?? []
              const known = notes.some((n) => n.memoryId === e.note.memoryId)
              return { ...m, memories: known ? notes.map((n) => (n.memoryId === e.note.memoryId ? e.note : n)) : [...notes, e.note] }
            })
            break
          case 'tool':
            patch((m) => {
              const others = m.tools.filter((t) => t.callId !== e.callId)
              const confirm = e.status === 'running' ? m.confirm : undefined
              return { ...m, confirm, tools: [...others, { callId: e.callId, label: e.label, icon: e.icon, status: e.status, copy: e.copy }] }
            })
            break
          case 'confirm':
            patch((m) => ({ ...m, confirm: { confirmId: e.confirmId, card: e.card, since: Date.now() } }))
            break
          case 'receipt':
            patch((m) => {
              const receipts = [...(m.receipts ?? [])]
              receipts[e.at] = e.receipt
              return { ...m, receipts, confirm: undefined }
            })
            break
          case 'done':
            patch((m) => ({ ...m, streaming: false, confirm: undefined, ...(e.stopped ? { stopped: true } : {}) }))
            if (e.id === currentId.current) setBusy(false)
            break
          case 'error':
            patch((m) => ({ ...m, streaming: false, confirm: undefined, error: e.message, ...(e.kind && e.kind !== 'other' ? { errorKind: e.kind } : {}) }))
            if (e.id === currentId.current) setBusy(false)
            break
        }
      }),
    []
  )

  const last = messages[messages.length - 1]
  // Until the first word, tools included: the thinking row says what the running tool is doing (D-62). Not while a
  // card waits, which says it itself.
  const waitingFirstToken = busy && (last?.role === 'user' || (last?.role === 'assistant' && !last.text && !last.confirm && !last.calc))

  const clear = () => {
    setMessages([])
    setBusy(false)
  }

  /** A card is waiting: the box stays usable, and says so. */
  const asking = messages.some((m) => m.role === 'assistant' && Boolean(m.confirm))

  return { messages, busy, setBusy, waitingFirstToken, clear, focusId, learn, asking, draft }
}
