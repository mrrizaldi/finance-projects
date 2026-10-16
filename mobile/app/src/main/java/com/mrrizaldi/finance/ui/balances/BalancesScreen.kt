package com.mrrizaldi.finance.ui.balances

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mrrizaldi.finance.R
import com.mrrizaldi.finance.data.SyncError
import com.mrrizaldi.finance.data.local.AccountEntity
import com.mrrizaldi.finance.ui.components.GroupedCard
import com.mrrizaldi.finance.ui.components.NavBarClearance
import com.mrrizaldi.finance.ui.components.OfflineChip
import com.mrrizaldi.finance.ui.components.hexColor
import com.mrrizaldi.finance.ui.components.signedAmount
import com.mrrizaldi.finance.ui.theme.AppType
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
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(horizontal = 16.dp)) {
            item {
                Column {
                    Text(
                        stringResource(R.string.balances_title),
                        style = AppType.screenTitle,
                        modifier = Modifier.padding(top = 8.dp)
                    )
                    when (error) {
                        SyncError.Offline -> Box(Modifier.padding(top = 12.dp)) { OfflineChip(lastSuccessAt) }
                        is SyncError.Server -> Text(
                            stringResource(R.string.load_error),
                            color = p.negative,
                            modifier = Modifier.padding(top = 12.dp)
                        )
                        else -> Unit
                    }
                    Text(
                        stringResource(R.string.balances_total),
                        style = MaterialTheme.typography.bodyMedium,
                        color = p.textMute,
                        modifier = Modifier.padding(top = 16.dp)
                    )
                    Text(signedAmount(RupiahFormat.format(accounts.sumOf { it.balance })), style = AppType.balance, maxLines = 1)
                }
            }
            item {
                GroupedCard(accounts, Modifier.padding(top = 16.dp)) { account -> AccountRow(account) }
            }
            item { Spacer(Modifier.navigationBarsPadding().height(NavBarClearance)) }
        }
    }
}

@Composable
private fun AccountRow(account: AccountEntity) {
    val p = LocalPalette.current
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(Modifier.size(8.dp).background(hexColor(account.color, p.accentLine), CircleShape))
        Column(Modifier.weight(1f).padding(start = 12.dp)) {
            Text(account.name, style = AppType.rowTitle)
            Text(account.type, style = AppType.rowMeta, color = p.textMute)
        }
        Text(
            signedAmount(RupiahFormat.format(account.balance)),
            style = AppType.rowAmount,
            color = if (account.balance < 0) p.negative else p.textHi
        )
    }
}
