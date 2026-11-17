import { renderToBuffer } from "@react-pdf/renderer";
import { AdmitCardPdf } from "@/lib/exams/documents";
import { loadSchoolHeader } from "@/lib/notices/school-header";
import { getServerApi } from "@/lib/trpc/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uuid = /^[0-9a-f-]{36}$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ examId: string; studentId: string }> },
) {
  const { examId, studentId } = await params;
  if (!uuid.test(examId) || !uuid.test(studentId))
    return new Response("Not found", { status: 404 });
  const api = await getServerApi();
  const card = await api.results.admitCard({ examId, studentId }).catch(() => null);
  if (!card) return new Response("Not found", { status: 404 });
  const buffer = await renderToBuffer(
    <AdmitCardPdf school={await loadSchoolHeader()} card={card} />,
  );
  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="admit-card.pdf"`,
      "cache-control": "private, no-store",
    },
  });
}
