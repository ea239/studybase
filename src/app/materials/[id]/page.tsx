import { MaterialDetailClient } from "./MaterialDetailClient";

export default async function MaterialDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MaterialDetailClient id={id} />;
}
