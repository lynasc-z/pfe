import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, Check, X } from 'lucide-react';
import * as api from '../../lib/api';
import type { Notification } from '../../types';

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [pulse, setPulse] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const prevUnread = useRef(0);

  const fetchNotifications = async () => {
    try {
      const data = await api.getNotifications();
      setNotifications(data.notifications);
      setUnreadCount(prev => {
        if (data.unreadCount > prevUnread.current) setPulse(true);
        prevUnread.current = data.unreadCount;
        return data.unreadCount;
      });
    } catch {}
  };

  useEffect(() => {
    fetchNotifications();
    let interval: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      interval = setInterval(() => {
        if (!document.hidden) fetchNotifications();
      }, 30000);
    };

    const handleVisibility = () => {
      if (!document.hidden) fetchNotifications();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    startPolling();

    return () => {
      if (interval) clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  useEffect(() => {
    if (pulse) {
      const t = setTimeout(() => setPulse(false), 1500);
      return () => clearTimeout(t);
    }
  }, [pulse]);

  const handleToggle = () => {
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setAnchor({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }
    setIsOpen(prev => !prev);
  };

  const handleClose = () => setIsOpen(false);

  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {}
  };

  const handleMarkRead = async (id: string) => {
    try {
      await api.markNotificationRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch {}
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return d.toLocaleDateString();
  };

  return (
    <>
      <motion.button
        ref={buttonRef}
        onClick={handleToggle}
        className="relative p-2.5 bg-white border border-gray-200 rounded-lg hover:border-[#FF6B00] transition-all"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <Bell className="w-5 h-5 text-gray-700" />
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span
              key="badge"
              initial={{ scale: 0 }}
              animate={pulse ? { scale: [1, 1.4, 1] } : { scale: 1 }}
              exit={{ scale: 0 }}
              transition={{ duration: 0.3 }}
              className="absolute -top-1 -right-1 w-5 h-5 bg-[#FF6B00] text-white text-xs rounded-full flex items-center justify-center pointer-events-none"
              style={{ fontFamily: 'var(--font-body)', fontWeight: 700 }}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      {createPortal(
        <AnimatePresence>
          {isOpen && anchor && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0"
                style={{ zIndex: 9998 }}
                onClick={handleClose}
              />
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.96 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                style={{
                  position: 'fixed',
                  top: anchor.top,
                  right: anchor.right,
                  zIndex: 9999,
                }}
                className="w-96 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden"
              >
                <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between bg-gray-50">
                  <h3 className="text-base" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>
                    Notifications
                    {unreadCount > 0 && (
                      <span className="ml-2 text-xs bg-[#FF6B00] text-white rounded-full px-1.5 py-0.5">
                        {unreadCount}
                      </span>
                    )}
                  </h3>
                  <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="max-h-[420px] overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                      <Bell className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                      <p className="text-sm">No notifications</p>
                    </div>
                  ) : (
                    notifications.map((notification) => (
                      <div
                        key={notification.id}
                        className={`px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors cursor-pointer ${
                          !notification.isRead ? 'bg-[#FF6B00]/5' : ''
                        }`}
                        onClick={() => !notification.isRead && handleMarkRead(notification.id)}
                      >
                        <div className="flex gap-3 items-start">
                          <div className="flex-shrink-0 mt-1">
                            {notification.isRead
                              ? <Check className="w-3.5 h-3.5 text-green-500" />
                              : <div className="w-2 h-2 bg-[#FF6B00] rounded-full mt-0.5" />
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-800 leading-snug">{notification.message}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{formatDate(notification.createdAt)}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {notifications.length > 0 && (
                  <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-200">
                    <button
                      onClick={handleMarkAllRead}
                      className="w-full text-xs text-[#FF6B00] hover:text-[#E05F00] transition-colors text-center"
                      style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}
                    >
                      Mark all as read
                    </button>
                  </div>
                )}
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}

