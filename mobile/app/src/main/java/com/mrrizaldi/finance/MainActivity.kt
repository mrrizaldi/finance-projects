package com.mrrizaldi.finance

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.core.content.IntentCompat
import androidx.lifecycle.lifecycleScope
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.biometric.BiometricPrompt
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.hazeSource
import dev.chrisbanes.haze.rememberHazeState
import com.mrrizaldi.finance.auth.LoginScreen
import com.mrrizaldi.finance.auth.LoginViewModel
import com.mrrizaldi.finance.lock.APP_LOCK_AUTHENTICATORS
import com.mrrizaldi.finance.lock.LockScreen
import com.mrrizaldi.finance.sync.Sync
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
import com.mrrizaldi.finance.ui.inbox.InboxScreen
import com.mrrizaldi.finance.ui.statements.StatementScreen
import com.mrrizaldi.finance.ui.statements.StatementViewModel
import com.mrrizaldi.finance.ui.statements.readUploads
import com.mrrizaldi.finance.util.JakartaDate
import java.time.YearMonth
import kotlinx.coroutines.launch
import com.mrrizaldi.finance.ui.theme.FinanceTheme
import com.mrrizaldi.finance.ui.theme.LocalHazeState
import com.mrrizaldi.finance.ui.transactions.TransactionsScreen
import com.mrrizaldi.finance.ui.transactions.TransactionsViewModel
import io.github.jan.supabase.auth.status.SessionStatus

private const val ADD_ROUTE = "add"
private const val EDIT_ROUTE = "edit/{id}"
private const val INBOX_ROUTE = "inbox"
private const val STATEMENTS_ROUTE = "statements"
private const val PICK_STATEMENT_FILES = 41
private val STATEMENT_MIME_TYPES = arrayOf("application/pdf", "image/*")

private fun NavHostController.edit(id: String) = navigate("edit/$id") { launchSingleTop = true }

class MainActivity : FragmentActivity() {
    private lateinit var prompt: BiometricPrompt

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        val container = (application as App).container
        prompt = BiometricPrompt(
            this,
            ContextCompat.getMainExecutor(this),
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    container.lock.unlock()
                }
            }
        )
        acceptShare(intent)
        setContent {
            FinanceTheme {
                Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    Root(container, this@MainActivity::askUnlock, this@MainActivity::pickStatementFiles)
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        acceptShare(intent)
    }

    private fun acceptShare(intent: Intent?) {
        val uris = when (intent?.action) {
            Intent.ACTION_SEND -> listOfNotNull(IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri::class.java))
            Intent.ACTION_SEND_MULTIPLE -> IntentCompat.getParcelableArrayListExtra(intent, Intent.EXTRA_STREAM, Uri::class.java).orEmpty()
            else -> emptyList()
        }
        deliverUploads(uris)
    }

    private fun deliverUploads(uris: List<Uri>) {
        if (uris.isEmpty()) return
        val container = (application as App).container
        lifecycleScope.launch { container.sharedUploads.value = readUploads(this@MainActivity, uris) }
    }

    private fun pickStatementFiles() {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE)
            .setType("*/*")
            .putExtra(Intent.EXTRA_MIME_TYPES, STATEMENT_MIME_TYPES)
            .putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
        @Suppress("DEPRECATION")
        startActivityForResult(intent, PICK_STATEMENT_FILES)
    }

    @Suppress("OVERRIDE_DEPRECATION")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        @Suppress("DEPRECATION")
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != PICK_STATEMENT_FILES || resultCode != RESULT_OK || data == null) return
        val clip = data.clipData
        val uris = if (clip != null) List(clip.itemCount) { clip.getItemAt(it).uri } else listOfNotNull(data.data)
        deliverUploads(uris)
    }

    private fun askUnlock() {
        prompt.authenticate(
            BiometricPrompt.PromptInfo.Builder()
                .setTitle(getString(R.string.lock_prompt_title))
                .setAllowedAuthenticators(APP_LOCK_AUTHENTICATORS)
                .build()
        )
    }
}

@Composable
private fun Root(container: AppContainer, askUnlock: () -> Unit, pickStatementFiles: () -> Unit) {
    val status by container.api.sessionStatus.collectAsStateWithLifecycle()
    val lockedAt by container.lock.lockedAt.collectAsStateWithLifecycle()
    val gated = lockedAt != null && status !is SessionStatus.NotAuthenticated
    val hazeState = rememberHazeState()
    val context = LocalContext.current
    LaunchedEffect(status) {
        when (status) {
            is SessionStatus.Authenticated -> {
                Sync.flush(context)
                Sync.pollNotificationsNow(context)
            }
            is SessionStatus.NotAuthenticated -> container.lock.unlock()
            else -> Unit
        }
    }
    LaunchedEffect(gated, lockedAt) {
        if (gated) askUnlock()
    }
    CompositionLocalProvider(LocalHazeState provides hazeState) {
        Box(Modifier.fillMaxSize()) {
            AuroraBackground(Modifier.fillMaxSize().hazeSource(hazeState, zIndex = 0f))
            Box(if (gated) Modifier.fillMaxSize().clearAndSetSemantics {} else Modifier.fillMaxSize()) {
                when (status) {
                    is SessionStatus.Initializing -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                    is SessionStatus.NotAuthenticated -> LoginScreen(viewModel { LoginViewModel(container.api) })
                    else -> MainScaffold(container, hazeState, pickStatementFiles)
                }
            }
            if (gated) LockScreen(askUnlock)
        }
    }
}

@Composable
private fun MainScaffold(container: AppContainer, hazeState: HazeState, pickStatementFiles: () -> Unit) {
    val nav = rememberNavController()
    val backStack by nav.currentBackStackEntryAsState()
    val current = backStack?.destination?.route
    val shared by container.sharedUploads.collectAsStateWithLifecycle()
    LaunchedEffect(shared) {
        if (shared.isNotEmpty()) nav.navigate(STATEMENTS_ROUTE) { launchSingleTop = true }
    }
    Box(Modifier.fillMaxSize()) {
        NavHost(
            nav,
            startDestination = Tab.HOME.route,
            modifier = Modifier.fillMaxSize().hazeSource(hazeState, zIndex = 1f).statusBarsPadding()
        ) {
            composable(Tab.HOME.route) {
                var unread by remember { mutableIntStateOf(0) }
                LaunchedEffect(Unit) { unread = runCatching { container.api.countUnreadNotifications() }.getOrDefault(0) }
                HomeScreen(
                    viewModel { HomeViewModel(container.repository) },
                    container.lock,
                    unread,
                    onEdit = nav::edit,
                    onInbox = { nav.navigate(INBOX_ROUTE) { launchSingleTop = true } },
                    onStatements = { nav.navigate(STATEMENTS_ROUTE) { launchSingleTop = true } }
                )
            }
            composable(Tab.TRANSACTIONS.route) {
                TransactionsScreen(viewModel { TransactionsViewModel(container.repository) }, onEdit = nav::edit)
            }
            composable(Tab.BALANCES.route) { BalancesScreen(viewModel { BalancesViewModel(container.repository) }) }
            composable(Tab.ANALYTICS.route) { AnalyticsScreen(viewModel { AnalyticsViewModel(container.repository) }) }
            composable(ADD_ROUTE) {
                AddScreen(viewModel { AddViewModel(container.repository) }, onBack = { nav.popBackStack() })
            }
            composable(INBOX_ROUTE) { InboxScreen(container.api, onBack = { nav.popBackStack() }) }
            composable(STATEMENTS_ROUTE) {
                StatementScreen(
                    viewModel {
                        StatementViewModel(container.statements, container.repository.accounts()) {
                            container.repository.refreshAccounts()
                            container.repository.refreshHome(YearMonth.from(JakartaDate.today()))
                        }
                    },
                    sharedFiles = shared,
                    onSharedConsumed = { container.sharedUploads.value = emptyList() },
                    onPickFiles = pickStatementFiles,
                    onBack = { nav.popBackStack() }
                )
            }
            composable(EDIT_ROUTE) { entry ->
                val id = entry.arguments?.getString("id").orEmpty()
                AddScreen(viewModel { AddViewModel(container.repository, id) }, onBack = { nav.popBackStack() })
            }
        }
        if (current != ADD_ROUTE && current != EDIT_ROUTE && current != INBOX_ROUTE && current != STATEMENTS_ROUTE) {
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
