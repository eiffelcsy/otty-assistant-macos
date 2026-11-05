/** A failure with words fit to show the user. */
export class FriendlyError extends Error {}

/** The model rejected an image, i.e. it has no vision. */
export class NoVisionError extends FriendlyError {}

/** The model can't use tools. Many local ones can't, so the request goes again without them. */
export class NoToolsError extends FriendlyError {}
