/**
 * Announces that this deployment has no login.
 *
 * Deliberately loud and on every page. The flag that switches authentication
 * off is one line in a compose file, and a line like that can end up somewhere
 * it was never meant to be; what makes that safe is being unable to miss it.
 */
export function DemoBanner() {
  if (process.env.DEMO_MODE !== "1") return null;

  return (
    <div className="flex items-center justify-center gap-2 bg-amber-500/90 px-4 py-1.5 text-center text-xs font-medium text-amber-950">
      <span aria-hidden>⚠</span>
      演示环境 · 未启用登录，任何能访问这个地址的人都能看到和修改全部内容
    </div>
  );
}
