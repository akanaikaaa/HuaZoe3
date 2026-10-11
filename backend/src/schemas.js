import { z } from 'zod';

// ───────── LLM output schemas (validated before saving) ─────────
export const CATEGORIES = ['blood_test', 'lipid_profile', 'thyroid', 'diabetes', 'liver_function', 'kidney_function', 'other'];

export const categorySchema = z.object({
  category: z.preprocess((val) => {
    if (typeof val !== 'string') return 'other';
    const s = val.toLowerCase().trim();
    if (CATEGORIES.includes(s)) return s;
    if (s.includes('blood') || s.includes('cbc') || s.includes('hematolog')) return 'blood_test';
    if (s.includes('lipid') || s.includes('cholesterol')) return 'lipid_profile';
    if (s.includes('thyroid') || s.includes('tsh')) return 'thyroid';
    if (s.includes('diabet') || s.includes('glucose') || s.includes('hba1c')) return 'diabetes';
    if (s.includes('liver') || s.includes('hepatic') || s.includes('alt') || s.includes('ast')) return 'liver_function';
    if (s.includes('kidney') || s.includes('renal') || s.includes('creatinine') || s.includes('egfr') || s.includes('bun')) return 'kidney_function';
    return 'other';
  }, z.enum(CATEGORIES)),
  confidence: z.preprocess((val) => {
    if (typeof val === 'number') {
      if (val > 1 && val <= 100) return val / 100;
      return Math.max(0, Math.min(1, val));
    }
    if (typeof val === 'string') {
      const n = parseFloat(val);
      if (!isNaN(n)) return n > 1 ? Math.min(1, n / 100) : Math.max(0, n);
    }
    return 0.9;
  }, z.number().min(0).max(1)),
  report_date: z.preprocess((val) => {
    if (typeof val === 'string') {
      const m = val.match(/\d{4}-\d{2}-\d{2}/);
      if (m) return m[0];
    }
    return null;
  }, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()),
});

const parseNum = (v) => {
  if (v === null || v === undefined || v === '' || v === 'null') return null;
  if (typeof v === 'number') return isNaN(v) ? null : v;
  if (typeof v === 'string') {
    const clean = v.replace(/[^0-9.-]/g, '');
    const n = parseFloat(clean);
    return isNaN(n) ? null : n;
  }
  return null;
};

export const extractionSchema = z.preprocess(
  (val) => {
    if (Array.isArray(val)) return { biomarkers: val };
    return val;
  },
  z.object({
    biomarkers: z
      .array(
        z.object({
          name: z.string().min(1).max(100),
          canonical_name: z.preprocess(
            (v, ctx) => {
              if (typeof v === 'string' && v.trim()) return v.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
              return 'biomarker';
            },
            z.string().min(1).max(100)
          ),
          value: z.preprocess((v) => parseNum(v) ?? 0, z.number()),
          unit: z.preprocess((v) => (v ? String(v).slice(0, 30) : null), z.string().max(30).nullable()),
          ref_low: z.preprocess(parseNum, z.number().nullable()),
          ref_high: z.preprocess(parseNum, z.number().nullable()),
        })
      )
      .max(150),
  })
);

export const insightsSchema = z.object({
  summary: z.string().min(1).max(2000),
  urgent_attention: z.preprocess((v) => (typeof v === 'string' ? v.toLowerCase() === 'true' : Boolean(v)), z.boolean()),
  items: z
    .array(
      z.object({
        biomarker: z.string(),
        flag: z.preprocess((v) => {
          if (typeof v === 'string') {
            const s = v.toLowerCase();
            if (s.includes('low') || s.includes('decreased')) return 'low';
          }
          return 'high';
        }, z.enum(['low', 'high'])),
        explanation: z.preprocess((v) => (v ? String(v).slice(0, 1200) : ''), z.string().max(1200)),
        possible_causes: z.preprocess((v) => (Array.isArray(v) ? v.map(String).slice(0, 6) : []), z.array(z.string()).max(6)),
        lifestyle_tips: z.preprocess((v) => (Array.isArray(v) ? v.map(String).slice(0, 6) : []), z.array(z.string()).max(6)),
        see_doctor: z.preprocess((v) => (typeof v === 'string' ? v.toLowerCase() === 'true' : Boolean(v)), z.boolean()),
      })
    )
    .max(60),
});

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const dietPlanSchema = z.preprocess((val) => {
  if (!val || typeof val !== 'object') return val;
  const daysMap = new Map();
  if (Array.isArray(val.days)) {
    for (const d of val.days) {
      if (d && d.day) daysMap.set(d.day, d);
    }
  }
  const fullDays = DAYS.map((day) => {
    const existing = daysMap.get(day);
    let meals = existing?.meals || [];
    if (!Array.isArray(meals) || meals.length < 3) {
      meals = [
        { type: 'breakfast', name: 'Whole grain oatmeal & fresh fruit', description: 'Oats with berries and nuts', targets: [] },
        { type: 'lunch', name: 'Mediterranean salad with lean protein', description: 'Greens, vegetables, and olive oil dressing', targets: [] },
        { type: 'dinner', name: 'Steamed vegetables and baked fish or lentils', description: 'Balanced nutritious dinner', targets: [] },
      ];
    }
    return {
      day,
      meals: meals.slice(0, 5).map((m) => ({
        type: ['breakfast', 'lunch', 'dinner', 'snack'].includes(m.type) ? m.type : 'lunch',
        name: String(m.name || 'Balanced Meal').slice(0, 150),
        description: String(m.description || 'Nutrient-rich balanced meal').slice(0, 400),
        targets: Array.isArray(m.targets) ? m.targets.map(String).slice(0, 5) : [],
      })),
    };
  });
  return {
    summary: String(val.summary || 'Personalized dietary recommendations supporting overall metabolic health.').slice(0, 1500),
    rationale: String(val.rationale || 'Focuses on wholesome foods and hydration.').slice(0, 1500),
    daily_calorie_target: parseNum(val.daily_calorie_target) ? Math.min(5000, Math.max(800, Math.round(Number(val.daily_calorie_target)))) : null,
    hydration_ml: parseNum(val.hydration_ml) ? Math.min(6000, Math.max(500, Math.round(Number(val.hydration_ml)))) : 2200,
    foods_to_emphasize: Array.isArray(val.foods_to_emphasize) ? val.foods_to_emphasize.map(String).slice(0, 25) : ['Leafy greens', 'Berries', 'Whole grains', 'Lean proteins'],
    foods_to_limit: Array.isArray(val.foods_to_limit) ? val.foods_to_limit.map(String).slice(0, 25) : ['Processed sugars', 'Fried foods', 'Excess sodium'],
    days: fullDays,
    notes: Array.isArray(val.notes) ? val.notes.map(String).slice(0, 10) : ['Stay hydrated throughout the day'],
  };
}, z.object({
  summary: z.string().max(1500),
  rationale: z.string().max(1500),
  daily_calorie_target: z.number().int().min(800).max(5000).nullable(),
  hydration_ml: z.number().int().min(500).max(6000),
  foods_to_emphasize: z.array(z.string()).max(25),
  foods_to_limit: z.array(z.string()).max(25),
  days: z
    .array(
      z.object({
        day: z.enum(DAYS),
        meals: z
          .array(
            z.object({
              type: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
              name: z.string().max(150),
              description: z.string().max(400),
              targets: z.array(z.string()).max(5),
            })
          )
          .min(3)
          .max(5),
      })
    )
    .length(7),
  notes: z.array(z.string()).max(10),
}));

export const exercisePlanSchema = z.preprocess((val) => {
  if (!val || typeof val !== 'object') return val;
  const daysMap = new Map();
  if (Array.isArray(val.days)) {
    for (const d of val.days) {
      if (d && d.day) daysMap.set(d.day, d);
    }
  }
  const fullDays = DAYS.map((day) => {
    const existing = daysMap.get(day);
    const isRest = existing ? Boolean(existing.rest) : (day === 'Wednesday' || day === 'Sunday');
    const activities = Array.isArray(existing?.activities)
      ? existing.activities.slice(0, 5).map((a) => ({
          name: String(a.name || 'Walking').slice(0, 100),
          duration_min: parseNum(a.duration_min) ? Math.min(180, Math.max(1, Math.round(Number(a.duration_min)))) : 30,
          intensity: ['low', 'moderate', 'high'].includes(a.intensity) ? a.intensity : 'moderate',
          notes: a.notes ? String(a.notes).slice(0, 300) : null,
        }))
      : (isRest ? [] : [{ name: 'Brisk Walk', duration_min: 30, intensity: 'moderate', notes: null }]);

    return {
      day,
      focus: String(existing?.focus || (isRest ? 'Rest & Recovery' : 'Aerobic & Mobility')).slice(0, 80),
      rest: isRest,
      activities: isRest ? [] : activities,
    };
  });

  return {
    summary: String(val.summary || 'A balanced weekly exercise routine designed to build stamina safely.').slice(0, 1500),
    rationale: String(val.rationale || 'Regular moderate activity improves cardiovascular and metabolic markers.').slice(0, 1500),
    weekly_goal_minutes: parseNum(val.weekly_goal_minutes) ? Math.min(1500, Math.max(0, Math.round(Number(val.weekly_goal_minutes)))) : 150,
    days: fullDays,
    safety_notes: Array.isArray(val.safety_notes) ? val.safety_notes.map(String).slice(0, 8) : ['Warm up before exercising', 'Stay hydrated'],
  };
}, z.object({
  summary: z.string().max(1500),
  rationale: z.string().max(1500),
  weekly_goal_minutes: z.number().int().min(0).max(1500),
  days: z
    .array(
      z.object({
        day: z.enum(DAYS),
        focus: z.string().max(80),
        rest: z.boolean(),
        activities: z
          .array(
            z.object({
              name: z.string().max(100),
              duration_min: z.number().int().min(1).max(180),
              intensity: z.enum(['low', 'moderate', 'high']),
              notes: z.string().max(300).nullable(),
            })
          )
          .max(5),
      })
    )
    .length(7),
  safety_notes: z.array(z.string()).max(8),
}));

// ───────── Request schemas ─────────
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
const uuid = z.string().uuid();

export const registerBody = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72),
  full_name: z.string().min(1).max(100).optional(),
});
export const loginBody = z.object({ email: z.string().email(), password: z.string().min(1) });
export const refreshBody = z.object({ refresh_token: z.string().min(1) });
export const verifyTokenBody = z.object({
  email: z.string().email(),
  token: z.string().min(4).max(64),
  type: z.enum(['signup', 'email', 'recovery', 'invite']).optional().default('signup'),
});
export const sendTokenBody = z.object({
  email: z.string().email(),
  type: z.enum(['signup', 'email']).optional().default('signup'),
});

export const profileBody = z
  .object({
    full_name: z.string().min(1).max(100),
    date_of_birth: date.nullable(),
    sex: z.enum(['male', 'female', 'other']).nullable(),
    height_cm: z.number().min(50).max(260).nullable(),
    fitness_level: z.enum(['beginner', 'intermediate', 'advanced']),
    dietary_preferences: z.array(z.string().max(40)).max(20),
    dietary_restrictions: z.array(z.string().max(40)).max(20),
  })
  .partial();

export const idParams = z.object({ id: uuid });
export const dateParams = z.object({ date });
export const patientQuery = z.object({ userId: uuid.optional() });
export const reportListQuery = patientQuery.extend({ category: z.enum(CATEGORIES).optional() });
export const biomarkerQuery = patientQuery.extend({ name: z.string().max(100).optional(), reportId: uuid.optional() });
export const insightQuery = patientQuery.extend({ reportId: uuid.optional() });
export const logRangeQuery = patientQuery.extend({ from: date.optional(), to: date.optional() });

export const dailyLogBody = z.object({
  meals: z.array(z.object({ name: z.string().max(150), calories: z.number().min(0).max(5000).optional(), notes: z.string().max(300).optional() })).max(20).default([]),
  workouts: z.array(z.object({ type: z.string().max(80), duration_min: z.number().min(0).max(600), intensity: z.enum(['low', 'moderate', 'high']).optional() })).max(10).default([]),
  water_ml: z.number().int().min(0).max(10000).default(0),
  weight_kg: z.number().min(20).max(400).nullable().optional(),
  symptoms: z.array(z.object({ name: z.string().max(80), severity: z.number().int().min(1).max(5), notes: z.string().max(300).optional() })).max(15).default([]),
  notes: z.string().max(1000).nullable().optional(),
});

export const compareBody = z.object({ currentReportId: uuid, previousReportId: uuid.optional() });
export const assignBody = z.object({ doctorId: uuid, patientId: uuid });
export const roleBody = z.object({ role: z.enum(['patient', 'doctor', 'admin']) });
