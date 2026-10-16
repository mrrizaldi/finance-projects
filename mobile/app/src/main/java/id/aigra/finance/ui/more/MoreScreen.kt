package id.aigra.finance.ui.more

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import id.aigra.finance.BuildConfig
import id.aigra.finance.R
import id.aigra.finance.data.Repository
import kotlinx.coroutines.launch

@Composable
fun MoreScreen(repo: Repository) {
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(stringResource(R.string.more_title), style = MaterialTheme.typography.titleLarge)
        Text(
            stringResource(R.string.more_version, BuildConfig.VERSION_NAME),
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Button(
            onClick = {
                busy = true
                scope.launch {
                    repo.logout()
                    busy = false
                }
            },
            enabled = !busy
        ) {
            Text(stringResource(R.string.more_logout))
        }
    }
}
