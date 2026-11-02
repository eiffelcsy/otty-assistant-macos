import { extract, FileError } from './extract'

// The file-reader utility process: reads one document per request and posts back its text.
// It makes no network requests and touches only the file it's asked to read.

export interface ReadRequest {
  reqId: number
  path: string
  kind: 'pdf' | 'docx' | 'text'
}

export type ReadReply =
  | { reqId: number; ok: true; result: Awaited<ReturnType<typeof extract>> }
  | { reqId: number; ok: false; message?: string }

process.parentPort.on('message', async ({ data }: { data: ReadRequest }) => {
  let reply: ReadReply
  try {
    reply = { reqId: data.reqId, ok: true, result: await extract(data.path, data.kind) }
  } catch (err) {
    if (!(err instanceof FileError)) console.error('File reader failed', err)
    reply = { reqId: data.reqId, ok: false, message: err instanceof FileError ? err.message : undefined }
  }
  process.parentPort.postMessage(reply)
})
