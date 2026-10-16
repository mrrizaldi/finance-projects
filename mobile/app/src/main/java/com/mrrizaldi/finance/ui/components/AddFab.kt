package com.mrrizaldi.finance.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import com.mrrizaldi.finance.R
import com.mrrizaldi.finance.ui.icons.AppIcons
import com.mrrizaldi.finance.ui.theme.LocalGlass

@Composable
fun AddFab(onClick: () -> Unit, modifier: Modifier = Modifier) {
    val glass = LocalGlass.current
    Box(
        modifier
            .size(56.dp)
            .shadow(12.dp, CircleShape, ambientColor = glass.fabShadow, spotColor = glass.fabShadow)
            .clip(CircleShape)
            .background(Brush.verticalGradient(listOf(glass.fabTop, glass.fabBottom)))
            .clickable(role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Icon(AppIcons.Plus, stringResource(R.string.nav_add), tint = glass.fabIcon)
    }
}
