# Разбор файла: src/middleware/upload.ts

**Путь к файлу**: [src/middleware/upload.ts](file:///d:/SPP/7sem/SPP/src/middleware/upload.ts)  
**Роль в архитектуре**: Промежуточное ПО обработки потоков multipart/form-data (Upload Middleware), интеграция библиотеки Multer, валидация расширений и комплексная защита от атак Path Traversal.

---

## 1. Концептуальное и архитектурное назначение

Файл [src/middleware/upload.ts](file:///d:/SPP/7sem/SPP/src/middleware/upload.ts) отвечает за прием бинарных данных от HTML-форм. В классическом веб-приложении отправка файлов выполняется в формате `multipart/form-data`. Обычные парсеры `express.urlencoded` или `express.json` не способны обработать такой поток. Модуль решает ключевые инженерные задачи:
1. **Потоковый прием файлов на диск**: с помощью библиотеки Multer файл сохраняется во временный каталог частями (чанки потока данных), не перегружая оперативную память сервера (RAM).
2. **Белый список расширений (Extension Whitelisting)**: предотвращение загрузки опасных исполняемых файлов (`.exe`, `.sh`, `.bat`, `.php`, `.js`) через проверку по строгому множеству `Set`.
3. **Рандомизация имен на диске**: сохранение файла под сгенерированным UUID v4 исключает коллизии имен и атаки перезаписи существующих файлов.
4. **Санитизация оригинального имени**: очистка имени файла от потенциально вредоносных спецсимволов и разделителей путей (`../`) перед сохранением в базу данных.

---

## 2. Ключевые концепции Node.js и особенности безопасности

### 2.1. Top-Level Await в стандарте ECMAScript Modules
В строке 12 используется директива:
```typescript
await fs.mkdir(UPLOAD_DIR, { recursive: true });
```
В старых версиях Node.js и в CommonJS вызов `await` на верхнем уровне файла вызывал синтаксическую ошибку и требовал оборачивания в `(async () => { ... })()`. В современном Node.js 20+ при работе с ES Modules (ESM) доступен **Top-Level Await**. Движок V8 приостанавливает выполнение импорта данного модуля до тех пор, пока Promise создания каталога не разрешится, гарантируя, что папка `uploads/` будет существовать до обработки первого HTTP-запроса.

### 2.2. Защита от атак Path Traversal (Обход каталога)
Злоумышленник может отправить в заголовке `Content-Disposition` поддельное имя файла вида `../../../../Windows/System32/evil.dll`.
Защита реализована на двух уровнях:
1. Физический файл сохраняется исключительно под случайным UUID: `${uuidv4()}${safeExt}`.
2. В функциях `fileToAttachment` и `getUploadPath` применяется функция `path.basename()`, отсекающая любые предшествующие пути и разделители каталогов (`/` и `\`), а также регулярное выражение `replace(/[^a-zA-Z0-9А-Яа-яЁё._\- ]/g, '_')`.

### 2.3. Структура данных `Set` для валидации O(1)
Вместо поиска по массиву `ALLOWED_EXTENSIONS.includes(...)`, имеющего линейную сложность $O(N)$, используется коллекция `Set` с операцией `.has()`, работающей за константное время $O(1)$ благодаря хэш-таблице внутри движка V8.

---

## 3. Построчный разбор кода

### Строки 1–6: Импорты
```typescript
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Request } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import type { Attachment } from '../domain/models/task.js';
```
- Импорт стандартных модулей `node:fs` и `node:path`, библиотеки `multer`, генератора `uuidv4` и доменного типа `Attachment`.

### Строки 8–12: Конфигурация каталога и Top-Level Await
```typescript
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || './uploads');
const MAX_FILE_SIZE_MB = Number(process.env.MAX_FILE_SIZE_MB || '5');
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

await fs.mkdir(UPLOAD_DIR, { recursive: true });
```
- **Строки 8–10**: Вычисление абсолютного пути к папке загрузок и перевод максимального размера файла из мегабайт в байты ($5 \times 1024 \times 1024 = 5\,242\,880$ байт).
- **Строка 12**: Асинхронное создание директории на диске при загрузке модуля через Top-Level Await.

### Строки 14–33: Белый список поддерживаемых расширений
```typescript
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
```
- Задает замкнутый перечень безопасных форматов: офисные документы, текстовые файлы, изображения, архивы и табличные/структурированные данные.

### Строки 35–45: Конфигурация дискового хранилища `multer.diskStorage`
```typescript
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
```
- **Строки 36–38**: `destination` указывает Multer сохранять поток байтов в `UPLOAD_DIR`.
- **Строки 39–44**: `filename` извлекает расширение исходного файла в нижнем регистре. Если расширение валидно, оно сохраняется, иначе подставляется безопасное расширение `.bin`. Имя генерируется как комбинация UUID v4 и расширения.

### Строки 47–58: Функция фильтрации файлов `fileFilter`
```typescript
const fileFilter = (
  _req: Request,
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
```
- Вызывается до сохранения файла на диск. Если расширение не входит в `ALLOWED_EXTENSIONS`, вызов `cb(new Error(...))` прерывает загрузку и передает ошибку в глобальный обработчик Express.

### Строки 60–66: Экземпляр Multer
```typescript
export const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES
  },
  fileFilter
});
```
- Создает middleware `upload` со связкой настроенного хранилища, ограничения размера файла и фильтра форматов.

### Строки 68–79: Преобразование файла Multer в доменное вложение
```typescript
export function fileToAttachment(file: Express.Multer.File): Attachment {
  const sanitizedOriginalName = path.basename(file.originalname).replace(/[^a-zA-Z0-9А-Яа-яЁё._\- ]/g, '_');

  return {
    id: uuidv4(),
    originalName: sanitizedOriginalName || 'attachment',
    storedName: file.filename,
    mimeType: file.mimetype || 'application/octet-stream',
    size: file.size,
    uploadedAt: new Date().toISOString()
  };
}
```
- Преобразует системный объект `Express.Multer.File` в строгий доменный интерфейс `Attachment`.
- `sanitizedOriginalName`: убирает любые потенциально опасные символы, оставляя только буквы, цифры, дефисы, точки, пробелы и подчеркивания.

### Строки 81–84: Вспомогательная функция `getUploadPath`
```typescript
export function getUploadPath(storedName: string): string {
  const safeName = path.basename(storedName);
  return path.resolve(UPLOAD_DIR, safeName);
}
```
- Гарантирует безопасное построение абсолютного пути к файлу для операций скачивания и проверки наличия на сервере.
