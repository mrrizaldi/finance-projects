package com.mrrizaldi.finance.lock

import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import androidx.biometric.BiometricManager
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

const val LOCK_TIMEOUT_MS = 60_000L

const val APP_LOCK_AUTHENTICATORS =
    BiometricManager.Authenticators.BIOMETRIC_STRONG or BiometricManager.Authenticators.DEVICE_CREDENTIAL

fun shouldLock(enabled: Boolean, available: Boolean, stoppedAt: Long?, now: Long): Boolean =
    enabled && available && (stoppedAt == null || now - stoppedAt > LOCK_TIMEOUT_MS)

class AppLock(
    private val prefs: SharedPreferences,
    private val canAuthenticate: () -> Boolean,
    private val clock: () -> Long = System::currentTimeMillis
) : DefaultLifecycleObserver {
    constructor(context: Context) : this(
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE),
        {
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.R &&
                BiometricManager.from(context).canAuthenticate(APP_LOCK_AUTHENTICATORS) ==
                BiometricManager.BIOMETRIC_SUCCESS
        }
    )

    private var stoppedAt: Long? = null
    private val _lockedAt = MutableStateFlow<Long?>(null)
    val lockedAt: StateFlow<Long?> = _lockedAt

    var enabled: Boolean
        get() = prefs.getBoolean(KEY_ENABLED, true)
        set(value) {
            prefs.edit().putBoolean(KEY_ENABLED, value).apply()
        }

    fun available(): Boolean = canAuthenticate()

    fun unlock() {
        _lockedAt.value = null
    }

    override fun onStart(owner: LifecycleOwner) {
        val now = clock()
        if (shouldLock(enabled, available(), stoppedAt, now)) _lockedAt.value = now
    }

    override fun onStop(owner: LifecycleOwner) {
        stoppedAt = clock()
    }

    private companion object {
        const val PREFS = "app_lock"
        const val KEY_ENABLED = "enabled"
    }
}
