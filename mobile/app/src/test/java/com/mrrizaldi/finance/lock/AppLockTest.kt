package com.mrrizaldi.finance.lock

import android.content.SharedPreferences
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import java.lang.reflect.Proxy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AppLockTest {
    private val now = 1_000_000L

    @Test
    fun `cold start dikunci`() {
        assertTrue(shouldLock(enabled = true, available = true, stoppedAt = null, now = now))
    }

    @Test
    fun `kunci cuma kalau background lebih dari 60 detik`() {
        assertFalse(shouldLock(true, true, now - 30_000, now))
        assertFalse(shouldLock(true, true, now - 60_000, now))
        assertTrue(shouldLock(true, true, now - 60_001, now))
    }

    @Test
    fun `dimatiin atau gak tersedia gak pernah dikunci`() {
        assertFalse(shouldLock(enabled = false, available = true, stoppedAt = null, now = now))
        assertFalse(shouldLock(enabled = true, available = false, stoppedAt = null, now = now))
        assertFalse(shouldLock(enabled = true, available = false, stoppedAt = now - 120_000, now = now))
    }

    @Test
    fun `toggle default nyala dan tersimpan di prefs`() {
        val store = mutableMapOf<String, Boolean>()
        assertTrue(AppLock(fakePrefs(store), { true }).enabled)
        AppLock(fakePrefs(store), { true }).enabled = false
        assertFalse(AppLock(fakePrefs(store), { true }).enabled)
        assertEquals(mapOf("enabled" to false), store)
    }

    @Test
    fun `tiap kunci baru bikin token baru, background singkat gak`() {
        var t = now
        val lock = AppLock(fakePrefs(mutableMapOf()), { true }) { t }
        lock.onStart(owner)
        assertEquals(now, lock.lockedAt.value)
        lock.onStop(owner)
        t += 30_000
        lock.onStart(owner)
        assertEquals(now, lock.lockedAt.value)
        lock.onStop(owner)
        t += 65_000
        lock.onStart(owner)
        assertEquals(t, lock.lockedAt.value)
        lock.unlock()
        assertNull(lock.lockedAt.value)
        lock.onStop(owner)
        t += 30_000
        lock.onStart(owner)
        assertNull(lock.lockedAt.value)
    }

    @Test
    fun `toggle mati gak pernah ngunci`() {
        var t = now
        val lock = AppLock(fakePrefs(mutableMapOf("enabled" to false)), { true }) { t }
        lock.onStart(owner)
        lock.onStop(owner)
        t += 120_000
        lock.onStart(owner)
        assertNull(lock.lockedAt.value)
        lock.enabled = true
        lock.onStop(owner)
        t += 120_000
        lock.onStart(owner)
        assertNotNull(lock.lockedAt.value)
    }

    private val owner = object : LifecycleOwner {
        override val lifecycle: Lifecycle get() = error("unused")
    }

    private fun fakePrefs(store: MutableMap<String, Boolean>): SharedPreferences {
        lateinit var editor: SharedPreferences.Editor
        editor = Proxy.newProxyInstance(javaClass.classLoader, arrayOf(SharedPreferences.Editor::class.java)) { _, m, a ->
            when (m.name) {
                "putBoolean" -> { store[a[0] as String] = a[1] as Boolean; editor }
                "apply" -> Unit
                else -> error(m.name)
            }
        } as SharedPreferences.Editor
        return Proxy.newProxyInstance(javaClass.classLoader, arrayOf(SharedPreferences::class.java)) { _, m, a ->
            when (m.name) {
                "getBoolean" -> store[a[0] as String] ?: a[1]
                "edit" -> editor
                else -> error(m.name)
            }
        } as SharedPreferences
    }
}
