import { useEffect, useRef, useState } from 'react'
import type { AnswerLanguage, AppInfo, ChatEvent, ScreenContext, ToolChipInfo } from '../../../shared/types'

export type ToolChip = ToolChipInfo

export type UiMessage =
  | { id: string; role: 'user'; text: string; context: ScreenContext | null; app: AppInfo | null; language?: AnswerLanguage }
  | {
      id: string
      role: 'assistant'
      text: string
      tools: ToolChip[]
      confirm?: { confirmId: string; title: string; detail: string }
      error?: string
      streaming: boolean
      language?: AnswerLanguage
    }

export type Assistant = Extract<UiMessage, { role: 'assistant' }>

/** The conversation as main reports it. Shared by the panel and the quick view so they never drift apart. */
export function useChat(onReset?: () => void) {
  const [messages, setMessages] = useState<UiMessage[]>([])
  const [busy, setBusy] = useState(false)
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
          currentId.current = null
          resetRef.current?.()
          return
        }
        if (e.type === 'load') {
          setMessages(e.messages.map((m) => (m.role === 'assistant' ? { ...m, streaming: false } : m)))
          setBusy(false)
          currentId.current = null
          return
        }
        if (e.type === 'user') {
          setMessages((ms) => [...ms, { id: e.id, role: 'user', text: e.text, context: e.context, app: e.app, language: e.language }])
          setBusy(true)
          currentId.current = null
          return
        }

        const patch = (fn: (m: Assistant) => Assistant) =>
          setMessages((ms) => ms.map((m) => (m.id === e.id && m.role === 'assistant' ? fn(m) : m)))

        switch (e.type) {
          case 'start':
            currentId.current = e.id
            setMessages((ms) => [...ms, { id: e.id, role: 'assistant', text: '', tools: [], streaming: true, language: e.language }])
            break
          case 'delta':
            patch((m) => ({ ...m, text: m.text + e.text }))
            break
          case 'tool':
            patch((m) => {
              const others = m.tools.filter((t) => t.callId !== e.callId)
              const confirm = e.status === 'running' ? m.confirm : undefined
              return { ...m, confirm, tools: [...others, { callId: e.callId, label: e.label, icon: e.icon, status: e.status }] }
            })
            break
          case 'confirm':
            patch((m) => ({ ...m, confirm: { confirmId: e.confirmId, title: e.title, detail: e.detail } }))
            break
          case 'done':
            patch((m) => ({ ...m, streaming: false, confirm: undefined }))
            if (e.id === currentId.current) setBusy(false)
            break
          case 'error':
            patch((m) => ({ ...m, streaming: false, confirm: undefined, error: e.message }))
            if (e.id === currentId.current) setBusy(false)
            break
        }
      }),
    []
  )

  const last = messages[messages.length - 1]
  const waitingFirstToken = busy && (last?.role === 'user' || (last?.role === 'assistant' && !last.text && !last.tools.length))

  const clear = () => {
    setMessages([])
    setBusy(false)
  }

  return { messages, busy, setBusy, waitingFirstToken, clear }
}
