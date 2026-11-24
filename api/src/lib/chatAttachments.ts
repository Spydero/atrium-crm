import { createHash } from "node:crypto";
import type { RequestHandler } from "express";
import multer from "multer";
import { z } from "zod";

const maxBytes = 10 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  defParamCharset: "utf8",
  limits: { fileSize: maxBytes + 1, files: 1, fields: 2, fieldSize: 20_000, parts: 4 },
}).single("attachment");

export const parseChatAttachment: RequestHandler = (req, res, next) => {
  if (!req.is("multipart/form-data")) return next();
  upload(req, res, error => {
    if (!error) return next();
    const tooLarge = error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE";
    res.status(tooLarge ? 413 : 400).json({
      error: tooLarge ? "Attachments must be 10 MB or smaller." : "Could not read the attachment. Send one file per message.",
    });
  });
};

const officeTypes = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};
const imagePngHeader = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const zipHeader = Buffer.from([80, 75, 3, 4]);

function contentTypeFor(ext: string, data: Buffer) {
  switch (ext) {
    case "jpg":
    case "jpeg":
      return data[0] === 255 && data[1] === 216 && data[2] === 255 ? "image/jpeg" : null;
    case "png":
      return data.subarray(0, 8).equals(imagePngHeader) ? "image/png" : null;
    case "webp":
      return data.toString("latin1", 0, 4) === "RIFF" && data.toString("latin1", 8, 12) === "WEBP" ? "image/webp" : null;
    case "gif":
      return ["GIF87a", "GIF89a"].includes(data.toString("latin1", 0, 6)) ? "image/gif" : null;
    case "pdf":
      return data.toString("latin1", 0, 5) === "%PDF-" ? "application/pdf" : null;
    case "docx":
    case "xlsx":
    case "pptx":
      return data.subarray(0, 4).equals(zipHeader) && data.includes("[Content_Types].xml") &&
        data.includes({ docx: "word/document.xml", xlsx: "xl/workbook.xml", pptx: "ppt/presentation.xml" }[ext])
        ? officeTypes[ext] : null;
    case "txt":
    case "csv":
      try {
        const text = new TextDecoder("utf-8", { fatal: true }).decode(data);
        return /\p{Cc}/u.test(text.replace(/[\t\n\r]/g, "")) ? null : ext === "csv" ? "text/csv" : "text/plain";
      } catch { return null; }
    default:
      return null;
  }
}

const sendSchema = z.object({ body: z.string().trim().max(4000).default(""), requestId: z.uuid() });
export type AttachmentInput = { fileName: string; contentType: string; size: number; digest: string; content: Uint8Array<ArrayBuffer> };
export type OutgoingMessage = z.infer<typeof sendSchema> & { attachment?: AttachmentInput };

export function parseChatMessage(body: unknown, file?: Express.Multer.File): OutgoingMessage | { error: string; status?: number } {
  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) return { error: "Enter a message of up to 4,000 characters." };
  if (!file) return parsed.data.body ? parsed.data : { error: "Enter a message or attach a file." };
  if (file.size > maxBytes) return { error: "Attachments must be 10 MB or smaller.", status: 413 };
  if (!file.buffer.length) return { error: "Choose a file that isn’t empty." };
  // Accept common raster photos and documents. Derive the MIME type from the extension and content.
  const base = file.originalname.split(/[\\/]/).at(-1) ?? "";
  const ext = /\.([a-z0-9]+)$/i.exec(base)?.[1].toLowerCase() ?? "";
  const contentType = contentTypeFor(ext, file.buffer);
  if (!contentType) return { error: "Choose a valid JPG, PNG, WebP, GIF, PDF, Word, Excel, PowerPoint, TXT, or CSV file." };
  const stem = base.slice(0, -(ext.length + 1)).replace(/[\p{Cc}\p{Cf}]/gu, "").trim().slice(0, 120) || "attachment";
  return {
    ...parsed.data,
    attachment: {
      fileName: `${stem}.${ext}`, contentType, size: file.size, content: Uint8Array.from(file.buffer),
      digest: createHash("sha256").update(file.buffer).digest("hex"),
    },
  };
}
