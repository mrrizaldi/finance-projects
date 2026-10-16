package com.mrrizaldi.finance.ui.home

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import com.mrrizaldi.finance.BuildConfig
import com.mrrizaldi.finance.R
import com.mrrizaldi.finance.ui.components.CancelButton
import com.mrrizaldi.finance.ui.components.DangerButton
import com.mrrizaldi.finance.ui.components.GlassDialog
import com.mrrizaldi.finance.ui.components.GroupDivider
import com.mrrizaldi.finance.ui.components.GroupedCard
import com.mrrizaldi.finance.ui.theme.AppType
import com.mrrizaldi.finance.ui.theme.LocalPalette

@Composable
fun SettingsSheet(pendingCount: Int, onLogout: () -> Unit, onDismiss: () -> Unit) {
    val p = LocalPalette.current
    var confirm by remember { mutableStateOf(false) }
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
