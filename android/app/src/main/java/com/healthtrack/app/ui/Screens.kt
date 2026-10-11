package com.healthtrack.app.ui

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.healthtrack.app.data.*
import java.io.File

const val DISCLAIMER = "Informational only — not a substitute for professional medical advice. Consult your doctor."

@Composable
fun Disclaimer() = Text(DISCLAIMER, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.outline, modifier = Modifier.padding(8.dp))

@Composable
fun ErrorText(msg: String?) { if (msg != null) Text(msg, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(vertical = 4.dp)) }

@Composable
fun Section(title: String, content: @Composable ColumnScope.() -> Unit) {
    Card(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Column(Modifier.padding(12.dp)) { Text(title, style = MaterialTheme.typography.titleMedium); Spacer(Modifier.height(6.dp)); content() }
    }
}

// ───────── Login ─────────
@Composable
fun LoginScreen(vm: AuthViewModel) {
    val s by vm.state.collectAsStateWithLifecycle()
    var email by remember { mutableStateOf("") }
    var pw by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }
    var register by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.Center) {
        Text("HealthTrack", style = MaterialTheme.typography.headlineMedium)
        if (register) OutlinedTextField(name, { name = it }, label = { Text("Full name") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(email, { email = it }, label = { Text("Email") }, keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Email), modifier = Modifier.fillMaxWidth())
        OutlinedTextField(pw, { pw = it }, label = { Text("Password") }, visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth())
        ErrorText(s.error)
        s.info?.let { Text(it) }
        Button({ if (register) vm.register(email.trim(), pw, name) else vm.login(email.trim(), pw) }, enabled = !s.loading, modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
            Text(if (s.loading) "Please wait…" else if (register) "Create account" else "Log in")
        }
        TextButton({ register = !register }) { Text(if (register) "Have an account? Log in" else "Need an account? Register") }
        Disclaimer()
    }
}

// ───────── Home: report history + upload (camera / gallery) ─────────
@Composable
fun HomeScreen(vm: HomeViewModel, onOpen: (String) -> Unit) {
    val s by vm.state.collectAsStateWithLifecycle()
    val ctx = LocalContext.current
    LaunchedEffect(Unit) { vm.pollWhileVisible() }

    val gallery = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? -> uri?.let(vm::upload) }
    var cameraUri by remember { mutableStateOf<Uri?>(null) }
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok -> if (ok) cameraUri?.let(vm::upload) }

    Column(Modifier.padding(12.dp).verticalScroll(rememberScrollState())) {
        Section("Upload a report") {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button({
                    val f = File(ctx.cacheDir, "captures").apply { mkdirs() }.let { File(it, "cap_${System.currentTimeMillis()}.jpg") }
                    cameraUri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.fileprovider", f)
                    camera.launch(cameraUri!!)
                }, enabled = !s.uploading) { Text("Camera") }
                OutlinedButton({ gallery.launch("*/*") }, enabled = !s.uploading) { Text("Gallery / PDF") }
            }
            if (s.uploading) LinearProgressIndicator(Modifier.fillMaxWidth().padding(top = 8.dp))
            ErrorText(s.error)
        }
        Section("Report history") {
            if (s.loading) CircularProgressIndicator()
            else if (s.reports.isEmpty()) Text("No reports yet.")
            s.reports.forEach { r ->
                Row(Modifier.fillMaxWidth().clickable { onOpen(r.id) }.padding(vertical = 8.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                    Column { Text(r.category?.replace('_', ' ') ?: r.fileName); Text(r.reportDate ?: r.createdAt.take(10), style = MaterialTheme.typography.bodySmall) }
                    AssistChip({}, label = { Text(r.status) })
                }
                HorizontalDivider()
            }
        }
        Disclaimer()
    }
}

// ───────── Report detail ─────────
@Composable
fun ReportScreen(id: String, vm: ReportViewModel) {
    val s by vm.state.collectAsStateWithLifecycle()
    LaunchedEffect(id) { vm.pollUntilDone(id) }
    val r = s.report
    Column(Modifier.padding(12.dp).verticalScroll(rememberScrollState())) {
        if (r == null) { if (s.loading) CircularProgressIndicator(); ErrorText(s.error); return@Column }
        Text(r.category?.replace('_', ' ') ?: "Categorizing…", style = MaterialTheme.typography.headlineSmall)
        if (r.status == "processing" || r.status == "uploaded") { Text("Analysing your report…"); LinearProgressIndicator(Modifier.fillMaxWidth()) }
        if (r.status == "failed") ErrorText(r.errorMessage ?: "Processing failed")
        if (r.status == "completed") {
            Section("Biomarkers") {
                r.biomarkers.forEach { b ->
                    Row(Modifier.fillMaxWidth().padding(vertical = 3.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(b.displayName); Text("${b.value} ${b.unit ?: ""} · ${b.flag}")
                    }
                }
            }
            r.insight?.let { i ->
                Section("Insights") {
                    if (i.items.urgentAttention) Text("Some values are significantly abnormal. Please consult a doctor soon.", color = MaterialTheme.colorScheme.error)
                    Text(i.summary)
                    i.items.list.forEach { it ->
                        Text("${it.biomarker} (${it.flag})", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 8.dp))
                        Text(it.explanation, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
        Disclaimer()
    }
}

// ───────── Plans (diet + exercise + latest comparison) ─────────
@Composable
fun PlansScreen(vm: PlansViewModel) {
    val s by vm.state.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { vm.load() }
    Column(Modifier.padding(12.dp).verticalScroll(rememberScrollState())) {
        ErrorText(s.error)
        Button({ vm.adapt() }, enabled = !s.adapting) { Text(if (s.adapting) "Adapting…" else "Adapt plans to my progress") }
        s.comparison?.let { c ->
            Section("Latest comparison") { Text(c.summary); c.items.take(10).forEach { Text("${it.displayName}: ${it.previous ?: "–"} → ${it.current} (${it.trend})", style = MaterialTheme.typography.bodySmall) } }
        }
        Section("Diet plan${s.diet?.let { " v${it.version}" } ?: ""}") {
            val d = s.diet?.plan
            if (d == null) Text("Plans appear after your first report is processed.")
            else {
                Text(d.summary); Text(d.rationale, style = MaterialTheme.typography.bodySmall)
                Text("Emphasize: ${d.foodsToEmphasize.joinToString()}"); Text("Limit: ${d.foodsToLimit.joinToString()}"); Text("Water: ${d.hydrationMl} ml/day")
                d.days.forEach { day -> Text(day.day, style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 6.dp)); day.meals.forEach { Text("• ${it.type}: ${it.name}", style = MaterialTheme.typography.bodySmall) } }
            }
        }
        Section("Exercise plan${s.exercise?.let { " v${it.version}" } ?: ""}") {
            val e = s.exercise?.plan
            if (e == null) Text("Plans appear after your first report is processed.")
            else {
                Text(e.summary); Text("${e.weeklyGoalMinutes} min/week", style = MaterialTheme.typography.bodySmall)
                e.days.forEach { d -> Text("${d.day} (${d.focus}): " + if (d.rest) "Rest" else d.activities.joinToString { "${it.name} ${it.durationMin}min" }, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(vertical = 2.dp)) }
                e.safetyNotes.forEach { Text("⚠ $it", style = MaterialTheme.typography.bodySmall) }
            }
        }
        Disclaimer()
    }
}

// ───────── Daily log entry ─────────
@Composable
fun LogScreen(vm: TrackingViewModel) {
    val s by vm.state.collectAsStateWithLifecycle()
    var meals by remember { mutableStateOf("") }
    var workout by remember { mutableStateOf("") }
    var minutes by remember { mutableStateOf("") }
    var water by remember { mutableStateOf("") }
    var weight by remember { mutableStateOf("") }
    var symptom by remember { mutableStateOf("") }
    var sev by remember { mutableStateOf("1") }
    val num = KeyboardType.Number
    Column(Modifier.padding(12.dp).verticalScroll(rememberScrollState())) {
        Section("Today's log") {
            OutlinedTextField(meals, { meals = it }, label = { Text("Meals (one per line)") }, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(workout, { workout = it }, label = { Text("Workout") }, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(minutes, { minutes = it.filter(Char::isDigit) }, label = { Text("Workout minutes") }, keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = num), modifier = Modifier.fillMaxWidth())
            OutlinedTextField(water, { water = it.filter(Char::isDigit) }, label = { Text("Water (ml)") }, keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = num), modifier = Modifier.fillMaxWidth())
            OutlinedTextField(weight, { weight = it }, label = { Text("Weight (kg)") }, keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.fillMaxWidth())
            OutlinedTextField(symptom, { symptom = it }, label = { Text("Symptom") }, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(sev, { sev = it.filter(Char::isDigit).take(1) }, label = { Text("Severity 1-5") }, keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = num), modifier = Modifier.fillMaxWidth())
            ErrorText(s.error)
            if (s.saved) Text("Saved ✓")
            Button({ vm.save(meals, workout, minutes.toIntOrNull() ?: 0, water.toIntOrNull() ?: 0, weight.toDoubleOrNull(), symptom, sev.toIntOrNull() ?: 1) }, enabled = !s.saving) { Text(if (s.saving) "Saving…" else "Save") }
        }
        Disclaimer()
    }
}

// ───────── Progress charts ─────────
@Composable
fun ProgressScreen(vm: TrackingViewModel) {
    val s by vm.state.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { vm.load() }
    Column(Modifier.padding(12.dp).verticalScroll(rememberScrollState())) {
        ErrorText(s.error)
        Section("Daily tracking") {
            LineChart("Weight (kg)", s.logs.mapNotNull { it.weightKg })
            LineChart("Water (ml)", s.logs.map { it.waterMl.toDouble() }, color = androidx.compose.ui.graphics.Color(0xFFA8C1C1))
            LineChart("Workout minutes", s.logs.map { l -> l.workouts.sumOf { it.durationMin }.toDouble() }, color = androidx.compose.ui.graphics.Color(0xFFA26997))
        }
        Section("Biomarker trends") {
            if (s.trends.isEmpty()) Text("Trends appear after your first report.")
            s.trends.filter { it.points.isNotEmpty() }.take(8).forEach { t -> LineChart("${t.displayName} ${t.unit ?: ""}", t.points.map { it.value }) }
        }
        Disclaimer()
    }
}
