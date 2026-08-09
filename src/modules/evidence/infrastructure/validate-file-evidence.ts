import { createHash } from "node:crypto";

import { fileTypeFromBuffer } from "file-type";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

import {
  type AcceptedFileMimeType,
  acceptedFileMimeTypes,
  type FileEvidenceValidationInput,
  type FileEvidenceValidator,
  FileValidationError,
  type ValidatedFileEvidence,
} from "../application/file-evidence-validator";
import {
  MAX_EVIDENCE_FILE_BYTES,
  MAX_PDF_PAGES,
} from "../domain/evidence";

function isAcceptedMimeType(value: string): value is AcceptedFileMimeType {
  return acceptedFileMimeTypes.some((mimeType) => mimeType === value);
}

type DetectedFileType = { mime: string } | undefined;
type FileTypeDetector = (bytes: Uint8Array) => Promise<DetectedFileType>;
type PdfLoadingTask = {
  promise: Promise<{ numPages: number }>;
  destroy(): Promise<void>;
};
type PdfLoader = (bytes: Uint8Array) => PdfLoadingTask;

type ValidatorDependencies = {
  detectFileType?: FileTypeDetector;
  loadPdf?: PdfLoader;
};

const defaultPdfLoader: PdfLoader = (bytes) => getDocument({
  data: bytes.slice(),
});

async function readPdfPageCount(
  bytes: Uint8Array,
  loadPdf: PdfLoader,
): Promise<number> {
  const loadingTask = loadPdf(bytes);
  let pageCount: number;

  try {
    const document = await loadingTask.promise;
    if (!Number.isInteger(document.numPages) || document.numPages < 1) {
      throw new FileValidationError("PDF_INVALID");
    }
    pageCount = document.numPages;
  } catch (error) {
    try {
      await loadingTask.destroy();
    } catch {
      // Preserve the established safe validation failure.
    }
    if (error instanceof FileValidationError) {
      throw error;
    }
    throw new FileValidationError("PDF_INVALID");
  }

  try {
    await loadingTask.destroy();
  } catch {
    throw new FileValidationError("PDF_INVALID");
  }

  return pageCount;
}

export class ServerFileEvidenceValidator implements FileEvidenceValidator {
  private readonly detectFileType: FileTypeDetector;
  private readonly loadPdf: PdfLoader;

  constructor({
    detectFileType = fileTypeFromBuffer,
    loadPdf = defaultPdfLoader,
  }: ValidatorDependencies = {}) {
    this.detectFileType = detectFileType;
    this.loadPdf = loadPdf;
  }

  async validate(
    input: FileEvidenceValidationInput,
  ): Promise<ValidatedFileEvidence> {
    const sizeBytes = input.bytes.byteLength;
    if (sizeBytes === 0) {
      throw new FileValidationError("FILE_EMPTY");
    }
    if (sizeBytes > MAX_EVIDENCE_FILE_BYTES) {
      throw new FileValidationError("FILE_TOO_LARGE");
    }

    let detected: DetectedFileType;
    try {
      detected = await this.detectFileType(input.bytes);
    } catch {
      throw new FileValidationError("FILE_TYPE_UNSUPPORTED");
    }
    if (!detected || !isAcceptedMimeType(detected.mime)) {
      throw new FileValidationError("FILE_TYPE_UNSUPPORTED");
    }
    if (input.declaredMimeType !== detected.mime) {
      throw new FileValidationError("FILE_TYPE_MISMATCH");
    }

    const sha256 = createHash("sha256").update(input.bytes).digest("hex");
    const pdfPageCount = detected.mime === "application/pdf"
      ? await readPdfPageCount(input.bytes, this.loadPdf)
      : null;

    if (pdfPageCount !== null && pdfPageCount > MAX_PDF_PAGES) {
      throw new FileValidationError("PDF_PAGE_LIMIT_EXCEEDED");
    }

    return { detectedMimeType: detected.mime, sizeBytes, sha256, pdfPageCount };
  }
}
