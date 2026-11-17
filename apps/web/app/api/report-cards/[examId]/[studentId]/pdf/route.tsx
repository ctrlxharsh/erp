import { renderToBuffer } from "@react-pdf/renderer";
import { ReportCardPdf } from "@/lib/exams/documents";
import { loadSchoolHeader } from "@/lib/notices/school-header";
import { getServerApi } from "@/lib/trpc/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uuid = /^[0-9a-f-]{36}$/i;

/** The report card goes through the same API (and permission checks) as the app. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ examId: string; studentId: string }> },
) {
  const { examId, studentId } = await params;
  if (!uuid.test(examId) || !uuid.test(studentId))
    return new Response("Not found", { status: 404 });
  const api = await getServerApi();
  const card = await api.results.reportCard({ examId, studentId }).catch(() => null);
  if (!card) return new Response("Not found", { status: 404 });
  const buffer = await renderToBuffer(
    <ReportCardPdf school={await loadSchoolHeader()} card={card} />,
  );
  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="report-card.pdf"`,
      "cache-control": "private, no-store",
    },
  });
}
