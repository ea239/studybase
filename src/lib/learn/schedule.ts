import { readLearnSession } from "./session";
import { syncEnabledCourses } from "./sync";

const INTERVAL_MS = 24 * 60 * 60 * 1000;
// Courseware lands during the day; a first run shortly after boot picks up
// anything posted while the server was down without hammering LEARN on every
// container restart.
const FIRST_RUN_DELAY_MS = 5 * 60 * 1000;

let started = false;

export function startLearnSchedule() {
  if (started) return;
  started = true;

  const run = async () => {
    // No session means the owner hasn't logged in (or it lapsed). Skip
    // quietly — the settings page already shows the disconnected state.
    if (!(await readLearnSession())) return;
    try {
      const reports = await syncEnabledCourses();
      for (const r of reports) {
        console.log(
          r.error
            ? `[learn] ${r.course}: ${r.error}`
            : `[learn] ${r.course}: +${r.imported} ~${r.updated} skip ${r.skipped}`
        );
      }
    } catch (err) {
      console.error("[learn] 定时同步失败", err);
    }
  };

  setTimeout(run, FIRST_RUN_DELAY_MS).unref?.();
  setInterval(run, INTERVAL_MS).unref?.();
}
