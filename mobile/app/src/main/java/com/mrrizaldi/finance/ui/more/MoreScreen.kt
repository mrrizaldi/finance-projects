package com.mrrizaldi.finance.ui.more

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import com.mrrizaldi.finance.BuildConfig
import com.mrrizaldi.finance.R
import com.mrrizaldi.finance.data.Repository
import com.mrrizaldi.finance.ui.components.GroupDivider
import com.mrrizaldi.finance.ui.components.GroupedCard
import com.mrrizaldi.finance.ui.theme.AppType
import com.mrrizaldi.finance.ui.theme.LocalPalette
import kotlinx.coroutines.launch

@Composable
fun MoreScreen(repo: Repository) {
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    val p = LocalPalette.current
    Column(Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
        Text(
            stringResource(R.string.more_title),
            style = AppType.screenTitle,
            modifier = Modifier.padding(top = 8.dp, bottom = 16.dp)
        )
        GroupedCard {
            Text(
                stringResource(R.string.more_version, BuildConfig.VERSION_NAME),
                style = AppType.rowTitle,
                color = p.textMute,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp)
            )
            GroupDivider()
            Text(
                stringResource(R.string.more_logout),
                style = AppType.rowTitle,
                color = p.negative,
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(enabled = !busy, role = Role.Button) {
                        busy = true
                        scope.launch {
                            repo.logout()
                            busy = false
                        }
                    }
                    .padding(horizontal = 16.dp, vertical = 14.dp)
            )
        }
    }
}
