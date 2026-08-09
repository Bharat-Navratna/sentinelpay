import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { FileValidationError } from "../application/file-evidence-validator";
import {
  MAX_EVIDENCE_FILE_BYTES,
  MAX_PDF_PAGES,
} from "../domain/evidence";
import { ServerFileEvidenceValidator } from "./validate-file-evidence";

const validator = new ServerFileEvidenceValidator();
const png = Uint8Array.from(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nKsAAAAASUVORK5CYII=",
  "base64",
));
const jpeg = Uint8Array.from(Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EB//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EB//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EB//2Q==",
  "base64",
));
const webp = Uint8Array.from(Buffer.from(
  "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJaQAA3AA/v89WAAAAA==",
  "base64",
));

async function expectCode(
  promise: Promise<unknown>,
  code: FileValidationError["code"],
): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code } satisfies Partial<FileValidationError>);
}

function syntheticPdf(pageCount: number): Uint8Array {
  const objects: string[] = [];
  const pageObjectNumbers = Array.from({ length: pageCount }, (_, index) => index + 3);
  const contentObjectNumber = pageCount + 3;
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(`<< /Type /Pages /Kids [${pageObjectNumbers.map((number) => `${number} 0 R`).join(" ")}] /Count ${pageCount} >>`);
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 10 10] /Contents ${contentObjectNumber} 0 R >>`);
  }
  objects.push("<< /Length 0 >>\nstream\n\nendstream");

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

describe("ServerFileEvidenceValidator", () => {
  it("rejects empty evidence before type inspection", async () => {
    await expectCode(
      validator.validate({ bytes: new Uint8Array(), declaredMimeType: "image/png" }),
      "FILE_EMPTY",
    );
  });

  it("accepts a signature-recognisable file exactly at the byte limit", async () => {
    const bytes = new Uint8Array(MAX_EVIDENCE_FILE_BYTES);
    bytes.set(png);
    const result = await validator.validate({ bytes, declaredMimeType: "image/png" });
    expect(result.sizeBytes).toBe(MAX_EVIDENCE_FILE_BYTES);
  });

  it("rejects a file above the byte limit", async () => {
    const bytes = new Uint8Array(MAX_EVIDENCE_FILE_BYTES + 1);
    bytes.set(png);
    await expectCode(validator.validate({ bytes, declaredMimeType: "image/png" }), "FILE_TOO_LARGE");
  });

  it.each([
    ["PNG", png, "image/png"],
    ["JPEG", jpeg, "image/jpeg"],
    ["WebP", webp, "image/webp"],
  ] as const)("detects %s from bytes", async (_label, bytes, declaredMimeType) => {
    const result = await validator.validate({ bytes, declaredMimeType });
    expect(result).toMatchObject({ detectedMimeType: declaredMimeType, sizeBytes: bytes.byteLength, pdfPageCount: null });
  });

  it("detects and parses a valid PDF", async () => {
    const bytes = syntheticPdf(1);
    await expect(validator.validate({ bytes, declaredMimeType: "application/pdf" }))
      .resolves.toMatchObject({ detectedMimeType: "application/pdf", pdfPageCount: 1 });
  });

  it("rejects unsupported binary content", async () => {
    await expectCode(
      validator.validate({ bytes: new TextEncoder().encode("<html>unsafe</html>"), declaredMimeType: "text/html" }),
      "FILE_TYPE_UNSUPPORTED",
    );
  });

  it("maps detector rejection without exposing dependency details", async () => {
    const rejectingValidator = new ServerFileEvidenceValidator({
      detectFileType: async () => {
        throw new Error("distinctive tokenizer failure");
      },
    });
    let caught: unknown;
    try {
      await rejectingValidator.validate({ bytes: png, declaredMimeType: "image/png" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({
      code: "FILE_TYPE_UNSUPPORTED",
      message: "The evidence file type is not supported.",
    });
    expect((caught as Error).message).not.toContain("tokenizer");
  });

  it("does not let declared MIME override detected bytes", async () => {
    await expectCode(validator.validate({ bytes: png, declaredMimeType: "image/jpeg" }), "FILE_TYPE_MISMATCH");
  });

  it("does not use the display filename as type proof", async () => {
    await expectCode(
      validator.validate({ bytes: png, declaredMimeType: "application/pdf", displayFilename: "synthetic.pdf" }),
      "FILE_TYPE_MISMATCH",
    );
  });

  it("calculates lowercase SHA-256 over the exact bytes", async () => {
    const result = await validator.validate({ bytes: png, declaredMimeType: "image/png" });
    expect(result.sha256).toBe(createHash("sha256").update(png).digest("hex"));
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("accepts a PDF at the exact page limit", async () => {
    const result = await validator.validate({ bytes: syntheticPdf(MAX_PDF_PAGES), declaredMimeType: "application/pdf" });
    expect(result.pdfPageCount).toBe(MAX_PDF_PAGES);
  });

  it("rejects a PDF above the page limit", async () => {
    await expectCode(
      validator.validate({ bytes: syntheticPdf(MAX_PDF_PAGES + 1), declaredMimeType: "application/pdf" }),
      "PDF_PAGE_LIMIT_EXCEEDED",
    );
  });

  it("maps malformed PDF parser failures without exposing raw details", async () => {
    const malformed = new TextEncoder().encode("%PDF-1.7\nthis is not a document");
    let caught: unknown;
    try {
      await validator.validate({ bytes: malformed, declaredMimeType: "application/pdf" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(FileValidationError);
    expect(caught).toMatchObject({ code: "PDF_INVALID", message: "The PDF evidence could not be validated." });
    expect((caught as Error).message).not.toContain("document");
  });

  it("maps PDF cleanup rejection without exposing dependency details", async () => {
    const cleanupRejectingValidator = new ServerFileEvidenceValidator({
      loadPdf: () => ({
        promise: Promise.resolve({ numPages: 1 }),
        destroy: async () => {
          throw new Error("distinctive PDF cleanup failure");
        },
      }),
    });
    let caught: unknown;
    try {
      await cleanupRejectingValidator.validate({
        bytes: syntheticPdf(1),
        declaredMimeType: "application/pdf",
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({
      code: "PDF_INVALID",
      message: "The PDF evidence could not be validated.",
    });
    expect((caught as Error).message).not.toContain("cleanup");
  });
});
