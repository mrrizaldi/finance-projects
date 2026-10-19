package com.mrrizaldi.finance.ui.inbox

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.mrrizaldi.finance.R
import com.mrrizaldi.finance.data.remote.NotificationDto
import com.mrrizaldi.finance.data.remote.SupabaseApi
import com.mrrizaldi.finance.ui.components.GroupedCard
import com.mrrizaldi.finance.ui.components.ScreenTopBar
import com.mrrizaldi.finance.ui.theme.AppType
import com.mrrizaldi.finance.ui.theme.LocalPalette
import com.mrrizaldi.finance.util.JakartaDate

@Composable
fun InboxScreen(api: SupabaseApi, onBack: () -> Unit) {
    val p = LocalPalette.current
    val locale = LocalConfiguration.current.locales[0]
    var rows by remember { mutableStateOf<List<NotificationDto>>(emptyList()) }
    var loaded by remember { mutableStateOf(false) }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {}

    LaunchedEffect(Unit) {
        if (Build.VERSION.SDK_INT >= 33) permission.launch(Manifest.permission.POST_NOTIFICATIONS)
        runCatching { api.listNotifications("1970-01-01T00:00:00Z", 50, ascending = false) }.onSuccess { list ->
            rows = list
            loaded = true
            runCatching { api.markAllNotificationsRead() }
        }
    }

    Column(Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
        ScreenTopBar(stringResource(R.string.inbox_title), onBack)
        if (loaded && rows.isEmpty()) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(stringResource(R.string.inbox_empty), color = p.textMute)
            }
        } else {
            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
                item {
                    GroupedCard(rows) { row ->
                        Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp)) {
                            Text(
                                row.title,
                                style = AppType.rowTitle,
                                fontWeight = if (row.readAt == null) FontWeight.Bold else FontWeight.SemiBold
                            )
                            Text(row.body, style = AppType.rowMeta, color = p.textHi)
                            Text(
                                JakartaDate.formatTimestamp(row.createdAt, locale),
                                style = AppType.rowMeta,
                                color = p.textMute
                            )
                        }
                    }
                }
            }
        }
    }
}
