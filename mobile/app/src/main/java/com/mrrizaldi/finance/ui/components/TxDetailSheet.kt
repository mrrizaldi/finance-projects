package com.mrrizaldi.finance.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.mrrizaldi.finance.R
import com.mrrizaldi.finance.data.SyncError
import com.mrrizaldi.finance.data.local.TransactionEntity
import com.mrrizaldi.finance.ui.theme.LocalPalette
import com.mrrizaldi.finance.util.JakartaDate
import com.mrrizaldi.finance.util.RupiahFormat
import java.util.Locale

private val ManualTypes = setOf("income", "expense", "transfer")
private val SheetShape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp)

internal fun deletable(tx: TransactionEntity): Boolean = !tx.pending && !tx.isAdjustment && tx.type in ManualTypes

internal fun itemizable(tx: TransactionEntity): Boolean = !tx.pending && !tx.isAdjustment && tx.type == "expense"

internal fun editable(tx: TransactionEntity): Boolean = deletable(tx) && tx.accountId != null

@Composable
fun TxDetailActions(
    detail: TransactionEntity?,
    deleteError: SyncError?,
    onEdit: (String) -> Unit,
    onReceipt: (String) -> Unit,
    onDelete: (String) -> Unit,
    onDismiss: () -> Unit,
    onDismissError: () -> Unit
) {
    val locale = LocalConfiguration.current.locales[0]
    var confirm by remember { mutableStateOf<TransactionEntity?>(null) }
    detail?.let { tx ->
        TxDetailSheet(
            tx = tx,
            locale = locale,
            onEdit = {
                onDismiss()
                onEdit(tx.id)
            },
            onReceipt = {
                onDismiss()
                onReceipt(tx.id)
            },
            onDelete = {
                onDismiss()
                confirm = tx
            },
            onDismiss = onDismiss
        )
    }
    confirm?.let { tx ->
        DeleteTransactionDialog(
            label = tx.description ?: tx.merchant ?: "",
            amount = tx.amount,
            onConfirm = {
                confirm = null
                onDelete(tx.id)
            },
            onDismiss = { confirm = null }
        )
    }
    deleteError?.let { DeleteErrorDialog(it, onDismissError) }
}

@Composable
private fun TxDetailSheet(
    tx: TransactionEntity,
    locale: Locale,
    onEdit: () -> Unit,
    onReceipt: () -> Unit,
    onDelete: () -> Unit,
    onDismiss: () -> Unit
) {
    val p = LocalPalette.current
    val typeLabel = when (tx.type) {
        "income" -> stringResource(R.string.tx_type_income)
        "expense" -> stringResource(R.string.tx_type_expense)
        "transfer" -> stringResource(R.string.tx_type_transfer)
        else -> tx.type
    }
    val rows = listOf(
        R.string.tx_detail_amount to RupiahFormat.format(tx.amount),
        R.string.tx_detail_type to typeLabel,
        R.string.tx_detail_account to tx.accountName,
        R.string.tx_detail_to_account to tx.toAccountName,
        R.string.tx_detail_category to tx.categoryName,
        R.string.tx_detail_description to tx.description,
        R.string.tx_detail_merchant to tx.merchant,
        R.string.tx_detail_date to JakartaDate.formatTimestamp(tx.transactionDate, locale),
        R.string.tx_detail_source to tx.source,
        R.string.tx_detail_balance_after to tx.balanceAfter?.let { RupiahFormat.format(it) }
    )
    ModalBottomSheet(onDismissRequest = onDismiss, shape = SheetShape, containerColor = p.bg) {
        Column(Modifier.padding(16.dp).navigationBarsPadding(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(stringResource(R.string.tx_detail_title), style = MaterialTheme.typography.titleLarge)
            HorizontalDivider()
            rows.forEach { (label, value) ->
                if (value != null) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(stringResource(label), color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(
                            value,
                            fontWeight = FontWeight.Medium,
                            textAlign = TextAlign.End,
                            modifier = Modifier.padding(start = 16.dp)
                        )
                    }
                }
            }
            if (!editable(tx)) {
                Text(
                    stringResource(R.string.tx_edit_locked),
                    style = MaterialTheme.typography.bodySmall,
                    color = p.textMute,
                    modifier = Modifier.padding(top = 8.dp)
                )
            }
            if (itemizable(tx)) {
                CapsuleButton(stringResource(R.string.receipt_title), onReceipt, Modifier.fillMaxWidth().padding(top = 8.dp))
            }
            Row(Modifier.fillMaxWidth().padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                DangerButton(stringResource(R.string.tx_delete), onDelete, Modifier.weight(1f), enabled = deletable(tx))
                GradientButton(stringResource(R.string.tx_edit), onEdit, Modifier.weight(1f), enabled = editable(tx))
            }
        }
    }
}

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

@Composable
private fun DeleteErrorDialog(error: SyncError, onDismiss: () -> Unit) {
    val body = when (error) {
        SyncError.Offline -> stringResource(R.string.edit_err_offline)
        else -> stringResource(R.string.add_err_failed, error.message ?: "")
    }
    GlassDialog(
        onDismiss = onDismiss,
        title = stringResource(R.string.tx_delete_failed),
        body = body,
        actions = { GradientButton(stringResource(R.string.common_ok), onDismiss, Modifier.weight(1f)) }
    )
}
