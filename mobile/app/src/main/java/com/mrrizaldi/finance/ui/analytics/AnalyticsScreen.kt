package com.mrrizaldi.finance.ui.analytics

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mrrizaldi.finance.R
import com.mrrizaldi.finance.data.SyncError
import com.mrrizaldi.finance.ui.components.MonthPicker
import com.mrrizaldi.finance.ui.components.NavBarClearance
import com.mrrizaldi.finance.ui.components.OfflineChip
import com.mrrizaldi.finance.ui.theme.AppType
import com.mrrizaldi.finance.ui.theme.LocalPalette

@Composable
fun AnalyticsScreen(vm: AnalyticsViewModel) {
    val state by vm.uiState.collectAsStateWithLifecycle()
    val error by vm.error.collectAsStateWithLifecycle()
    val refreshing by vm.refreshing.collectAsStateWithLifecycle()
    val p = LocalPalette.current

    PullToRefreshBox(isRefreshing = refreshing, onRefresh = vm::refresh, modifier = Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp)) {
            Text(
                stringResource(R.string.analytics_title),
                style = AppType.screenTitle,
                modifier = Modifier.padding(top = 8.dp, bottom = 4.dp)
            )
            MonthPicker(state.month, vm::setMonth)
            when (error) {
                SyncError.Offline -> Box(Modifier.padding(top = 8.dp)) { OfflineChip(state.lastSuccessAt) }
                is SyncError.Server -> Text(
                    stringResource(R.string.load_error),
                    color = p.negative,
                    modifier = Modifier.padding(top = 8.dp)
                )
                else -> Unit
            }
            Spacer(Modifier.navigationBarsPadding().height(NavBarClearance))
        }
    }
}
