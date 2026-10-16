package id.aigra.finance.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import id.aigra.finance.R
import id.aigra.finance.data.local.TransactionEntity
import id.aigra.finance.ui.theme.LocalPalette
import id.aigra.finance.util.RupiahFormat

@Composable
fun TxRow(tx: TransactionEntity, onClick: () -> Unit) {
    val p = LocalPalette.current
    val amountColor = when (tx.type) {
        "income" -> p.positive
        "expense" -> p.negative
        else -> MaterialTheme.colorScheme.onSurface
    }
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
    val subtitle = listOfNotNull(category, tx.accountName, tx.toAccountName?.let { "→ $it" }).joinToString(" · ")

    ListItem(
        modifier = Modifier.clickable(onClick = onClick),
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        headlineContent = { Text(title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        supportingContent = { Text(subtitle, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        leadingContent = {
            Box(Modifier.size(12.dp).background(hexColor(tx.categoryColor, p.accentLine), CircleShape))
        },
        trailingContent = {
            Text(sign + RupiahFormat.format(tx.amount), color = amountColor, fontWeight = FontWeight.SemiBold)
        }
    )
}
