package id.aigra.finance

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.AccountBox
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import id.aigra.finance.auth.LoginScreen
import id.aigra.finance.auth.LoginViewModel
import id.aigra.finance.ui.home.HomeScreen
import id.aigra.finance.ui.home.HomeViewModel
import id.aigra.finance.ui.theme.FinanceTheme
import id.aigra.finance.ui.theme.LocalPalette
import io.github.jan.supabase.auth.status.SessionStatus

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        val container = (application as App).container
        setContent {
            FinanceTheme {
                Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    Root(container)
                }
            }
        }
    }
}

private enum class Tab(val route: String, val label: Int, val icon: ImageVector) {
    HOME("home", R.string.nav_home, Icons.Filled.Home),
    TRANSACTIONS("transactions", R.string.nav_transactions, Icons.AutoMirrored.Filled.List),
    ADD("add", R.string.nav_add, Icons.Filled.Add),
    BALANCES("balances", R.string.nav_balances, Icons.Filled.AccountBox),
    MORE("more", R.string.nav_more, Icons.Filled.MoreVert)
}

@Composable
private fun Root(container: AppContainer) {
    val status by container.api.sessionStatus.collectAsStateWithLifecycle()
    when (status) {
        is SessionStatus.Initializing -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        is SessionStatus.NotAuthenticated -> LoginScreen(viewModel { LoginViewModel(container.api) })
        else -> MainScaffold(container)
    }
}

@Composable
private fun MainScaffold(container: AppContainer) {
    val nav = rememberNavController()
    val backStack by nav.currentBackStackEntryAsState()
    val current = backStack?.destination?.route
    val p = LocalPalette.current
    val itemColors = NavigationBarItemDefaults.colors(
        indicatorColor = p.navActiveBg,
        selectedIconColor = p.navActiveFg,
        selectedTextColor = MaterialTheme.colorScheme.onSurface
    )
    Scaffold(
        bottomBar = {
            NavigationBar {
                Tab.entries.forEach { tab ->
                    NavigationBarItem(
                        selected = current == tab.route,
                        onClick = {
                            nav.navigate(tab.route) {
                                popUpTo(nav.graph.findStartDestination().id) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = { Icon(tab.icon, null) },
                        label = { Text(stringResource(tab.label)) },
                        colors = itemColors
                    )
                }
            }
        }
    ) { padding ->
        NavHost(nav, startDestination = Tab.HOME.route, modifier = Modifier.padding(padding)) {
            composable(Tab.HOME.route) { HomeScreen(viewModel { HomeViewModel(container.repository) }) }
            composable(Tab.TRANSACTIONS.route) { Placeholder(Tab.TRANSACTIONS) }
            composable(Tab.ADD.route) { Placeholder(Tab.ADD) }
            composable(Tab.BALANCES.route) { Placeholder(Tab.BALANCES) }
            composable(Tab.MORE.route) { Placeholder(Tab.MORE) }
        }
    }
}

@Composable
private fun Placeholder(tab: Tab) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text(stringResource(tab.label)) }
}
