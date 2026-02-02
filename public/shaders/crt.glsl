// Fragment shader with comprehensive CRT effects
// Inspired by cool-retro-term (https://github.com/Swordfish90/cool-retro-term)

precision highp float;

uniform sampler2D u_texture;
uniform sampler2D u_burnInTexture;
uniform sampler2D u_selectionTexture;
uniform vec2 u_resolution;
uniform vec2 u_textureSize;
uniform float u_time;

// CRT effect uniforms
uniform float u_curvature;
uniform float u_scanlineIntensity;
uniform float u_scanlineWidth;
uniform float u_shadowMask;
uniform float u_glowIntensity;
uniform float u_glowSpread;
uniform float u_brightness;
uniform float u_contrast;
uniform float u_saturation;
uniform float u_vignette;
uniform float u_flicker;
uniform float u_rgbOffset;

// New effect uniforms
uniform float u_staticNoise;
uniform float u_jitter;
uniform float u_horizontalSync;
uniform float u_glowingLine;
uniform float u_ambientLight;
uniform float u_burnIn;
uniform float u_overscan;
uniform float u_noSignal;

// NTSC fringing effect
uniform float u_ntscFringing;

// Monochrome mode (0=color, 1=green, 2=amber, 3=white)
uniform int u_monochromeMode;

// Corner radius for rounded screen corners
uniform float u_cornerRadius;

// Beam position crosshair overlay (-1.0 = off, 0.0–1.0 = normalized position)
uniform float u_beamY;
uniform float u_beamX;

// Screen margin/padding for rounded corners (content is inset by this amount)
uniform float u_screenMargin;

varying vec2 v_texCoord;

// Constants
const float PI = 3.14159265359;

// ============================================
// Utility functions
// ============================================

float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float rgb2grey(vec3 v) {
    return dot(v, vec3(0.21, 0.72, 0.07));
}

// ============================================
// Screen overscan/border
// ============================================

vec2 applyOverscan(vec2 uv) {
    if (u_overscan < 0.001) return uv;

    // Scale UV coordinates inward to create a border
    // overscan of 1.0 = 10% border on each side (content fills 80% of screen)
    float borderSize = u_overscan * 0.1;
    float scale = 1.0 - (borderSize * 2.0);

    // Scale from center
    vec2 centered = uv - 0.5;
    vec2 scaled = centered / scale;
    return scaled + 0.5;
}

// ============================================
// Screen curvature (pincushion distortion)
// ============================================

vec2 curveUV(vec2 uv) {
    if (u_curvature < 0.001) return uv;

    vec2 cc = uv - 0.5;
    float dist = dot(cc, cc);
    float distortion = dist * u_curvature * 0.5;
    vec2 curved = uv + cc * distortion;

    return curved;
}

// ============================================
// Horizontal sync distortion
// ============================================

vec2 applyHorizontalSync(vec2 uv, float time) {
    if (u_horizontalSync < 0.001) return uv;

    float randVal = hash12(vec2(floor(time * 0.5), 0.0));
    if (randVal > u_horizontalSync) return uv;

    float distortionFreq = mix(4.0, 40.0, hash12(vec2(time * 0.1, 1.0)));
    float distortionScale = u_horizontalSync * 0.02 * randVal;
    float wave = sin((uv.y + time * 0.01) * distortionFreq);
    uv.x += wave * distortionScale;

    return uv;
}

// ============================================
// Jitter effect
// ============================================

vec2 applyJitter(vec2 uv, float time) {
    if (u_jitter < 0.001) return uv;

    vec2 noiseCoord = uv * 100.0 + vec2(time * 10.0, time * 7.0);
    vec2 offset = vec2(
        hash12(noiseCoord) - 0.5,
        hash12(noiseCoord + vec2(100.0, 0.0)) - 0.5
    );

    return uv + offset * u_jitter * 0.005;
}

// ============================================
// Static noise effect (TV static style)
// ============================================

float staticNoise(vec2 uv, float time) {
    if (u_staticNoise < 0.001) return 0.0;

    // Blocky TV static - sized for authentic CRT look
    vec2 blockSize = vec2(2.0, 2.0);
    vec2 pixelCoord = floor(uv * u_textureSize / blockSize);

    // Animate the noise - change every frame
    vec2 noiseCoord = pixelCoord + vec2(
        floor(time * 30.0) * 17.0,
        floor(time * 30.0) * 31.0
    );

    float noise = hash12(noiseCoord);

    // Add some scanline-like horizontal banding for authenticity
    float scanBand = hash12(vec2(pixelCoord.y, floor(time * 15.0)));
    noise = mix(noise, scanBand, 0.3);

    // Slight vignette on the noise
    vec2 cc = uv - 0.5;
    float dist = length(cc);
    float vignette = 1.0 - dist * 0.5;

    return noise * u_staticNoise * vignette;
}

// ============================================
// No signal TV static (full screen)
// ============================================

vec3 noSignalStatic(vec2 uv, float time) {
    // Blocky TV static - sized for authentic CRT look
    vec2 blockSize = vec2(2.0, 2.0);
    vec2 pixelCoord = floor(uv * u_textureSize / blockSize);

    // Animate for that classic TV static feel
    float frameTime = floor(time * 50.0);
    vec2 noiseCoord = pixelCoord + vec2(frameTime * 17.0, frameTime * 31.0);

    // Base noise
    float noise = hash12(noiseCoord);

    // Horizontal banding - occasional brighter/darker scanlines
    float bandNoise = hash12(vec2(pixelCoord.y * 0.1, frameTime * 0.5));
    float band = smoothstep(0.4, 0.7, bandNoise);
    noise = mix(noise * 0.7, noise * 1.2, band);

    // Occasional horizontal interference lines
    float lineNoise = hash12(vec2(frameTime, 0.0));
    if (lineNoise > 0.95) {
        float lineY = hash12(vec2(frameTime, 1.0));
        float lineDist = abs(uv.y - lineY);
        if (lineDist < 0.02) {
            noise = mix(noise, 1.0, (0.02 - lineDist) / 0.02 * 0.5);
        }
    }

    // Slight brightness variation over time
    float brightnessFlicker = 0.85 + hash12(vec2(frameTime * 0.1, 0.0)) * 0.3;
    noise *= brightnessFlicker;

    // Vignette
    vec2 cc = uv - 0.5;
    float dist = length(cc);
    float vignette = 1.0 - dist * 0.0;
    noise *= vignette;

    // Clamp and return grayscale - reduced brightness for less dazzling effect
    noise = clamp(noise, 0.0, 1.0) * 0.25;
    return vec3(noise);
}

// ============================================
// Flicker effect
// ============================================

float flicker(float time) {
    if (u_flicker < 0.001) return 1.0;

    float noiseVal = hash12(vec2(floor(time * 15.0), 0.0));
    return 1.0 + (noiseVal - 0.5) * u_flicker * 0.15;
}

// ============================================
// Glowing line effect (scanning beam)
// ============================================

float glowingLine(vec2 uv, float time) {
    if (u_glowingLine < 0.001) return 0.0;

    float beamPos = fract(time * 0.05);
    float dist = abs(uv.y - beamPos);
    float glow = smoothstep(0.1, 0.0, dist);

    return glow * u_glowingLine * 0.3;
}

// ============================================
// Ambient light effect
// ============================================

vec3 applyAmbientLight(vec3 color, vec2 uv) {
    if (u_ambientLight < 0.001) return color;

    vec2 cc = uv - 0.5;
    float dist = length(cc);
    float ambient = (1.0 - dist) * (1.0 - dist);

    return color + vec3(u_ambientLight * ambient * 0.15);
}

// ============================================
// Scanline effect
// ============================================

float scanlines(vec2 uv) {
    if (u_scanlineIntensity < 0.001) return 1.0;

    float scanline = sin(uv.y * u_textureSize.y * PI) * 0.5 + 0.5;
    scanline = pow(scanline, u_scanlineWidth * 2.0 + 0.5);
    return mix(1.0, scanline, u_scanlineIntensity);
}

// ============================================
// Shadow mask
// ============================================

vec3 shadowMask(vec2 uv) {
    if (u_shadowMask < 0.001) return vec3(1.0);

    vec2 pos = uv * u_resolution;
    int px = int(mod(pos.x, 3.0));

    vec3 mask;
    if (px == 0) {
        mask = vec3(1.0, 0.7, 0.7);
    } else if (px == 1) {
        mask = vec3(0.7, 1.0, 0.7);
    } else {
        mask = vec3(0.7, 0.7, 1.0);
    }

    return mix(vec3(1.0), mask, u_shadowMask);
}

// ============================================
// Vignette effect
// ============================================

float vignette(vec2 uv) {
    if (u_vignette < 0.001) return 1.0;

    vec2 center = uv - 0.5;
    float dist = length(center);
    float vig = 1.0 - dist * dist * u_vignette * 2.0;
    return clamp(vig, 0.0, 1.0);
}

// ============================================
// Phosphor glow / bloom effect
// ============================================

vec3 glow(sampler2D tex, vec2 uv) {
    if (u_glowIntensity < 0.001) return vec3(0.0);

    vec3 bloom = vec3(0.0);
    float spread = u_glowSpread * 0.01;

    for (int x = -1; x <= 1; x++) {
        for (int y = -1; y <= 1; y++) {
            vec2 offset = vec2(float(x), float(y)) * spread;
            bloom += texture2D(tex, uv + offset).rgb;
        }
    }
    bloom /= 9.0;

    return bloom * u_glowIntensity;
}

// ============================================
// RGB chromatic aberration
// ============================================

vec3 rgbShift(sampler2D tex, vec2 uv) {
    if (u_rgbOffset < 0.001) return texture2D(tex, uv).rgb;

    vec2 dir = uv - 0.5;
    float offset = u_rgbOffset * 0.003;

    vec2 rOffset = dir * offset;
    vec2 bOffset = -dir * offset;

    float r = texture2D(tex, uv + rOffset).r;
    float g = texture2D(tex, uv).g;
    float b = texture2D(tex, uv + bOffset).b;

    return vec3(r, g, b);
}

// ============================================
// NTSC Color Fringing
// Simulates the limited chroma bandwidth of NTSC
// causing color "ringing" at sharp edges
// ============================================

vec3 ntscFringing(sampler2D tex, vec2 uv, vec3 baseColor) {
    if (u_ntscFringing < 0.001) return baseColor;

    // Pixel size for sampling neighbors
    vec2 pixelSize = 1.0 / u_textureSize;

    // Sample neighboring pixels horizontally (NTSC fringing is horizontal)
    vec3 left2 = texture2D(tex, uv + vec2(-2.0 * pixelSize.x, 0.0)).rgb;
    vec3 left1 = texture2D(tex, uv + vec2(-1.0 * pixelSize.x, 0.0)).rgb;
    vec3 right1 = texture2D(tex, uv + vec2(1.0 * pixelSize.x, 0.0)).rgb;
    vec3 right2 = texture2D(tex, uv + vec2(2.0 * pixelSize.x, 0.0)).rgb;

    // Calculate brightness (luma) for edge detection
    float lumaCenter = rgb2grey(baseColor);
    float lumaLeft1 = rgb2grey(left1);
    float lumaLeft2 = rgb2grey(left2);
    float lumaRight1 = rgb2grey(right1);
    float lumaRight2 = rgb2grey(right2);

    // Detect edges - looking for significant brightness transitions
    float leftAvg = (lumaLeft1 + lumaLeft2) * 0.5;
    float rightAvg = (lumaRight1 + lumaRight2) * 0.5;

    // Edge strength: how much brighter is one side vs the other
    float leftEdge = max(0.0, rightAvg - leftAvg);   // Bright on right = left edge of bright area
    float rightEdge = max(0.0, leftAvg - rightAvg);  // Bright on left = right edge of bright area

    // Only apply fringing where there's a significant edge
    float edgeThreshold = 0.15;
    leftEdge = smoothstep(edgeThreshold, edgeThreshold + 0.2, leftEdge);
    rightEdge = smoothstep(edgeThreshold, edgeThreshold + 0.2, rightEdge);

    // NTSC fringe colors (magenta on left edges, cyan on right edges)
    vec3 magentaFringe = vec3(0.84, 0.26, 1.0);  // Purple/Magenta
    vec3 cyanFringe = vec3(0.42, 0.90, 0.72);    // Aqua/Cyan

    // Apply fringing with smooth blending
    // Fringe is stronger on darker pixels near bright edges
    float darkness = 1.0 - lumaCenter;
    float fringeStrength = u_ntscFringing * darkness * 0.7;

    vec3 result = baseColor;

    // Left edge fringing (magenta)
    if (leftEdge > 0.0) {
        result = mix(result, magentaFringe, leftEdge * fringeStrength);
    }

    // Right edge fringing (cyan)
    if (rightEdge > 0.0) {
        result = mix(result, cyanFringe, rightEdge * fringeStrength);
    }

    // Add subtle horizontal color blur to simulate chroma bandwidth limiting
    // This makes the overall color response smoother
    vec3 blurredChroma = (left1 + baseColor + right1) / 3.0;
    float chromaBlur = u_ntscFringing * 0.15;
    result = mix(result, blurredChroma, chromaBlur);

    return result;
}

// ============================================
// Color adjustment
// ============================================

vec3 adjustColor(vec3 color) {
    color *= u_brightness;
    color = (color - 0.5) * u_contrast + 0.5;
    float gray = rgb2grey(color);
    color = mix(vec3(gray), color, u_saturation);
    return color;
}

// ============================================
// Monochrome mode
// ============================================

vec3 applyMonochrome(vec3 color) {
    if (u_monochromeMode == 0) return color; // Color mode - no change

    // Convert to grayscale using luminance
    float gray = rgb2grey(color);

    // Apply tint based on monochrome mode
    if (u_monochromeMode == 1) {
        // Green phosphor (classic Apple II monitor)
        // P1 phosphor green: slightly blue-green tint
        return vec3(gray * 0.2, gray * 1.0, gray * 0.2);
    } else if (u_monochromeMode == 2) {
        // Amber phosphor (common on IBM PCs)
        // Warm orange-yellow tint
        return vec3(gray * 1.0, gray * 0.75, gray * 0.2);
    } else if (u_monochromeMode == 3) {
        // White phosphor (paper white)
        // Slight warm tint for authenticity
        return vec3(gray * 1.0, gray * 1.0, gray * 0.9);
    }

    return color;
}

// ============================================
// Edge effects
// ============================================

float edgeFade(vec2 uv) {
    vec2 edge = smoothstep(0.0, 0.005, uv) * smoothstep(0.0, 0.005, 1.0 - uv);
    return mix(0.85, 1.0, edge.x * edge.y);
}

float smoothEdge(vec2 uv) {
    if (u_curvature < 0.001 && u_cornerRadius < 0.001) return 1.0;

    vec2 centered = uv - 0.5;
    // Use explicit corner radius if set, otherwise derive from curvature
    float cornerRadius = u_cornerRadius > 0.001 ? u_cornerRadius : u_curvature * 0.03;
    vec2 cornerDist = abs(centered) - (0.5 - cornerRadius);
    cornerDist = max(cornerDist, 0.0);
    float corner = length(cornerDist) / cornerRadius;

    return 1.0 - smoothstep(0.9, 1.0, corner);
}

// Rounded rectangle SDF for clean corner masking
float roundedRectAlpha(vec2 uv, float radius) {
    if (radius < 0.001) return 1.0;

    vec2 centered = abs(uv - 0.5);
    vec2 cornerDist = centered - (0.5 - radius);

    // Inside the rectangle (not in corner region)
    if (cornerDist.x < 0.0 || cornerDist.y < 0.0) {
        return 1.0;
    }

    // In corner region - use distance from corner arc
    float dist = length(cornerDist);
    // Smooth anti-aliased edge
    return 1.0 - smoothstep(radius - 0.005, radius + 0.005, dist);
}

// Apply screen margin - scales content inward so corners don't clip it
vec2 applyScreenMargin(vec2 uv) {
    if (u_screenMargin < 0.001) return uv;

    // Scale UV from center to create margin
    vec2 centered = uv - 0.5;
    float scale = 1.0 / (1.0 - u_screenMargin * 2.0);
    return centered * scale + 0.5;
}

// ============================================
// Beam position crosshair overlay
// ============================================

vec3 beamOverlay(vec2 uv) {
    if (u_beamY < 0.0 && u_beamX < 0.0) return vec3(0.0);

    // Line thickness in UV space (~1.5 pixels)
    float lineW = 1.5 / u_textureSize.x;
    float lineH = 1.5 / u_textureSize.y;

    vec3 lineColor = vec3(1.0, 0.0, 0.0); // Red
    float intensity = 0.0;

    // Horizontal line at beamY
    if (u_beamY >= 0.0 && u_beamY <= 1.0) {
        float dy = abs(uv.y - u_beamY);
        intensity += smoothstep(lineH, 0.0, dy) * 0.6;
    }

    // Vertical line at beamX
    if (u_beamX >= 0.0 && u_beamX <= 1.0) {
        float dx = abs(uv.x - u_beamX);
        intensity += smoothstep(lineW, 0.0, dx) * 0.6;
    }

    return lineColor * min(intensity, 1.0);
}

// ============================================
// Main fragment shader
// ============================================

void main() {
    vec2 uv = v_texCoord;

    // Stable screen boundary from undistorted coordinates.
    // The physical CRT mask doesn't wobble — only the beam does.
    // All clipping and alpha use this so nothing renders outside the edge.
    vec2 stableCurvedUV = curveUV(uv);

    float cornerAlpha = roundedRectAlpha(stableCurvedUV, u_cornerRadius);
    if (cornerAlpha < 0.001) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
        return;
    }

    float edgeFactor = smoothEdge(stableCurvedUV);
    if (edgeFactor < 0.001) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
        return;
    }

    if (stableCurvedUV.x < 0.0 || stableCurvedUV.x > 1.0 || stableCurvedUV.y < 0.0 || stableCurvedUV.y > 1.0) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
        return;
    }

    // Apply signal distortions — the beam wobbles, the mask does not
    vec2 distortedUV = applyHorizontalSync(uv, u_time);
    distortedUV = applyJitter(distortedUV, u_time);
    vec2 curvedUV = curveUV(distortedUV);

    // Content coordinates use the distorted beam position
    vec2 contentUV = applyOverscan(curvedUV);
    contentUV = applyScreenMargin(contentUV);

    // Dark bezel color for areas outside content
    vec3 darkBezelColor = vec3(0.0); // Black

    // Check if we're in the margin area (outside content but inside screen)
    bool inMargin = contentUV.x < 0.0 || contentUV.x > 1.0 || contentUV.y < 0.0 || contentUV.y > 1.0;

    // No signal mode - show TV static instead of emulator content
    if (u_noSignal > 0.5) {
        vec3 staticColor = noSignalStatic(curvedUV, u_time);

        // Apply scanlines to static for authentic look
        staticColor *= scanlines(curvedUV);

        // Apply vignette
        staticColor *= vignette(curvedUV);

        // Apply edge fade for curved screens
        if (u_curvature > 0.001) {
            staticColor *= edgeFade(curvedUV);
        }

        float staticAlpha = cornerAlpha * edgeFactor;
        gl_FragColor = vec4(staticColor, staticAlpha);
        return;
    }

    // Get base color - dark bezel color for margin area, texture sample for content
    vec3 color;
    if (inMargin) {
        color = darkBezelColor;
    } else {
        // Get base color with RGB shift
        color = rgbShift(u_texture, contentUV);

        // Apply NTSC color fringing only in colour mode
        if (u_monochromeMode == 0) {
            color = ntscFringing(u_texture, contentUV, color);
        }
    }

    // Apply texture-based effects only for content area
    if (!inMargin) {
        // Blend text selection overlay (before burn-in and glow so CRT effects apply on top)
        vec4 sel = texture2D(u_selectionTexture, contentUV);
        if (sel.a > 0.0) {
            color = mix(color, sel.rgb, sel.a);
        }

        // Apply burn-in from accumulation buffer
        if (u_burnIn > 0.001) {
            // Burn-in texture is stored in non-flipped coords, flip Y to match main texture
            vec2 burnInCoord = vec2(contentUV.x, 1.0 - contentUV.y);
            vec3 burnInColor = texture2D(u_burnInTexture, burnInCoord).rgb;
            color = max(color, burnInColor * u_burnIn);
        }

        // Add phosphor glow
        color += glow(u_texture, contentUV);
    }

    // Apply scanlines (use curvedUV for consistent scanlines across margin)
    color *= scanlines(curvedUV);

    // Apply shadow mask
    color *= shadowMask(curvedUV);

    // Apply color adjustments (brightness, contrast, saturation)
    color = adjustColor(color);

    // Apply monochrome mode (after color adjustments, before vignette)
    color = applyMonochrome(color);

    // Apply vignette
    color *= vignette(curvedUV);

    // Apply edge fade for curved screens (uses stable coords — physical screen property)
    if (u_curvature > 0.001) {
        color *= edgeFade(stableCurvedUV);
    }

    // Apply flicker
    color *= flicker(u_time);

    // Add glowing line
    color += vec3(glowingLine(curvedUV, u_time));

    // Add static noise
    color += vec3(staticNoise(curvedUV, u_time));

    // Apply ambient light
    color = applyAmbientLight(color, curvedUV);

    // Beam position crosshair (additive blend, uses content UV)
    if (!inMargin) {
        color += beamOverlay(contentUV);
    }

    // Clamp final color
    color = clamp(color, 0.0, 1.0);

    // Alpha combines corner rounding and curvature edge fade
    float alpha = cornerAlpha * edgeFactor;

    gl_FragColor = vec4(color, alpha);
}
