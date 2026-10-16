package com.mrrizaldi.finance.ui.components

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import com.mrrizaldi.finance.ui.theme.AppType
import com.mrrizaldi.finance.ui.theme.LocalGlass
import com.mrrizaldi.finance.ui.theme.LocalPalette

fun Modifier.glassCapsule(fill: Color, border: Color): Modifier =
    clip(CircleShape).background(fill).border(1.dp, border, CircleShape)

@Composable
fun GlassSegmented(options: List<String>, selected: Int, onSelect: (Int) -> Unit, modifier: Modifier = Modifier) {
    val p = LocalPalette.current
    val glass = LocalGlass.current
    BoxWithConstraints(
        modifier.fillMaxWidth().height(44.dp).glassCapsule(glass.tint, glass.edge).padding(4.dp)
    ) {
        val segment = maxWidth / options.size
        val x by animateDpAsState(
            segment * selected,
            spring(dampingRatio = 0.8f, stiffness = Spring.StiffnessMediumLow),
            label = "segmen"
        )
        Box(
            Modifier
                .offset { IntOffset(x.roundToPx(), 0) }
                .width(segment)
                .fillMaxHeight()
                .clip(CircleShape)
                .background(p.textHi)
        )
        Row(Modifier.fillMaxSize().selectableGroup()) {
            options.forEachIndexed { i, label ->
                Box(
                    Modifier
                        .weight(1f)
                        .fillMaxHeight()
                        .clip(CircleShape)
                        .selectable(selected = i == selected, role = Role.Tab, onClick = { onSelect(i) }),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        label,
                        style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold),
                        color = if (i == selected) p.bg else p.textHi
                    )
                }
            }
        }
    }
}

@Composable
fun CapsuleButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val glass = LocalGlass.current
    Box(
        modifier
            .height(48.dp)
            .glassCapsule(glass.tint, glass.edge)
            .clickable(role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Text(text, style = AppType.rowTitle, color = LocalPalette.current.textHi)
    }
}

@Composable
fun CheckRow(text: String, checked: Boolean, onCheckedChange: (Boolean) -> Unit, modifier: Modifier = Modifier) {
    val p = LocalPalette.current
    val glass = LocalGlass.current
    Row(
        modifier
            .fillMaxWidth()
            .height(48.dp)
            .glassCapsule(glass.tint, glass.edge)
            .toggleable(value = checked, role = Role.Checkbox, onValueChange = onCheckedChange)
            .padding(horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Checkbox(
            checked = checked,
            onCheckedChange = null,
            colors = CheckboxDefaults.colors(
                checkedColor = p.primary,
                uncheckedColor = p.textMute,
                checkmarkColor = p.primaryFg
            ),
            modifier = Modifier.padding(start = 6.dp)
        )
        Text(text, style = AppType.rowTitle, color = p.textHi, modifier = Modifier.padding(start = 12.dp))
    }
}
