// Holds the model's streamed answers until released, so a spec can act while an answer is still under way.
import type { ServerResponse } from 'http'
import type { ModelBody, World } from './world/server'

/**
 * Holds every streamed answer until the returned function is called, so a spec can act while one is under way.
 * The world is shared by the worker, so the hold is always lifted (call it in `finally`).
 */
export function holdAnswers(world: World): () => void {
  type Model = (res: ServerResponse, body: ModelBody) => void
  const w = world as unknown as { model: Model }
  const real = w.model
  let release = () => {}
  const gate = new Promise<void>((r) => (release = r))
  w.model = (res, body) => {
    if (body.stream) void gate.then(() => real.call(world, res, body))
    else real.call(world, res, body)
  }
  return () => {
    release()
    delete (w as Partial<typeof w>).model // back to the class's own
  }
}
