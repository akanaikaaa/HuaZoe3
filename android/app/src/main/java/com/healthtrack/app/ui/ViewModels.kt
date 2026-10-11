package com.healthtrack.app.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.healthtrack.app.data.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate

class VMFactory(private val repo: Repository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = when (modelClass) {
        AuthViewModel::class.java -> AuthViewModel(repo)
        HomeViewModel::class.java -> HomeViewModel(repo)
        ReportViewModel::class.java -> ReportViewModel(repo)
        PlansViewModel::class.java -> PlansViewModel(repo)
        TrackingViewModel::class.java -> TrackingViewModel(repo)
        else -> error("Unknown VM")
    } as T
}

data class AuthState(val loggedIn: Boolean, val loading: Boolean = false, val error: String? = null, val info: String? = null)

class AuthViewModel(private val repo: Repository) : ViewModel() {
    private val _s = MutableStateFlow(AuthState(repo.isLoggedIn))
    val state: StateFlow<AuthState> = _s

    fun login(email: String, pw: String) = viewModelScope.launch {
        _s.value = AuthState(false, loading = true)
        repo.login(email, pw).fold(
            { _s.value = AuthState(true) },
            { e -> _s.value = AuthState(false, error = e.message) },
        )
    }
    fun register(email: String, pw: String, name: String) = viewModelScope.launch {
        _s.value = AuthState(false, loading = true)
        repo.register(email, pw, name).fold(
            { _s.value = AuthState(false, info = if (it.confirmationRequired) "Check your email to confirm, then log in." else "Account created. Log in.") },
            { e -> _s.value = AuthState(false, error = e.message) },
        )
    }
    fun logout() { repo.logout(); _s.value = AuthState(false) }
    fun sessionExpired() { _s.value = AuthState(false, error = "Session expired. Please log in again.") }
}

data class HomeState(val reports: List<ReportSummary> = emptyList(), val loading: Boolean = true, val uploading: Boolean = false, val error: String? = null)

class HomeViewModel(private val repo: Repository) : ViewModel() {
    private val _s = MutableStateFlow(HomeState())
    val state: StateFlow<HomeState> = _s

    fun refresh() = viewModelScope.launch {
        repo.reports().fold(
            { r -> _s.update { it.copy(reports = r, loading = false, error = null) } },
            { e -> _s.update { it.copy(loading = false, error = e.message) } },
        )
    }

    /** REST polling (default sync). Runs while the Home screen is visible; faster while a report is processing. */
    suspend fun pollWhileVisible() {
        while (true) {
            refresh().join()
            val busy = _s.value.reports.any { it.status == "uploaded" || it.status == "processing" }
            delay(if (busy) 3_000 else 15_000)
        }
    }

    fun upload(uri: android.net.Uri) = viewModelScope.launch {
        _s.update { it.copy(uploading = true, error = null) }
        repo.uploadReport(uri).fold(
            { _s.update { s -> s.copy(uploading = false) }; refresh() },
            { e -> _s.update { it.copy(uploading = false, error = e.message) } },
        )
    }
}

data class ReportState(val report: ReportDetail? = null, val loading: Boolean = true, val error: String? = null)

class ReportViewModel(private val repo: Repository) : ViewModel() {
    private val _s = MutableStateFlow(ReportState())
    val state: StateFlow<ReportState> = _s

    suspend fun pollUntilDone(id: String) {
        while (true) {
            repo.report(id).fold(
                { r -> _s.value = ReportState(r, false) },
                { e -> _s.update { it.copy(loading = false, error = e.message) } },
            )
            val st = _s.value.report?.status
            if (st == "completed" || st == "failed") return
            delay(3_000)
        }
    }
}

data class PlansState(
    val diet: DietPlan? = null, val exercise: ExercisePlan? = null, val comparison: Comparison? = null,
    val loading: Boolean = true, val adapting: Boolean = false, val error: String? = null,
)

class PlansViewModel(private val repo: Repository) : ViewModel() {
    private val _s = MutableStateFlow(PlansState())
    val state: StateFlow<PlansState> = _s

    /** Always fetches fresh plans from the API, so plans regenerated on web show up here. */
    fun load() = viewModelScope.launch {
        val d = repo.dietPlan(); val e = repo.exercisePlan(); val c = repo.comparisons()
        _s.update {
            it.copy(
                diet = d.getOrNull() ?: it.diet, exercise = e.getOrNull() ?: it.exercise,
                comparison = c.getOrNull()?.firstOrNull(), loading = false,
                error = (d.exceptionOrNull() ?: e.exceptionOrNull())?.message,
            )
        }
    }
    fun adapt() = viewModelScope.launch {
        _s.update { it.copy(adapting = true, error = null) }
        repo.regeneratePlans().onFailure { e -> _s.update { it.copy(error = e.message) } }
        _s.update { it.copy(adapting = false) }
        load()
    }
}

data class TrackingState(val logs: List<DailyLog> = emptyList(), val trends: List<TrendSeries> = emptyList(), val saving: Boolean = false, val saved: Boolean = false, val error: String? = null)

class TrackingViewModel(private val repo: Repository) : ViewModel() {
    private val _s = MutableStateFlow(TrackingState())
    val state: StateFlow<TrackingState> = _s

    fun load() = viewModelScope.launch {
        val l = repo.dailyLogs(); val t = repo.trends()
        _s.update { it.copy(logs = l.getOrDefault(it.logs), trends = t.getOrDefault(it.trends), error = l.exceptionOrNull()?.message) }
    }

    fun save(meals: String, workout: String, minutes: Int, waterMl: Int, weight: Double?, symptom: String, severity: Int) = viewModelScope.launch {
        _s.update { it.copy(saving = true, saved = false, error = null) }
        val log = DailyLog(
            meals = meals.lines().map { it.trim() }.filter { it.isNotEmpty() }.map(::MealLog),
            workouts = if (workout.isBlank()) emptyList() else listOf(WorkoutLog(workout.trim(), minutes)),
            waterMl = waterMl, weightKg = weight,
            symptoms = if (symptom.isBlank()) emptyList() else listOf(SymptomLog(symptom.trim(), severity.coerceIn(1, 5))),
        )
        repo.saveLog(LocalDate.now().toString(), log).fold(
            { _s.update { it.copy(saving = false, saved = true) }; load() },
            { e -> _s.update { it.copy(saving = false, error = e.message) } },
        )
    }
}
