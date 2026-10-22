import { describe, expect, it } from "vitest";
import { buildDigest, type DigestItem } from "./digest";

const SITE = "https://hmo.example";
const items: DigestItem[] = [
  {
    propertyId: "p1",
    propertyLabel: "12 High Street, LS6 2AB",
    serviceName: "Gas safety certificate",
    expiresOn: "2026-11-30",
    kind: "due_soon",
  },
  {
    propertyId: "p2",
    propertyLabel: "4 <Mill> Lane, LS1 1AA",
    serviceName: "EICR",
    expiresOn: "2026-10-01",
    kind: "overdue",
  },
];

describe("buildDigest", () => {
  it("leads with what's overdue", () => {
    const digest = buildDigest({
      firstName: "Priya",
      organisation: "Northside",
      items,
      siteUrl: SITE,
    });
    expect(digest.subject).toBe("1 compliance item is overdue at Northside");
    expect(digest.text).toContain("Hi Priya,");
    expect(digest.text.indexOf("EICR")).toBeLessThan(digest.text.indexOf("Gas safety"));
    expect(digest.text).toContain("EICR, 4 <Mill> Lane, LS1 1AA: expired on 01/10/2026");
    expect(digest.text).toContain(
      "Gas safety certificate, 12 High Street, LS6 2AB: due by 30/11/2026",
    );
    expect(digest.text).toContain(`${SITE}/properties/p2/compliance`);
  });

  it("says how many are coming due when nothing is overdue", () => {
    const digest = buildDigest({
      firstName: null,
      organisation: "Northside",
      items: [items[0]!, { ...items[0]!, propertyId: "p3", serviceName: "PAT" }],
      siteUrl: SITE,
    });
    expect(digest.subject).toBe("2 compliance items are coming due at Northside");
    expect(digest.text.startsWith("Hello,")).toBe(true);
  });

  it("escapes names in the HTML", () => {
    const { html } = buildDigest({
      firstName: "Priya",
      organisation: "A & B",
      items,
      siteUrl: SITE,
    });
    expect(html).toContain("4 &lt;Mill&gt; Lane");
    expect(html).toContain("A &amp; B");
    expect(html).not.toContain("<Mill>");
  });
});
