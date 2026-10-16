package id.aigra.finance.ui.components

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.OffsetMapping
import androidx.compose.ui.text.input.TransformedText
import androidx.compose.ui.text.input.VisualTransformation
import id.aigra.finance.util.RupiahFormat

@Composable
fun AmountField(digits: String, onChange: (String) -> Unit, label: String, modifier: Modifier = Modifier) {
    OutlinedTextField(
        value = digits,
        onValueChange = { onChange(RupiahFormat.digitsOf(it)) },
        label = { Text(label) },
        prefix = { Text("Rp ") },
        visualTransformation = RupiahVisualTransformation,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        singleLine = true,
        modifier = modifier.fillMaxWidth()
    )
}

object RupiahVisualTransformation : VisualTransformation {
    override fun filter(text: AnnotatedString): TransformedText {
        val digits = text.text
        val out = RupiahFormat.group(digits)
        val mapping = object : OffsetMapping {
            override fun originalToTransformed(offset: Int): Int {
                if (digits.isEmpty()) return 0
                val remaining = digits.length - offset
                val dotsAfter = (remaining - 1).coerceAtLeast(0) / 3
                return out.length - remaining - dotsAfter
            }

            override fun transformedToOriginal(offset: Int): Int =
                offset - out.take(offset.coerceAtMost(out.length)).count { it == '.' }
        }
        return TransformedText(AnnotatedString(out), mapping)
    }
}
