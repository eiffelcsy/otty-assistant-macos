/**
 * Thrown by a tool's confirm when nobody is there to answer: a background job asking about an address. It stops the
 * work where it is. The tool call stays unanswered in the history, and runs again once the user has replied.
 */
export class ToolPause extends Error {
  constructor(readonly url: string) {
    super('Waiting for the user')
  }
}
