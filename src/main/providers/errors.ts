import type { Profile } from './profiles'

/** A failure with words fit to show the user. */
export class FriendlyError extends Error {}

/** The model rejected an image, i.e. it has no vision. */
export class NoVisionError extends FriendlyError {}

/** The model can't use tools. Many local ones can't, so the request goes again without them. */
export class NoToolsError extends FriendlyError {}

/** A failed request in plain words, the same whichever API format it used. */
export function friendlyStatus(status: number, body: string, profile: Profile): FriendlyError {
  if (status === 401) return new FriendlyError('Otty’s key doesn’t look right. Please check it in Settings.')
  if (status === 402 || /credit balance/i.test(body)) {
    const name = profile.topUp ? `Your ${profile.label}` : 'Your'
    return new FriendlyError(`${name} balance is empty.${profile.topUp ? ` Top up at ${profile.topUp}, then try again.` : ''}`)
  }
  if (status === 404 && profile.id === 'local') {
    return new FriendlyError('Otty can’t find that model. Check its name in Settings, and that it’s downloaded in Ollama or LM Studio.')
  }
  if (status === 404) return new FriendlyError('Otty can’t find that model. Check its name in Settings.')
  if (status === 429) return new FriendlyError('Otty is getting lots of questions right now. Give it a few seconds and try again.')
  if (status >= 500) return new FriendlyError('The AI service is having a moment. Please try again shortly.')
  if (status === 413 || /prompt is too long/i.test(body)) return new FriendlyError('This chat has grown too long. Please start a new one.')
  if (status === 400 && /image|vision|multimodal/i.test(body)) {
    return new NoVisionError('This model can’t look at pictures. Try a vision-capable model in Settings.')
  }
  console.error('LLM error', status, body)
  return new FriendlyError(`Something went wrong (error ${status}). Please try again.`)
}

export function friendlyConnection(profile: Profile): FriendlyError {
  if (profile.id === 'local') return new FriendlyError('Otty can’t reach your local model. Check that Ollama or LM Studio is running.')
  return new FriendlyError('Otty can’t reach the internet. Check your connection and try again.')
}
