// Notification manager for HuaZoe HealthTrack
export interface InAppNotification {
  id: string;
  title: string;
  body: string;
  type: 'info' | 'success' | 'alert' | 'urgent';
  timestamp: Date;
  read: boolean;
}

type Listener = (notifications: InAppNotification[]) => void;

class NotificationService {
  private notifications: InAppNotification[] = [];
  private listeners: Set<Listener> = new Set();

  constructor() {
    // Initial welcome or system status notification
    this.notifications = [
      {
        id: 'sys-init',
        title: 'Authentication & Notification Service Active',
        body: 'Resend API integration and real-time clinical alerts are connected.',
        type: 'success',
        timestamp: new Date(),
        read: false,
      },
    ];
  }

  getPermission(): NotificationPermission {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'denied';
  }

  async requestPermission(): Promise<NotificationPermission> {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        this.notify('Notifications Enabled', 'You will receive real-time updates for lab report processing and clinical plans.', 'success');
      }
      return perm;
    }
    return 'denied';
  }

  notify(title: string, body: string, type: 'info' | 'success' | 'alert' | 'urgent' = 'info') {
    const item: InAppNotification = {
      id: Math.random().toString(36).slice(2),
      title,
      body,
      type,
      timestamp: new Date(),
      read: false,
    };

    this.notifications = [item, ...this.notifications.slice(0, 19)];
    this.broadcast();

    // Trigger browser system notification if permitted
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body,
          icon: '/favicon.ico',
        });
      } catch {
        /* Ignore background service worker errors */
      }
    }
  }

  getNotifications(): InAppNotification[] {
    return this.notifications;
  }

  markAllAsRead() {
    this.notifications = this.notifications.map((n) => ({ ...n, read: true }));
    this.broadcast();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.notifications);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private broadcast() {
    for (const l of this.listeners) {
      l(this.notifications);
    }
  }
}

export const notificationService = new NotificationService();
