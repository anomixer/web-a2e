(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const i of document.querySelectorAll('link[rel="modulepreload"]'))s(i);new MutationObserver(i=>{for(const r of i)if(r.type==="childList")for(const a of r.addedNodes)a.tagName==="LINK"&&a.rel==="modulepreload"&&s(a)}).observe(document,{childList:!0,subtree:!0});function t(i){const r={};return i.integrity&&(r.integrity=i.integrity),i.referrerPolicy&&(r.referrerPolicy=i.referrerPolicy),i.crossOrigin==="use-credentials"?r.credentials="include":i.crossOrigin==="anonymous"?r.credentials="omit":r.credentials="same-origin",r}function s(i){if(i.ep)return;i.ep=!0;const r=t(i);fetch(i.href,r)}})();class y{constructor(e){this.canvas=e,this.gl=null,this.program=null,this.texture=null,this.width=560,this.height=384,this.crtParams={curvature:0,scanlineIntensity:0,scanlineWidth:.5,shadowMask:0,glowIntensity:0,glowSpread:.5,brightness:1,contrast:1,saturation:1,vignette:0,flicker:0,rgbOffset:0},this.time=0,this.uniforms={}}async init(){if(this.gl=this.canvas.getContext("webgl2")||this.canvas.getContext("webgl"),!this.gl)throw new Error("WebGL not supported");const e=this.gl,t=this.compileShader(e.VERTEX_SHADER,E),s=this.compileShader(e.FRAGMENT_SHADER,b);if(this.program=e.createProgram(),e.attachShader(this.program,t),e.attachShader(this.program,s),e.linkProgram(this.program),!e.getProgramParameter(this.program,e.LINK_STATUS))throw new Error("Shader program failed to link: "+e.getProgramInfoLog(this.program));this.positionLoc=e.getAttribLocation(this.program,"a_position"),this.texCoordLoc=e.getAttribLocation(this.program,"a_texCoord"),this.uniforms={texture:e.getUniformLocation(this.program,"u_texture"),resolution:e.getUniformLocation(this.program,"u_resolution"),textureSize:e.getUniformLocation(this.program,"u_textureSize"),time:e.getUniformLocation(this.program,"u_time"),curvature:e.getUniformLocation(this.program,"u_curvature"),scanlineIntensity:e.getUniformLocation(this.program,"u_scanlineIntensity"),scanlineWidth:e.getUniformLocation(this.program,"u_scanlineWidth"),shadowMask:e.getUniformLocation(this.program,"u_shadowMask"),glowIntensity:e.getUniformLocation(this.program,"u_glowIntensity"),glowSpread:e.getUniformLocation(this.program,"u_glowSpread"),brightness:e.getUniformLocation(this.program,"u_brightness"),contrast:e.getUniformLocation(this.program,"u_contrast"),saturation:e.getUniformLocation(this.program,"u_saturation"),vignette:e.getUniformLocation(this.program,"u_vignette"),flicker:e.getUniformLocation(this.program,"u_flicker"),rgbOffset:e.getUniformLocation(this.program,"u_rgbOffset")};const i=new Float32Array([-1,-1,0,1,1,-1,1,1,-1,1,0,0,1,1,1,0]);this.vertexBuffer=e.createBuffer(),e.bindBuffer(e.ARRAY_BUFFER,this.vertexBuffer),e.bufferData(e.ARRAY_BUFFER,i,e.STATIC_DRAW),this.texture=e.createTexture(),e.bindTexture(e.TEXTURE_2D,this.texture),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),this.useNearestFilter=!0,e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST);const r=new Uint8Array(this.width*this.height*4);e.texImage2D(e.TEXTURE_2D,0,e.RGBA,this.width,this.height,0,e.RGBA,e.UNSIGNED_BYTE,r),(!this.canvas.width||!this.canvas.height)&&(this.canvas.width=this.width,this.canvas.height=this.height),e.viewport(0,0,this.canvas.width,this.canvas.height)}compileShader(e,t){const s=this.gl,i=s.createShader(e);if(s.shaderSource(i,t),s.compileShader(i),!s.getShaderParameter(i,s.COMPILE_STATUS))throw new Error("Shader compilation failed: "+s.getShaderInfoLog(i));return i}updateTexture(e){const t=this.gl;t.bindTexture(t.TEXTURE_2D,this.texture),t.texSubImage2D(t.TEXTURE_2D,0,0,0,this.width,this.height,t.RGBA,t.UNSIGNED_BYTE,e)}draw(){const e=this.gl;this.time+=.016,e.clearColor(0,0,0,1),e.clear(e.COLOR_BUFFER_BIT),e.useProgram(this.program),e.bindBuffer(e.ARRAY_BUFFER,this.vertexBuffer),e.enableVertexAttribArray(this.positionLoc),e.vertexAttribPointer(this.positionLoc,2,e.FLOAT,!1,16,0),e.enableVertexAttribArray(this.texCoordLoc),e.vertexAttribPointer(this.texCoordLoc,2,e.FLOAT,!1,16,8),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,this.texture),e.uniform1i(this.uniforms.texture,0),e.uniform2f(this.uniforms.resolution,this.canvas.width,this.canvas.height),e.uniform2f(this.uniforms.textureSize,this.width,this.height),e.uniform1f(this.uniforms.time,this.time),e.uniform1f(this.uniforms.curvature,this.crtParams.curvature),e.uniform1f(this.uniforms.scanlineIntensity,this.crtParams.scanlineIntensity),e.uniform1f(this.uniforms.scanlineWidth,this.crtParams.scanlineWidth),e.uniform1f(this.uniforms.shadowMask,this.crtParams.shadowMask),e.uniform1f(this.uniforms.glowIntensity,this.crtParams.glowIntensity),e.uniform1f(this.uniforms.glowSpread,this.crtParams.glowSpread),e.uniform1f(this.uniforms.brightness,this.crtParams.brightness),e.uniform1f(this.uniforms.contrast,this.crtParams.contrast),e.uniform1f(this.uniforms.saturation,this.crtParams.saturation),e.uniform1f(this.uniforms.vignette,this.crtParams.vignette),e.uniform1f(this.uniforms.flicker,this.crtParams.flicker),e.uniform1f(this.uniforms.rgbOffset,this.crtParams.rgbOffset),e.drawArrays(e.TRIANGLE_STRIP,0,4)}clear(){const e=this.gl,t=new Uint8Array(this.width*this.height*4);e.bindTexture(e.TEXTURE_2D,this.texture),e.texSubImage2D(e.TEXTURE_2D,0,0,0,this.width,this.height,e.RGBA,e.UNSIGNED_BYTE,t),e.clearColor(0,0,0,1),e.clear(e.COLOR_BUFFER_BIT),this.draw()}setParam(e,t){e in this.crtParams&&(this.crtParams[e]=t)}setParams(e){for(const[t,s]of Object.entries(e))t in this.crtParams&&(this.crtParams[t]=s)}setNearestFilter(e){const t=this.gl;this.useNearestFilter=e,t.bindTexture(t.TEXTURE_2D,this.texture),e?(t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.NEAREST)):(t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR))}setCRTEnabled(e){e?(this.crtParams.curvature=.3,this.crtParams.scanlineIntensity=.3,this.crtParams.shadowMask=.2,this.crtParams.vignette=.2,this.crtParams.glowIntensity=.1):(this.crtParams.curvature=0,this.crtParams.scanlineIntensity=0,this.crtParams.shadowMask=0,this.crtParams.vignette=0,this.crtParams.glowIntensity=0)}resize(e,t){const s=window.devicePixelRatio||1;this.canvas.width=Math.floor(e*s),this.canvas.height=Math.floor(t*s),this.gl.viewport(0,0,this.canvas.width,this.canvas.height)}}const E=`
attribute vec2 a_position;
attribute vec2 a_texCoord;
varying vec2 v_texCoord;

void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
}
`,b=`
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
`;class M{constructor(e){this.wasmModule=e,this.audioContext=null,this.workletNode=null,this.gainNode=null,this.sampleRate=48e3,this.bufferSize=128,this.running=!1,this.muted=!1,this.speed=1,this.useWorklet=typeof AudioWorkletNode<"u",this.scriptProcessor=null,this.onFrameReady=null}async start(){if(!this.running)try{if(this.audioContext=new(window.AudioContext||window.webkitAudioContext)({sampleRate:this.sampleRate}),this.audioContext.state==="suspended"){console.log("Audio context suspended, using fallback timing until user interaction"),this.startFallbackTiming(),this.setupAutoResumeAudio();return}await this.initAudioNodes()}catch(e){console.error("Failed to start audio driver:",e),this.startFallbackTiming()}}async initAudioNodes(){this.gainNode=this.audioContext.createGain(),this.gainNode.connect(this.audioContext.destination),this.gainNode.gain.value=this.muted?0:.5,this.useWorklet?await this.startWithWorklet():this.startWithScriptProcessor(),this.running=!0,console.log("Audio driver started")}setupAutoResumeAudio(){const e=async()=>{if(this.audioContext&&this.audioContext.state==="suspended")try{await this.audioContext.resume(),console.log("Audio context resumed"),this.fallbackInterval&&(clearInterval(this.fallbackInterval),this.fallbackInterval=null),await this.initAudioNodes()}catch(t){console.error("Failed to resume audio context:",t)}document.removeEventListener("click",e),document.removeEventListener("keydown",e)};document.addEventListener("click",e,{once:!0}),document.addEventListener("keydown",e,{once:!0})}async startWithWorklet(){await this.audioContext.audioWorklet.addModule("/audio-worklet.js"),this.workletNode=new AudioWorkletNode(this.audioContext,"apple-audio-processor",{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[1]}),this.workletNode.port.onmessage=t=>{if(!(!this.workletNode||!this.running)&&t.data.type==="requestSamples"){const s=this.generateSamples(t.data.count);this.workletNode&&this.workletNode.port&&this.workletNode.port.postMessage({type:"samples",data:s})}},this.workletNode.connect(this.gainNode),this.workletNode.port.postMessage({type:"start"})}startWithScriptProcessor(){this.scriptProcessor=this.audioContext.createScriptProcessor(4096,0,1),this.scriptProcessor.onaudioprocess=e=>{const t=e.outputBuffer.getChannelData(0),s=this.generateSamples(t.length);t.set(s)},this.scriptProcessor.connect(this.gainNode)}startFallbackTiming(){this.fallbackInterval=setInterval(()=>{this.speed===0?this.wasmModule._runCycles(17050*10):this.wasmModule._runCycles(17050*this.speed);const s=this.wasmModule._consumeFrameSamples();s>0&&this.onFrameReady&&this.onFrameReady(s)},1e3/60),this.running=!0,console.log("Using fallback timing (no audio)")}generateSamples(e){const t=this.wasmModule._malloc(e*4);this.wasmModule._generateAudioSamples(t,e);const s=new Float32Array(e);for(let r=0;r<e;r++)s[r]=this.wasmModule.HEAPF32[(t>>2)+r];this.wasmModule._free(t);const i=this.wasmModule._consumeFrameSamples();return i>0&&this.onFrameReady&&this.onFrameReady(i),s}stop(){if(this.running){if(this.running=!1,this.workletNode){try{this.workletNode.port.postMessage({type:"stop"}),this.workletNode.disconnect()}catch{}this.workletNode=null}if(this.scriptProcessor){try{this.scriptProcessor.disconnect()}catch{}this.scriptProcessor=null}if(this.fallbackInterval&&(clearInterval(this.fallbackInterval),this.fallbackInterval=null),this.audioContext){try{this.audioContext.close()}catch{}this.audioContext=null}console.log("Audio driver stopped")}}setSpeed(e){this.speed=e}toggleMute(){this.muted=!this.muted,this.gainNode&&(this.gainNode.gain.value=this.muted?0:.5)}isMuted(){return this.muted}setVolume(e){this.gainNode&&(this.gainNode.gain.value=this.muted?0:e)}}class _{constructor(e){this.wasmModule=e,this.keyMap=new Map,this.setupKeyMap(),this.ctrlPressed=!1,this.shiftPressed=!1,this.altPressed=!1,this.metaPressed=!1,this.canvas=null}init(){this.canvas=document.getElementById("screen"),this.canvas.tabIndex=1,this.canvas.addEventListener("click",()=>{this.canvas.focus()}),setTimeout(()=>this.canvas.focus(),100),this.canvas.addEventListener("keydown",e=>this.handleKeyDown(e)),this.canvas.addEventListener("keyup",e=>this.handleKeyUp(e)),document.addEventListener("keydown",e=>{(document.activeElement===this.canvas||document.activeElement===document.body)&&this.handleKeyDown(e)}),document.addEventListener("keyup",e=>{(document.activeElement===this.canvas||document.activeElement===document.body)&&this.handleKeyUp(e)})}setupKeyMap(){for(let e=65;e<=90;e++)this.keyMap.set(e,e+32);for(let e=48;e<=57;e++)this.keyMap.set(e,e);this.keyMap.set(13,13),this.keyMap.set(8,8),this.keyMap.set(27,27),this.keyMap.set(32,32),this.keyMap.set(9,9),this.keyMap.set(37,8),this.keyMap.set(38,11),this.keyMap.set(39,21),this.keyMap.set(40,10),this.keyMap.set(188,44),this.keyMap.set(190,46),this.keyMap.set(191,47),this.keyMap.set(186,59),this.keyMap.set(222,39),this.keyMap.set(219,91),this.keyMap.set(221,93),this.keyMap.set(220,92),this.keyMap.set(189,45),this.keyMap.set(187,61),this.keyMap.set(192,96)}handleKeyDown(e){const t=e.keyCode||e.which;if(t===16){this.shiftPressed=!0;return}if(t===17){this.ctrlPressed=!0;return}if(t===18){this.altPressed=!0,this.wasmModule._setButton(0,!0);return}if(t===91||t===93){this.metaPressed=!0,this.wasmModule._setButton(1,!0);return}if(this.ctrlPressed&&t===82)return;let s=this.keyMap.get(t);if(s===void 0)return;this.shouldPreventDefault(e)&&e.preventDefault(),document.activeElement===this.canvas&&e.preventDefault();const i=e.getModifierState&&e.getModifierState("CapsLock");s>=97&&s<=122?(i&&!this.shiftPressed||!i&&this.shiftPressed)&&(s=s-32):this.shiftPressed&&(s=this.applyShift(s,t)),this.ctrlPressed&&(s>=97&&s<=122?s=s-96:s>=65&&s<=90&&(s=s-64)),this.wasmModule._keyDown(s)}handleKeyUp(e){const t=e.keyCode||e.which;if(t===16){this.shiftPressed=!1;return}if(t===17){this.ctrlPressed=!1;return}if(t===18){this.altPressed=!1,this.wasmModule._setButton(0,!1);return}if(t===91||t===93){this.metaPressed=!1,this.wasmModule._setButton(1,!1);return}const s=this.keyMap.get(t);s!==void 0&&this.wasmModule._keyUp(s)}applyShift(e,t){return{48:41,49:33,50:64,51:35,52:36,53:37,54:94,55:38,56:42,57:40,188:60,190:62,191:63,186:58,222:34,219:123,221:125,220:124,189:95,187:43,192:126}[t]||e}shouldPreventDefault(e){const t=e.keyCode||e.which;return!!([8,9,27,32,37,38,39,40].includes(t)&&!e.ctrlKey&&!e.metaKey)}}class S{constructor(e){this.wasmModule=e,this.drives=[{input:null,insertBtn:null,blankBtn:null,ejectBtn:null,led:null,trackLabel:null,filename:null},{input:null,insertBtn:null,blankBtn:null,ejectBtn:null,led:null,trackLabel:null,filename:null}],this.pendingEjectDrive=null,this.saveModal=null,this.saveFilenameInput=null}init(){this.setupDrive(0,"disk1"),this.setupDrive(1,"disk2"),this.setupDragDrop(),this.setupSaveModal()}setupDrive(e,t){const s=document.getElementById(t);if(!s)return;const i=this.drives[e];i.input=s.querySelector(`#${t}-input`),i.insertBtn=s.querySelector(".disk-insert"),i.blankBtn=s.querySelector(".disk-blank"),i.ejectBtn=s.querySelector(".disk-eject"),i.led=s.querySelector(".disk-led"),i.nameLabel=s.querySelector(".disk-name"),i.trackLabel=s.querySelector(".disk-track"),i.insertBtn&&i.insertBtn.addEventListener("click",()=>{i.input.click()}),i.blankBtn&&i.blankBtn.addEventListener("click",()=>{this.insertBlankDisk(e)}),i.input&&i.input.addEventListener("change",r=>{r.target.files.length>0&&this.loadDisk(e,r.target.files[0])}),i.ejectBtn&&i.ejectBtn.addEventListener("click",()=>{this.ejectDisk(e)})}setupDragDrop(){const e=document.getElementById("monitor-frame");e&&(e.addEventListener("dragover",t=>{t.preventDefault(),t.stopPropagation(),e.classList.add("drag-over")}),e.addEventListener("dragleave",t=>{t.preventDefault(),t.stopPropagation(),e.classList.remove("drag-over")}),e.addEventListener("drop",t=>{if(t.preventDefault(),t.stopPropagation(),e.classList.remove("drag-over"),t.dataTransfer.files.length>0){const s=this.drives[0].filename?this.drives[1].filename?0:1:0;this.loadDisk(s,t.dataTransfer.files[0])}}))}setupSaveModal(){var i;this.saveModal=document.getElementById("save-disk-modal"),this.saveFilenameInput=document.getElementById("save-disk-filename");const e=document.getElementById("save-disk-confirm"),t=document.getElementById("save-disk-cancel"),s=(i=this.saveModal)==null?void 0:i.querySelector(".modal-backdrop");e&&e.addEventListener("click",()=>{this.handleSaveConfirm()}),t&&t.addEventListener("click",()=>{this.handleSaveCancel()}),s&&s.addEventListener("click",()=>{this.handleSaveCancel()}),this.saveFilenameInput&&this.saveFilenameInput.addEventListener("keydown",r=>{r.key==="Enter"?this.handleSaveConfirm():r.key==="Escape"&&this.handleSaveCancel()})}showSaveModal(e){const t=this.drives[e];this.pendingEjectDrive=e;let s=t.filename||`disk${e+1}.dsk`;if(s.includes(".")||(s+=".dsk"),this.saveFilenameInput&&(this.saveFilenameInput.value=s),this.saveModal&&(this.saveModal.classList.remove("hidden"),this.saveFilenameInput)){this.saveFilenameInput.focus();const i=s.lastIndexOf(".");i>0?this.saveFilenameInput.setSelectionRange(0,i):this.saveFilenameInput.select()}}hideSaveModal(){this.saveModal&&this.saveModal.classList.add("hidden"),this.pendingEjectDrive=null}async handleSaveConfirm(){var i;if(this.pendingEjectDrive===null)return;const e=this.pendingEjectDrive,t=((i=this.saveFilenameInput)==null?void 0:i.value)||`disk${e+1}.dsk`;this.hideSaveModal();const s=await this.saveDiskWithPicker(e,t);this.performEject(e),s&&console.log("Disk saved successfully")}handleSaveCancel(){if(this.pendingEjectDrive===null)return;const e=this.pendingEjectDrive;this.hideSaveModal(),this.performEject(e)}performEject(e){const t=this.drives[e];this.wasmModule._ejectDisk(e),t.filename=null,t.ejectBtn&&(t.ejectBtn.disabled=!0),t.input&&(t.input.value=""),t.nameLabel&&(t.nameLabel.textContent="No Disk"),console.log(`Ejected disk from drive ${e+1}`)}async loadDisk(e,t){const s=this.drives[e];try{const i=await t.arrayBuffer(),r=new Uint8Array(i),a=this.wasmModule._malloc(r.length);this.wasmModule.HEAPU8.set(r,a);const d=this.wasmModule._malloc(t.name.length+1);this.wasmModule.stringToUTF8(t.name,d,t.name.length+1);const l=this.wasmModule._insertDisk(e,a,r.length,d);this.wasmModule._free(a),this.wasmModule._free(d),l?(s.filename=t.name,s.ejectBtn&&(s.ejectBtn.disabled=!1),s.nameLabel&&(s.nameLabel.textContent=t.name),console.log(`Inserted disk in drive ${e+1}: ${t.name}`)):alert(`Failed to load disk image: ${t.name}`)}catch(i){console.error("Error loading disk:",i),alert("Error loading disk: "+i.message)}}insertBlankDisk(e){const t=this.drives[e],s=this.createBlankWozDisk();console.log("WOZ data size:",s.length),console.log("First 20 bytes (header+INFO start):",Array.from(s.slice(0,20)).map(l=>l.toString(16).padStart(2,"0")).join(" ")),console.log("Bytes 80-100 (TMAP should start here):",Array.from(s.slice(80,100)).map(l=>l.toString(16).padStart(2,"0")).join(" ")),console.log("Bytes 248-268 (TRKS should start here):",Array.from(s.slice(248,268)).map(l=>l.toString(16).padStart(2,"0")).join(" "));const i=this.wasmModule._malloc(s.length);this.wasmModule.HEAPU8.set(s,i);const r="Blank Disk.woz",a=this.wasmModule._malloc(r.length+1);this.wasmModule.stringToUTF8(r,a,r.length+1);const d=this.wasmModule._insertDisk(e,i,s.length,a);this.wasmModule._free(i),this.wasmModule._free(a),d?(t.filename=r,t.ejectBtn&&(t.ejectBtn.disabled=!1),t.nameLabel&&(t.nameLabel.textContent=r),console.log(`Inserted blank WOZ disk in drive ${e+1}`)):alert("Failed to insert blank disk")}createBlankWozDisk(){const s=Math.ceil(6400),i=Math.ceil(s/512),r=160*8,a=3,d=35*i*512,l=a*512+d,n=new Uint8Array(l);let o=0;n[o++]=87,n[o++]=79,n[o++]=90,n[o++]=50,n[o++]=255,n[o++]=10,n[o++]=13,n[o++]=10,n[o++]=0,n[o++]=0,n[o++]=0,n[o++]=0,n[o++]=73,n[o++]=78,n[o++]=70,n[o++]=79,n[o++]=60,n[o++]=0,n[o++]=0,n[o++]=0,n[o++]=2,n[o++]=1,n[o++]=0,n[o++]=0,n[o++]=1;const v="A2E Emulator";for(let c=0;c<32;c++)n[o++]=c<v.length?v.charCodeAt(c):32;n[o++]=1,n[o++]=0,n[o++]=32,n[o++]=0,n[o++]=0,n[o++]=0,n[o++]=0,n[o++]=i&255,n[o++]=i>>8&255,n[o++]=0,n[o++]=0,n[o++]=0,n[o++]=0;for(let c=0;c<10;c++)n[o++]=0;console.log("After INFO data, offset:",o),console.log("TMAP chunk starting at offset:",o),n[o++]=84,n[o++]=77,n[o++]=65,n[o++]=80,n[o++]=160,n[o++]=0,n[o++]=0,n[o++]=0;for(let c=0;c<160;c++){const u=Math.floor(c/4);u<35?n[o++]=u:n[o++]=255}n[o++]=84,n[o++]=82,n[o++]=75,n[o++]=83;const f=r;n[o++]=f&255,n[o++]=f>>8&255,n[o++]=f>>16&255,n[o++]=f>>24&255;for(let c=0;c<160;c++)if(c<35){const u=a+c*i;n[o++]=u&255,n[o++]=u>>8&255,n[o++]=i&255,n[o++]=i>>8&255,n[o++]=0,n[o++]=200,n[o++]=0,n[o++]=0}else for(let u=0;u<8;u++)n[o++]=0;for(;o<a*512;)n[o++]=0;for(let c=0;c<35;c++){const u=a*512+c*i*512;for(let g=0;g<i*512;g++)n[u+g]=255}return n}ejectDisk(e){const t=typeof this.wasmModule._isDiskModified=="function",s=t&&this.wasmModule._isDiskModified(e);console.log(`Eject drive ${e+1}: hasModifiedCheck=${t}, isModified=${s}`),s?this.showSaveModal(e):this.performEject(e)}updateLEDs(){if(!this.wasmModule._getDiskMotorOn)return;const e=this.wasmModule._getSelectedDrive?this.wasmModule._getSelectedDrive():0;for(let t=0;t<2;t++){const s=this.drives[t];if(s.led&&(this.wasmModule._getDiskMotorOn(t)&&t===e?s.led.classList.add("active"):s.led.classList.remove("active")),s.trackLabel)if(s.filename&&this.wasmModule._getDiskTrack){const i=this.wasmModule._getDiskTrack(t);s.trackLabel.textContent=`T${i.toString().padStart(2,"0")}`,this.wasmModule._getDiskMotorOn(t)&&t===e?s.trackLabel.classList.add("active"):s.trackLabel.classList.remove("active")}else s.trackLabel.textContent="T--",s.trackLabel.classList.remove("active")}}saveDisk(e){this.saveDiskAs(e,this.drives[e].filename||`disk${e+1}.dsk`)}async saveDiskWithPicker(e,t){const s=this.wasmModule._malloc(4),i=this.wasmModule._getDiskData(e,s);if(!i)return this.wasmModule._free(s),!1;const r=this.wasmModule.HEAPU32[s>>2],a=new Uint8Array(this.wasmModule.HEAPU8.buffer,i,r),d=new Uint8Array(a);if(this.wasmModule._free(s),"showSaveFilePicker"in window)try{const l=await window.showSaveFilePicker({suggestedName:t,types:[{description:"Disk Images",accept:{"application/octet-stream":[".dsk",".do",".po",".woz",".nib"]}}]}),n=await l.createWritable();return await n.write(d),await n.close(),console.log(`Saved disk from drive ${e+1} to: ${l.name}`),!0}catch(l){return l.name!=="AbortError"&&console.error("Error saving disk:",l),!1}else return this.downloadFile(d,t),!0}downloadFile(e,t){const s=new Blob([e],{type:"application/octet-stream"}),i=URL.createObjectURL(s),r=document.createElement("a");r.href=i,r.download=t,r.click(),URL.revokeObjectURL(i)}saveDiskAs(e,t){const s=this.wasmModule._malloc(4),i=this.wasmModule._getDiskData(e,s);if(!i){this.wasmModule._free(s);return}const r=this.wasmModule.HEAPU32[s>>2],a=new Uint8Array(this.wasmModule.HEAPU8.buffer,i,r);this.downloadFile(new Uint8Array(a),t),this.wasmModule._free(s),console.log(`Saved disk from drive ${e+1} as: ${t}`)}}class B{constructor(e){this.wasmModule=e,this.breakpoints=new Map,this.memoryViewAddress=0}init(){this.setupControls(),this.setupBreakpoints(),this.setupMemoryViewer()}setupControls(){document.getElementById("dbg-run").addEventListener("click",()=>{this.wasmModule._setPaused(!1)}),document.getElementById("dbg-pause").addEventListener("click",()=>{this.wasmModule._setPaused(!0)}),document.getElementById("dbg-step").addEventListener("click",()=>{this.wasmModule._stepInstruction(),this.refresh()}),document.getElementById("dbg-step-over").addEventListener("click",()=>{const e=this.wasmModule._getPC();if(this.wasmModule._readMemory(e)===32){const s=e+3;this.wasmModule._addBreakpoint(s),this.wasmModule._setPaused(!1)}else this.wasmModule._stepInstruction();this.refresh()}),document.getElementById("dbg-step-out").addEventListener("click",()=>{this.wasmModule._setPaused(!1),this.refresh()})}setupBreakpoints(){const e=document.getElementById("bp-add-btn"),t=document.getElementById("bp-address");e.addEventListener("click",()=>{const s=t.value.replace(/^\$/,""),i=parseInt(s,16);!isNaN(i)&&i>=0&&i<=65535&&(this.addBreakpoint(i),t.value="")}),t.addEventListener("keypress",s=>{s.key==="Enter"&&e.click()})}setupMemoryViewer(){const e=document.getElementById("mem-goto"),t=document.getElementById("mem-address");e.addEventListener("click",()=>{const s=t.value.replace(/^\$/,""),i=parseInt(s,16);!isNaN(i)&&i>=0&&i<=65535&&(this.memoryViewAddress=i&65520,this.updateMemoryView())}),t.addEventListener("keypress",s=>{s.key==="Enter"&&e.click()})}addBreakpoint(e){this.breakpoints.set(e,!0),this.wasmModule._addBreakpoint(e),this.updateBreakpointList()}removeBreakpoint(e){this.breakpoints.delete(e),this.wasmModule._removeBreakpoint(e),this.updateBreakpointList()}toggleBreakpoint(e){const t=!this.breakpoints.get(e);this.breakpoints.set(e,t),this.wasmModule._enableBreakpoint(e,t),this.updateBreakpointList()}updateBreakpointList(){const e=document.getElementById("breakpoint-list");e.innerHTML="";for(const[t,s]of this.breakpoints){const i=document.createElement("div");i.className="breakpoint-item";const r=document.createElement("input");r.type="checkbox",r.checked=s,r.addEventListener("change",()=>this.toggleBreakpoint(t));const a=document.createElement("span");a.className="bp-addr",a.textContent="$"+t.toString(16).toUpperCase().padStart(4,"0");const d=document.createElement("button");d.textContent="X",d.addEventListener("click",()=>this.removeBreakpoint(t)),i.appendChild(r),i.appendChild(a),i.appendChild(d),e.appendChild(i)}}refresh(){this.updateRegisters(),this.updateFlags(),this.updateDisassembly(),this.updateMemoryView(),this.updateSoftSwitches(),this.updateDiskStatus()}updateRegisters(){const e=i=>i.toString(16).toUpperCase().padStart(2,"0"),t=i=>i.toString(16).toUpperCase().padStart(4,"0");document.getElementById("reg-a").textContent=e(this.wasmModule._getA()),document.getElementById("reg-x").textContent=e(this.wasmModule._getX()),document.getElementById("reg-y").textContent=e(this.wasmModule._getY()),document.getElementById("reg-sp").textContent=e(this.wasmModule._getSP()),document.getElementById("reg-pc").textContent=t(this.wasmModule._getPC());const s=this.wasmModule._getTotalCycles();document.getElementById("cycle-count").textContent=s.toString()}updateFlags(){const e=this.wasmModule._getP(),t={"flag-n":(e&128)!==0,"flag-v":(e&64)!==0,"flag-b":(e&16)!==0,"flag-d":(e&8)!==0,"flag-i":(e&4)!==0,"flag-z":(e&2)!==0,"flag-c":(e&1)!==0};for(const[s,i]of Object.entries(t)){const r=document.getElementById(s);r&&r.classList.toggle("active",i)}}updateDisassembly(){const e=document.getElementById("disasm-view");e.innerHTML="";const t=this.wasmModule._getPC();let s=Math.max(0,t-10);for(let i=0;i<20;i++){const r=document.createElement("div");r.className="disasm-line",s===t&&r.classList.add("current"),this.breakpoints.has(s)&&r.classList.add("breakpoint");const a=document.createElement("span");a.className="disasm-addr",a.textContent="$"+s.toString(16).toUpperCase().padStart(4,"0");const d=this.wasmModule._readMemory(s),l=document.createElement("span");l.className="disasm-bytes",l.textContent=d.toString(16).toUpperCase().padStart(2,"0");const n=document.createElement("span");n.className="disasm-instruction";const o=this.wasmModule.UTF8ToString(this.wasmModule._disassembleAt(s));if(n.textContent=o.substring(6),r.appendChild(a),r.appendChild(l),r.appendChild(n),r.addEventListener("click",()=>{this.breakpoints.has(s)?this.removeBreakpoint(s):this.addBreakpoint(s),this.updateDisassembly()}),e.appendChild(r),s+=this.getInstructionLength(d),s>65535)break}}getInstructionLength(e){return{0:2,8:1,24:1,40:1,56:1,64:1,72:1,88:1,96:1,104:1,120:1,136:1,138:1,152:1,154:1,168:1,170:1,184:1,186:1,200:1,202:1,216:1,232:1,234:1,248:1,12:3,13:3,14:3,25:3,28:3,29:3,30:3,32:3,44:3,45:3,46:3,57:3,60:3,61:3,62:3,76:3,77:3,78:3,89:3,93:3,94:3,108:3,109:3,110:3,121:3,124:3,125:3,126:3,140:3,141:3,142:3,153:3,156:3,157:3,158:3,172:3,173:3,174:3,185:3,188:3,189:3,190:3,204:3,205:3,206:3,217:3,221:3,222:3,236:3,237:3,238:3,249:3,253:3,254:3}[e]||2}updateMemoryView(){const e=document.getElementById("memory-dump");let t="";for(let s=0;s<16;s++){const i=this.memoryViewAddress+s*16&65535;t+=`<span class="mem-addr">${i.toString(16).toUpperCase().padStart(4,"0")}:</span> `;let r="";for(let a=0;a<16;a++){const d=i+a&65535,l=this.wasmModule._readMemory(d);t+=`<span class="mem-byte">${l.toString(16).toUpperCase().padStart(2,"0")}</span> `,r+=l>=32&&l<127?String.fromCharCode(l):"."}t+=`<span class="mem-ascii">${r}</span>
`}e.innerHTML=t}updateSoftSwitches(){const e=this.wasmModule._getSoftSwitchState(),t={"sw-text":(e&1)!==0,"sw-mixed":(e&2)!==0,"sw-page2":(e&4)!==0,"sw-hires":(e&8)!==0,"sw-80col":(e&16)!==0,"sw-80store":(e&32)!==0,"sw-ramrd":(e&64)!==0,"sw-ramwrt":(e&128)!==0,"sw-altzp":(e&256)!==0,"sw-lcram":(e&512)!==0,"sw-lcbnk2":(e&1024)!==0};for(const[s,i]of Object.entries(t)){const r=document.getElementById(s);r&&r.classList.toggle("active",i)}}updateDiskStatus(){if(!this.wasmModule._getDiskTrack)return;const e=i=>"$"+i.toString(16).toUpperCase().padStart(2,"0");for(let i=0;i<2;i++){const r=document.getElementById(`drive${i+1}-status`);if(!r)continue;const a=this.wasmModule._getDiskHeadPosition(i),d=this.wasmModule._getDiskTrack(i),l=this.wasmModule._getDiskPhase(i),n=this.wasmModule._getDiskMotorOn(i),o=this.wasmModule._getDiskWriteMode(i),v=this.wasmModule._getCurrentNibblePosition(i),f=this.wasmModule._isDiskInserted(i),c=r.querySelector(".disk-inserted"),u=r.querySelector(".quarter-track"),g=r.querySelector(".track"),k=r.querySelector(".phase"),w=r.querySelector(".nibble-pos"),x=r.querySelector(".motor"),m=r.querySelector(".mode");c&&(c.textContent=f?"Disk Inserted":"No Disk"),u&&(u.textContent=a),g&&(g.textContent=d),k&&(k.textContent=l),w&&(w.textContent=v),x&&(x.textContent=n?"Motor ON":"Motor OFF",x.classList.toggle("on",n)),m&&(m.textContent=o?"Write Mode":"Read Mode")}const t=document.getElementById("sel-drive");if(t){const i=this.wasmModule._getSelectedDrive();t.textContent=i+1}const s=document.getElementById("last-disk-byte");if(s){const i=this.wasmModule._getLastDiskByte();s.textContent=e(i)}}}class T{constructor(e){this.renderer=e,this.panel=null,this.defaults={curvature:0,scanlines:0,shadowMask:0,phosphorGlow:0,vignette:0,brightness:100,contrast:100,saturation:100,rgbOffset:0,flicker:0,sharpPixels:!0},this.settings={...this.defaults},this.sliders={},this.valueDisplays={}}init(){this.panel=document.getElementById("display-panel");const e=document.getElementById("btn-display");e&&e.addEventListener("click",()=>this.togglePanel());const t=document.getElementById("display-panel-close");t&&t.addEventListener("click",()=>this.hidePanel());const s=document.getElementById("display-reset");s&&s.addEventListener("click",()=>this.resetToDefaults()),this.setupSlider("curvature","curvature",i=>i/100),this.setupSlider("scanlines","scanlineIntensity",i=>i/100),this.setupSlider("shadowMask","shadowMask",i=>i/100),this.setupSlider("phosphorGlow","glowIntensity",i=>i/100),this.setupSlider("vignette","vignette",i=>i/100),this.setupSlider("brightness","brightness",i=>i/100),this.setupSlider("contrast","contrast",i=>i/100),this.setupSlider("saturation","saturation",i=>i/100),this.setupSlider("rgbOffset","rgbOffset",i=>i/100),this.setupSlider("flicker","flicker",i=>i/100),this.setupToggle("sharpPixels"),this.loadSettings(),this.applyAllSettings()}setupSlider(e,t,s){const i=document.getElementById(`setting-${e}`),r=document.getElementById(`value-${e}`);i&&r&&(this.sliders[e]={slider:i,shaderParam:t,convertFn:s},this.valueDisplays[e]=r,i.addEventListener("input",a=>{const d=parseInt(a.target.value,10);this.settings[e]=d,this.updateValueDisplay(e),this.applyToRenderer(e),this.saveSettings()}))}setupToggle(e){const t=document.getElementById(`setting-${e}`);t&&(this.toggles=this.toggles||{},this.toggles[e]=t,t.addEventListener("change",s=>{this.settings[e]=s.target.checked,this.applyToggleToRenderer(e),this.saveSettings()}))}applyToggleToRenderer(e){this.renderer&&e==="sharpPixels"&&this.renderer.setNearestFilter(this.settings.sharpPixels)}updateValueDisplay(e){const t=this.settings[e],s=this.valueDisplays[e];s&&(s.textContent=`${t}%`)}applyToRenderer(e){if(!this.renderer)return;const t=this.sliders[e];if(t){const s=t.convertFn(this.settings[e]);this.renderer.setParam(t.shaderParam,s)}}applyAllSettings(){for(const e of Object.keys(this.settings)){const t=this.sliders[e];t&&t.slider&&(t.slider.value=this.settings[e]),this.updateValueDisplay(e),this.applyToRenderer(e)}if(this.toggles)for(const e of Object.keys(this.toggles)){const t=this.toggles[e];t&&(t.checked=this.settings[e]),this.applyToggleToRenderer(e)}}resetToDefaults(){this.settings={...this.defaults},this.applyAllSettings(),this.saveSettings()}saveSettings(){try{localStorage.setItem("a2e-display-settings",JSON.stringify(this.settings))}catch(e){console.warn("Could not save display settings:",e)}}loadSettings(){try{const e=localStorage.getItem("a2e-display-settings");if(e){const t=JSON.parse(e);this.settings={...this.defaults,...t}}}catch(e){console.warn("Could not load display settings:",e)}}togglePanel(){this.panel&&this.panel.classList.toggle("hidden")}showPanel(){this.panel&&this.panel.classList.remove("hidden")}hidePanel(){this.panel&&this.panel.classList.add("hidden")}isVisible(){return this.panel&&!this.panel.classList.contains("hidden")}}class L{constructor(){this.wasmModule=null,this.renderer=null,this.audioDriver=null,this.inputHandler=null,this.diskManager=null,this.debugger=null,this.displaySettings=null,this.running=!1,this.speed=1,this.aspectRatio=560/384,this.handleResize=this.handleResize.bind(this)}async init(){this.showLoading(!0);try{this.wasmModule=await window.createA2EModule(),this.wasmModule._init();const e=document.getElementById("screen");this.renderer=new y(e),await this.renderer.init(),this.audioDriver=new M(this.wasmModule),this.audioDriver.onFrameReady=t=>{this.renderFrame()},this.inputHandler=new _(this.wasmModule),this.inputHandler.init(),this.diskManager=new S(this.wasmModule),this.diskManager.init(),this.debugger=new B(this.wasmModule),this.debugger.init(),this.displaySettings=new T(this.renderer),this.displaySettings.init(),this.setupControls(),this.setupResizeHandling(),this.handleResize(),this.startRenderLoop(),this.showLoading(!1),console.log("Apple //e Emulator initialized")}catch(e){console.error("Failed to initialize emulator:",e),this.showLoading(!1),alert("Failed to initialize emulator: "+e.message)}}setupControls(){const e=document.getElementById("btn-power"),t=document.getElementById("btn-mute");e.addEventListener("click",()=>{this.running?this.stop():this.start()}),document.getElementById("btn-warm-reset").addEventListener("click",()=>{this.wasmModule._warmReset()}),document.getElementById("btn-cold-reset").addEventListener("click",()=>{this.wasmModule._reset()}),document.getElementById("btn-fullscreen").addEventListener("click",()=>{const i=document.getElementById("monitor-frame");document.fullscreenElement?document.exitFullscreen():i.requestFullscreen()}),t.addEventListener("click",()=>{this.audioDriver.toggleMute(),this.updateMuteButton()}),document.getElementById("btn-debugger").addEventListener("click",()=>{this.toggleDebugger()});const s=document.getElementById("debugger-close");s&&s.addEventListener("click",()=>{this.toggleDebugger(!1)})}toggleDebugger(e){const t=document.getElementById("debugger-panel");e===!1?t.classList.add("hidden"):e===!0?t.classList.remove("hidden"):t.classList.toggle("hidden"),t.classList.contains("hidden")||this.debugger.refresh(),this.handleResize()}setupResizeHandling(){if(window.addEventListener("resize",this.handleResize),typeof ResizeObserver<"u"){const e=document.querySelector("main");this.resizeObserver=new ResizeObserver(()=>{this.handleResize()}),this.resizeObserver.observe(e)}}handleResize(){const e=document.getElementById("screen");document.querySelector("main");const t=document.getElementById("debugger-panel"),s=document.getElementById("disk-drives"),i=document.querySelector("header"),r=document.querySelector("footer"),a=i?i.offsetHeight:0,d=r?r.offsetHeight:0,l=t&&!t.classList.contains("hidden")?t.offsetWidth+16:0,n=s?s.offsetHeight+16:100,o=window.innerWidth,v=window.innerHeight,f=32,c=o-l-f,u=v-a-d-n-f,g=88,k=104,w=c-g,x=u-k;let m,p;w/x>this.aspectRatio?(p=Math.max(200,x),m=p*this.aspectRatio):(m=Math.max(280,w),p=m/this.aspectRatio),m=Math.floor(m),p=Math.floor(p),e.style.width=m+"px",e.style.height=p+"px",this.renderer&&this.renderer.resize(m,p)}updateMuteButton(){const e=document.getElementById("btn-mute"),t=e.querySelector(".icon-unmuted"),s=e.querySelector(".icon-muted");this.audioDriver.isMuted()?(t.classList.add("hidden"),s.classList.remove("hidden")):(t.classList.remove("hidden"),s.classList.add("hidden"))}updatePowerButton(){const e=document.getElementById("btn-power"),t=document.getElementById("monitor-power-led");this.running?(e.classList.remove("off"),e.title="Power Off",t==null||t.classList.add("on")):(e.classList.add("off"),e.title="Power On",t==null||t.classList.remove("on"))}start(){this.running||(this.wasmModule._reset(),this.running=!0,this.audioDriver.start(),this.updatePowerButton(),console.log("Emulator powered on"))}stop(){this.running&&(this.running=!1,this.audioDriver.stop(),this.renderer.clear(),this.updatePowerButton(),console.log("Emulator powered off"))}renderFrame(){const e=this.wasmModule._getFramebuffer(),t=this.wasmModule._getFramebufferSize(),s=new Uint8Array(this.wasmModule.HEAPU8.buffer,e,t);this.renderer.updateTexture(s),this.renderer.draw()}startRenderLoop(){const e=()=>{document.getElementById("debugger-panel").classList.contains("hidden")||this.debugger.refresh(),this.diskManager.updateLEDs(),requestAnimationFrame(e)};requestAnimationFrame(e)}showLoading(e){const t=document.getElementById("loading");e?t.classList.remove("hidden"):t.classList.add("hidden")}}document.addEventListener("DOMContentLoaded",()=>{const h=new L;h.init(),window.a2e=h});
