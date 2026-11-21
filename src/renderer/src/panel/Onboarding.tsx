import { useEffect, useState } from "react";
import type {
  HomeLanguage,
  Permissions,
  PublicSettings,
} from "../../../shared/types";
import { serviceAt, serviceById } from "../../../shared/services";
import {
  connectionReady,
  ConnectionFields,
  type Connection,
} from "../components/ConnectionFields";
import { HomeLanguagePicker } from "../components/HomeLanguagePicker";
import { Icon } from "../components/Icon";
import { Cove, CoveOtty } from "../components/Cove";
import { prettyKey } from "../lib/keys";

/** Each step's words on the sky (Spec 08): the title, then one sentence. */
const HERO: [title: string, sentence: string][] = [
  [
    "Hi! I’m Otty",
    "Highlight text or snap your screen, and I’ll explain it in plain words.",
  ],
  [
    "Choose Otty’s brain",
    "Otty needs an AI service to think. Keys stay locked in your Mac’s Keychain.",
  ],
  ["Two quick permissions", "Otty only looks when you ask."],
];

export function Onboarding({
  settings,
  onDone,
}: {
  settings: PublicSettings;
  onDone: (s: PublicSettings) => void;
}) {
  const [step, setStep] = useState(0);
  const [key, setKey] = useState("");
  const [connection, setConnection] = useState<Connection>({
    baseUrl: settings.baseUrl,
    model: settings.model,
    apiFormat: settings.apiFormat,
  });
  const [saved, setSaved] = useState(settings.savedKeys);
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(
    null,
  );
  const [testing, setTesting] = useState(false);
  const [perms, setPerms] = useState<Permissions | null>(null);
  const [home, setHome] = useState<HomeLanguage | null>(settings.homeLanguage);

  // Live-refresh permission ticks while the user is in System Settings.
  useEffect(() => {
    if (step !== 2) return;
    const tick = () => window.otty.getPermissions().then(setPerms);
    tick();
    const t = setInterval(tick, 1500);
    return () => clearInterval(t);
  }, [step]);

  const saveAndTest = async () => {
    setTesting(true);
    setTest(null);
    const s = await window.otty.saveSettings({
      ...connection,
      ...(key.trim() ? { apiKey: key.trim() } : {}),
    });
    setSaved(s.savedKeys);
    setKey("");
    setTest(await window.otty.testConnection());
    setTesting(false);
  };

  const service = serviceById(serviceAt(connection.baseUrl));
  const canTest =
    connectionReady(connection) &&
    (!service.needsKey || Boolean(key.trim()) || saved.includes(service.id));

  const finish = async () =>
    onDone(await window.otty.saveSettings({ onboarded: true }));

  return (
    <div className="frame frame--compact">
      <main className="frame__main frame__main--cove frame__main--full">
        <Cove mode="full" />
        <div className="frame__body">
          <div className="onboarding">
            <div className="cove-hero">
              <div className="cove-hero__words">
                <h2 className="cove-hero__hello">{HERO[step][0]}</h2>
                <p className="cove-hero__sentence">{HERO[step][1]}</p>
              </div>
              <CoveOtty />
            </div>
            <div className="onboarding__block">
              <div className="steps">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className={`steps__dot ${i <= step ? "steps__dot--on" : ""}`}
                  />
                ))}
              </div>

              {step === 0 && (
                <div className="onboarding__page">
                  <div className="onboarding__field">
                    <span className="label">
                      Do you also speak another language?
                    </span>
                    <HomeLanguagePicker value={home} onChange={setHome} />
                  </div>
                  <button
                    className="btn btn--primary btn--large btn--wide"
                    onClick={async () => {
                      await window.otty.saveSettings({ homeLanguage: home });
                      setStep(1);
                    }}
                  >
                    Let’s get started
                  </button>
                </div>
              )}

              {step === 1 && (
                <div className="onboarding__page">
                  <ConnectionFields
                    value={connection}
                    onChange={setConnection}
                    apiKey={key}
                    onKey={setKey}
                    savedKeys={saved}
                    keychain={settings.keychain}
                    autoFocus
                  />
                  <button
                    className="btn btn--soft btn--large btn--wide"
                    disabled={testing || !canTest}
                    onClick={saveAndTest}
                  >
                    {testing ? "Checking…" : "Save & test"}
                  </button>
                  {test && (
                    <div className={test.ok ? "ok-card" : "error-card"}>
                      {test.message}
                    </div>
                  )}
                  <button
                    className="btn btn--primary btn--large btn--wide"
                    disabled={!test?.ok}
                    onClick={() => setStep(2)}
                  >
                    Next
                  </button>
                </div>
              )}

              {step === 2 && (
                <div className="onboarding__page">
                  <p>
                    macOS asks you to approve these so Otty can see what you
                    point it at.
                  </p>
                  <PermissionRow
                    ok={perms?.accessibility}
                    title="Accessibility"
                    why={`Reads text you highlight when you press ${prettyKey(settings.askHotkey)} or click Otty.`}
                    onOpen={() =>
                      window.otty.openPermissionSettings("accessibility")
                    }
                  />
                  <PermissionRow
                    ok={perms?.screen}
                    title="Screen Recording"
                    why="Lets your snips and whole-screen captures include other apps’ windows. A whole-screen capture shows everything on it, and nothing is sent until you ask."
                    onOpen={() => window.otty.openPermissionSettings("screen")}
                  />
                  <p className="hint">
                    Tip: after turning on Screen Recording, macOS may ask you to
                    reopen Otty.
                  </p>
                  <button
                    className="btn btn--primary btn--large btn--wide"
                    onClick={finish}
                  >
                    {perms?.accessibility && perms?.screen
                      ? "All set — let’s go!"
                      : "Skip for now"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function PermissionRow(props: {
  ok?: boolean;
  title: string;
  why: string;
  onOpen: () => void;
}) {
  return (
    <div className="perm-row">
      <span
        className={`perm-row__status ${props.ok ? "perm-row__status--ok" : ""}`}
      >
        <Icon name={props.ok ? "check-circle" : "circle"} solid={props.ok} />
      </span>
      <div className="perm-row__text">
        <b>{props.title}</b>
        <span>{props.why}</span>
      </div>
      {!props.ok && (
        <button className="btn btn--soft btn--small" onClick={props.onOpen}>
          Allow
        </button>
      )}
    </div>
  );
}
