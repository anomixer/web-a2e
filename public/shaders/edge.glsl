// Edge overlay fragment shader
// Renders the screen edge highlight as a separate pass so it is
// completely unaffected by CRT effects (scanlines, shadow mask, etc.).
// Uses stable coordinates (no jitter / horizontal sync distortion).

precision highp float;

uniform float u_curvature;
uniform float u_cornerRadius;
uniform float u_edgeHighlight;
uniform vec2 u_textureSize;
uniform vec2 u_resolution;

varying vec2 v_texCoord;

// Screen curvature (must match crt.glsl)
vec2 curveUV(vec2 uv) {
    if (u_curvature < 0.001) return uv;

    vec2 cc = uv - 0.5;
    float dist = dot(cc, cc);
    float distortion = dist * u_curvature * 0.5;
    return uv + cc * distortion;
}

// Rounded rectangle alpha (must match crt.glsl)
float roundedRectAlpha(vec2 uv, float radius) {
    if (radius < 0.001) return 1.0;

    vec2 centered = abs(uv - 0.5);
    vec2 cornerDist = centered - (0.5 - radius);

    if (cornerDist.x < 0.0 || cornerDist.y < 0.0) {
        return 1.0;
    }

    float dist = length(cornerDist);
    return 1.0 - smoothstep(radius - 0.005, radius + 0.005, dist);
}

// Edge highlight with uniform screen-pixel width and anti-aliasing.
// Computes the gradient direction of the distance field so that line
// width and AA are expressed in output pixels regardless of whether
// the fragment sits on a straight edge or a corner arc.
float edgeHighlightIntensity(vec2 uv, float radius) {
    if (u_edgeHighlight < 0.001) return 0.0;

    vec2 centered = abs(uv - 0.5);
    vec2 cornerDist = centered - (0.5 - radius);

    float distFromEdge;
    vec2 gradDir; // unit-length gradient direction in UV space

    if (cornerDist.x > 0.0 && cornerDist.y > 0.0) {
        // Corner arc
        float d = length(cornerDist);
        distFromEdge = radius - d;
        gradDir = cornerDist / d;
    } else if (0.5 - centered.x < 0.5 - centered.y) {
        // Nearest to a vertical edge (left / right)
        distFromEdge = 0.5 - centered.x;
        gradDir = vec2(1.0, 0.0);
    } else {
        // Nearest to a horizontal edge (top / bottom)
        distFromEdge = 0.5 - centered.y;
        gradDir = vec2(0.0, 1.0);
    }

    // Convert pixel counts to UV-space distances along the gradient.
    // length(gradDir / u_resolution) gives UV units per output pixel
    // in the direction perpendicular to the edge.
    float uvPerPixel = length(gradDir / u_resolution);
    float lineWidth = 2.5 * uvPerPixel;
    float aa = 0.75 * uvPerPixel;

    // Anti-aliased line: smoothstep at both inner and outer boundaries
    float outer = smoothstep(-aa, aa, distFromEdge);
    float inner = smoothstep(lineWidth + aa, lineWidth - aa, distFromEdge);

    return outer * inner * u_edgeHighlight;
}

void main() {
    // Use raw texture coordinates with only curvature applied.
    // No jitter or horizontal sync — the edge stays perfectly stable.
    vec2 curvedUV = curveUV(v_texCoord);

    // Outside the rounded rectangle — fully transparent
    float cornerAlpha = roundedRectAlpha(curvedUV, u_cornerRadius);
    if (cornerAlpha < 0.001) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
        return;
    }

    // Edge highlight
    float edgeGlow = edgeHighlightIntensity(curvedUV, u_cornerRadius);
    if (edgeGlow < 0.001) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
        return;
    }

    // Separate the line shape (0–1) from the brightness.
    // Use the shape as alpha so the line is fully opaque where it exists
    // and fades only at its own anti-aliased boundaries — not at the
    // rounded-rect corner alpha which would dim the corner arcs.
    float lineAlpha = edgeGlow / u_edgeHighlight;
    vec3 highlightColor = vec3(0.55, 0.55, 0.5) * u_edgeHighlight;
    gl_FragColor = vec4(highlightColor, lineAlpha);
}
