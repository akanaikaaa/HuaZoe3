import { Server } from 'socket.io';
import { config } from './config.js';
import { supabase } from './supabase.js';
import { canAccessPatient, log } from './utils.js';

let io = null;

/** Optional realtime layer. Clients authenticate with the same JWT. REST polling remains the default. */
export function initRealtime(httpServer) {
  if (!config.socketio) return;
  io = new Server(httpServer, { cors: { origin: config.corsOrigins } });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('unauthorized'));
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return next(new Error('unauthorized'));
    const { data: profile } = await supabase.from('users').select('id, role').eq('id', data.user.id).maybeSingle();
    if (!profile) return next(new Error('unauthorized'));
    socket.data.user = profile;
    next();
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    socket.join(`user:${user.id}`);
    // Doctors/admins can watch a patient: socket.emit('watch', patientId)
    socket.on('watch', async (patientId) => {
      if (await canAccessPatient(user, patientId)) socket.join(`user:${patientId}`);
    });
  });
  log.info('socketio_enabled');
}

/** events: report:update | plans:updated | log:updated | comparison:created */
export function emitToUser(userId, event, payload) {
  io?.to(`user:${userId}`).emit(event, payload);
}
