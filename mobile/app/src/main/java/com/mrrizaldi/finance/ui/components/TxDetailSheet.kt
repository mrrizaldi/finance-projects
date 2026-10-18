package com.mrrizaldi.finance.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.mrrizaldi.finance.R
import com.mrrizaldi.finance.util.RupiahFormat

@Composable
fun DeleteTransactionDialog(label: String, amount: Long, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    val what = listOfNotNull(label.trim().ifBlank { null }, RupiahFormat.format(amount)).joinToString(" · ")
    GlassDialog(
        onDismiss = onDismiss,
        title = stringResource(R.string.tx_delete_title),
        body = stringResource(R.string.tx_delete_body, what),
        actions = {
            CancelButton(stringResource(R.string.common_cancel), onDismiss, Modifier.weight(1f))
            DangerButton(stringResource(R.string.tx_delete), onConfirm, Modifier.weight(1f))
        }
    )
}
