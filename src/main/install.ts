import { app, dialog } from 'electron'
import { getStored, saveMoveDeclined } from './settings'

// D-53: macOS ties Otty's permissions and updates to where the app lives, so one run from the DMG or Downloads
// offers, once, to move it into Applications. A no is kept; a move relaunches from there.

export async function offerMove(): Promise<void> {
  if (process.platform !== 'darwin' || !app.isPackaged || app.isInApplicationsFolder() || getStored().moveDeclined) return
  app.focus({ steal: true }) // Otty has no Dock icon, so the question would open behind the app in front
  const { response } = await dialog.showMessageBox({
    type: 'question',
    message: 'Move Otty to your Applications folder?',
    detail: 'Otty keeps its permissions and updates there. Right now it’s running from somewhere macOS may forget it.',
    buttons: ['Move to Applications', 'Not now'],
    defaultId: 0,
    cancelId: 1
  })
  if (response !== 0) return saveMoveDeclined()
  try {
    // False when the user cancels macOS's own "replace the copy there?", which is a no too.
    if (!app.moveToApplicationsFolder()) saveMoveDeclined()
  } catch (err) {
    console.error('Could not move Otty to Applications', err)
    await dialog.showMessageBox({
      type: 'info',
      message: 'Otty couldn’t move itself',
      detail: 'Drag Otty into your Applications folder in Finder, then open it from there. Otty will keep working meanwhile.'
    })
  }
}
