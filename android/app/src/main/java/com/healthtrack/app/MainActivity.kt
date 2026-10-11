package com.healthtrack.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.healthtrack.app.data.Network
import com.healthtrack.app.ui.*

private val HealthColorScheme = lightColorScheme(
    primary = androidx.compose.ui.graphics.Color(0xFF533E64),
    onPrimary = androidx.compose.ui.graphics.Color(0xFFFFFFFF),
    secondary = androidx.compose.ui.graphics.Color(0xFFA26997),
    onSecondary = androidx.compose.ui.graphics.Color(0xFFFFFFFF),
    tertiary = androidx.compose.ui.graphics.Color(0xFFA8C1C1),
    onTertiary = androidx.compose.ui.graphics.Color(0xFF533E64),
    background = androidx.compose.ui.graphics.Color(0xFFFFFFFF),
    onBackground = androidx.compose.ui.graphics.Color(0xFF533E64),
    surface = androidx.compose.ui.graphics.Color(0xFFFFFFFF),
    onSurface = androidx.compose.ui.graphics.Color(0xFF533E64),
    surfaceVariant = androidx.compose.ui.graphics.Color(0xFFF7F9F9),
    onSurfaceVariant = androidx.compose.ui.graphics.Color(0xFF533E64),
    outline = androidx.compose.ui.graphics.Color(0xFFA8C1C1)
)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val factory = VMFactory((application as HealthTrackApp).repository)
        setContent { MaterialTheme(colorScheme = HealthColorScheme) { App(factory) } }
    }
}

private data class Tab(val route: String, val label: String, val icon: androidx.compose.ui.graphics.vector.ImageVector)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun App(factory: VMFactory) {
    val auth: AuthViewModel = viewModel(factory = factory)
    val state by auth.state.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { Network.onSessionExpired = auth::sessionExpired }
    if (!state.loggedIn) { LoginScreen(auth); return }

    val nav = rememberNavController()
    val tabs = listOf(Tab("home", "Reports", Icons.Default.Description), Tab("plans", "Plans", Icons.Default.Restaurant), Tab("log", "Log", Icons.Default.EditNote), Tab("progress", "Progress", Icons.Default.ShowChart))
    val route = nav.currentBackStackEntryAsState().value?.destination?.route

    Scaffold(
        topBar = { TopAppBar(title = { Text("HealthTrack") }, actions = { TextButton(auth::logout) { Text("Log out") } }) },
        bottomBar = {
            NavigationBar {
                tabs.forEach { t ->
                    NavigationBarItem(selected = route == t.route, onClick = { nav.navigate(t.route) { launchSingleTop = true; popUpTo("home") } }, icon = { Icon(t.icon, t.label) }, label = { Text(t.label) })
                }
            }
        },
    ) { pad ->
        NavHost(nav, startDestination = "home", modifier = Modifier.padding(pad)) {
            composable("home") { HomeScreen(viewModel(factory = factory), onOpen = { nav.navigate("report/$it") }) }
            composable("report/{id}") { ReportScreen(it.arguments?.getString("id")!!, viewModel(factory = factory)) }
            composable("plans") { PlansScreen(viewModel(factory = factory)) }
            composable("log") { LogScreen(viewModel(factory = factory)) }
            composable("progress") { ProgressScreen(viewModel(factory = factory)) }
        }
    }
}
