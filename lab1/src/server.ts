import 'dotenv/config';
import { createApp } from './app.js';

const PORT = Number(process.env.PORT || '3000');
const app = createApp();

const server = app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 Сервер задач (SSR) успешно запущен на порту ${PORT}`);
  console.log(`🌐 Доступен по адресу: http://localhost:${PORT}`);
  console.log(`⚙️  Режим: ${process.env.NODE_ENV || 'development'}`);
  console.log(`====================================================`);
});

process.on('SIGINT', () => {
  console.log('\nОстановка сервера...');
  server.close(() => {
    console.log('Сервер успешно остановлен.');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\nПолучен сигнал завершения процесса...');
  server.close(() => {
    process.exit(0);
  });
});
