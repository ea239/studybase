import { STATUS_LABELS } from "@/lib/labels";

export function StatusBadge({ status }: { status: string }) {
  const info = STATUS_LABELS[status] ?? { text: status, className: "bg-neutral-200 text-neutral-700" };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${info.className}`}>
      {info.text}
    </span>
  );
}
