import "server-only";

import { Document, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import { type Block, mergeTemplate, type MergeValues, toBlocks } from "./merge";

const styles = StyleSheet.create({
  page: {
    paddingTop: 56,
    paddingBottom: 56,
    paddingHorizontal: 56,
    fontFamily: "Helvetica",
    fontSize: 10.5,
    lineHeight: 1.45,
    color: "#111111",
  },
  draft: {
    position: "absolute",
    top: 20,
    left: 56,
    right: 56,
    textAlign: "center",
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: "#9a3412",
    letterSpacing: 1,
  },
  h1: { fontFamily: "Helvetica-Bold", fontSize: 17, marginBottom: 10 },
  h2: { fontFamily: "Helvetica-Bold", fontSize: 12.5, marginTop: 10, marginBottom: 4 },
  paragraph: { marginBottom: 7 },
  listItem: { flexDirection: "row", marginBottom: 3 },
  bullet: { width: 12 },
  listText: { flex: 1 },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 56,
    right: 56,
    fontSize: 8,
    color: "#666666",
  },
});

function BlockView({ block }: { block: Block }) {
  if (block.type === "heading") {
    return <Text style={block.level === 1 ? styles.h1 : styles.h2}>{block.text}</Text>;
  }
  if (block.type === "list") {
    return (
      <View style={styles.paragraph}>
        {block.items.map((item, index) => (
          <View key={index} style={styles.listItem}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.listText}>{item}</Text>
          </View>
        ))}
      </View>
    );
  }
  return <Text style={styles.paragraph}>{block.text}</Text>;
}

/**
 * An agreement as a PDF: the template merged with the tenancy's values. A
 * draft template stamps every page. Signature fields are added by the
 * e-sign provider on its own signature page.
 */
export async function renderAgreementPdf({
  title,
  body,
  values,
  isDraft,
}: {
  title: string;
  body: string;
  values: MergeValues;
  isDraft: boolean;
}): Promise<Buffer> {
  const blocks = toBlocks(mergeTemplate(body, values));
  return renderToBuffer(
    <Document title={title} author={values.organisation_name ?? undefined} language="en-GB">
      <Page size="A4" style={styles.page}>
        {isDraft ? (
          <Text style={styles.draft} fixed>
            DRAFT: NOT SOLICITOR APPROVED
          </Text>
        ) : null}
        {blocks.map((block, index) => (
          <BlockView key={index} block={block} />
        ))}
        <Text style={styles.footer} fixed>
          {title}
        </Text>
      </Page>
    </Document>,
  );
}
