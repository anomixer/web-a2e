// WebGL Renderer for Apple //e display

export class WebGLRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = null;
        this.program = null;
        this.texture = null;
        this.crtEnabled = false;

        // Texture dimensions
        this.width = 560;
        this.height = 384;
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

        // Get attribute and uniform locations
        this.positionLoc = gl.getAttribLocation(this.program, 'a_position');
        this.texCoordLoc = gl.getAttribLocation(this.program, 'a_texCoord');
        this.textureLoc = gl.getUniformLocation(this.program, 'u_texture');
        this.crtEnabledLoc = gl.getUniformLocation(this.program, 'u_crtEnabled');
        this.resolutionLoc = gl.getUniformLocation(this.program, 'u_resolution');

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
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

        // Initialize with empty texture
        const emptyData = new Uint8Array(this.width * this.height * 4);
        gl.texImage2D(
            gl.TEXTURE_2D, 0, gl.RGBA,
            this.width, this.height, 0,
            gl.RGBA, gl.UNSIGNED_BYTE, emptyData
        );

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
        gl.uniform1i(this.textureLoc, 0);

        // Set uniforms
        gl.uniform1i(this.crtEnabledLoc, this.crtEnabled ? 1 : 0);
        gl.uniform2f(this.resolutionLoc, this.canvas.width, this.canvas.height);

        // Draw
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    setCRTEnabled(enabled) {
        this.crtEnabled = enabled;
    }

    resize(width, height) {
        this.canvas.width = width;
        this.canvas.height = height;
        this.gl.viewport(0, 0, width, height);
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

// Fragment shader with optional CRT effect
const FRAGMENT_SHADER_SOURCE = `
precision mediump float;

uniform sampler2D u_texture;
uniform bool u_crtEnabled;
uniform vec2 u_resolution;

varying vec2 v_texCoord;

// CRT effect parameters
const float scanlineIntensity = 0.15;
const float curvature = 0.03;
const float vignetteStrength = 0.3;

vec2 curveRemapUV(vec2 uv) {
    if (!u_crtEnabled) return uv;

    uv = uv * 2.0 - 1.0;
    vec2 offset = abs(uv.yx) / vec2(6.0, 4.0);
    uv = uv + uv * offset * offset * curvature;
    uv = uv * 0.5 + 0.5;
    return uv;
}

float scanline(vec2 uv) {
    if (!u_crtEnabled) return 1.0;

    float scanlineCount = u_resolution.y * 0.5;
    float scanlinePhase = uv.y * scanlineCount * 3.14159 * 2.0;
    return 1.0 - scanlineIntensity * (0.5 + 0.5 * sin(scanlinePhase));
}

float vignette(vec2 uv) {
    if (!u_crtEnabled) return 1.0;

    uv = uv * 2.0 - 1.0;
    float v = 1.0 - dot(uv, uv) * vignetteStrength;
    return clamp(v, 0.0, 1.0);
}

void main() {
    vec2 uv = curveRemapUV(v_texCoord);

    // Check bounds after curvature
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }

    vec4 color = texture2D(u_texture, uv);

    // Apply scanlines
    color.rgb *= scanline(uv);

    // Apply vignette
    color.rgb *= vignette(uv);

    // Slight phosphor glow effect
    if (u_crtEnabled) {
        color.rgb = pow(color.rgb, vec3(0.9));
    }

    gl_FragColor = color;
}
`;
