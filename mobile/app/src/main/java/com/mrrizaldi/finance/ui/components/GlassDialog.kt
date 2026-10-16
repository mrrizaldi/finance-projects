package com.mrrizaldi.finance.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.mrrizaldi.finance.ui.theme.AppType
import com.mrrizaldi.finance.ui.theme.LocalGlass
import com.mrrizaldi.finance.ui.theme.LocalPalette

private val DialogShape = RoundedCornerShape(28.dp)

@Composable
fun GlassDialog(
    onDismiss: () -> Unit,
    actions: @Composable RowScope.() -> Unit,
    modifier: Modifier = Modifier,
    title: String? = null,
    body: String? = null,
    content: @Composable ColumnScope.() -> Unit = {}
) {
    val p = LocalPalette.current
    val glass = LocalGlass.current
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Column(
            modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp)
                .clip(DialogShape)
                .background(p.surface)
                .background(glass.tint)
                .border(1.dp, glass.edge, DialogShape)
                .padding(top = if (title != null) 24.dp else 8.dp, bottom = 16.dp)
        ) {
            if (title != null) {
                Text(
                    title,
                    style = MaterialTheme.typography.titleLarge.copy(
                        fontSize = 20.sp,
                        lineHeight = 26.sp,
                        fontWeight = FontWeight.SemiBold
                    ),
                    color = p.textHi,
                    modifier = Modifier.padding(horizontal = 24.dp)
                )
            }
            if (body != null) {
                Text(
                    body,
                    style = MaterialTheme.typography.bodyMedium,
                    color = p.textMute,
                    modifier = Modifier.padding(horizontal = 24.dp).padding(top = 8.dp)
                )
            }
            content()
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 16.dp).padding(top = 20.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
                content = actions
            )
        }
    }
}

@Composable
fun DangerButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val p = LocalPalette.current
    DialogButton(text, onClick, modifier, p.negativeSoft, p.negative.copy(alpha = 0.35f), p.negative)
}

@Composable
fun CancelButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val p = LocalPalette.current
    DialogButton(text, onClick, modifier, p.surfaceHi, LocalGlass.current.edge, p.textHi)
}

@Composable
private fun DialogButton(text: String, onClick: () -> Unit, modifier: Modifier, fill: Color, edge: Color, color: Color) {
    Box(
        modifier
            .height(52.dp)
            .clip(CircleShape)
            .background(fill)
            .border(1.dp, edge, CircleShape)
            .clickable(role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Text(text, style = AppType.rowTitle.copy(fontWeight = FontWeight.SemiBold), color = color)
    }
}
