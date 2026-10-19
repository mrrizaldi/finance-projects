package com.mrrizaldi.finance

import com.mrrizaldi.finance.data.remote.NotificationDto
import com.mrrizaldi.finance.sync.latestCreatedAt
import org.junit.Assert.assertEquals
import org.junit.Test

class NotifPollTest {
    private fun dto(id: String, createdAt: String) =
        NotificationDto(id = id, kind = "tx_baru", title = "t", body = "b", createdAt = createdAt, readAt = null)

    @Test
    fun `daftar kosong mempertahankan penanda lama`() {
        assertEquals("2026-10-19T00:00:00Z", latestCreatedAt(emptyList(), "2026-10-19T00:00:00Z"))
    }

    @Test
    fun `ambil created_at terbesar`() {
        val rows = listOf(
            dto("a", "2026-10-19T01:00:00Z"),
            dto("b", "2026-10-19T03:00:00Z"),
            dto("c", "2026-10-19T02:00:00Z"),
        )
        assertEquals("2026-10-19T03:00:00Z", latestCreatedAt(rows, "2026-10-19T00:00:00Z"))
    }

    @Test
    fun `created_at kembar tidak bikin mundur`() {
        val rows = listOf(dto("a", "2026-10-19T03:00:00Z"), dto("b", "2026-10-19T03:00:00Z"))
        assertEquals("2026-10-19T03:00:00Z", latestCreatedAt(rows, "2026-10-19T02:00:00Z"))
    }
}
