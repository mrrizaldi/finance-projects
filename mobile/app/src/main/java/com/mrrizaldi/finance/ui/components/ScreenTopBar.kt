package com.mrrizaldi.finance.ui.components

import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mrrizaldi.finance.R
import com.mrrizaldi.finance.ui.icons.AppIcons
import com.mrrizaldi.finance.ui.theme.AppType
import com.mrrizaldi.finance.ui.theme.LocalPalette

@Composable
fun ScreenTopBar(
    title: String,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    trailing: (@Composable () -> Unit)? = null
) {
    val palette = LocalPalette.current
    val interaction = remember { MutableInteractionSource() }
    Box(modifier.fillMaxWidth().height(56.dp)) {
        GlassSurface(
            Modifier
                .align(Alignment.CenterStart)
                .pressScale(interaction)
                .size(44.dp)
                .clickable(
                    interactionSource = interaction,
                    indication = LocalIndication.current,
                    role = Role.Button,
                    onClick = onBack
                ),
            shape = CircleShape
        ) {
            Icon(
                AppIcons.Back,
                stringResource(R.string.common_back),
                tint = palette.textHi,
                modifier = Modifier.align(Alignment.Center).size(22.dp)
            )
        }
        Text(
            title,
            style = AppType.rowTitle.copy(fontSize = 17.sp, lineHeight = 22.sp, fontWeight = FontWeight.SemiBold),
            color = palette.textHi,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.align(Alignment.Center).padding(horizontal = 56.dp).semantics { heading() }
        )
        Box(Modifier.align(Alignment.CenterEnd).size(44.dp), contentAlignment = Alignment.Center) {
            trailing?.invoke()
        }
    }
}
