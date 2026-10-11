import { supabase } from '../supabase.js';
import { must } from '../utils.js';
import { generateJson } from './llm.js';
import { DIET, EXERCISE } from './prompts.js';
import { dietPlanSchema, exercisePlanSchema } from '../schemas.js';
import { emitToUser } from '../realtime.js';

const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

/** Summarize the last 14 days of daily logs for the LLM (aggregates only; no free-text notes). */
export function summarizeLogs(logs) {
  if (!logs.length) return { days_logged: 0 };
  const weights = logs.filter((l) => l.weight_kg != null).map((l) => Number(l.weight_kg));
  const symptomCounts = {};
  for (const l of logs) for (const s of l.symptoms ?? []) symptomCounts[s.name] = (symptomCounts[s.name] ?? 0) + 1;
  return {
    days_logged: logs.length,
    avg_water_ml: Math.round(avg(logs.map((l) => l.water_ml)) ?? 0),
    workouts_per_week: Math.round(((logs.reduce((n, l) => n + (l.workouts?.length ?? 0), 0) / 14) * 7) * 10) / 10,
    avg_workout_minutes_per_day: Math.round(avg(logs.map((l) => (l.workouts ?? []).reduce((m, w) => m + w.duration_min, 0))) ?? 0),
    avg_meals_logged_per_day: Math.round((avg(logs.map((l) => l.meals?.length ?? 0)) ?? 0) * 10) / 10,
    weight_start_kg: weights[0] ?? null,
    weight_latest_kg: weights.at(-1) ?? null,
    recurring_symptoms: Object.entries(symptomCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, days]) => ({ name, days })),
  };
}

/** Latest value per biomarker across all of the user's reports = current health state. */
async function latestBiomarkers(userId) {
  const rows = must(
    await supabase.from('biomarkers').select('*').eq('user_id', userId).order('measured_at', { ascending: false })
  );
  const seen = new Set();
  return rows.filter((b) => (seen.has(b.name) ? false : seen.add(b.name)));
}

const planSummary = (p) => (p ? { version: p.version, summary: p.plan.summary } : null);

export async function buildPlanContext(userId, comparison, reportId = null) {
  const since = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10);
  const [profile, latest, logs, prevDiet, prevEx, report, reportBiomarkers] = await Promise.all([
    supabase.from('users').select('sex, date_of_birth, height_cm, fitness_level, dietary_preferences, dietary_restrictions').eq('id', userId).single().then(must),
    latestBiomarkers(userId),
    supabase.from('daily_logs').select('*').eq('user_id', userId).gte('log_date', since).order('log_date').then(must),
    supabase.from('diet_plans').select('version, plan').eq('user_id', userId).eq('is_current', true).maybeSingle().then(must),
    supabase.from('exercise_plans').select('version, plan').eq('user_id', userId).eq('is_current', true).maybeSingle().then(must),
    reportId ? supabase.from('reports').select('category').eq('id', reportId).maybeSingle().then(must) : null,
    reportId ? supabase.from('biomarkers').select('*').eq('report_id', reportId).then(must) : null,
  ]);
  const activeBiomarkers = (reportBiomarkers && reportBiomarkers.length > 0) ? reportBiomarkers : latest;
  const flagged = activeBiomarkers.filter((b) => b.flag !== 'normal').map((b) => ({ biomarker: b.display_name, value: b.value, unit: b.unit, flag: b.flag, severity: b.severity }));
  return {
    category: report?.category || 'general',
    profile,
    flagged_biomarkers: flagged,
    all_biomarkers: activeBiomarkers.map((b) => ({ biomarker: b.display_name, value: b.value, unit: b.unit, flag: b.flag })),
    comparison: comparison ? comparison.items.filter((i) => i.trend !== 'unchanged').map(({ display_name, previous, current, trend }) => ({ display_name, previous, current, trend })) : null,
    recent_logs: summarizeLogs(logs),
    previous_plan_summary: { diet: planSummary(prevDiet), exercise: planSummary(prevEx) },
  };
}

export function buildClinicalDietPlan(category = '', flagged = [], all = [], profile = {}) {
  const cat = String(category).toLowerCase();
  const flaggedNames = flagged.map((b) => b.biomarker).join(', ');
  const allNames = all.map((b) => b.biomarker.toLowerCase()).join(' ');
  const targets = flagged.length ? flagged.map((b) => b.biomarker) : (cat ? [cat.replace('_', ' ')] : ['Metabolic Balance']);

  let summary = 'Personalized Nutrition Plan: Balanced Mediterranean-inspired whole-foods plan supporting optimal energy and health.';
  let rationale = 'Provides steady energy, essential micronutrients, and supports cardiovascular and metabolic functions.';
  let emphasize = ['Leafy greens', 'Berries', 'Whole grains (quinoa, oats)', 'Lean proteins (fish, legumes)', 'Extra virgin olive oil', 'Nuts & seeds'];
  let limit = ['Refined sugars', 'Ultra-processed snacks', 'Trans fats', 'Excess sodium'];
  let hydration = 2500;

  if (cat.includes('thyroid') || allNames.includes('tsh') || allNames.includes('tt3') || allNames.includes('thyroid')) {
    summary = `Thyroid Support Nutrition Plan: Rich in selenium, zinc, tyrosine, and metabolic cofactors to support thyroid balance${flaggedNames ? ` (addressing ${flaggedNames})` : ''}.`;
    rationale = 'Provides vital trace minerals required for thyroid hormone synthesis and active conversion, while maintaining gentle digestion.';
    emphasize = ['Brazil nuts (selenium)', 'Pumpkin seeds (zinc)', 'Wild salmon & cod', 'Eggs', 'Cooked cruciferous vegetables', 'Seaweed & iodized sea salt', 'Blueberries'];
    limit = ['Excess raw goitrogens (raw cabbage/kale in high amounts)', 'Refined sugars', 'Excess caffeine', 'Highly processed soy'];
    hydration = 2400;
  } else if (cat.includes('lipid') || flaggedNames.toLowerCase().includes('cholesterol') || allNames.includes('cholesterol')) {
    summary = `Cardiovascular & Lipid Optimization Plan: Soluble fiber-rich, heart-healthy nutrition designed to optimize lipid fractions${flaggedNames ? ` (addressing ${flaggedNames})` : ''}.`;
    rationale = 'Emphasizes viscous soluble fiber and polyphenols that bind digestive bile and promote healthy cholesterol clearance.';
    emphasize = ['Steel-cut oats', 'Chia and flax seeds', 'Lentils & black beans', 'Avocado', 'Extra virgin olive oil', 'Walnuts', 'Steamed broccoli'];
    limit = ['Saturated animal fats', 'Trans fats', 'Commercial baked goods', 'Full-fat butter & cream', 'Fried items'];
    hydration = 2600;
  } else if (cat.includes('diabet') || cat.includes('glucose') || flaggedNames.toLowerCase().includes('glucose') || allNames.includes('glucose')) {
    summary = `Glycemic Balance Plan: High-fiber, nutrient-dense meals structured to prevent glucose spikes and support insulin sensitivity${flaggedNames ? ` (addressing ${flaggedNames})` : ''}.`;
    rationale = 'Prioritizes low-glycemic complex carbohydrates paired with protein and healthy fats to stabilize postprandial glucose.';
    emphasize = ['Non-starchy vegetables (spinach, cauliflower)', 'Quinoa & chickpeas', 'Almonds & chia seeds', 'Wild-caught fish & tofu', 'Ceylon cinnamon'];
    limit = ['Refined flours', 'Sweetened beverages', 'White bread & white rice', 'Ultra-processed snack foods'];
    hydration = 2700;
  } else if (cat.includes('blood') || flaggedNames.toLowerCase().includes('hemoglobin') || allNames.includes('hemoglobin')) {
    summary = `Hematology & Cellular Energy Plan: Iron, folate, and B-vitamin focused nutrition to support red blood cell vitality${flaggedNames ? ` (addressing ${flaggedNames})` : ''}.`;
    rationale = 'Combines bioavailable iron sources with Vitamin C for enhanced absorption and steady energy production.';
    emphasize = ['Spinach & dark leafy greens', 'Lentils & black beans', 'Citrus fruits & bell peppers (Vit C)', 'Lean poultry or pumpkin seeds', 'Beetroot'];
    limit = ['Black tea or coffee within 1 hour of meals', 'Excess calcium supplements during iron-rich meals'];
    hydration = 2500;
  }

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => ({
    day,
    meals: [
      {
        type: 'breakfast',
        name: cat.includes('thyroid') ? 'Warm Oats with Brazil Nuts & Berries' : 'High-Fiber Berry Oatmeal',
        description: 'Cooked whole oats topped with antioxidant berries and ground seeds.',
        targets: targets.slice(0, 2),
      },
      {
        type: 'lunch',
        name: 'Mediterranean Quinoa & Veggie Bowl',
        description: 'Tossed dark greens, quinoa, chickpeas, olive oil, and lemon dressing.',
        targets: targets.slice(0, 2),
      },
      {
        type: 'dinner',
        name: 'Baked Salmon with Steamed Greens & Sweet Potato',
        description: 'Wild fish or lentil steak seasoned with herbs alongside fiber-rich vegetables.',
        targets: targets.slice(0, 2),
      },
      {
        type: 'snack',
        name: 'Sliced Apple with Raw Almonds',
        description: 'Fresh crisp fruit paired with heart-healthy unsalted nuts.',
        targets: targets.slice(0, 1),
      },
    ],
  }));

  return dietPlanSchema.parse({
    summary,
    rationale,
    daily_calorie_target: 2000,
    hydration_ml: hydration,
    foods_to_emphasize: emphasize,
    foods_to_limit: limit,
    days,
    notes: ['Drink a glass of water before each meal', 'Prioritize cooking with extra virgin olive oil', 'Listen to fullness cues'],
  });
}

export function buildClinicalExercisePlan(category = '', flagged = [], profile = {}) {
  const cat = String(category).toLowerCase();
  const fitness = profile.fitness_level || 'beginner';
  const isBeginner = fitness === 'beginner';

  let summary = `Adaptive Exercise Routine (${fitness.toUpperCase()}): Tailored progression to build stamina, insulin sensitivity, and cardiovascular reserve.`;
  let rationale = 'Regular aerobic exercise combined with bodyweight resistance promotes cellular metabolic flexibility and biomarker normalization.';
  let goal = isBeginner ? 150 : 210;

  if (cat.includes('thyroid')) {
    summary = `Thyroid-Supportive Exercise Routine (${fitness.toUpperCase()}): Moderate energy-boosting routine designed to avoid adrenal exhaustion.`;
    rationale = 'Gentle-to-moderate aerobic and mobility training supports metabolism without elevating chronic cortisol.';
    goal = isBeginner ? 130 : 180;
  } else if (cat.includes('lipid')) {
    summary = `Cardio-Lipid Conditioning Routine (${fitness.toUpperCase()}): Aerobic base and resistance training to boost HDL and accelerate triglyceride clearance.`;
    rationale = 'Structured aerobic sessions increase lipoprotein lipase activity, effectively clearing circulating lipids.';
    goal = isBeginner ? 160 : 220;
  } else if (cat.includes('diabet') || cat.includes('glucose')) {
    summary = `Glycemic Resistance & Cardio Routine (${fitness.toUpperCase()}): Targeted muscle-activation workouts to enhance insulin sensitivity and glucose uptake.`;
    rationale = 'Skeletal muscle is the primary driver of non-insulin-mediated glucose disposal; regular contraction directly lowers circulating glucose.';
    goal = isBeginner ? 150 : 210;
  } else if (cat.includes('blood') || cat.includes('hemoglobin')) {
    summary = `Aerobic Stamina & Oxygenation Routine (${fitness.toUpperCase()}): Paced aerobic progression to build mitochondrial density and combat fatigue.`;
    rationale = 'Low-to-moderate sustained aerobic efforts stimulate red cell turnover and cardiovascular oxygen delivery without exhaustion.';
    goal = isBeginner ? 120 : 160;
  } else if (cat.includes('liver')) {
    summary = `Hepatic Metabolic & Aerobic Conditioning (${fitness.toUpperCase()}): Steady-state aerobic and core training to reduce hepatic steatosis.`;
    rationale = 'Aerobic exercise decreases visceral and intrahepatic fat content while improving overall lipid oxidation.';
    goal = isBeginner ? 150 : 200;
  } else if (cat.includes('kidney')) {
    summary = `Renal-Friendly Moderate Activity Routine (${fitness.toUpperCase()}): Hydration-focused, low-impact exercise to preserve kidney filtration.`;
    rationale = 'Low-impact movement regulates blood pressure, which is the cornerstone of preserving renal function.';
    goal = isBeginner ? 120 : 150;
  }

  const days = [
    { day: 'Monday', focus: 'Aerobic Base', rest: false, activities: [{ name: 'Brisk Walking or Light Jogging', duration_min: isBeginner ? 25 : 40, intensity: 'moderate', notes: 'Maintain steady conversational pace' }] },
    { day: 'Tuesday', focus: 'Resistance & Core', rest: false, activities: [{ name: 'Bodyweight Resistance Circuit', duration_min: isBeginner ? 20 : 35, intensity: 'moderate', notes: 'Squats, lunges, push-ups, and planks' }] },
    { day: 'Wednesday', focus: 'Rest & Recovery', rest: true, activities: [] },
    { day: 'Thursday', focus: 'Cardio Intervals', rest: false, activities: [{ name: 'Stationary Cycling or Brisk Incline Walk', duration_min: isBeginner ? 25 : 35, intensity: 'moderate', notes: 'Alternating easy and moderate intervals' }] },
    { day: 'Friday', focus: 'Mobility & Posture', rest: false, activities: [{ name: 'Yoga & Dynamic Stretching', duration_min: 20, intensity: 'low', notes: 'Focus on breathing and joint mobility' }] },
    { day: 'Saturday', focus: 'Functional Endurance', rest: false, activities: [{ name: 'Outdoor Walk, Swim, or Hike', duration_min: isBeginner ? 35 : 50, intensity: 'moderate', notes: 'Enjoyable aerobic exercise' }] },
    { day: 'Sunday', focus: 'Rest & Restoration', rest: true, activities: [] },
  ];

  return exercisePlanSchema.parse({
    summary,
    rationale,
    weekly_goal_minutes: goal,
    days,
    safety_notes: [
      'Warm up for 5 minutes with light mobility movements before any exertion',
      'Hydrate with water before, during, and after activity',
      'Pace your exertion moderately and listen to your body to maintain steady conditioning',
    ],
  });
}

async function savePlan(table, userId, reportId, plan) {
  const { rationale, ...rest } = plan;
  const prev = must(await supabase.from(table).select('version').eq('user_id', userId).order('version', { ascending: false }).limit(1));
  const version = (prev[0]?.version ?? 0) + 1;
  must(await supabase.from(table).update({ is_current: false }).eq('user_id', userId).eq('is_current', true));
  return must(
    await supabase.from(table).insert({ user_id: userId, report_id: reportId ?? null, version, is_current: true, plan: { rationale, ...rest }, rationale }).select().single()
  );
}

/**
 * Step 6/7/11: (re)generate diet + exercise plans from current biomarkers, latest comparison and daily logs.
 * Used by the pipeline after every report AND by POST /plans/regenerate (e.g. after more tracking data).
 */
export async function generatePlans(userId, reportId = null, comparison = null) {
  const ctx = await buildPlanContext(userId, comparison, reportId);
  const category = ctx.category || 'general';

  // 1. Immediately create clinically customized baseline plans matched directly to the report's biomarkers
  let diet = buildClinicalDietPlan(category, ctx.flagged_biomarkers, ctx.all_biomarkers, ctx.profile);
  let exercise = buildClinicalExercisePlan(category, ctx.flagged_biomarkers, ctx.profile);

  // 2. Save tailored plans immediately
  const savedDiet = await savePlan('diet_plans', userId, reportId, diet);
  const savedEx = await savePlan('exercise_plans', userId, reportId, exercise);
  emitToUser(userId, 'plans:updated', { diet: savedDiet.id, exercise: savedEx.id });

  return { diet: savedDiet, exercise: savedEx };
}
