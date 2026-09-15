import { readLearnSession } from "./session";
import { syncEnabledCourses } from "./sync";

const INTERVAL_MS = 24 * 60 * 60 * 1000;
// A failed run is usually an expired session, which is fixed by hand and could
// be fixed minutes later. Waiting a full day to notice would mean a day of
// missed courseware after a login that already happened.
const RETRY_MS = 60 * 60 * 1000;
// Courseware lands during the day; a first run shortly after boot picks up
// anything posted while the server was down without hammering LEARN on every
// container restart.
const FIRST_RUN_DELAY_MS = 5 * 60 * 1000;

let started = false;

export function startLearnSchedule() {
  if (started) return;
  started = true;

  // Self-scheduling rather than a fixed interval, so the next run can come
  // sooner after a failure than after a success.
  const schedule = (delay: number) => setTimeout(run, delay).unref?.();

  const run = async () => {
    let failed = false;
    try {
      if (!(await readLearnSession())) {
        // Not logged in at all. Nothing to retry quickly for — a login is a
        // manual act, and the settings page shows the state.
        console.log("[learn] 跳过定时同步：没有 LEARN 登录会话");
      } else {
        const reports = await syncEnabledCourses();
        for (const r of reports) {
          console.log(
            r.error
              ? `[learn] ${r.course}: ${r.error}`
              : `[learn] ${r.course}: +${r.imported} ~${r.updated} skip ${r.skipped}`
          );
        }
        failed = reports.some((r) => r.error);
      }
    } catch (err) {
      console.error("[learn] 定时同步失败", err);
      failed = true;
    } finally {
      schedule(failed ? RETRY_MS : INTERVAL_MS);
    }
  };

  schedule(FIRST_RUN_DELAY_MS);
}
