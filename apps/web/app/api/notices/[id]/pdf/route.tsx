import { renderToBuffer } from "@react-pdf/renderer";
import { loadNoticeDocument } from "@/lib/notices/branding";
import { NoticePdf } from "@/lib/notices/notice-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const doc = await loadNoticeDocument(id);
  if (!doc) return new Response("Not found", { status: 404 });
  const buffer = await renderToBuffer(<NoticePdf doc={doc} />);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="notice-${doc.refLabel?.replaceAll("/", "-") ?? id}.pdf"`,
      "cache-control": "private, no-store",
    },
  });
}
