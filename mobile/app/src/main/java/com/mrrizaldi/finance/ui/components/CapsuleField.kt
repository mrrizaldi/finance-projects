package com.mrrizaldi.finance.ui.components

import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import com.mrrizaldi.finance.ui.theme.AppType
import com.mrrizaldi.finance.ui.theme.LocalGlass
import com.mrrizaldi.finance.ui.theme.LocalPalette

@Composable
fun CapsuleField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    readOnly: Boolean = false,
    error: String? = null,
    prefix: (@Composable () -> Unit)? = null,
    trailingIcon: (@Composable () -> Unit)? = null,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    keyboardActions: KeyboardActions = KeyboardActions.Default
) {
    val p = LocalPalette.current
    val glass = LocalGlass.current
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    val border = when {
        error != null -> p.negative
        focused -> p.primary
        else -> glass.edge
    }
    Column(modifier.fillMaxWidth()) {
        TextField(
            value = value,
            onValueChange = onValueChange,
            label = { Text(label) },
            readOnly = readOnly,
            isError = error != null,
            prefix = prefix,
            trailingIcon = trailingIcon,
            visualTransformation = visualTransformation,
            keyboardOptions = keyboardOptions,
            keyboardActions = keyboardActions,
            singleLine = true,
            shape = CircleShape,
            interactionSource = interaction,
            textStyle = AppType.rowTitle,
            colors = TextFieldDefaults.colors(
                focusedContainerColor = Color.Transparent,
                unfocusedContainerColor = Color.Transparent,
                disabledContainerColor = Color.Transparent,
                errorContainerColor = Color.Transparent,
                focusedIndicatorColor = Color.Transparent,
                unfocusedIndicatorColor = Color.Transparent,
                disabledIndicatorColor = Color.Transparent,
                errorIndicatorColor = Color.Transparent,
                focusedTextColor = p.textHi,
                unfocusedTextColor = p.textHi,
                errorTextColor = p.textHi,
                focusedLabelColor = p.textMute,
                unfocusedLabelColor = p.textMute,
                errorLabelColor = p.negative,
                focusedPrefixColor = p.textMute,
                unfocusedPrefixColor = p.textMute,
                errorPrefixColor = p.textMute,
                focusedTrailingIconColor = p.textMute,
                unfocusedTrailingIconColor = p.textMute,
                errorTrailingIconColor = p.negative,
                cursorColor = p.primary,
                errorCursorColor = p.negative
            ),
            modifier = Modifier.fillMaxWidth().glassCapsule(glass.tint, border)
        )
        if (error != null) {
            Text(
                error,
                style = AppType.rowMeta,
                color = p.negative,
                modifier = Modifier.padding(start = 20.dp, top = 4.dp, end = 20.dp)
            )
        }
    }
}
