package com.mrrizaldi.finance

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.hazeSource
import dev.chrisbanes.haze.rememberHazeState
import com.mrrizaldi.finance.auth.LoginScreen
import com.mrrizaldi.finance.auth.LoginViewModel
import com.mrrizaldi.finance.ui.add.AddScreen
import com.mrrizaldi.finance.ui.add.AddViewModel
import com.mrrizaldi.finance.ui.analytics.AnalyticsScreen
import com.mrrizaldi.finance.ui.analytics.AnalyticsViewModel
import com.mrrizaldi.finance.ui.balances.BalancesScreen
import com.mrrizaldi.finance.ui.balances.BalancesViewModel
import com.mrrizaldi.finance.ui.components.AddFab
import com.mrrizaldi.finance.ui.components.AuroraBackground
import com.mrrizaldi.finance.ui.components.FloatingNavBar
import com.mrrizaldi.finance.ui.components.Tab
import com.mrrizaldi.finance.ui.home.HomeScreen
import com.mrrizaldi.finance.ui.home.HomeViewModel
import com.mrrizaldi.finance.ui.theme.FinanceTheme
import com.mrrizaldi.finance.ui.theme.LocalHazeState
import com.mrrizaldi.finance.ui.transactions.TransactionsScreen
import com.mrrizaldi.finance.ui.transactions.TransactionsViewModel
import io.github.jan.supabase.auth.status.SessionStatus

private const val ADD_ROUTE = "add"

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

@Composable
private fun Root(container: AppContainer) {
    val status by container.api.sessionStatus.collectAsStateWithLifecycle()
    val hazeState = rememberHazeState()
    CompositionLocalProvider(LocalHazeState provides hazeState) {
        Box(Modifier.fillMaxSize()) {
            AuroraBackground(Modifier.fillMaxSize().hazeSource(hazeState, zIndex = 0f))
            when (status) {
                is SessionStatus.Initializing -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
                is SessionStatus.NotAuthenticated -> LoginScreen(viewModel { LoginViewModel(container.api) })
                else -> MainScaffold(container, hazeState)
            }
        }
    }
}

@Composable
private fun MainScaffold(container: AppContainer, hazeState: HazeState) {
    val nav = rememberNavController()
    val backStack by nav.currentBackStackEntryAsState()
    val current = backStack?.destination?.route
    Box(Modifier.fillMaxSize()) {
        NavHost(
            nav,
            startDestination = Tab.HOME.route,
            modifier = Modifier.fillMaxSize().hazeSource(hazeState, zIndex = 1f).statusBarsPadding()
        ) {
            composable(Tab.HOME.route) { HomeScreen(viewModel { HomeViewModel(container.repository) }) }
            composable(Tab.TRANSACTIONS.route) { TransactionsScreen(viewModel { TransactionsViewModel(container.repository) }) }
            composable(Tab.BALANCES.route) { BalancesScreen(viewModel { BalancesViewModel(container.repository) }) }
            composable(Tab.ANALYTICS.route) { AnalyticsScreen(viewModel { AnalyticsViewModel(container.repository) }) }
            composable(ADD_ROUTE) {
                AddScreen(viewModel { AddViewModel(container.repository) }, onBack = { nav.popBackStack() })
            }
        }
        if (current != ADD_ROUTE) {
            FloatingNavBar(
                current = current,
                onSelect = { tab ->
                    nav.navigate(tab.route) {
                        popUpTo(nav.graph.findStartDestination().id) { saveState = true }
                        launchSingleTop = true
                        restoreState = true
                    }
                },
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .navigationBarsPadding()
                    .padding(start = 12.dp, end = 76.dp, bottom = 16.dp)
                    .fillMaxWidth()
            )
            AddFab(
                onClick = { nav.navigate(ADD_ROUTE) { launchSingleTop = true } },
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .navigationBarsPadding()
                    .padding(end = 12.dp, bottom = 16.dp)
            )
        }
    }
}
