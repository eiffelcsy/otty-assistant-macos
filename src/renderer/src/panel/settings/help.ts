import { keyWords } from '../../lib/keys'

// D-79: the answers under Settings › Help, "How do I…". Shortcuts are shown from the person's own settings.

export interface HowTo {
  question: string
  answer: string
}

export function howTo(s: { askHotkey: string; snapHotkey: string; screenHotkey: string }): HowTo[] {
  return [
    { question: 'Ask about something you highlighted', answer: `Highlight text in any app and press ${keyWords(s.askHotkey)}. Otty opens next to it.` },
    { question: 'Ask about part of the screen', answer: `Press ${keyWords(s.snapHotkey)}, then drag over what you want Otty to look at.` },
    { question: 'Ask about the whole screen', answer: `Press ${keyWords(s.screenHotkey)}. Otty sees everything on it, so close anything private first.` },
    {
      question: 'Stop Otty for a while',
      answer: 'Right-click the floating otter and choose Pause everything, or use Pause in the sidebar. Nothing runs until you resume.'
    },
    { question: 'See what left your Mac', answer: 'Open the Logbook and choose What left my Mac. Every question, search and page read is listed.' },
    { question: 'Connect your calendar or apps', answer: 'Settings › Connections. Otty only reads, and shows every read in What left my Mac.' },
    { question: 'Keep something Otty made', answer: 'Press Keep on a chart, diagram or slides. It goes to your Pouch (⌘6).' }
  ]
}
