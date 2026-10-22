import "server-only";

import { Document, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatPence, formatUkDate } from "@/lib/format";
import type { Ledger, StatementLine } from "./ledger";

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 44,
    fontFamily: "Helvetica",
    fontSize: 9.5,
    lineHeight: 1.4,
    color: "#111111",
  },
  organisation: { fontFamily: "Helvetica-Bold", fontSize: 11, marginBottom: 2 },
  h1: { fontFamily: "Helvetica-Bold", fontSize: 18, marginBottom: 12 },
  details: { flexDirection: "row", marginBottom: 2 },
  label: { width: 90, color: "#555555" },
  value: { flex: 1 },
  summary: {
    flexDirection: "row",
    marginTop: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#dddddd",
    borderRadius: 4,
  },
  summaryCell: { flex: 1, padding: 8 },
  summaryLabel: { color: "#555555", fontSize: 8.5 },
  summaryValue: { fontFamily: "Helvetica-Bold", fontSize: 12 },
  headRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: "#999999",
    paddingBottom: 4,
    fontFamily: "Helvetica-Bold",
  },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: "#dddddd", paddingVertical: 4 },
  date: { width: 62 },
  detail: { flex: 1, paddingRight: 8 },
  money: { width: 66, textAlign: "right" },
  note: { color: "#555555", fontSize: 8.5 },
  reversed: { color: "#777777", textDecoration: "line-through" },
  footer: {
    position: "absolute",
    bottom: 26,
    left: 44,
    right: 44,
    fontSize: 7.5,
    color: "#666666",
  },
});

export type StatementPdfDetails = {
  organisation: string;
  tenantNames: string;
  room: string;
  address: string;
  rent: string;
};

function notes(line: StatementLine) {
  const parts: string[] = [];
  if (line.reversed) parts.push(`Reversed on ${line.reversed.dateLabel}: ${line.reversed.reason}`);
  if (line.reason) parts.push(`Reason: ${line.reason}`);
  if (line.charge && line.charge.status !== "paid" && !line.reversed) {
    parts.push(
      `${line.charge.status === "overdue" ? "Overdue" : line.charge.status === "part_paid" ? "Part paid" : "Due"}: ${formatPence(line.charge.leftPence)} left`,
    );
  }
  if (line.kind === "payment" && !line.reversed && line.paidTowards.length > 0) {
    parts.push(
      `Paid towards ${line.paidTowards.map((t) => `${t.description} (${formatPence(t.pence)})`).join(", ")}`,
    );
  }
  if (line.kind === "payment" && !line.reversed && line.creditPence > 0) {
    parts.push(`${formatPence(line.creditPence)} kept as credit`);
  }
  return parts;
}

/**
 * A tenant's rent statement as a PDF, oldest entry first, the same as the
 * statement on screen: for the tenant's own records, a council or Universal
 * Credit. Made fresh each time, never stored.
 */
export async function renderStatementPdf(
  details: StatementPdfDetails,
  ledger: Ledger,
  today: string,
): Promise<Buffer> {
  const title = `Rent statement: ${details.tenantNames}`;
  return renderToBuffer(
    <Document title={title} author={details.organisation} language="en-GB">
      <Page size="A4" style={styles.page}>
        <Text style={styles.organisation}>{details.organisation}</Text>
        <Text style={styles.h1}>Rent statement</Text>
        {[
          ["Tenant", details.tenantNames],
          ["Room", details.room],
          ["Address", details.address],
          ["Rent", details.rent],
          ["Statement date", formatUkDate(today)],
        ].map(([label, value]) => (
          <View key={label} style={styles.details}>
            <Text style={styles.label}>{label}</Text>
            <Text style={styles.value}>{value}</Text>
          </View>
        ))}

        <View style={styles.summary}>
          <View style={styles.summaryCell}>
            <Text style={styles.summaryLabel}>Balance</Text>
            <Text style={styles.summaryValue}>{ledger.balanceLabel}</Text>
          </View>
          <View style={styles.summaryCell}>
            <Text style={styles.summaryLabel}>Overdue</Text>
            <Text style={styles.summaryValue}>{formatPence(ledger.arrearsPence)}</Text>
          </View>
          <View style={styles.summaryCell}>
            <Text style={styles.summaryLabel}>In credit</Text>
            <Text style={styles.summaryValue}>{formatPence(ledger.creditPence)}</Text>
          </View>
        </View>

        <View style={styles.headRow} fixed>
          <Text style={styles.date}>Date</Text>
          <Text style={styles.detail}>Details</Text>
          <Text style={styles.money}>Charged</Text>
          <Text style={styles.money}>Paid</Text>
          <Text style={styles.money}>Balance</Text>
        </View>
        {ledger.lines.length === 0 ? (
          <Text style={{ paddingVertical: 6 }}>Nothing on the statement yet.</Text>
        ) : null}
        {ledger.lines.map((line) => (
          <View key={line.id} style={styles.row} wrap={false}>
            <Text style={styles.date}>{line.dateLabel}</Text>
            <View style={styles.detail}>
              <Text style={line.reversed ? styles.reversed : {}}>
                {line.kind === "payment"
                  ? `Payment received · ${line.description}`
                  : line.description}
              </Text>
              {notes(line).map((note) => (
                <Text key={note} style={styles.note}>
                  {note}
                </Text>
              ))}
            </View>
            <Text style={[styles.money, line.reversed ? styles.reversed : {}]}>
              {line.adds ? formatPence(line.amountPence) : ""}
            </Text>
            <Text style={[styles.money, line.reversed ? styles.reversed : {}]}>
              {line.adds ? "" : formatPence(line.amountPence)}
            </Text>
            <Text style={styles.money}>
              {line.balancePence < 0
                ? `${formatPence(-line.balancePence)} cr`
                : formatPence(line.balancePence)}
            </Text>
          </View>
        ))}

        <Text style={styles.footer} fixed>
          {details.organisation} · Rent statement for {details.tenantNames} · {formatUkDate(today)}.
          Nothing is ever deleted from this statement: corrections appear as reversals.
        </Text>
      </Page>
    </Document>,
  );
}

/** A file name like "rent-statement-2026-10-22.pdf". */
export function statementFileName(today: string) {
  return `rent-statement-${today}.pdf`;
}
