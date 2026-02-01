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

    // Selection overlay texture
    this.selectionTexture = null;

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

      // NTSC color fringing (simulates chroma bandwidth limiting)
      ntscFringing: 0.67, // 0.0 to 1.0

      // Monochrome mode (0=color, 1=green, 2=amber, 3=white)
      monochromeMode: 0,

      // Corner radius for rounded screen corners (0.0 to 0.15)
      cornerRadius: 0.02,

      // Screen margin - insets content so rounded corners don't clip it
      // Should be slightly larger than cornerRadius
      screenMargin: 0.02,

      // Edge highlight intensity (0.0 to 1.0)
      edgeHighlight: 0.3,

      // Beam position crosshair (-1.0 = off, 0.0–1.0 = normalized position)
      beamY: -1.0,
      beamX: -1.0,
    };

    // Time for animated effects
    this.time = 0;

    // Uniform locations
    this.uniforms = {};
    this.burnInUniforms = {};
  }

  async init() {
    // Get WebGL context
    const ctxAttrs = { alpha: true, premultipliedAlpha: false };
    this.gl =
      this.canvas.getContext("webgl2", ctxAttrs) || this.canvas.getContext("webgl", ctxAttrs);
    if (!this.gl) {
      throw new Error("WebGL not supported");
    }

    const gl = this.gl;

    // Load shader sources from files
    const [vertexSource, fragmentSource, burnInSource] = await Promise.all([
      this.loadShader("shaders/vertex.glsl"),
      this.loadShader("shaders/crt.glsl"),
      this.loadShader("shaders/burnin.glsl"),
    ]);

    // Create main shaders
    const vertexShader = this.compileShader(gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = this.compileShader(
      gl.FRAGMENT_SHADER,
      fragmentSource,
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
      vertexSource,
    );
    const burnInFragmentShader = this.compileShader(
      gl.FRAGMENT_SHADER,
      burnInSource,
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
      ntscFringing: gl.getUniformLocation(this.program, "u_ntscFringing"),
      monochromeMode: gl.getUniformLocation(this.program, "u_monochromeMode"),
      cornerRadius: gl.getUniformLocation(this.program, "u_cornerRadius"),
      screenMargin: gl.getUniformLocation(this.program, "u_screenMargin"),
      edgeHighlight: gl.getUniformLocation(this.program, "u_edgeHighlight"),
      beamY: gl.getUniformLocation(this.program, "u_beamY"),
      beamX: gl.getUniformLocation(this.program, "u_beamX"),
      selectionTexture: gl.getUniformLocation(this.program, "u_selectionTexture"),
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

    // Create selection overlay texture
    this.selectionTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.selectionTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.width, this.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, emptyData);

    // Set initial canvas size if not already set
    if (!this.canvas.width || !this.canvas.height) {
      this.canvas.width = this.width;
      this.canvas.height = this.height;
    }

    // Set viewport
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);

    // Enable blending for rounded corners transparency
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
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

  updateSelectionTexture(canvas) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.selectionTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
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

    // Apply any pending canvas resize right before painting so the
    // buffer clear and the redraw happen in the same frame (no flicker).
    if (this._pendingWidth !== undefined) {
      const pw = this._pendingWidth;
      const ph = this._pendingHeight;
      this._pendingWidth = undefined;
      this._pendingHeight = undefined;
      if (this.canvas.width !== pw || this.canvas.height !== ph) {
        this.canvas.width = pw;
        this.canvas.height = ph;
        gl.viewport(0, 0, pw, ph);
      }
    }

    // Update time for animated effects
    this.time += 0.016; // Approximately 60fps

    // Update burn-in accumulation
    this.updateBurnIn();

    gl.clearColor(0, 0, 0, 0); // Black background
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

    // Bind selection overlay texture
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.selectionTexture);
    gl.uniform1i(this.uniforms.selectionTexture, 2);

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
    gl.uniform1f(this.uniforms.ntscFringing, this.crtParams.ntscFringing);
    gl.uniform1i(this.uniforms.monochromeMode, this.crtParams.monochromeMode);
    gl.uniform1f(this.uniforms.cornerRadius, this.crtParams.cornerRadius);
    gl.uniform1f(this.uniforms.screenMargin, this.crtParams.screenMargin);
    gl.uniform1f(this.uniforms.edgeHighlight, this.crtParams.edgeHighlight);
    gl.uniform1f(this.uniforms.beamY, this.crtParams.beamY);
    gl.uniform1f(this.uniforms.beamX, this.crtParams.beamX);

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
    gl.clearColor(0, 0, 0, 0); // Black background
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
    // Defer the actual canvas buffer resize to the next draw() call.
    // Setting canvas.width/height clears the WebGL drawing buffer and forces
    // a GPU reallocation.  During a drag-resize this is called on every
    // mousemove, but draw() only runs once per rAF.  Deferring keeps the
    // buffer clear and the repaint in the same frame, eliminating flicker.
    const dpr = window.devicePixelRatio || 1;
    this._pendingWidth = Math.floor(width * dpr);
    this._pendingHeight = Math.floor(height * dpr);
  }

  async loadShader(path) {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Failed to load shader: ${path}`);
    }
    return response.text();
  }
}
