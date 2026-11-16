import { ImageResponse } from "next/og";
import sharp from "sharp";
import { formatNoticeDate, loadNoticeDocument } from "@/lib/notices/branding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Brand colours (CONSTITUTION §7.1); the image renderer cannot read CSS variables.
const navy = "#01306F";
const slate = "#475569";

/** A square-ish picture of the notice for sharing on WhatsApp, stored as WebP like every image. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const doc = await loadNoticeDocument(id);
  if (!doc) return new Response("Not found", { status: 404 });
  const logo = doc.school.logoPng
    ? `data:image/png;base64,${doc.school.logoPng.toString("base64")}`
    : null;
  const body = doc.body.length > 700 ? `${doc.body.slice(0, 700)}…` : doc.body;

  const png = await new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: "#ffffff",
        padding: 56,
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          paddingBottom: 24,
          borderBottom: `4px solid ${navy}`,
        }}
      >
        {logo ? (
          // biome-ignore lint/performance/noImgElement: next/og renders plain elements
          <img
            src={logo}
            width={88}
            height={88}
            alt=""
            style={{ marginRight: 24, objectFit: "contain" }}
          />
        ) : null}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 40, fontWeight: 700, color: navy }}>{doc.school.name}</div>
          {doc.school.address ? (
            <div style={{ fontSize: 22, color: slate, marginTop: 4 }}>{doc.school.address}</div>
          ) : null}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 24,
          color: slate,
          marginTop: 28,
        }}
      >
        <div>{doc.refLabel ?? ""}</div>
        <div>{formatNoticeDate(doc.publishedAt)}</div>
      </div>
      <div style={{ fontSize: 48, fontWeight: 700, color: navy, marginTop: 28 }}>{doc.title}</div>
      <div
        style={{
          fontSize: 30,
          lineHeight: 1.5,
          marginTop: 24,
          color: "#0F172A",
          whiteSpace: "pre-wrap",
        }}
      >
        {body}
      </div>
      <div
        style={{
          marginTop: "auto",
          fontSize: 20,
          color: slate,
          textAlign: "center",
          justifyContent: "center",
          display: "flex",
        }}
      >
        Powered by ERP · PastAndPixels Group
      </div>
    </div>,
    { width: 1080, height: 1350 },
  ).arrayBuffer();

  const webp = await sharp(Buffer.from(png)).webp({ quality: 85 }).toBuffer();
  return new Response(new Uint8Array(webp), {
    headers: { "content-type": "image/webp", "cache-control": "private, no-store" },
  });
}
