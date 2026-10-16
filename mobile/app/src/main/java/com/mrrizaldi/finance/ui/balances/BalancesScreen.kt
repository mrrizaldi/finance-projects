package com.mrrizaldi.finance.ui.balances

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mrrizaldi.finance.R
import com.mrrizaldi.finance.data.SyncError
import com.mrrizaldi.finance.ui.components.NavBarClearance
import com.mrrizaldi.finance.ui.components.OfflineChip
import com.mrrizaldi.finance.ui.components.hexColor
import com.mrrizaldi.finance.ui.theme.LocalPalette
import com.mrrizaldi.finance.util.RupiahFormat

@Composable
fun BalancesScreen(vm: BalancesViewModel) {
    val accounts by vm.accounts.collectAsStateWithLifecycle()
    val error by vm.error.collectAsStateWithLifecycle()
    val refreshing by vm.refreshing.collectAsStateWithLifecycle()
    val lastSuccessAt by vm.lastSuccessAt.collectAsStateWithLifecycle()
    val p = LocalPalette.current

    PullToRefreshBox(isRefreshing = refreshing, onRefresh = vm::refresh, modifier = Modifier.fillMaxSize()) {
        LazyColumn(Modifier.fillMaxSize()) {
            item {
                Column(Modifier.padding(16.dp)) {
                    Text(stringResource(R.string.balances_title), style = MaterialTheme.typography.titleLarge)
                    when (error) {
                        SyncError.Offline -> OfflineChip(lastSuccessAt)
                        is SyncError.Server -> Text(stringResource(R.string.load_error), color = p.negative)
                        else -> Unit
                    }
                    Text(
                        stringResource(R.string.balances_total),
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 12.dp)
                    )
                    Text(
                        RupiahFormat.format(accounts.sumOf { it.balance }),
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
            items(accounts, key = { it.id }) { account ->
                ListItem(
                    headlineContent = { Text(account.name) },
                    colors = ListItemDefaults.colors(containerColor = MaterialTheme.colorScheme.background),
                    supportingContent = { Text(account.type) },
                    leadingContent = {
                        Box(Modifier.size(14.dp).background(hexColor(account.color, p.accentLine), CircleShape))
                    },
                    trailingContent = {
                        Text(
                            RupiahFormat.format(account.balance),
                            fontWeight = FontWeight.SemiBold,
                            color = if (account.balance < 0) p.negative else MaterialTheme.colorScheme.onSurface
                        )
                    }
                )
            }
            item { Spacer(Modifier.navigationBarsPadding().height(NavBarClearance)) }
        }
    }
}
