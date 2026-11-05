/** A failure with words fit to show the user. */
export class FriendlyError extends Error {}

/** The model rejected an image, i.e. it has no vision. */
export class NoVisionError extends FriendlyError {}
