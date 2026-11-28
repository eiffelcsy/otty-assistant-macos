// D-87: signs the app again with Otty's own certificate when the release workflow provides one (OTTY_SIGN_KEYCHAIN,
// unlocked, holding "Otty Self-Signed"). It's self-signed until there's a Developer ID, and electron-builder refuses a
// certificate macOS doesn't trust, so codesign does it here, after electron-builder's ad-hoc signature and the fuses,
// and before the dmg and zip are made. The designated requirement it prints must stay the same from version to version.
const { execFileSync } = require('child_process')
const { join } = require('path')

exports.default = async function afterSign({ appOutDir, packager, electronPlatformName }) {
  const keychain = process.env.OTTY_SIGN_KEYCHAIN
  if (electronPlatformName !== 'darwin' || !keychain) return
  const app = join(appOutDir, `${packager.appInfo.productFilename}.app`)
  const entitlements = join(__dirname, 'entitlements.mac.plist')
  execFileSync('codesign', ['--force', '--deep', '--sign', 'Otty Self-Signed', '--keychain', keychain, '--entitlements', entitlements, app], { stdio: 'inherit' })
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' })
  execFileSync('codesign', ['-d', '-r-', app], { stdio: 'inherit' })
}
