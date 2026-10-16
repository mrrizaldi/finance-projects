package com.mrrizaldi.finance.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.mrrizaldi.finance.R
import com.mrrizaldi.finance.data.local.TransactionEntity
import com.mrrizaldi.finance.ui.theme.AppType
import com.mrrizaldi.finance.ui.theme.LocalPalette
import com.mrrizaldi.finance.util.JakartaDate
import com.mrrizaldi.finance.util.RupiahFormat

@Composable
fun TxRow(tx: TransactionEntity, onClick: () -> Unit) {
    val p = LocalPalette.current
    val sign = when (tx.type) {
        "income" -> "+"
        "expense" -> "-"
        else -> ""
    }
    val title = tx.description ?: tx.merchant ?: tx.categoryName ?: stringResource(R.string.tx_uncategorized)
    val category = when {
        tx.isAdjustment -> stringResource(R.string.tx_adjustment)
        tx.type == "transfer" -> stringResource(R.string.tx_type_transfer)
        else -> tx.categoryName ?: stringResource(R.string.tx_uncategorized)
    }
    val subtitle = listOfNotNull(
        category,
        tx.accountName,
        tx.toAccountName?.let { "→ $it" },
        JakartaDate.formatTime(tx.transactionDate)
    ).joinToString(" · ")

    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, style = AppType.rowTitle, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                subtitle,
                style = AppType.rowMeta,
                color = p.textMute,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = 2.dp)
            )
        }
        Text(
            sign + RupiahFormat.format(tx.amount),
            style = AppType.rowAmount,
            color = if (tx.type == "income") p.positive else p.textHi,
            modifier = Modifier.padding(start = 12.dp)
        )
    }
}
