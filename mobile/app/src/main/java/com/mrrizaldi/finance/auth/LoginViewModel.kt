package com.mrrizaldi.finance.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mrrizaldi.finance.R
import com.mrrizaldi.finance.data.remote.SupabaseApi
import io.github.jan.supabase.exceptions.RestException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class LoginState(
    val email: String = "",
    val password: String = "",
    val loading: Boolean = false,
    val errorRes: Int? = null
)

class LoginViewModel(private val api: SupabaseApi) : ViewModel() {
    private val _state = MutableStateFlow(LoginState())
    val state: StateFlow<LoginState> = _state

    fun setEmail(value: String) = _state.update { it.copy(email = value, errorRes = null) }

    fun setPassword(value: String) = _state.update { it.copy(password = value, errorRes = null) }

    fun submit() {
        val s = _state.value
        if (s.loading || s.email.isBlank() || s.password.isBlank()) return
        _state.update { it.copy(loading = true, errorRes = null) }
        viewModelScope.launch {
            val error = try {
                api.signIn(s.email.trim(), s.password)
                null
            } catch (e: CancellationException) {
                throw e
            } catch (e: RestException) {
                if (e.statusCode in 400..499) R.string.login_error else R.string.login_error_network
            } catch (e: Exception) {
                R.string.login_error_network
            }
            _state.update { it.copy(loading = false, errorRes = error) }
        }
    }
}
