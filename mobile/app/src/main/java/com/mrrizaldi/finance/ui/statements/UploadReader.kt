package com.mrrizaldi.finance.ui.statements

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import com.mrrizaldi.finance.data.remote.UploadFile
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private fun displayName(context: Context, uri: Uri, index: Int): String =
    context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) cursor.getString(0) else null
    } ?: "file-${index + 1}"

suspend fun readUploads(context: Context, uris: List<Uri>): List<UploadFile> = withContext(Dispatchers.IO) {
    uris.mapIndexedNotNull { index, uri ->
        runCatching {
            val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: return@runCatching null
            UploadFile(displayName(context, uri, index), bytes)
        }.getOrNull()
    }
}
