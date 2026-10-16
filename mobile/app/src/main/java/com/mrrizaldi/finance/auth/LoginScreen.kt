package com.mrrizaldi.finance.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mrrizaldi.finance.R
import com.mrrizaldi.finance.ui.components.CapsuleField
import com.mrrizaldi.finance.ui.components.GlassSurface
import com.mrrizaldi.finance.ui.components.GradientButton
import com.mrrizaldi.finance.ui.theme.AppType
import com.mrrizaldi.finance.ui.theme.LocalPalette

private const val FORGOT_PASSWORD_URL = "https://finance-dashboard.mrrizaldi.com/forgot-password"

@Composable
fun LoginScreen(vm: LoginViewModel) {
    val state by vm.state.collectAsStateWithLifecycle()
    val uriHandler = LocalUriHandler.current
    val p = LocalPalette.current

    Column(
        modifier = Modifier
            .fillMaxSize()
            .safeDrawingPadding()
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(stringResource(R.string.app_name), style = AppType.screenTitle)
        Text(stringResource(R.string.login_title), style = MaterialTheme.typography.bodyLarge, color = p.textMute)
        GlassSurface(Modifier.fillMaxWidth().padding(top = 8.dp)) {
            Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                CapsuleField(
                    value = state.email,
                    onValueChange = vm::setEmail,
                    label = stringResource(R.string.login_email),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next)
                )
                CapsuleField(
                    value = state.password,
                    onValueChange = vm::setPassword,
                    label = stringResource(R.string.login_password),
                    error = state.errorRes?.let { stringResource(it) },
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { vm.submit() })
                )
                GradientButton(
                    text = stringResource(R.string.login_submit),
                    onClick = vm::submit,
                    enabled = !state.loading && state.email.isNotBlank() && state.password.isNotBlank()
                )
            }
        }
        TextButton(onClick = { runCatching { uriHandler.openUri(FORGOT_PASSWORD_URL) } }) {
            Text(stringResource(R.string.login_forgot))
        }
    }
}
