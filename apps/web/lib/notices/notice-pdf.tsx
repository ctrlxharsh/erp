import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatNoticeDate, type NoticeDocument } from "./branding";

// Brand colours (CONSTITUTION §7.1). PDFs cannot read CSS variables, so the values live here.
const navy = "#01306F";
const slate = "#475569";

const styles = StyleSheet.create({
  page: { padding: 48, fontFamily: "Helvetica", fontSize: 12, color: "#0F172A" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingBottom: 14,
    borderBottomWidth: 2,
    borderBottomColor: navy,
  },
  logo: { width: 56, height: 56, objectFit: "contain" },
  school: { fontSize: 18, fontFamily: "Helvetica-Bold", color: navy },
  meta: { fontSize: 9, color: slate, marginTop: 2 },
  refRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 18,
    fontSize: 10,
    color: slate,
  },
  heading: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    color: navy,
    marginTop: 22,
    marginBottom: 14,
  },
  body: { lineHeight: 1.6 },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 48,
    right: 48,
    fontSize: 8,
    color: slate,
    textAlign: "center",
  },
});

/** A branded notice on A4: school header, reference and date, the notice, and the product footer. */
export function NoticePdf({ doc }: { doc: NoticeDocument }) {
  const details = [
    doc.school.address,
    doc.school.affiliationNo ? `Affiliation no. ${doc.school.affiliationNo}` : null,
    doc.school.phone,
  ]
    .filter(Boolean)
    .join("  ·  ");
  return (
    <Document title={doc.title} author={doc.school.name}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {doc.school.logoPng ? <Image src={doc.school.logoPng} style={styles.logo} /> : null}
          <View>
            <Text style={styles.school}>{doc.school.name}</Text>
            {details ? <Text style={styles.meta}>{details}</Text> : null}
          </View>
        </View>
        <View style={styles.refRow}>
          <Text>{doc.refLabel ?? ""}</Text>
          <Text>{formatNoticeDate(doc.publishedAt)}</Text>
        </View>
        <Text style={styles.heading}>{doc.title}</Text>
        <Text style={styles.body}>{doc.body}</Text>
        <Text style={styles.footer} fixed>
          Powered by ERP · PastAndPixels Group
        </Text>
      </Page>
    </Document>
  );
}
