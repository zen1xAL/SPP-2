import { promises as fs } from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';

export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || './uploads');
const MAX_FILE_SIZE_MB = Number(process.env.MAX_FILE_SIZE_MB || '5');
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

await fs.mkdir(UPLOAD_DIR, { recursive: true });

const ALLOWED_EXTENSIONS = new Set([
  '.pdf',
  '.doc',
  '.docx',
  '.txt',
  '.md',
  '.rtf',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.zip',
  '.tar',
  '.gz',
  '.csv',
  '.xlsx',
  '.json'
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const originalExt = path.extname(file.originalname).toLowerCase();
    const safeExt = ALLOWED_EXTENSIONS.has(originalExt) ? originalExt : '.bin';
    const uniqueName = `${uuidv4()}${safeExt}`;
    cb(null, uniqueName);
  }
});

const fileFilter = (
  _req: unknown,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_EXTENSIONS.has(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Недопустимый формат файла: ${ext}. Разрешены: PDF, DOC, TXT, изображения, архивы, CSV/JSON.`));
  }
};

export const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES
  },
  fileFilter
});

export function sanitizeFileName(name: string): string {
  return path.basename(name).replace(/[^a-zA-Z0-9А-Яа-яЁё._\- ]/g, '_');
}

export function getUploadFilePath(storedName: string): string {
  const safeName = path.basename(storedName);
  return path.resolve(UPLOAD_DIR, safeName);
}

export async function deletePhysicalFile(storedName: string): Promise<void> {
  try {
    const filePath = getUploadFilePath(storedName);
    await fs.unlink(filePath);
  } catch {
    return;
  }
}
