package com.mrrizaldi.finance.ui.home

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import com.mrrizaldi.finance.BuildConfig
import com.mrrizaldi.finance.R
import com.mrrizaldi.finance.lock.AppLock
import com.mrrizaldi.finance.ui.components.CancelButton
import com.mrrizaldi.finance.ui.components.DangerButton
import com.mrrizaldi.finance.ui.components.GlassDialog
import com.mrrizaldi.finance.ui.components.GroupDivider
import com.mrrizaldi.finance.ui.components.GroupedCard
import com.mrrizaldi.finance.ui.theme.AppType
import com.mrrizaldi.finance.ui.theme.LocalPalette

@Composable
fun SettingsSheet(pendingCount: Int, lock: AppLock, onLogout: () -> Unit, onDismiss: () -> Unit) {
    val p = LocalPalette.current
    var confirm by remember { mutableStateOf(false) }
    var lockOn by remember { mutableStateOf(lock.enabled) }
    val lockAvailable = remember { lock.available() }
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
        containerColor = p.bg
    ) {
        Column(Modifier.padding(horizontal = 16.dp).padding(bottom = 16.dp).navigationBarsPadding()) {
            Text(
                stringResource(R.string.settings_title),
                style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.padding(bottom = 12.dp)
            )
            GroupedCard {
                if (lockAvailable) {
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .toggleable(value = lockOn, role = Role.Switch) {
                                lockOn = it
                                lock.enabled = it
                            }
                            .padding(horizontal = 16.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            stringResource(R.string.settings_lock),
                            style = AppType.rowTitle,
                            color = p.textHi,
                            modifier = Modifier.weight(1f)
                        )
                        Switch(
                            checked = lockOn,
                            onCheckedChange = null,
                            colors = SwitchDefaults.colors(checkedThumbColor = p.primaryFg, checkedTrackColor = p.primary)
                        )
                    }
                    GroupDivider()
                }
                Text(
                    stringResource(R.string.settings_version, BuildConfig.VERSION_NAME),
                    style = AppType.rowTitle,
                    color = p.textMute,
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp)
                )
                GroupDivider()
                Text(
                    stringResource(R.string.settings_logout),
                    style = AppType.rowTitle,
                    color = p.negative,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable(role = Role.Button) { confirm = true }
                        .padding(horizontal = 16.dp, vertical = 14.dp)
                )
            }
        }
    }
    if (confirm) {
        GlassDialog(
            onDismiss = { confirm = false },
            title = stringResource(R.string.settings_logout_confirm_title),
            body = listOfNotNull(
                stringResource(R.string.settings_logout_confirm_body),
                if (pendingCount > 0) stringResource(R.string.settings_logout_pending, pendingCount) else null
            ).joinToString("\n\n"),
            actions = {
                CancelButton(stringResource(R.string.common_cancel), { confirm = false }, Modifier.weight(1f))
                DangerButton(
                    stringResource(R.string.settings_logout),
                    {
                        confirm = false
                        onLogout()
                    },
                    Modifier.weight(1f)
                )
            }
        )
    }
}
