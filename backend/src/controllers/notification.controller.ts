import { Request, Response } from 'express';
import { prisma } from '../config/db.js';

export async function getNotifications(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;

  const notifications = await prisma.notification.findMany({
    where: { userId },
    include: {
      request: {
        select: { id: true, status: true, startDate: true, endDate: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  const unreadCount = await prisma.notification.count({
    where: { userId, isRead: false },
  });

  res.json({ notifications, unreadCount });
}

export async function markAsRead(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const userId = req.user!.userId;

  const notification = await prisma.notification.findUnique({ where: { id } });
  if (!notification || notification.userId !== userId) {
    res.status(404).json({ error: 'Notification not found' });
    return;
  }

  await prisma.notification.update({
    where: { id },
    data: { isRead: true },
  });

  res.json({ success: true });
}

export async function markAllAsRead(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;

  await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });

  res.json({ success: true });
}
