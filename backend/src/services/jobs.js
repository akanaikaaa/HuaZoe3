import { supabase } from '../supabase.js';
import { config } from '../config.js';
import { log } from '../utils.js';
import { processReport } from './pipeline.js';

/**
 * Minimal in-process job queue. Status lives in reports.status so clients poll GET /reports/:id.
 * For multi-instance scale, swap for BullMQ/pg-boss; the enqueue() interface stays the same.
 */
const queue = [];
let running = 0;

export function enqueue(reportId) {
  queue.push(reportId);
  pump();
}

function pump() {
  while (running < config.JOB_CONCURRENCY && queue.length) {
    const id = queue.shift();
    running++;
    processReport(id)
      .catch((e) => log.error('job_crashed', { reportId: id, reason: e.name }))
      .finally(() => {
        running--;
        pump();
      });
  }
}

/** On boot, resume reports interrupted by a restart/deploy. */
export async function resumePending() {
  const { data } = await supabase.from('reports').select('id').in('status', ['uploaded', 'processing']);
  (data ?? []).forEach((r) => enqueue(r.id));
  if (data?.length) log.info('jobs_resumed', { count: data.length });
}
