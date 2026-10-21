import { describe, expect, it } from "vitest";
import {
  documentFormSchema,
  documentPath,
  fileContentType,
  fileProblem,
  MAX_FILE_BYTES,
  safeFileName,
} from "./document";

const file = (name: string, type: string, size = 1000) => ({ name, type, size });

describe("files", () => {
  it("accepts PDFs, photos and Word documents", () => {
    expect(fileProblem(file("gas.pdf", "application/pdf"))).toBeNull();
    expect(fileProblem(file("photo.HEIC", ""))).toBeNull();
    expect(fileContentType(file("photo.HEIC", ""))).toBe("image/heic");
    expect(fileContentType(file("licence.docx", "application/octet-stream"))).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
  });

  it("explains why a file can't be used", () => {
    expect(fileProblem(file("page.html", "text/html"))).toBe(
      "Upload a PDF, a photo (JPG, PNG or HEIC) or a Word document.",
    );
    expect(fileProblem(file("fake.pdf", "text/html"))).not.toBeNull();
    expect(fileProblem(file("big.pdf", "application/pdf", MAX_FILE_BYTES + 1))).toBe(
      "That file is over 20 MB. Choose a smaller one.",
    );
    expect(fileProblem(file("empty.pdf", "application/pdf", 0))).toBe(
      "That file is empty. Choose another one.",
    );
  });

  it("makes file names safe for storage", () => {
    expect(safeFileName("Gas Safety (2026) – Flat 2.PDF")).toBe("Gas-Safety-2026-Flat-2.pdf");
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName("Café.jpg")).toBe("Cafe.jpg");
    expect(safeFileName("???.pdf")).toBe("document.pdf");
  });

  it("puts each file in its own place inside the property's folder", () => {
    expect(documentPath("org", "prop", "EICR report.pdf", "abc")).toBe(
      "org/properties/prop/abc-EICR-report.pdf",
    );
  });
});

describe("documentFormSchema", () => {
  it("needs a type and takes an optional expiry date", () => {
    expect(documentFormSchema.parse({ documentType: "eicr", expiryDate: "2031-05-01" })).toEqual({
      documentType: "eicr",
      expiryDate: "2031-05-01",
    });
    expect(documentFormSchema.parse({ documentType: "epc", expiryDate: "" }).expiryDate).toBeNull();
  });

  it("rejects missing types and impossible dates", () => {
    const result = documentFormSchema.safeParse({ documentType: "", expiryDate: "2026-02-30" });
    expect(result.success).toBe(false);
    expect(result.error!.issues.map((issue) => issue.message)).toEqual([
      "Choose what kind of document this is",
      "Enter a real date, like 31/12/2026",
    ]);
  });
});
