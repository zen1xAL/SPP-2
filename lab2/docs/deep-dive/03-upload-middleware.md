# Модуль загрузки файлов и безопасность файловой системы: upload.ts

Данный документ содержит построчный и физический разбор модуля [upload.ts](file:///d:/SPP/7sem/SPP/lab2/src/server/upload.ts), отвечающего за прием бинарных потоков данных (`multipart/form-data`), валидацию типов файлов, предотвращение атак Path Traversal и управление дисковым пространством.

---

## 1. Назначение и физика работы с файлами

В HTTP-протоколе передача файлов осуществляется через тело запроса со спецификацией `multipart/form-data`. Тело запроса разбивается на сегменты, разделенные специальным строковым маркером (boundary). В каждом сегменте передаются метаданные (заголовки `Content-Disposition`, `Content-Type`) и сырой бинарный поток байтов.

Модуль `upload.ts` решает пять фундаментальных задач:
1. Потоковый прием бинарных чанков из сокета операционной системы без загрузки всего файла в оперативную память Node.js (предотвращение атак переполнения памяти Out-Of-Memory).
2. Запись файла на жесткий диск в защищенную директорию с генерацией уникального псевдослучайного имени (UUIDv4) для исключения коллизий и перезаписи файлов.
3. Валидация расширения файла по строгому белому списку (Whitelist).
4. Ограничение предельного размера файла (квота 5 МБ).
5. Санитизация оригинального имени файла для безопасного сохранения в БД и последующей отдачи пользователю при скачивании.

---

## 2. Построчный разбор кода upload.ts

### Строки 1-4: Импорты библиотек
```typescript
import { promises as fs } from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
```
- `node:fs/promises`: Встроенный асинхронный модуль Node.js для работы с файловой системой на основе `Promise`. Используется для создания директорий (`mkdir`) и удаления файлов (`unlink`) без блокировки Event Loop.
- `node:path`: Системная утилита для нормализации файловых путей и безопасного извлечения расширений файлов.
- `multer`: Middleware для Express, реализующий разбор заголовков и потоков формата `multipart/form-data`.
- `uuidv4`: Криптографически стойкий генератор 128-битных идентификаторов версии 4 (RFC 4122).

---

### Строки 6-10: Конфигурация хранилища и создание каталога
```typescript
export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || './uploads');
const MAX_FILE_SIZE_MB = Number(process.env.MAX_FILE_SIZE_MB || '5');
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

await fs.mkdir(UPLOAD_DIR, { recursive: true });
```
- `UPLOAD_DIR`: Абсолютный путь к директории хранения на диске. Функция `path.resolve()` приводит относительный путь к абсолютному виду с учетом корневого каталога запуска процесса. В Docker это `/app/uploads`.
- `MAX_FILE_SIZE_BYTES`: Математический расчет лимита в байтах. `5 * 1024 * 1024 = 5 242 880` байт.
- `await fs.mkdir(UPLOAD_DIR, { recursive: true })`: Асинхронное создание целевой директории при старте модуля (Top-Level Await в ES Modules). Флаг `{ recursive: true }` гарантирует, что если каталог уже существует, системная ошибка `EEXIST` выброшена не будет, а недостающие промежуточные папки будут созданы автоматически.

---

### Строки 12-31: Белый список расширений (Whitelist)
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
- Для хранения разрешенных расширений используется структура данных `Set` вместо обычного массива `Array`. Поиск в `Set.has(ext)` выполняется за константное время $O(1)$ через внутреннюю хэш-таблицу V8, в то время как поиск в массиве `Array.includes()` требует линейного сканирования $O(N)$.
- Список расширений строго ограничен документами, изображениями, таблицами и архивами. Исполняемые файлы (`.exe`, `.bat`, `.cmd`, `.sh`, `.php`, `.js`, `.vbs`) категорически отсекаются.

---

### Строки 33-43: Конфигурация дискового хранилища Multer (DiskStorage)
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
- `destination`: Функция обратного вызова, указывающая Multer, куда сохранять поток байтов. Первый аргумент `null` означает отсутствие ошибки.
- `filename`: Генерация уникального имени сохраняемого файла на диске:
  1. `path.extname(file.originalname).toLowerCase()` извлекает расширение файла (включая точку) и переводит в нижний регистр.
  2. `safeExt`: Если расширение присутствует в белом списке, оно сохраняется, иначе подставляется нейтральное `.bin`.
  3. `uniqueName = ${uuidv4()}${safeExt}`: Итоговое имя формируется исключительно из UUID (например, `4f3b185c-1960-4966-aefb-db59bdf70221.pdf`).
  4. Зачем это нужно: На сервере **никогда** не сохраняются файлы под их исходными именами. Это полностью нивелирует уязвимости перезаписи системных файлов (`../../etc/passwd`), внедрения спецсимволов терминала и коллизий при одновременной загрузке файлов с одинаковыми именами от разных пользователей.

---

### Строки 45-56: Фильтр файлов (FileFilter)
```typescript
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
```
- Фильтр вызывается до начала сохранения данных на диск.
- Если расширение файла не проходит валидацию, вызывается `cb(new Error(...))`.
- Multer прерывает прием потока, не тратя ресурсы диска, и пробрасывает ошибку в глобальный обработчик ошибок Express (возвращая клиенту статус `400 Bad Request`).

---

### Строки 58-64: Инициализация middleware Multer
```typescript
export const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES
  },
  fileFilter
});
```
- `upload.single('attachment')` перехватывает поле формы с именем `attachment`.
- По достижении лимита `MAX_FILE_SIZE_BYTES` (5 МБ) поток немедленно разрывается, временный файл удаляется, а в Express выбрасывается ошибка `LIMIT_FILE_SIZE`.

---

### Строки 66-82: Вспомогательные функции безопасности и удаления
```typescript
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
```
1. `sanitizeFileName(name)`:
   - `path.basename(name)` отсекает любые относительные и абсолютные префиксы путей (`../../`, `C:\Windows\System32\`).
   - Регулярное выражение `/[^a-zA-Z0-9А-Яа-яЁё._\- ]/g` заменяет любые потенциально опасные спецсимволы (нулевые байты `\0`, кавычки, управляющие символы) на безопасный символ подчеркивания `_`.
2. `getUploadFilePath(storedName)`:
   - Гарантирует абсолютную изоляцию файловых операций. Применение `path.basename()` к имени гарантирует, что злоумышленник не сможет передать параметр `../sensitive.txt` в маршрут скачивания и прочитать файлы вне каталога `UPLOAD_DIR`.
3. `deletePhysicalFile(storedName)`:
   - Вызывает `fs.unlink()` (системный вызов POSIX `unlink`), освобождающий дисковый inode файла.
   - Блок `try/catch` с пустым телом подавляет ошибку `ENOENT`, если файл уже был удален ранее или отсутствовал на диске. Это предотвращает падение серверного потока при асинхронных операциях очистки.
