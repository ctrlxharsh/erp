import type { ReportCard } from "@erp/contracts";
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { SchoolHeader } from "@/lib/notices/school-header";

// Brand colours (CONSTITUTION §7.1). PDFs cannot read CSS variables, so the values live here.
const navy = "#01306F";
const slate = "#475569";
const line = "#E2E8F0";

const s = StyleSheet.create({
  page: { padding: 40, fontFamily: "Helvetica", fontSize: 11, color: "#0F172A" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: navy,
  },
  logo: { width: 52, height: 52, objectFit: "contain" },
  school: { fontSize: 17, fontFamily: "Helvetica-Bold", color: navy },
  meta: { fontSize: 9, color: slate, marginTop: 2 },
  title: {
    fontSize: 15,
    fontFamily: "Helvetica-Bold",
    color: navy,
    marginTop: 16,
    marginBottom: 10,
    textAlign: "center",
  },
  info: { flexDirection: "row", flexWrap: "wrap", marginBottom: 12 },
  infoItem: { width: "50%", marginBottom: 4 },
  label: { color: slate, fontSize: 9 },
  table: { borderWidth: 1, borderColor: line },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: line },
  head: { backgroundColor: "#F1F5F9", fontFamily: "Helvetica-Bold" },
  cell: { padding: 6 },
  summary: { marginTop: 14, padding: 10, borderWidth: 1, borderColor: navy },
  note: { marginTop: 10, fontSize: 9, color: slate },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    fontSize: 8,
    color: slate,
    textAlign: "center",
  },
});

function Header({ school }: { school: SchoolHeader }) {
  const details = [
    school.address,
    school.affiliationNo ? `Affiliation no. ${school.affiliationNo}` : null,
    school.phone,
  ]
    .filter(Boolean)
    .join("  ·  ");
  return (
    <View style={s.header}>
      {school.logoPng ? <Image src={school.logoPng} style={s.logo} /> : null}
      <View>
        <Text style={s.school}>{school.name}</Text>
        {details ? <Text style={s.meta}>{details}</Text> : null}
      </View>
    </View>
  );
}

const Footer = () => (
  <Text style={s.footer} fixed>
    Pixel Schoolware · Made by PastAndPixels Group
  </Text>
);

/** One report card per student per exam: subject marks, percentage, grade and overall result. */
export function ReportCardPdf({ school, card }: { school: SchoolHeader; card: ReportCard }) {
  const cols = [3, 1.2, 1.2, 1.2, 1];
  const cell = (index: number) => ({ ...s.cell, flex: cols[index] });
  return (
    <Document title={`Report card – ${card.student.fullName}`} author={school.name}>
      <Page size="A4" style={s.page}>
        <Header school={school} />
        <Text style={s.title}>Report Card · {card.exam.name}</Text>
        <View style={s.info}>
          <View style={s.infoItem}>
            <Text style={s.label}>Student</Text>
            <Text>{card.student.fullName}</Text>
          </View>
          <View style={s.infoItem}>
            <Text style={s.label}>Admission no.</Text>
            <Text>{card.student.admissionNo}</Text>
          </View>
          <View style={s.infoItem}>
            <Text style={s.label}>Class and section</Text>
            <Text>
              {[card.student.className, card.student.sectionName].filter(Boolean).join(" ")}
            </Text>
          </View>
        </View>
        <View style={s.table}>
          <View style={[s.row, s.head]}>
            {["Subject", "Marks", "Out of", "Percent", "Grade"].map((title, i) => (
              <Text key={title} style={cell(i)}>
                {title}
              </Text>
            ))}
          </View>
          {card.rows.map((row) => (
            <View key={row.subject} style={s.row}>
              <Text style={cell(0)}>{row.subject}</Text>
              <Text style={cell(1)}>
                {!row.published ? "Pending" : row.absent ? "Absent" : String(row.marks ?? "")}
              </Text>
              <Text style={cell(2)}>{row.max}</Text>
              <Text style={cell(3)}>{row.percent === null ? "" : `${row.percent}%`}</Text>
              <Text style={cell(4)}>{row.grade ?? ""}</Text>
            </View>
          ))}
        </View>
        <View style={s.summary}>
          <Text>
            Total: {card.summary.totalMarks} out of {card.summary.totalMax}
            {card.summary.percent === null ? "" : `  ·  ${card.summary.percent}%`}
            {card.summary.grade
              ? `  ·  Grade ${card.summary.grade} (${card.summary.gradePoint} points)`
              : ""}
          </Text>
        </View>
        {!card.complete ? (
          <Text style={s.note}>
            Some subjects are still pending. This report will be complete once all results are
            published.
          </Text>
        ) : null}
        <Footer />
      </Page>
    </Document>
  );
}

export interface AdmitCardData {
  exam: { name: string };
  student: {
    fullName: string;
    admissionNo: string;
    className: string | null;
    sectionName: string | null;
  };
  schedule: { date: string; startTime: string | null; subject: string; maxMarks: number }[];
}

const dateText = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`));

/** The admit card lists the student and the exam timetable for their class. */
export function AdmitCardPdf({ school, card }: { school: SchoolHeader; card: AdmitCardData }) {
  return (
    <Document title={`Admit card – ${card.student.fullName}`} author={school.name}>
      <Page size="A4" style={s.page}>
        <Header school={school} />
        <Text style={s.title}>Admit Card · {card.exam.name}</Text>
        <View style={s.info}>
          <View style={s.infoItem}>
            <Text style={s.label}>Student</Text>
            <Text>{card.student.fullName}</Text>
          </View>
          <View style={s.infoItem}>
            <Text style={s.label}>Admission no.</Text>
            <Text>{card.student.admissionNo}</Text>
          </View>
          <View style={s.infoItem}>
            <Text style={s.label}>Class and section</Text>
            <Text>
              {[card.student.className, card.student.sectionName].filter(Boolean).join(" ")}
            </Text>
          </View>
        </View>
        <View style={s.table}>
          <View style={[s.row, s.head]}>
            <Text style={{ ...s.cell, flex: 2 }}>Date</Text>
            <Text style={{ ...s.cell, flex: 1 }}>Time</Text>
            <Text style={{ ...s.cell, flex: 2 }}>Subject</Text>
            <Text style={{ ...s.cell, flex: 1 }}>Max marks</Text>
          </View>
          {card.schedule.map((item) => (
            <View key={`${item.date}-${item.subject}`} style={s.row}>
              <Text style={{ ...s.cell, flex: 2 }}>{dateText(item.date)}</Text>
              <Text style={{ ...s.cell, flex: 1 }}>{item.startTime ?? "—"}</Text>
              <Text style={{ ...s.cell, flex: 2 }}>{item.subject}</Text>
              <Text style={{ ...s.cell, flex: 1 }}>{item.maxMarks}</Text>
            </View>
          ))}
        </View>
        <Text style={s.note}>Please bring this admit card to every paper.</Text>
        <Footer />
      </Page>
    </Document>
  );
}
