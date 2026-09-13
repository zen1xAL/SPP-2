import { Router } from 'express';
import type { TaskController } from '../controllers/task-controller.js';
import { upload } from '../middleware/upload.js';

export function createTaskRouter(controller: TaskController): Router {
  const router = Router();

  router.get('/', controller.index);
  router.post('/tasks', upload.single('attachment'), controller.create);
  router.post('/tasks/:id/status', controller.updateStatus);
  router.post('/tasks/:id/delete', controller.delete);
  router.post('/tasks/:id/attachments', upload.single('attachment'), controller.addAttachment);
  router.post('/tasks/:id/attachments/:attachmentId/delete', controller.deleteAttachment);
  router.get('/tasks/:id/attachments/:attachmentId/download', controller.downloadAttachment);

  return router;
}
