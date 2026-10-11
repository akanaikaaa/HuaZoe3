import { supabase } from '../supabase.js';
import { must } from '../utils.js';
import { compareBiomarkers, comparisonSummary } from './analysis.js';
import { emitToUser } from '../realtime.js';

/** Most recent completed report of the same category that predates `current`. */
export async function findPreviousReport(current) {
  const rows = must(
    await supabase
      .from('reports')
      .select('id, report_date, created_at')
      .eq('user_id', current.user_id)
      .eq('category', current.category)
      .eq('status', 'completed')
      .neq('id', current.id)
      .lte('report_date', current.report_date)
      .order('report_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
  );
  return rows[0] ?? null;
}

export async function createComparison(userId, currentReportId, previousReportId) {
  const [cur, prev] = await Promise.all(
    [currentReportId, previousReportId].map(async (id) =>
      must(await supabase.from('biomarkers').select('*').eq('report_id', id).eq('user_id', userId))
    )
  );
  const items = compareBiomarkers(cur, prev);
  const row = {
    user_id: userId,
    current_report_id: currentReportId,
    previous_report_id: previousReportId,
    items,
    summary: comparisonSummary(items),
  };
  const saved = must(
    await supabase.from('report_comparisons').upsert(row, { onConflict: 'current_report_id,previous_report_id' }).select().single()
  );
  emitToUser(userId, 'comparison:created', { id: saved.id });
  return saved;
}
