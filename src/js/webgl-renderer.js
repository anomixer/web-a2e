// WebGL Renderer for Apple //e display with CRT effects
// Inspired by cool-retro-term (https://github.com/Swordfish90/cool-retro-term)

export class WebGLRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = null;
    this.program = null;
    this.texture = null;

    // Burn-in resources
    this.burnInProgram = null;
    this.burnInFramebuffers = [null, null];
    this.burnInTextures = [null, null];
    this.currentBurnInIndex = 0;

    // Texture dimensions
    this.width = 560;
    this.height = 384;

    // CRT effect parameters (0.0 to 1.0 unless noted)
    this.crtParams = {
      // Screen geometry
      curvature: 0.0,

      // Scanlines and rasterization
      scanlineIntensity: 0.0,
      scanlineWidth: 0.5,
      shadowMask: 0.0,

      // Glow/bloom
      glowIntensity: 0.0,
      glowSpread: 0.5,

      // Color adjustments
      brightness: 1.0, // 0.5 to 1.5
      contrast: 1.0, // 0.5 to 1.5
      saturation: 1.0, // 0.0 to 2.0

      // Vignette
      vignette: 0.0,

      // Chromatic aberration
      rgbOffset: 0.0,

      // New effects from cool-retro-term
      staticNoise: 0.0, // Static noise/grain
      flicker: 0.0, // Brightness flicker
      jitter: 0.0, // Random pixel displacement
      horizontalSync: 0.0, // Horizontal sync distortion
      glowingLine: 0.0, // Moving scan beam
      ambientLight: 0.0, // Screen surface reflection
      burnIn: 0.0, // Phosphor persistence

      // Screen border/overscan
      overscan: 0.0, // Border around display content (0.0 to 1.0)

      // No signal mode (TV static when off)
      noSignal: 0.0, // 1.0 = full static, 0.0 = normal display
    };

    // Time for animated effects
    this.time = 0;

    // Uniform locations
    this.uniforms = {};
    this.burnInUniforms = {};
  }

  async init() {
    // Get WebGL context
    this.gl =
      this.canvas.getContext("webgl2") || this.canvas.getContext("webgl");
    if (!this.gl) {
      throw new Error("WebGL not supported");
    }

    const gl = this.gl;

    // Create main shaders
    const vertexShader = this.compileShader(
      gl.VERTEX_SHADER,
      VERTEX_SHADER_SOURCE,
    );
    const fragmentShader = this.compileShader(
      gl.FRAGMENT_SHADER,
      FRAGMENT_SHADER_SOURCE,
    );

    // Create main program
    this.program = gl.createProgram();
    gl.attachShader(this.program, vertexShader);
    gl.attachShader(this.program, fragmentShader);
    gl.linkProgram(this.program);

    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      throw new Error(
        "Shader program failed to link: " + gl.getProgramInfoLog(this.program),
      );
    }

    // Create burn-in shaders
    const burnInVertexShader = this.compileShader(
      gl.VERTEX_SHADER,
      VERTEX_SHADER_SOURCE,
    );
    const burnInFragmentShader = this.compileShader(
      gl.FRAGMENT_SHADER,
      BURNIN_SHADER_SOURCE,
    );

    // Create burn-in program
    this.burnInProgram = gl.createProgram();
    gl.attachShader(this.burnInProgram, burnInVertexShader);
    gl.attachShader(this.burnInProgram, burnInFragmentShader);
    gl.linkProgram(this.burnInProgram);

    if (!gl.getProgramParameter(this.burnInProgram, gl.LINK_STATUS)) {
      throw new Error(
        "Burn-in shader program failed to link: " +
          gl.getProgramInfoLog(this.burnInProgram),
      );
    }

    // Get attribute locations
    this.positionLoc = gl.getAttribLocation(this.program, "a_position");
    this.texCoordLoc = gl.getAttribLocation(this.program, "a_texCoord");

    // Get burn-in attribute locations
    this.burnInPositionLoc = gl.getAttribLocation(
      this.burnInProgram,
      "a_position",
    );
    this.burnInTexCoordLoc = gl.getAttribLocation(
      this.burnInProgram,
      "a_texCoord",
    );

    // Get all uniform locations for main program
    this.uniforms = {
      texture: gl.getUniformLocation(this.program, "u_texture"),
      burnInTexture: gl.getUniformLocation(this.program, "u_burnInTexture"),
      resolution: gl.getUniformLocation(this.program, "u_resolution"),
      textureSize: gl.getUniformLocation(this.program, "u_textureSize"),
      time: gl.getUniformLocation(this.program, "u_time"),
      curvature: gl.getUniformLocation(this.program, "u_curvature"),
      scanlineIntensity: gl.getUniformLocation(
        this.program,
        "u_scanlineIntensity",
      ),
      scanlineWidth: gl.getUniformLocation(this.program, "u_scanlineWidth"),
      shadowMask: gl.getUniformLocation(this.program, "u_shadowMask"),
      glowIntensity: gl.getUniformLocation(this.program, "u_glowIntensity"),
      glowSpread: gl.getUniformLocation(this.program, "u_glowSpread"),
      brightness: gl.getUniformLocation(this.program, "u_brightness"),
      contrast: gl.getUniformLocation(this.program, "u_contrast"),
      saturation: gl.getUniformLocation(this.program, "u_saturation"),
      vignette: gl.getUniformLocation(this.program, "u_vignette"),
      flicker: gl.getUniformLocation(this.program, "u_flicker"),
      rgbOffset: gl.getUniformLocation(this.program, "u_rgbOffset"),
      staticNoise: gl.getUniformLocation(this.program, "u_staticNoise"),
      jitter: gl.getUniformLocation(this.program, "u_jitter"),
      horizontalSync: gl.getUniformLocation(this.program, "u_horizontalSync"),
      glowingLine: gl.getUniformLocation(this.program, "u_glowingLine"),
      ambientLight: gl.getUniformLocation(this.program, "u_ambientLight"),
      burnIn: gl.getUniformLocation(this.program, "u_burnIn"),
      overscan: gl.getUniformLocation(this.program, "u_overscan"),
      noSignal: gl.getUniformLocation(this.program, "u_noSignal"),
    };

    // Get burn-in program uniform locations
    this.burnInUniforms = {
      currentTexture: gl.getUniformLocation(
        this.burnInProgram,
        "u_currentTexture",
      ),
      previousTexture: gl.getUniformLocation(
        this.burnInProgram,
        "u_previousTexture",
      ),
      burnInDecay: gl.getUniformLocation(this.burnInProgram, "u_burnInDecay"),
    };

    // Create vertex buffer (full-screen quad)
    // Format: x, y, u, v - texture coords are flipped for screen rendering
    const positions = new Float32Array([
      -1, -1, 0, 1, 1, -1, 1, 1, -1, 1, 0, 0, 1, 1, 1, 0,
    ]);

    this.vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    // Create vertex buffer for framebuffer rendering (non-flipped texture coords)
    const fbPositions = new Float32Array([
      -1, -1, 0, 0, 1, -1, 1, 0, -1, 1, 0, 1, 1, 1, 1, 1,
    ]);

    this.fbVertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.fbVertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, fbPositions, gl.STATIC_DRAW);

    // Create main texture
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
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      this.width,
      this.height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      emptyData,
    );

    // Create burn-in framebuffers and textures (ping-pong)
    for (let i = 0; i < 2; i++) {
      this.burnInTextures[i] = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.burnInTextures[i]);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        this.width,
        this.height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        emptyData,
      );

      this.burnInFramebuffers[i] = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.burnInFramebuffers[i]);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        this.burnInTextures[i],
        0,
      );
    }

    // Unbind framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

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
      throw new Error(
        "Shader compilation failed: " + gl.getShaderInfoLog(shader),
      );
    }

    return shader;
  }

  updateTexture(data) {
    const gl = this.gl;

    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      this.width,
      this.height,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      data,
    );
  }

  updateBurnIn() {
    const gl = this.gl;

    if (this.crtParams.burnIn < 0.001) return;

    // Swap buffers
    const prevIndex = this.currentBurnInIndex;
    this.currentBurnInIndex = 1 - this.currentBurnInIndex;
    const currIndex = this.currentBurnInIndex;

    // Render to current burn-in buffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.burnInFramebuffers[currIndex]);
    gl.viewport(0, 0, this.width, this.height);

    gl.useProgram(this.burnInProgram);

    // Bind framebuffer vertex buffer (non-flipped texture coords)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.fbVertexBuffer);
    gl.enableVertexAttribArray(this.burnInPositionLoc);
    gl.vertexAttribPointer(this.burnInPositionLoc, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(this.burnInTexCoordLoc);
    gl.vertexAttribPointer(this.burnInTexCoordLoc, 2, gl.FLOAT, false, 16, 8);

    // Bind current frame texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(this.burnInUniforms.currentTexture, 0);

    // Bind previous burn-in texture
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.burnInTextures[prevIndex]);
    gl.uniform1i(this.burnInUniforms.previousTexture, 1);

    // Set decay rate - higher burnIn = slower decay
    const decayRate = 0.02 + (1.0 - this.crtParams.burnIn) * 0.08;
    gl.uniform1f(this.burnInUniforms.burnInDecay, decayRate);

    // Draw
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Unbind framebuffer and restore viewport
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  draw() {
    const gl = this.gl;

    // Update time for animated effects
    this.time += 0.016; // Approximately 60fps

    // Update burn-in accumulation
    this.updateBurnIn();

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

    // Bind main texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(this.uniforms.texture, 0);

    // Bind burn-in texture
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.burnInTextures[this.currentBurnInIndex]);
    gl.uniform1i(this.uniforms.burnInTexture, 1);

    // Set all uniforms
    gl.uniform2f(
      this.uniforms.resolution,
      this.canvas.width,
      this.canvas.height,
    );
    gl.uniform2f(this.uniforms.textureSize, this.width, this.height);
    gl.uniform1f(this.uniforms.time, this.time);
    gl.uniform1f(this.uniforms.curvature, this.crtParams.curvature);
    gl.uniform1f(
      this.uniforms.scanlineIntensity,
      this.crtParams.scanlineIntensity,
    );
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
    gl.uniform1f(this.uniforms.staticNoise, this.crtParams.staticNoise);
    gl.uniform1f(this.uniforms.jitter, this.crtParams.jitter);
    gl.uniform1f(this.uniforms.horizontalSync, this.crtParams.horizontalSync);
    gl.uniform1f(this.uniforms.glowingLine, this.crtParams.glowingLine);
    gl.uniform1f(this.uniforms.ambientLight, this.crtParams.ambientLight);
    gl.uniform1f(this.uniforms.burnIn, this.crtParams.burnIn);
    gl.uniform1f(this.uniforms.overscan, this.crtParams.overscan);
    gl.uniform1f(this.uniforms.noSignal, this.crtParams.noSignal);

    // Draw
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  clear() {
    const gl = this.gl;

    // Clear the texture to black
    const emptyData = new Uint8Array(this.width * this.height * 4);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      this.width,
      this.height,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      emptyData,
    );

    // Clear burn-in buffers
    for (let i = 0; i < 2; i++) {
      gl.bindTexture(gl.TEXTURE_2D, this.burnInTextures[i]);
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        this.width,
        this.height,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        emptyData,
      );
    }

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

  // Set no-signal mode (TV static when emulator is off)
  setNoSignal(enabled) {
    this.crtParams.noSignal = enabled ? 1.0 : 0.0;
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

// Burn-in accumulation shader
const BURNIN_SHADER_SOURCE = `
precision highp float;

uniform sampler2D u_currentTexture;
uniform sampler2D u_previousTexture;
uniform float u_burnInDecay;

varying vec2 v_texCoord;

void main() {
    // Flip Y when sampling current texture to match main rendering coords
    vec2 flippedCoord = vec2(v_texCoord.x, 1.0 - v_texCoord.y);
    vec3 current = texture2D(u_currentTexture, flippedCoord).rgb;
    vec3 previous = texture2D(u_previousTexture, v_texCoord).rgb;

    // Decay the previous frame
    vec3 decayed = max(previous - vec3(u_burnInDecay), 0.0);

    // Take the maximum of current and decayed previous
    vec3 result = max(current, decayed);

    gl_FragColor = vec4(result, 1.0);
}
`;

// Fragment shader with comprehensive CRT effects
// Inspired by cool-retro-term (https://github.com/Swordfish90/cool-retro-term)
const FRAGMENT_SHADER_SOURCE = `
precision highp float;

uniform sampler2D u_texture;
uniform sampler2D u_burnInTexture;
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
    vec2 blockSize = vec2(3.0, 3.0);
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
// Edge effects
// ============================================

float edgeFade(vec2 uv) {
    vec2 edge = smoothstep(0.0, 0.005, uv) * smoothstep(0.0, 0.005, 1.0 - uv);
    return mix(0.85, 1.0, edge.x * edge.y);
}

float smoothEdge(vec2 uv) {
    if (u_curvature < 0.001) return 1.0;

    vec2 centered = uv - 0.5;
    float cornerRadius = u_curvature * 0.03;
    vec2 cornerDist = abs(centered) - (0.5 - cornerRadius);
    cornerDist = max(cornerDist, 0.0);
    float corner = length(cornerDist) / cornerRadius;

    return 1.0 - smoothstep(0.9, 1.0, corner);
}

// ============================================
// Main fragment shader
// ============================================

void main() {
    vec2 uv = v_texCoord;

    // Apply coordinate distortions
    uv = applyHorizontalSync(uv, u_time);
    uv = applyJitter(uv, u_time);

    // Apply screen curvature
    vec2 curvedUV = curveUV(uv);

    // Apply overscan (adds border around content)
    vec2 contentUV = applyOverscan(curvedUV);

    // Calculate edge factor
    float edgeFactor = smoothEdge(v_texCoord);

    // Outside corners - show bezel
    if (edgeFactor < 0.001) {
        gl_FragColor = vec4(0.01, 0.01, 0.01, 1.0);
        return;
    }

    // Outside screen area (including overscan border)
    if (curvedUV.x < 0.0 || curvedUV.x > 1.0 || curvedUV.y < 0.0 || curvedUV.y > 1.0) {
        gl_FragColor = vec4(0.01, 0.01, 0.01, 1.0);
        return;
    }

    // Outside content area (in overscan border region)
    if (contentUV.x < 0.0 || contentUV.x > 1.0 || contentUV.y < 0.0 || contentUV.y > 1.0) {
        // Show static in border area too when in no-signal mode
        if (u_noSignal > 0.5) {
            vec3 borderStatic = noSignalStatic(curvedUV, u_time);
            borderStatic *= edgeFactor;
            gl_FragColor = vec4(borderStatic, 1.0);
            return;
        }
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }

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

        // Blend with bezel
        staticColor = mix(vec3(0.01), staticColor, edgeFactor);

        gl_FragColor = vec4(staticColor, 1.0);
        return;
    }

    // Get base color with RGB shift
    vec3 color = rgbShift(u_texture, contentUV);

    // Apply burn-in from accumulation buffer
    if (u_burnIn > 0.001) {
        // Burn-in texture is stored in non-flipped coords, flip Y to match main texture
        vec2 burnInCoord = vec2(contentUV.x, 1.0 - contentUV.y);
        vec3 burnInColor = texture2D(u_burnInTexture, burnInCoord).rgb;
        color = max(color, burnInColor * u_burnIn);
    }

    // Add phosphor glow
    color += glow(u_texture, contentUV);

    // Apply scanlines
    color *= scanlines(contentUV);

    // Apply shadow mask
    color *= shadowMask(contentUV);

    // Apply color adjustments
    color = adjustColor(color);

    // Apply vignette
    color *= vignette(contentUV);

    // Apply edge fade for curved screens
    if (u_curvature > 0.001) {
        color *= edgeFade(contentUV);
    }

    // Apply flicker
    color *= flicker(u_time);

    // Add glowing line
    color += vec3(glowingLine(contentUV, u_time));

    // Add static noise
    color += vec3(staticNoise(contentUV, u_time));

    // Apply ambient light
    color = applyAmbientLight(color, contentUV);

    // Blend with bezel
    vec3 bezelColor = vec3(0.01);
    color = mix(bezelColor, color, edgeFactor);

    // Clamp final color
    color = clamp(color, 0.0, 1.0);

    gl_FragColor = vec4(color, 1.0);
}
`;
