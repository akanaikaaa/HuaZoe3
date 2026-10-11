package com.healthtrack.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp

/** Dependency-free line chart. Optional shaded reference range. */
@Composable
fun LineChart(title: String, values: List<Double>, modifier: Modifier = Modifier, refLow: Double? = null, refHigh: Double? = null, color: Color = Color(0xFF533E64)) {
    Column(modifier.padding(vertical = 6.dp)) {
        Text(title, style = MaterialTheme.typography.titleSmall)
        if (values.size < 2) {
            Text(if (values.isEmpty()) "No data yet" else "Latest: ${values.last()}", style = MaterialTheme.typography.bodySmall)
            return@Column
        }
        Canvas(Modifier.fillMaxWidth().height(120.dp)) {
            val lo = minOf(values.min(), refLow ?: Double.MAX_VALUE)
            val hi = maxOf(values.max(), refHigh ?: Double.MIN_VALUE)
            val span = (hi - lo).takeIf { it > 0 } ?: 1.0
            fun y(v: Double) = (size.height - ((v - lo) / span * size.height)).toFloat()
            if (refLow != null && refHigh != null) {
                drawRect(Color(0x44A8C1C1), topLeft = Offset(0f, y(refHigh)), size = androidx.compose.ui.geometry.Size(size.width, y(refLow) - y(refHigh)))
            }
            val step = size.width / (values.size - 1)
            val path = Path()
            values.forEachIndexed { i, v -> if (i == 0) path.moveTo(0f, y(v)) else path.lineTo(i * step, y(v)) }
            drawPath(path, color, style = Stroke(width = 4f))
            values.forEachIndexed { i, v -> drawCircle(color, 6f, Offset(i * step, y(v))) }
        }
    }
}
