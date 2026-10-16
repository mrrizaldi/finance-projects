package com.mrrizaldi.finance.ui.components

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import com.mrrizaldi.finance.R
import com.mrrizaldi.finance.ui.icons.AppIcons
import com.mrrizaldi.finance.ui.theme.LocalGlass
import com.mrrizaldi.finance.ui.theme.LocalPalette

enum class Tab(val route: String, val label: Int, val icon: ImageVector, val activeIcon: ImageVector) {
    HOME("home", R.string.nav_home, AppIcons.Home, AppIcons.HomeActive),
    TRANSACTIONS("transactions", R.string.nav_transactions, AppIcons.List, AppIcons.ListActive),
    BALANCES("balances", R.string.nav_balances, AppIcons.Wallet, AppIcons.WalletActive),
    MORE("more", R.string.nav_more, AppIcons.Profile, AppIcons.ProfileActive)
}

val NavBarClearance = 88.dp

private val PillWidth = 52.dp
private val PillHeight = 40.dp

@Composable
fun FloatingNavBar(current: String?, onSelect: (Tab) -> Unit, modifier: Modifier = Modifier) {
    val glass = LocalGlass.current
    val idle = LocalPalette.current.textHi.copy(alpha = 0.5f)
    val index = Tab.entries.indexOfFirst { it.route == current }
    GlassSurface(modifier.height(56.dp), shape = CircleShape) {
        BoxWithConstraints(Modifier.fillMaxSize().padding(horizontal = 4.dp)) {
            val slot = maxWidth / Tab.entries.size
            val pillX by animateDpAsState(
                targetValue = slot * index.coerceAtLeast(0) + (slot - PillWidth) / 2,
                animationSpec = spring(dampingRatio = 0.75f, stiffness = Spring.StiffnessMediumLow),
                label = "navPill"
            )
            if (index >= 0) {
                Box(
                    Modifier
                        .align(Alignment.CenterStart)
                        .offset(x = pillX)
                        .size(PillWidth, PillHeight)
                        .background(glass.navPill, CircleShape)
                )
            }
            Row(Modifier.fillMaxSize()) {
                Tab.entries.forEach { tab ->
                    val selected = tab.route == current
                    Box(
                        Modifier
                            .weight(1f)
                            .fillMaxHeight()
                            .selectable(
                                selected = selected,
                                interactionSource = null,
                                indication = null,
                                role = Role.Tab,
                                onClick = { onSelect(tab) }
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            if (selected) tab.activeIcon else tab.icon,
                            stringResource(tab.label),
                            tint = if (selected) glass.navIcon else idle
                        )
                    }
                }
            }
        }
    }
}
