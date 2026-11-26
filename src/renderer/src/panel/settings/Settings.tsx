import { useEffect, useState } from 'react'
import type { ConnectionsState, KeepChats, MonthlyCap, PublicSettings, SettableKey, SettingsCounts, UsageReport } from '../../../../shared/types'
import { serviceAt, serviceById } from '../../../../shared/services'
import { findRanges, parseQuery } from '../../../../shared/match'
import { connectionReady, ConnectionFields } from '../../components/ConnectionFields'
import { Icon } from '../../components/Icon'
import { prettyKey } from '../../lib/keys'
import { Connections } from './Connections'
import { MyTiles } from './Tiles'
import { ChoiceRow, CustomRow, Group, HoldButton, HoldRow, KeysRow, LinkRow, SwitchRow, ValueRow } from './rows'

// Settings in six sections that apply as you go (D-61, docs/design/specs/02-settings.md). There's no Save button and
// no draft: each control saves itself through `setSetting`, and what main sends back is what's shown. Forgetting is
// always behind a hold, with the real count from main.

export type SectionId = 'you' | 'tiles' | 'keys' | 'privacy' | 'links' | 'usage' | 'conn' | 'help'

const SECTIONS: { id: SectionId; title: string; icon: string }[] = [
  { id: 'you', title: 'You & Otty', icon: 'paw' },
  { id: 'tiles', title: 'My tiles', icon: 'apps' },
  { id: 'keys', title: 'Shortcuts', icon: 'keyboard' },
  { id: 'privacy', title: 'Privacy', icon: 'shield-check' },
  { id: 'links', title: 'Connections', icon: 'plug-connection' },
  { id: 'usage', title: 'Usage & limit', icon: 'stats' },
  { id: 'conn', title: 'Connection', icon: 'brain' },
  { id: 'help', title: 'Help', icon: 'life-ring' }
]

/** Every row Find a setting can reach, with a few words people might use instead. */
const FINDABLE: { id: string; section: SectionId; title: string; words?: string }[] = [
  { id: 'showBubble', section: 'you', title: 'Show the floating otter', words: 'bubble button' },
  { id: 'notifyDone', section: 'you', title: 'Tell me when something is ready', words: 'notification alert' },
  { id: 'openAtLogin', section: 'you', title: 'Open Otty when I log in', words: 'startup launch restart' },
  { id: 'homeLanguage', section: 'you', title: 'Help in my own language', words: 'chinese 中文 language' },
  { id: 'tiles', section: 'tiles', title: 'Add a tile', words: 'button action prompt my own' },
  { id: 'askHotkey', section: 'keys', title: 'Ask about highlighted text', words: 'hotkey shortcut key' },
  { id: 'snapHotkey', section: 'keys', title: 'Snip part of the screen', words: 'hotkey shortcut screenshot' },
  { id: 'screenHotkey', section: 'keys', title: 'The whole screen', words: 'hotkey shortcut screenshot' },
  { id: 'rememberChats', section: 'privacy', title: 'Remember my chats', words: 'history save' },
  { id: 'keepChats', section: 'privacy', title: 'Keep chats for', words: 'retention delete days' },
  { id: 'learn', section: 'privacy', title: 'Let Otty note things about me', words: 'memory learn' },
  { id: 'notebook', section: 'privacy', title: 'Open the Notebook', words: 'memory notes what otty knows' },
  { id: 'shareAppContext', section: 'privacy', title: 'Tell Otty which app I’m using', words: 'window title page address' },
  { id: 'sent', section: 'privacy', title: 'See what left my Mac', words: 'sent privacy log' },
  { id: 'changed', section: 'privacy', title: 'See what Otty changed', words: 'ledger undo' },
  { id: 'forgetChats', section: 'privacy', title: 'Forget all chats', words: 'delete clear' },
  { id: 'forgetNotes', section: 'privacy', title: 'Forget everything in the Notebook', words: 'memory delete clear' },
  { id: 'forgetPouch', section: 'privacy', title: 'Forget my Pouch', words: 'pebbles kept delete clear' },
  { id: 'monthlyCap', section: 'usage', title: 'Set a monthly limit', words: 'cap budget cost' },
  { id: 'usage', section: 'usage', title: 'This month', words: 'questions cost usage' },
  { id: 'service', section: 'conn', title: 'Your AI service', words: 'api key model deepseek claude openai' },
  { id: 'thinking', section: 'conn', title: 'Always think deeper', words: 'reasoning' },
  { id: 'connections', section: 'links', title: 'Connections', words: 'calendar canvas notion google mcp connector app' },
  { id: 'addOwn', section: 'links', title: 'Add your own connection', words: 'mcp server custom connector address' },
  { id: 'apple', section: 'links', title: 'Apple Calendar and Reminders', words: 'eventkit' },
  { id: 'google', section: 'links', title: 'Google Calendar', words: 'gmail account' },
  { id: 'canvas', section: 'links', title: 'Canvas', words: 'school course assignment nus' },
  { id: 'notion', section: 'links', title: 'Notion', words: 'notes pages' },
  { id: 'diagnostics', section: 'help', title: 'Copy diagnostics', words: 'help support problem log' }
]

const KEEP: { value: KeepChats; label: string }[] = [
  { value: '30d', label: '30 days' },
  { value: '1y', label: '1 year' },
  { value: 'forever', label: 'Forever' }
]

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`
const nextMonth = () => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth() + 1, 1).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })
}

interface Props {
  settings: PublicSettings
  onSaved: (s: PublicSettings) => void
  /** The section on show, or null for the list. Kept by the panel so the health line can open one. */
  section: SectionId | null
  onSection: (s: SectionId | null) => void
  onOpenLogbook: (tab: 'sent' | 'changed') => void
  onOpenNotebook: () => void
}

/** The one-line summaries in the list, from the saved settings. */
function summary(id: SectionId, s: PublicSettings, usage: UsageReport | null, links: ConnectionsState | null): { text: string; warn?: boolean } {
  switch (id) {
    case 'you':
      return { text: [`Otter ${s.showBubble ? 'on' : 'off'}`, `notifications ${s.notifyDone ? 'on' : 'off'}`, ...(s.openAtLogin ? ['opens at login'] : [])].join(' · ') }
    case 'tiles':
      return { text: s.myTiles.length ? s.myTiles.map((t) => t.name).join(' · ') : 'Your own one-tap questions' }
    case 'keys': {
      const taken = [s.askHotkey, s.snapHotkey, s.screenHotkey].filter((k) => s.takenHotkeys.includes(k)).length
      return taken ? { text: `${plural(taken, 'shortcut needs', 'shortcuts need')} a change`, warn: true } : { text: `${prettyKey(s.askHotkey)} to ask about highlighted text` }
    }
    case 'privacy':
      return { text: `${s.rememberChats ? `Chats kept ${KEEP.find((k) => k.value === s.keepChats)?.label.toLowerCase()}` : 'Chats not kept'} · notes ${s.learn ? 'on' : 'off'}` }
    case 'links': {
      if (!links) return { text: '' }
      const need = links.connected.find((c) => c.status === 'needs-sign-in' || c.status === 'changed')
      if (need) return { text: `${need.label} needs you`, warn: true }
      const names = links.connected.map((c) => c.label)
      if (!names.length) return { text: 'None yet' }
      return { text: names.length <= 2 ? `${names.join(' and ')} on` : `${names[0]} and ${names.length - 1} more on` }
    }
    case 'usage':
      if (!usage) return { text: '' }
      return { text: s.monthlyCap?.unit === 'questions' ? `${usage.month.questions.toLocaleString()} of ${s.monthlyCap.limit.toLocaleString()} this month` : `${plural(usage.month.questions, 'question')} this month` }
    case 'conn':
      return s.needsKey && !s.hasApiKey ? { text: `${serviceById(serviceAt(s.baseUrl)).label} · needs a key`, warn: true } : { text: `${serviceById(serviceAt(s.baseUrl)).label} · ${s.model}` }
    case 'help':
      return { text: 'Diagnostics, shown before they’re copied' }
  }
}

export function Settings({ settings, onSaved, section, onSection, onOpenLogbook, onOpenNotebook }: Props) {
  const [usage, setUsage] = useState<UsageReport | null>(null)
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<string | null>(null)
  const [saved, setSaved] = useState(0)
  const [failed, setFailed] = useState<SettableKey | null>(null)
  /** A shortcut just recorded that another app owns: the old one was put back. */
  const [clash, setClash] = useState<SettableKey | null>(null)
  /** What a control shows while main saves it, so a switch moves at once and goes back if the save fails. */
  const [pending, setPending] = useState<Partial<PublicSettings>>({})
  /** D-54: the connections, for the list's summary and the Connections section. Never throws into the list. */
  const [links, setLinks] = useState<ConnectionsState | null>(null)
  useEffect(() => void window.otty.getUsage().then(setUsage), [])
  useEffect(() => void Promise.resolve().then(() => window.otty.connections()).then(setLinks, () => {}), [])
  const shown = { ...settings, ...pending }

  const save = async <K extends SettableKey>(key: K, value: PublicSettings[K]) => {
    setFailed(null)
    setPending((p) => ({ ...p, [key]: value }))
    const next = await window.otty.setSetting(key, value).catch(() => null)
    setPending(({ [key]: _gone, ...rest }) => rest)
    if (!next) return setFailed(key)
    onSaved(next)
    setSaved((n) => n + 1)
  }

  /** A new shortcut. If another app owns it, the old one goes back and the row says why. */
  const record = async (key: 'askHotkey' | 'snapHotkey' | 'screenHotkey', accel: string) => {
    const old = settings[key]
    setFailed(null)
    setClash(null)
    const next = await window.otty.setSetting(key, accel).catch(() => null)
    if (!next) return setFailed(key)
    if (!next.takenHotkeys.includes(accel)) {
      onSaved(next)
      return setSaved((n) => n + 1)
    }
    setClash(key)
    onSaved((await window.otty.setSetting(key, old).catch(() => null)) ?? next)
  }

  const open = (id: SectionId, row?: string) => {
    setFound(row ?? null)
    setQuery('')
    onSection(id)
  }

  if (!section) {
    const terms = parseQuery(query)
    const hits = terms.length ? FINDABLE.filter((f) => terms.every((t) => findRanges(`${f.title} ${f.words ?? ''}`, [t]).length)) : null
    return (
      <div className="settings">
        <label className="set-find">
          <Icon name="search" />
          <input
            placeholder="Find a setting"
            aria-label="Find a setting"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && hits?.[0] && open(hits[0].section, hits[0].id)}
          />
        </label>
        <div className="set-group__box">
          {hits
            ? hits.map((h) => (
                <button key={h.id} className="set-row set-row--tap" onClick={() => open(h.section, h.id)}>
                  <span className="set-row__text">
                    <Marked text={h.title} terms={terms} />
                    <span className="set-row__desc">{SECTIONS.find((s) => s.id === h.section)!.title}</span>
                  </span>
                </button>
              ))
            : SECTIONS.map((s) => {
                const sum = summary(s.id, settings, usage, links)
                return (
                  <button key={s.id} className="set-row set-row--tap set-row--section" onClick={() => open(s.id)}>
                    <Icon name={s.icon} className="set-row__glyph" />
                    <span className="set-row__text">
                      <span className="set-row__title">{s.title}</span>
                      <span className={`set-row__sum${sum.warn ? ' set-row__sum--warn' : ''}`}>{sum.text}</span>
                    </span>
                    <Icon name="angle-small-right" className="set-row__chevron" />
                  </button>
                )
              })}
          {hits?.length === 0 && <p className="set-none">No setting matches “{query}”.</p>}
        </div>
      </div>
    )
  }

  const row = (id: string) => ({ found: found === id, failed: failed === id })
  const title = SECTIONS.find((s) => s.id === section)!.title
  return (
    <div className="settings">
      <div className="set-bar">
        <button className="icon-btn icon-btn--sm" title="All settings" aria-label="All settings" onClick={() => onSection(null)}>
          <Icon name="angle-small-left" />
        </button>
        <h2 className="set-bar__title">{title}</h2>
        <Saved key={saved} on={saved > 0} />
      </div>
      {section === 'you' && (
        <>
          <Group label="Otty on your screen">
            <SwitchRow {...row('showBubble')} title="Show the floating otter" description="Click it to open Otty. Right-click for Pause and more." on={shown.showBubble} onChange={(v) => void save('showBubble', v)} />
            <SwitchRow
              {...row('notifyDone')}
              title="Tell me when something is ready"
              description="A Mac notification when something Otty looked into is done, or needs your OK."
              on={shown.notifyDone}
              onChange={(v) => void save('notifyDone', v)}
            />
            <SwitchRow
              {...row('openAtLogin')}
              title="Open Otty when I log in"
              description={settings.canOpenAtLogin ? 'So things you asked Otty to check later still happen after a restart.' : 'Only in the installed app.'}
              disabled={!settings.canOpenAtLogin}
              on={shown.openAtLogin}
              onChange={(v) => void save('openAtLogin', v)}
            />
          </Group>
          <Group label="Language">
            <ChoiceRow
              {...row('homeLanguage')}
              title="Help in my own language"
              description="For when a word or a step is easier in your own language. The app stays in English."
              value={shown.homeLanguage ?? 'none'}
              options={[
                { value: 'none', label: 'English only' },
                { value: 'zh-HK', label: '繁體中文（香港）' }
              ]}
              onChange={(v) => void save('homeLanguage', v === 'none' ? null : v)}
            />
          </Group>
        </>
      )}
      {section === 'tiles' && <MyTiles tiles={shown.myTiles} save={(t) => void save('myTiles', t)} />}
      {section === 'keys' && (
        <Group label="Shortcuts">
          {(
            [
              ['askHotkey', 'Ask about highlighted text', undefined],
              ['snapHotkey', 'Snip part of the screen', undefined],
              ['screenHotkey', 'The whole screen', 'Includes everything on it, such as notifications and other windows. Nothing is sent until you ask.']
            ] as const
          ).map(([key, t, d]) => (
            <KeysRow key={key} {...row(key)} title={t} description={d} value={settings[key]} clash={clash === key || settings.takenHotkeys.includes(settings[key])} onChange={(v) => void record(key, v)} />
          ))}
        </Group>
      )}
      {section === 'privacy' && <Privacy shown={shown} settings={settings} row={row} save={save} onOpenLogbook={onOpenLogbook} onOpenNotebook={onOpenNotebook} />}
      {section === 'links' && links && <Connections state={links} onChange={setLinks} />}
      {section === 'usage' && <Usage usage={usage} cap={shown.monthlyCap} row={row} save={save} />}
      {section === 'conn' && <Conn settings={settings} shown={shown} row={row} save={save} onSaved={onSaved} />}
      {section === 'help' && <Help />}
    </div>
  )
}

/** "Saved", for a moment, each time something in the section is saved. Restarted by a new key. */
function Saved({ on }: { on: boolean }) {
  return (
    <span className={`set-saved${on ? ' set-saved--on' : ''}`} role="status">
      {on && (
        <>
          <Icon name="check" /> Saved
        </>
      )}
    </span>
  )
}

function Marked({ text, terms }: { text: string; terms: string[] }) {
  const ranges = findRanges(text, terms)
  const parts: React.ReactNode[] = []
  let at = 0
  for (const [a, b] of ranges) {
    parts.push(text.slice(at, a), <b key={a}>{text.slice(a, b)}</b>)
    at = b
  }
  parts.push(text.slice(at))
  return <span className="set-row__title set-row__title--find">{parts}</span>
}

type Row = (id: string) => { found: boolean; failed: boolean }
type Save = <K extends SettableKey>(key: K, value: PublicSettings[K]) => Promise<void>

/** What forgetting would cost, asked inline: the switch or choice only changes after the hold. */
function ForgetPrompt({ text, onForget, onKeep }: { text: string; onForget: () => void; onKeep: () => void }) {
  return (
    <div className="confirm-card ask ask--unusual set-prompt" role="group" aria-label={text}>
      <Icon name="triangle-warning" className="ask__glyph" />
      <div className="ask__body">
        <div className="ask__host">{text}</div>
        <div className="ask__sub">This can’t be undone.</div>
        <div className="confirm-card__row">
          <HoldButton label="Hold to forget" onDone={onForget} />
          <button className="btn btn--soft btn--small" onClick={onKeep}>
            Keep them
          </button>
        </div>
      </div>
    </div>
  )
}

function Privacy({ shown, settings, row, save, onOpenLogbook, onOpenNotebook }: { shown: PublicSettings; settings: PublicSettings; row: Row; save: Save } & Pick<Props, 'onOpenLogbook' | 'onOpenNotebook'>) {
  const [counts, setCounts] = useState<SettingsCounts | null>(null)
  /** A change that would forget chats: the control moves at once, and the prompt shows once main's count is in. */
  const [asking, setAsking] = useState<({ kind: 'off' } | { kind: 'keep'; keep: KeepChats }) & { counted?: boolean } | null>(null)
  /** Asks first if `forgets` says the change would forget anything now; otherwise just saves it. */
  const askOr = (ask: { kind: 'off' } | { kind: 'keep'; keep: KeepChats }, forgets: (c: SettingsCounts) => number, go: () => Promise<void>) => {
    setAsking(ask)
    void fresh().then((c) => {
      if (forgets(c)) return setAsking({ ...ask, counted: true })
      setAsking(null)
      return go()
    })
  }
  /** Rows held to the end stay, saying Forgotten, after their count drops to nothing. */
  const [forgot, setForgot] = useState<{ chats?: boolean; notes?: boolean }>({})
  const chatsRow = Boolean(counts?.chats) || forgot.chats
  const notesRow = Boolean(counts?.notes) || forgot.notes
  /** D-77: the Pouch's hold is always here, disabled while nothing is kept. */
  const pouchCount = counts?.pebbles ?? 0
  /** The counts as they are now: the prompt must never be skipped because they hadn't arrived yet. */
  const fresh = () =>
    window.otty.settingsCounts().then((c) => {
      setCounts(c)
      return c
    })
  const refresh = () => void fresh()
  useEffect(refresh, [settings.rememberChats, settings.keepChats])
  const keepLabel = (k: KeepChats) => KEEP.find((x) => x.value === k)!.label.toLowerCase()
  return (
    <>
      <Group label="What Otty keeps">
        <SwitchRow
          {...row('rememberChats')}
          title="Remember my chats"
          description="On this Mac only. Keeps the text Otty read from files, never the files or pictures."
          on={shown.rememberChats && asking?.kind !== 'off'}
          onChange={(on) => (on ? void save('rememberChats', true) : askOr({ kind: 'off' }, (c) => c.chats, () => save('rememberChats', false)))}
        />
        {asking?.kind === 'off' && asking.counted && (
          <ForgetPrompt text={`Turn off and forget ${plural(counts?.chats ?? 0, 'chat')}?`} onKeep={() => setAsking(null)} onForget={() => (setAsking(null), void save('rememberChats', false))} />
        )}
        {shown.rememberChats && (
          <ChoiceRow
            {...row('keepChats')}
            title="Keep chats for"
            description="Counted from a chat’s last message."
            value={asking?.kind === 'keep' ? asking.keep : shown.keepChats}
            options={KEEP}
            onChange={(keep) => askOr({ kind: 'keep', keep }, (c) => c.olderThan[keep], () => save('keepChats', keep))}
          />
        )}
        {asking?.kind === 'keep' && asking.counted && (
          <ForgetPrompt
            text={`Forget ${plural(counts?.olderThan[asking.keep] ?? 0, 'chat')} older than ${keepLabel(asking.keep)}?`}
            onKeep={() => setAsking(null)}
            onForget={() => (setAsking(null), void save('keepChats', asking.keep))}
          />
        )}
        <SwitchRow {...row('learn')} title="Let Otty note things about me" description="Every note shows under the answer with an Undo." on={shown.learn} onChange={(v) => void save('learn', v)} />
        <LinkRow {...row('notebook')} title="Open the Notebook" onClick={onOpenNotebook} />
      </Group>
      <Group label="What goes with a question">
        <SwitchRow
          {...row('shareAppContext')}
          title="Tell Otty which app I’m using"
          description="The app’s name, window title and page address (without anything after “?”)."
          on={shown.shareAppContext}
          onChange={(v) => void save('shareAppContext', v)}
        />
      </Group>
      <Group label="What leaves your Mac">
        <ValueRow title="Web look-ups" description={settings.readsPages ? serviceById(serviceAt(settings.baseUrl)).webPrivacy : 'Nothing leaves this Mac.'} />
        <LinkRow {...row('sent')} title="See what left my Mac" onClick={() => onOpenLogbook('sent')} />
        <LinkRow {...row('changed')} title="See what Otty changed" onClick={() => onOpenLogbook('changed')} />
      </Group>
      <Group label="Can’t be undone">
          {chatsRow && (
            <HoldRow
              {...row('forgetChats')}
              title="Forget all chats"
              description={`${plural(counts?.chats ?? 0, 'chat')}. Your Pouch and calendar are kept.`}
              onDone={() => (setForgot((f) => ({ ...f, chats: true })), void window.otty.clearChats().then(refresh))}
            />
          )}
          {notesRow && (
            <HoldRow
              {...row('forgetNotes')}
              title="Forget everything in the Notebook"
              description={`${plural(counts?.notes ?? 0, 'note')}.`}
              onDone={() => (setForgot((f) => ({ ...f, notes: true })), void window.otty.clearMemories().then(refresh))}
            />
          )}
          <HoldRow
            {...row('forgetPouch')}
            title="Forget my Pouch"
            description={pouchCount ? `${plural(pouchCount, 'kept thing')}. Chats aren’t touched.` : 'Nothing kept yet.'}
            disabled={!pouchCount}
            onDone={() => void window.otty.forgetPouch().then(refresh)}
          />
        </Group>
    </>
  )
}

const DEFAULT_CAP: MonthlyCap = { unit: 'questions', limit: 300 }

/** Questions only: tokens mean nothing to most people. A saved token limit still works and reads as one. */
function Usage({ usage, cap, row, save }: { usage: UsageReport | null; cap: MonthlyCap | null; row: Row; save: Save }) {
  const [limit, setLimit] = useState(String(cap?.limit ?? DEFAULT_CAP.limit))
  if (!usage) return null
  const used = usage.month.questions
  const share = cap?.unit === 'questions' ? Math.min(1, used / cap.limit) : 0
  const commit = () => {
    const n = Math.max(1, Math.floor(Number(limit) || 1))
    setLimit(String(n))
    if (n !== cap?.limit) void save('monthlyCap', { unit: 'questions', limit: n })
  }
  return (
    <>
      <Group label="This month">
        <div className={`meter${row('usage').found ? ' set-row--found' : ''}`}>
          <div className="meter__top">
            <span className="meter__count">{used.toLocaleString()}</span>
            <span className="meter__unit">{used === 1 ? 'question' : 'questions'}</span>
            {cap?.unit === 'questions' && <span className="meter__limit">of {cap.limit.toLocaleString()}</span>}
          </div>
          {cap?.unit === 'questions' && (
            <div className="meter__bar" role="meter" aria-label="Used this month" aria-valuemin={0} aria-valuemax={cap.limit} aria-valuenow={used}>
              <span className={share >= 0.8 ? 'meter__fill meter__fill--near' : 'meter__fill'} style={{ width: `${share * 100}%` }} />
            </div>
          )}
          <p className="meter__note">
            {usage.jobs || usage.searches || usage.pages ? `In the last ${usage.days} days, also ${plural(usage.jobs, 'look-up')} on its own, ${plural(usage.searches, 'search', 'searches')} and ${plural(usage.pages, 'page')}. ` : ''}
            Resets on {nextMonth()}.
          </p>
        </div>
        {usage.usageUrl && <LinkRow title={`See what it cost on ${usage.service}`} out onClick={() => void window.otty.openExternal(usage.usageUrl!)} />}
      </Group>
      <Group label="Monthly limit">
        <SwitchRow
          {...row('monthlyCap')}
          title="Set a monthly limit"
          description="Past it, Otty asks before starting anything on its own. Your own questions always go through."
          on={Boolean(cap)}
          onChange={(on) => void save('monthlyCap', on ? { ...DEFAULT_CAP, limit: Math.max(1, Number(limit) || DEFAULT_CAP.limit) } : null)}
        />
        {cap?.unit === 'questions' && (
          <CustomRow title="Limit">
            <span className="limit">
              <input className="field limit__field" inputMode="numeric" aria-label="Limit" value={limit} onChange={(e) => setLimit(e.target.value.replace(/\D/g, ''))} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />
              <span>questions a month</span>
            </span>
          </CustomRow>
        )}
        {cap?.unit === 'tokens' && (
          <CustomRow title={`${cap.limit.toLocaleString()} tokens a month`}>
            <button className="btn btn--soft btn--small" onClick={() => void save('monthlyCap', DEFAULT_CAP)}>
              Count questions instead
            </button>
          </CustomRow>
        )}
      </Group>
    </>
  )
}

/** The one place with an explicit button: a key is saved only once it's been checked. */
function Conn({ settings, shown, row, save, onSaved }: { settings: PublicSettings; shown: PublicSettings; row: Row; save: Save; onSaved: (s: PublicSettings) => void }) {
  const broken = settings.needsKey && !settings.hasApiKey
  const [open, setOpen] = useState(broken)
  const [form, setForm] = useState({ baseUrl: settings.baseUrl, model: settings.model, apiFormat: settings.apiFormat })
  const [key, setKey] = useState('')
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null)
  const [checking, setChecking] = useState(false)
  const service = serviceById(serviceAt(settings.baseUrl))
  const check = async () => {
    setChecking(true)
    const s = await window.otty.saveSettings({ ...form, ...(key.trim() ? { apiKey: key.trim() } : {}) })
    setKey('')
    onSaved(s)
    setStatus(await window.otty.testConnection())
    setChecking(false)
  }
  return (
    <>
      <Group label="Your AI service">
        <ValueRow
          {...row('service')}
          title={service.label}
          description={!settings.needsKey ? 'Runs on this Mac, with no key.' : settings.hasApiKey ? 'Key in your Mac’s Keychain.' : 'No key saved yet.'}
          value={status ? (status.ok ? 'Working' : 'Not working') : undefined}
        />
        <button className="set-row set-row--tap" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span className="set-row__text">
            <span className="set-row__title">Change service or key</span>
          </span>
          <Icon name={open ? 'angle-small-up' : 'angle-small-down'} className="set-row__chevron" />
        </button>
        {open && (
          <div className="set-conn">
            <ConnectionFields value={form} onChange={(c) => setForm((f) => ({ ...f, ...c }))} apiKey={key} onKey={setKey} savedKeys={settings.savedKeys} keychain={settings.keychain} />
            <button className="btn btn--primary" disabled={checking || !connectionReady(form)} onClick={() => void check()}>
              {checking ? 'Checking…' : 'Check and save'}
            </button>
            {status && <div className={status.ok ? 'ok-card' : 'error-card'}>{status.message}</div>}
          </div>
        )}
        <SwitchRow {...row('thinking')} title="Always think deeper" description="Slower, and uses more of your plan, but better on hard questions." on={shown.thinking} onChange={(v) => void save('thinking', v)} />
      </Group>
    </>
  )
}

/** D-50: what to send Otty's team when something goes wrong, all shown before it's copied. */
function Help() {
  const [report, setReport] = useState<string | null>(null)
  const [copied, setCopied] = useState<boolean | 'failed'>(false)
  return (
    <Group label="Help">
      <LinkRow title="Copy diagnostics" description="Shown in full before anything is copied. Never your chats or keys." onClick={() => void window.otty.getDiagnostics().then(setReport)} />
      {report !== null && (
        <div className="set-conn">
          <pre className="diagnostics" aria-label="Diagnostics">
            {report}
          </pre>
          <button className="btn btn--soft btn--small" onClick={() => void window.otty.copyText(report).then(() => setCopied(true), () => setCopied('failed'))}>
            <Icon name="copy" /> {copied === 'failed' ? 'Couldn’t copy, try again' : copied ? 'Copied' : 'Copy this'}
          </button>
        </div>
      )}
    </Group>
  )
}

