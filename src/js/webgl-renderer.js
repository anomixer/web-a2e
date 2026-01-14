// WebGL Renderer for Apple //e display with CRT effects

export class WebGLRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = null;
        this.program = null;
        this.texture = null;

        // Texture dimensions
        this.width = 560;
        this.height = 384;

        // CRT effect parameters (0.0 to 1.0 unless noted)
        this.crtParams = {
            curvature: 0.0,
            scanlineIntensity: 0.0,
            scanlineWidth: 0.5,
            shadowMask: 0.0,
            glowIntensity: 0.0,
            glowSpread: 0.5,
            brightness: 1.0,      // 0.5 to 1.5
            contrast: 1.0,        // 0.5 to 1.5
            saturation: 1.0,      // 0.0 to 2.0
            vignette: 0.0,
            flicker: 0.0,
            rgbOffset: 0.0
        };

        // Time for animated effects
        this.time = 0;

        // Uniform locations
        this.uniforms = {};
    }

    async init() {
        // Get WebGL context
        this.gl = this.canvas.getContext('webgl2') || this.canvas.getContext('webgl');
        if (!this.gl) {
            throw new Error('WebGL not supported');
        }

        const gl = this.gl;

        // Create shaders
        const vertexShader = this.compileShader(gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
        const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);

        // Create program
        this.program = gl.createProgram();
        gl.attachShader(this.program, vertexShader);
        gl.attachShader(this.program, fragmentShader);
        gl.linkProgram(this.program);

        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            throw new Error('Shader program failed to link: ' + gl.getProgramInfoLog(this.program));
        }

        // Get attribute locations
        this.positionLoc = gl.getAttribLocation(this.program, 'a_position');
        this.texCoordLoc = gl.getAttribLocation(this.program, 'a_texCoord');

        // Get all uniform locations
        this.uniforms = {
            texture: gl.getUniformLocation(this.program, 'u_texture'),
            resolution: gl.getUniformLocation(this.program, 'u_resolution'),
            textureSize: gl.getUniformLocation(this.program, 'u_textureSize'),
            time: gl.getUniformLocation(this.program, 'u_time'),
            curvature: gl.getUniformLocation(this.program, 'u_curvature'),
            scanlineIntensity: gl.getUniformLocation(this.program, 'u_scanlineIntensity'),
            scanlineWidth: gl.getUniformLocation(this.program, 'u_scanlineWidth'),
            shadowMask: gl.getUniformLocation(this.program, 'u_shadowMask'),
            glowIntensity: gl.getUniformLocation(this.program, 'u_glowIntensity'),
            glowSpread: gl.getUniformLocation(this.program, 'u_glowSpread'),
            brightness: gl.getUniformLocation(this.program, 'u_brightness'),
            contrast: gl.getUniformLocation(this.program, 'u_contrast'),
            saturation: gl.getUniformLocation(this.program, 'u_saturation'),
            vignette: gl.getUniformLocation(this.program, 'u_vignette'),
            flicker: gl.getUniformLocation(this.program, 'u_flicker'),
            rgbOffset: gl.getUniformLocation(this.program, 'u_rgbOffset')
        };

        // Create vertex buffer (full-screen quad)
        const positions = new Float32Array([
            -1, -1,  0, 1,
             1, -1,  1, 1,
            -1,  1,  0, 0,
             1,  1,  1, 0,
        ]);

        this.vertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

        // Create texture
        this.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        // Default to nearest neighbor filtering (sharp pixels)
        this.useNearestFilter = true;
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

        // Initialize with empty texture
        const emptyData = new Uint8Array(this.width * this.height * 4);
        gl.texImage2D(
            gl.TEXTURE_2D, 0, gl.RGBA,
            this.width, this.height, 0,
            gl.RGBA, gl.UNSIGNED_BYTE, emptyData
        );

        // Set initial canvas size if not already set
        if (!this.canvas.width || !this.canvas.height) {
            this.canvas.width = this.width;
            this.canvas.height = this.height;
        }

        // Set viewport
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }

    compileShader(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            throw new Error('Shader compilation failed: ' + gl.getShaderInfoLog(shader));
        }

        return shader;
    }

    updateTexture(data) {
        const gl = this.gl;

        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texSubImage2D(
            gl.TEXTURE_2D, 0,
            0, 0,
            this.width, this.height,
            gl.RGBA, gl.UNSIGNED_BYTE,
            data
        );
    }

    draw() {
        const gl = this.gl;

        // Update time for animated effects
        this.time += 0.016; // Approximately 60fps

        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(this.program);

        // Bind vertex buffer
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);

        // Position attribute
        gl.enableVertexAttribArray(this.positionLoc);
        gl.vertexAttribPointer(this.positionLoc, 2, gl.FLOAT, false, 16, 0);

        // TexCoord attribute
        gl.enableVertexAttribArray(this.texCoordLoc);
        gl.vertexAttribPointer(this.texCoordLoc, 2, gl.FLOAT, false, 16, 8);

        // Bind texture
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.uniform1i(this.uniforms.texture, 0);

        // Set all uniforms
        gl.uniform2f(this.uniforms.resolution, this.canvas.width, this.canvas.height);
        gl.uniform2f(this.uniforms.textureSize, this.width, this.height);
        gl.uniform1f(this.uniforms.time, this.time);
        gl.uniform1f(this.uniforms.curvature, this.crtParams.curvature);
        gl.uniform1f(this.uniforms.scanlineIntensity, this.crtParams.scanlineIntensity);
        gl.uniform1f(this.uniforms.scanlineWidth, this.crtParams.scanlineWidth);
        gl.uniform1f(this.uniforms.shadowMask, this.crtParams.shadowMask);
        gl.uniform1f(this.uniforms.glowIntensity, this.crtParams.glowIntensity);
        gl.uniform1f(this.uniforms.glowSpread, this.crtParams.glowSpread);
        gl.uniform1f(this.uniforms.brightness, this.crtParams.brightness);
        gl.uniform1f(this.uniforms.contrast, this.crtParams.contrast);
        gl.uniform1f(this.uniforms.saturation, this.crtParams.saturation);
        gl.uniform1f(this.uniforms.vignette, this.crtParams.vignette);
        gl.uniform1f(this.uniforms.flicker, this.crtParams.flicker);
        gl.uniform1f(this.uniforms.rgbOffset, this.crtParams.rgbOffset);

        // Draw
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    clear() {
        const gl = this.gl;

        // Clear the texture to black
        const emptyData = new Uint8Array(this.width * this.height * 4);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texSubImage2D(
            gl.TEXTURE_2D, 0,
            0, 0,
            this.width, this.height,
            gl.RGBA, gl.UNSIGNED_BYTE,
            emptyData
        );

        // Clear and redraw
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        this.draw();
    }

    // Set individual CRT parameter
    setParam(name, value) {
        if (name in this.crtParams) {
            this.crtParams[name] = value;
        }
    }

    // Set multiple CRT parameters at once
    setParams(params) {
        for (const [name, value] of Object.entries(params)) {
            if (name in this.crtParams) {
                this.crtParams[name] = value;
            }
        }
    }

    // Set texture filtering mode
    setNearestFilter(enabled) {
        const gl = this.gl;
        this.useNearestFilter = enabled;

        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        if (enabled) {
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        } else {
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        }
    }

    // Legacy method for compatibility
    setCRTEnabled(enabled) {
        // Apply preset CRT settings
        if (enabled) {
            this.crtParams.curvature = 0.3;
            this.crtParams.scanlineIntensity = 0.3;
            this.crtParams.shadowMask = 0.2;
            this.crtParams.vignette = 0.2;
            this.crtParams.glowIntensity = 0.1;
        } else {
            this.crtParams.curvature = 0;
            this.crtParams.scanlineIntensity = 0;
            this.crtParams.shadowMask = 0;
            this.crtParams.vignette = 0;
            this.crtParams.glowIntensity = 0;
        }
    }

    resize(width, height) {
        // Use device pixel ratio for sharper rendering on high-DPI displays
        const dpr = window.devicePixelRatio || 1;

        // Set the backing store size (actual pixels)
        this.canvas.width = Math.floor(width * dpr);
        this.canvas.height = Math.floor(height * dpr);

        // Update WebGL viewport
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }
}

// Vertex shader
const VERTEX_SHADER_SOURCE = `
attribute vec2 a_position;
attribute vec2 a_texCoord;
varying vec2 v_texCoord;

void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
}
`;

// Fragment shader with comprehensive CRT effects
const FRAGMENT_SHADER_SOURCE = `
precision highp float;

uniform sampler2D u_texture;
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

varying vec2 v_texCoord;

// Constants
const float PI = 3.14159265359;
const float BORDER = 0.03; // Border size as fraction of screen (3%)

// Remap UV to add border around the screen content
vec2 addBorder(vec2 uv) {
    // Shrink the UV space to create a border
    return uv * (1.0 + BORDER * 2.0) - BORDER;
}

// Check if we're in the border area (outside the actual screen content)
bool isInBorder(vec2 uv) {
    return uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0;
}

// Apply barrel distortion simulating curved CRT glass
// This version keeps the screen filling the texture - corners stay at corners
// while edges bow inward to create the curved appearance
vec2 curveUV(vec2 uv) {
    if (u_curvature < 0.001) return uv;

    // Convert to centered coordinates (-0.5 to 0.5)
    vec2 cc = uv - 0.5;

    // Calculate squared distance from center
    float dist = dot(cc, cc);

    // Barrel distortion formula
    // Higher curvature = more pronounced curve
    float k = u_curvature * 0.8; // Scale factor for reasonable curvature range
    float distortion = 1.0 + dist * k;

    // Apply distortion
    cc *= distortion;

    // Calculate the distortion at the corner (where dist is maximum)
    // For a point at (0.5, 0.5), dist = 0.5^2 + 0.5^2 = 0.5
    float cornerDist = 0.5;
    float cornerDistortion = 1.0 + cornerDist * k;

    // Normalize so corners map back to texture edges
    // This keeps the screen filling the entire texture
    cc /= cornerDistortion;

    return cc + 0.5;
}

// Calculate edge fade for curved screen (darker at edges like real CRT)
float edgeFade(vec2 uv) {
    vec2 edge = smoothstep(0.0, 0.02, uv) * smoothstep(0.0, 0.02, 1.0 - uv);
    return edge.x * edge.y;
}

// Check if UV is within screen bounds
bool isOutOfBounds(vec2 uv) {
    return uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0;
}

// Calculate smooth edge factor for rounded corners on curved screens
// This creates subtle rounded corners that look more like a real CRT
float smoothEdge(vec2 uv, vec2 curvedUV) {
    if (u_curvature < 0.001) return 1.0;

    // For the curved effect, we want slightly rounded corners
    // The rounding is based on original UV to create consistent corner radius
    vec2 centered = uv - 0.5;

    // Calculate corner rounding - more curvature = more rounded corners
    float cornerRadius = u_curvature * 0.08;
    vec2 cornerDist = abs(centered) - (0.5 - cornerRadius);
    cornerDist = max(cornerDist, 0.0);
    float corner = length(cornerDist) / cornerRadius;

    // Smooth falloff at corners
    return 1.0 - smoothstep(0.8, 1.0, corner);
}

// Scanline effect
float scanlines(vec2 uv) {
    if (u_scanlineIntensity < 0.001) return 1.0;

    float scanline = sin(uv.y * u_textureSize.y * PI) * 0.5 + 0.5;
    scanline = pow(scanline, u_scanlineWidth * 2.0 + 0.5);
    return mix(1.0, scanline, u_scanlineIntensity);
}

// Shadow mask (aperture grille simulation)
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

// Vignette effect
float vignette(vec2 uv) {
    if (u_vignette < 0.001) return 1.0;

    vec2 center = uv - 0.5;
    float dist = length(center);
    float vig = 1.0 - dist * dist * u_vignette * 2.0;
    return clamp(vig, 0.0, 1.0);
}

// Phosphor glow / bloom effect
vec3 glow(sampler2D tex, vec2 uv) {
    if (u_glowIntensity < 0.001) return vec3(0.0);

    vec3 bloom = vec3(0.0);
    float spread = u_glowSpread * 0.01;

    // Simple 9-tap blur for glow
    for (int x = -1; x <= 1; x++) {
        for (int y = -1; y <= 1; y++) {
            vec2 offset = vec2(float(x), float(y)) * spread;
            bloom += texture2D(tex, uv + offset).rgb;
        }
    }
    bloom /= 9.0;

    return bloom * u_glowIntensity;
}

// RGB chromatic aberration
vec3 rgbShift(sampler2D tex, vec2 uv) {
    if (u_rgbOffset < 0.001) return texture2D(tex, uv).rgb;

    float offset = u_rgbOffset * 0.003;
    vec2 dir = normalize(uv - 0.5);

    float r = texture2D(tex, uv + dir * offset).r;
    float g = texture2D(tex, uv).g;
    float b = texture2D(tex, uv - dir * offset).b;

    return vec3(r, g, b);
}

// Brightness/Contrast/Saturation adjustment
vec3 adjustColor(vec3 color) {
    // Brightness
    color *= u_brightness;

    // Contrast
    color = (color - 0.5) * u_contrast + 0.5;

    // Saturation
    float gray = dot(color, vec3(0.299, 0.587, 0.114));
    color = mix(vec3(gray), color, u_saturation);

    return color;
}

// Flicker effect (simulates CRT refresh)
float flicker() {
    if (u_flicker < 0.001) return 1.0;

    float f = sin(u_time * 60.0) * 0.5 + 0.5;
    return 1.0 - u_flicker * 0.1 * f;
}

void main() {
    // Store original UV for edge calculations
    vec2 origUV = v_texCoord;

    // Apply screen curvature - this keeps corners at corners
    // while bowing the edges inward for the curved effect
    vec2 uv = curveUV(v_texCoord);

    // Calculate smooth edge factor for rounded corners
    float edgeFactor = smoothEdge(origUV, uv);

    // If completely outside rounded corners, show bezel color
    if (edgeFactor < 0.001) {
        gl_FragColor = vec4(0.01, 0.01, 0.01, 1.0);
        return;
    }

    // Add border around screen content
    vec2 texUV = addBorder(uv);

    // Check if we're in the border area
    bool inBorder = isInBorder(texUV);

    // For border area, use black; otherwise sample the texture
    vec3 color;
    if (inBorder) {
        color = vec3(0.0);
    } else {
        // Get base color with optional RGB shift
        color = rgbShift(u_texture, texUV);

        // Add phosphor glow
        color += glow(u_texture, texUV);

        // Apply scanlines
        color *= scanlines(texUV);

        // Apply shadow mask
        color *= shadowMask(texUV);

        // Apply color adjustments
        color = adjustColor(color);

        // Apply vignette (use curved UV for natural vignette following the curve)
        color *= vignette(uv);

        // Apply edge fade for curved screens (edges are darker due to viewing angle)
        if (u_curvature > 0.001) {
            color *= edgeFade(uv);
        }

        // Apply flicker
        color *= flicker();
    }

    // Blend between screen content and bezel using smooth edge factor
    // This creates anti-aliased rounded corners
    vec3 bezelColor = vec3(0.01);
    color = mix(bezelColor, color, edgeFactor);

    // Clamp final color
    color = clamp(color, 0.0, 1.0);

    gl_FragColor = vec4(color, 1.0);
}
`;
